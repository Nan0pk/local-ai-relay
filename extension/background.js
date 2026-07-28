const STORAGE_CONNECTION = 'relayConnection';
const STORAGE_TABS = 'providerTabs';
const SESSION_ID = `chrome-${crypto.randomUUID()}`;
let loopPromise;
let stopped = false;

function isLoopbackOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:'
      && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

async function storedConnection() {
  return (await chrome.storage.local.get(STORAGE_CONNECTION))[STORAGE_CONNECTION];
}

async function relayFetch(path, body) {
  const connection = await storedConnection();
  if (!connection?.token || !isLoopbackOrigin(connection.relayOrigin)) {
    throw new Error('Open the Local AI Relay dashboard and choose “Use this Chrome”.');
  }
  const response = await fetch(connection.relayOrigin + path, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${connection.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(value?.error?.message || `Relay returned HTTP ${response.status}.`);
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTab(tabId, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const tab = await chrome.tabs.get(tabId).catch(() => undefined);
    if (!tab) throw new Error('The provider tab was closed.');
    if (tab.status === 'complete') return tab;
    await sleep(150);
  }
  throw new Error('The provider page did not finish loading.');
}

async function providerTab(command, activate = true) {
  const stored = await chrome.storage.local.get(STORAGE_TABS);
  const providerTabs = stored[STORAGE_TABS] || {};
  let tab = providerTabs[command.provider]
    ? await chrome.tabs.get(providerTabs[command.provider]).catch(() => undefined)
    : undefined;
  if (!tab) {
    tab = await chrome.tabs.create({ url: command.config.url, active: activate });
    providerTabs[command.provider] = tab.id;
    await chrome.storage.local.set({ [STORAGE_TABS]: providerTabs });
  } else if (activate) {
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId !== undefined) {
      await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
    }
  }
  return waitForTab(tab.id);
}

async function inspectPage(tabId, config) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (site) => {
      const visible = (element) => {
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity || 1) !== 0
          && rect.width > 0
          && rect.height > 0;
      };
      const firstVisible = (selectors) => {
        for (const selector of selectors) {
          for (const element of document.querySelectorAll(selector)) {
            if (visible(element)) return element;
          }
        }
        return null;
      };
      const matches = (pattern, value) => {
        if (!pattern) return false;
        try { return new RegExp(pattern.source, pattern.flags).test(value); }
        catch { return false; }
      };
      const composer = firstVisible(site.composerSelectors);
      const composerUsable = Boolean(
        composer
        && !composer.disabled
        && !composer.readOnly
        && composer.getAttribute('aria-disabled') !== 'true'
        && composer.getAttribute('contenteditable') !== 'false',
      );
      const bodyText = (document.body?.innerText || '').slice(0, 250_000);
      const assistantTexts = [];
      for (const selector of site.assistantMessageSelectors) {
        for (const element of document.querySelectorAll(selector)) {
          if (visible(element)) {
            const value = (element.innerText || element.textContent || '').trim();
            if (value) assistantTexts.push(value);
          }
        }
      }
      // Providers often preload an invisible reCAPTCHA iframe on an otherwise
      // usable anonymous chat page. Only a visible challenge blocks the relay.
      const captchaFrame = [...document.querySelectorAll('iframe')].some((frame) =>
        visible(frame)
        && /captcha|recaptcha|hcaptcha|turnstile/i.test(frame.src || frame.title || ''));
      const signInText = site.signInButtonLabels.some((label) => {
        const normalized = label.toLowerCase();
        return [...document.querySelectorAll('button,a,[role="button"]')].some((element) =>
          visible(element) && (element.textContent || '').trim().toLowerCase().includes(normalized));
      });
      return {
        url: location.href,
        title: document.title,
        ready: composerUsable,
        composerFound: Boolean(composer),
        composerUsable,
        generating: Boolean(firstVisible(site.stopButtonSelectors)),
        assistantTexts,
        loginRequired: matches(site.loginUrlPattern, location.href) || (!composer && signInText),
        captcha: captchaFrame || matches(site.captchaTextPattern, bodyText),
        rateLimited: matches(site.rateLimitPattern, bodyText),
        quotaExhausted: matches(site.quotaPattern, bodyText),
      };
    },
    args: [config],
  });
  return results[0]?.result;
}

function failureFromState(state, label) {
  if (state?.captcha) return { kind: 'captcha', message: `${label} requires a CAPTCHA in the visible tab.` };
  if (state?.quotaExhausted) return { kind: 'quota_exhausted', message: `${label} reports that the account quota is exhausted.` };
  if (state?.rateLimited) return { kind: 'rate_limit', message: `${label} reports a rate limit.` };
  if (state?.loginRequired) return { kind: 'login_required', message: `Sign in to ${label} in the opened Chrome tab.` };
  if (state?.composerFound && !state?.composerUsable) {
    return { kind: 'composer_disabled', message: `${label} composer is currently disabled.` };
  }
  return { kind: 'layout_changed', message: `${label} chat composer was not found in the existing-browser tab.` };
}

async function waitUntilReady(command, tabId) {
  const started = Date.now();
  let lastState;
  let lastInspectionError;
  while (Date.now() - started < command.timeout_ms) {
    const state = await inspectPage(tabId, command.config).catch((error) => {
      lastInspectionError = error instanceof Error ? error.message : String(error);
      return undefined;
    });
    if (!state) {
      // OAuth and identity-provider pages are intentionally outside the
      // extension host permissions. The user can finish there manually; this
      // provider tab becomes inspectable again after it returns.
      await sleep(500);
      continue;
    }
    lastState = state;
    if (state?.ready) return { ready: true, conversation_url: state.url };
    if (state?.captcha || state?.rateLimited || state?.quotaExhausted) {
      return { ok: false, error: failureFromState(state, command.config.label) };
    }
    await sleep(500);
  }
  const state = await inspectPage(tabId, command.config).catch(() => lastState);
  if (!state && lastInspectionError) {
    return {
      ok: false,
      error: {
        kind: 'login_required',
        message: `Finish ${command.config.label} sign-in in the visible tab, then connect again.`,
      },
    };
  }
  return { ok: false, error: failureFromState(state, command.config.label) };
}

async function fillAndSend(tabId, config, prompt) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (site, value) => {
      const visible = (element) => {
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const firstVisible = (selectors) => {
        for (const selector of selectors) {
          for (const element of document.querySelectorAll(selector)) {
            if (visible(element)) return element;
          }
        }
        return null;
      };
      const composer = firstVisible(site.composerSelectors);
      if (!composer) return { sent: false, reason: 'composer_missing' };
      const assistantTexts = [];
      for (const selector of site.assistantMessageSelectors) {
        for (const element of document.querySelectorAll(selector)) {
          const text = (element.innerText || element.textContent || '').trim();
          if (visible(element) && text) assistantTexts.push(text);
        }
      }
      composer.focus();
      if (composer instanceof HTMLInputElement || composer instanceof HTMLTextAreaElement) {
        const prototype = composer instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(composer, value);
      } else {
        composer.textContent = value;
      }
      composer.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: value,
      }));
      composer.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 120));
      const send = firstVisible(site.sendButtonSelectors);
      if (send && !send.disabled && send.getAttribute('aria-disabled') !== 'true') {
        send.click();
        return { sent: true, assistantTexts };
      }
      const form = composer.closest('form');
      if (form instanceof HTMLFormElement) {
        form.requestSubmit();
        return { sent: true, assistantTexts };
      }
      // Synthetic keyboard events do not invoke the browser's default Enter
      // action. Fail before submission instead of claiming a prompt was sent.
      return { sent: false, reason: 'send_control_missing' };
    },
    args: [config, prompt],
  });
  return results[0]?.result;
}

async function sendPrompt(command, tab) {
  if (command.reset_session) {
    await chrome.tabs.update(tab.id, { url: command.config.url });
    await waitForTab(tab.id);
  }
  const beforeState = await inspectPage(tab.id, command.config);
  if (!beforeState?.ready) {
    return { ok: false, error: failureFromState(beforeState, command.config.label) };
  }
  const sent = await fillAndSend(tab.id, command.config, command.prompt);
  if (!sent?.sent) {
    return {
      ok: false,
      error: {
        kind: 'layout_changed',
        message: sent?.reason === 'send_control_missing'
          ? `${command.config.label} send control was not found; the prompt was not submitted.`
          : `${command.config.label} composer disappeared before submission.`,
      },
    };
  }
  const before = sent.assistantTexts || [];
  const beforeLast = before.at(-1) || '';
  let lastText = '';
  let stableSince = 0;
  const started = Date.now();
  while (Date.now() - started < command.timeout_ms) {
    const state = await inspectPage(tab.id, command.config);
    if (state?.captcha || state?.rateLimited || state?.quotaExhausted || state?.loginRequired) {
      return { ok: false, error: failureFromState(state, command.config.label) };
    }
    const current = state?.assistantTexts?.at(-1) || '';
    const changed = state?.assistantTexts?.length > before.length || (current && current !== beforeLast);
    if (changed && current) {
      if (current !== lastText) {
        lastText = current;
        stableSince = Date.now();
      } else if (!state.generating && Date.now() - stableSince >= 2_000) {
        return { ok: true, text: current, conversation_url: state.url };
      }
    }
    await sleep(400);
  }
  return {
    ok: false,
    error: { kind: 'timeout', message: `${command.config.label} did not finish generating before timeout.` },
  };
}

async function executeCommand(command) {
  try {
    const tab = await providerTab(command, command.action !== 'send_prompt');
    if (command.action === 'open_provider') {
      return { command_id: command.id, ok: true, conversation_url: tab.url };
    }
    if (command.action === 'wait_until_ready') {
      const result = await waitUntilReady(command, tab.id);
      return { command_id: command.id, ok: result.ok !== false, ...result };
    }
    const result = await sendPrompt(command, tab);
    return { command_id: command.id, ...result };
  } catch (error) {
    return {
      command_id: command.id,
      ok: false,
      error: {
        kind: 'layout_changed',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function pollingLoop() {
  if (loopPromise) return loopPromise;
  stopped = false;
  loopPromise = (async () => {
    let backoff = 500;
    while (!stopped) {
      try {
        await relayFetch('/v1/control/browser-extension/register', { session_id: SESSION_ID });
        const value = await relayFetch('/v1/control/browser-extension/poll', { session_id: SESSION_ID });
        backoff = 500;
        if (!value.command) continue;
        const result = await executeCommand(value.command);
        await relayFetch('/v1/control/browser-extension/result', {
          session_id: SESSION_ID,
          result,
        });
      } catch (error) {
        if (!await storedConnection()) break;
        await chrome.storage.local.set({
          relayLastError: error instanceof Error ? error.message : String(error),
        });
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 15_000);
      }
    }
  })().finally(() => { loopPromise = undefined; });
  return loopPromise;
}

async function pair(message) {
  if (!isLoopbackOrigin(message.relayOrigin) || typeof message.token !== 'string' || message.token.length < 16) {
    throw new Error('Rejected an invalid Local AI Relay pairing message.');
  }
  stopped = true;
  await chrome.storage.local.set({
    [STORAGE_CONNECTION]: {
      relayOrigin: message.relayOrigin,
      token: message.token,
      pairedAt: new Date().toISOString(),
    },
    relayLastError: '',
  });
  stopped = false;
  void pollingLoop();
}

async function resumeIfPaired() {
  if (await storedConnection()) void pollingLoop();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'PAIR_RELAY') {
    pair(message).then(() => sendResponse({ ok: true })).catch((error) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
    return true;
  }
  if (message?.type === 'GET_RELAY_STATUS') {
    Promise.all([
      storedConnection(),
      chrome.storage.local.get('relayLastError'),
    ]).then(([connection, error]) => sendResponse({
      paired: Boolean(connection?.token),
      relayOrigin: connection?.relayOrigin,
      lastError: error.relayLastError || '',
    }));
    return true;
  }
  if (message?.type === 'FORGET_RELAY') {
    stopped = true;
    relayFetch('/v1/control/browser-extension/disconnect', { session_id: SESSION_ID })
      .catch(() => {})
      .finally(() => chrome.storage.local.remove([STORAGE_CONNECTION, 'relayLastError']))
      .then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

chrome.runtime.onInstalled.addListener(() => void resumeIfPaired());
chrome.runtime.onStartup.addListener(() => void resumeIfPaired());
void resumeIfPaired();
