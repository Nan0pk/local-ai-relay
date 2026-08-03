import assert from 'node:assert/strict';
import test from 'node:test';
import type { Locator, Page } from 'patchright';
import { BaseBrowserDriver, isComposerUsable, resolveVisibleSelector, type SiteConfig } from './base-driver.js';
import { BrowserFailure } from './types.js';

class FixtureLocator {
  constructor(readonly html: string, readonly id = html) {}
  async isEnabled(): Promise<boolean> { return !/\sdisabled(?:[\s=>]|$)/i.test(this.html); }
  async isVisible(): Promise<boolean> { return !/\shidden(?:[\s=>]|$)/i.test(this.html); }
  async getAttribute(name: string): Promise<string | null> {
    const match = this.html.match(new RegExp(`\\s${name}=["']([^"']*)["']`, 'i'));
    return match?.[1] ?? null;
  }
  async evaluate(): Promise<{ tagName: string; readOnly: boolean; contentEditable: string | null }> {
    const tagName = this.html.match(/^<([a-z0-9-]+)/i)?.[1]?.toLowerCase() ?? 'div';
    return {
      tagName,
      readOnly: /\sreadonly(?:[\s=>]|$)/i.test(this.html),
      contentEditable: await this.getAttribute('contenteditable'),
    };
  }
}

function locator(html: string, id?: string): Locator {
  return new FixtureLocator(html, id) as unknown as Locator;
}

function fixturePage(entries: Record<string, FixtureLocator[]>): Page {
  return {
    locator(selector: string) {
      const matches = entries[selector] ?? [];
      return {
        count: async () => matches.length,
        nth: (index: number) => matches[index],
      };
    },
  } as unknown as Page;
}

for (const [name, html] of [
  ['textarea', '<textarea id="prompt"></textarea>'],
  ['input', '<input id="prompt">'],
  ['ProseMirror', '<div class="ProseMirror" contenteditable="true"></div>'],
  ['Lexical', '<div data-lexical-editor="true" contenteditable="true"></div>'],
  ['ordinary contenteditable', '<div contenteditable="true"></div>'],
] as const) {
  test(`${name} composer fixture is usable`, async () => {
    assert.equal(await isComposerUsable(locator(html)), true);
  });
}

for (const [name, html] of [
  ['disabled textarea', '<textarea disabled></textarea>'],
  ['read-only input', '<input readonly>'],
  ['explicitly disabled contenteditable', '<div contenteditable="false"></div>'],
  ['aria-disabled editor', '<div contenteditable="true" aria-disabled="true"></div>'],
] as const) {
  test(`${name} fixture is rejected`, async () => {
    assert.equal(await isComposerUsable(locator(html)), false);
  });
}

test('selector resolution honors configuration priority instead of DOM order', async () => {
  const preferredHidden = new FixtureLocator('<button hidden></button>', 'preferred-hidden');
  const preferredVisible = new FixtureLocator('<button></button>', 'preferred-visible');
  const fallbackEarlierInDom = new FixtureLocator('<button></button>', 'fallback-dom-first');
  const page = fixturePage({
    '#preferred': [preferredHidden, preferredVisible],
    '.fallback': [fallbackEarlierInDom],
  });

  const result = await resolveVisibleSelector(page, ['#preferred', '.fallback']);
  assert.equal(result?.selector, '#preferred');
  assert.equal((result?.locator as unknown as FixtureLocator).id, 'preferred-visible');
});

test('selector resolution skips disabled matches before using a fallback', async () => {
  const page = fixturePage({
    '#preferred': [new FixtureLocator('<button disabled></button>')],
    '.fallback': [new FixtureLocator('<button></button>', 'enabled-fallback')],
  });
  const result = await resolveVisibleSelector(page, ['#preferred', '.fallback']);
  assert.equal(result?.selector, '.fallback');
});

class TestDriver extends BaseBrowserDriver {
  mockStopButton: Locator | undefined = undefined;

  constructor(options: { stableMs?: number; timeoutMs?: number; maxSessions?: number } = {}) {
    super({ stableMs: 50, timeoutMs: 500, ...options });
  }

  protected config(): SiteConfig {
    return {
      name: 'test',
      url: 'https://test.com/',
      profileEnvVar: 'TEST_PROFILE',
      composerSelectors: ['composer'],
      sendButtonSelectors: ['send'],
      stopButtonSelectors: ['stop'],
      assistantMessageSelectors: ['message'],
      loginUrlPattern: /login/,
      signInButtonLabels: ['Sign in'],
    };
  }

  protected override stopButton(): Promise<Locator | undefined> {
    return Promise.resolve(this.mockStopButton);
  }
}

test('short answers like OK, BANANA, 42 and tool-calls succeed', async () => {
  const driver = new TestDriver();
  
  // Set up mock locator for stop button (not visible)
  const stopButtonLocator = {
    isVisible: async () => false,
  } as unknown as Locator;
  driver.mockStopButton = stopButtonLocator;

  for (const text of ['OK', 'BANANA', '42', '[TOOL: test]']) {
    const mockLocator = {
      innerText: async () => text,
    } as unknown as Locator;

    const mockPage = {
      locator: (_selector: string) => {
        return {
          count: async () => 0,
          nth: () => ({ isVisible: async () => false }),
          innerText: async () => '',
        } as unknown as Locator;
      },
    } as unknown as Page;

    // Simulate sawStop = true by setting up stop button to be visible initially
    let stopVisible = true;
    const stopButtonWithToggle = {
      isVisible: async () => {
        const val = stopVisible;
        stopVisible = false; // toggle visible to false on next calls
        return val;
      }
    } as unknown as Locator;
    driver.mockStopButton = stopButtonWithToggle;

    const res = await driver['waitUntilStable'](mockPage, mockLocator, undefined);
    assert.equal(res.text, text);
  }
});

test('genuinely interrupted generation (short text + error element) throws generation_interrupted', async () => {
  const driver = new TestDriver();

  let stopVisible = true;
  driver.mockStopButton = {
    isVisible: async () => {
      const val = stopVisible;
      stopVisible = false;
      return val;
    }
  } as unknown as Locator;

  const mockLocator = {
    innerText: async () => 'OK',
  } as unknown as Locator;

  const mockPage = {
    locator: (selector: string) => {
      if (selector === 'body') {
        return { innerText: async () => '' } as unknown as Locator;
      }
      // Return a visible error element
      return {
        count: async () => 1,
        nth: () => ({
          isVisible: async () => true,
        }),
        innerText: async () => '',
      } as unknown as Locator;
    },
  } as unknown as Page;

  await assert.rejects(
    driver['waitUntilStable'](mockPage, mockLocator, undefined),
    (err: Error) => {
      assert.ok(err instanceof BrowserFailure);
      assert.equal(err.kind, 'generation_interrupted');
      return true;
    }
  );
});

test('genuinely interrupted generation (short text + error keyword in body) throws generation_interrupted', async () => {
  const driver = new TestDriver();

  let stopVisible = true;
  driver.mockStopButton = {
    isVisible: async () => {
      const val = stopVisible;
      stopVisible = false;
      return val;
    }
  } as unknown as Locator;

  const mockLocator = {
    innerText: async () => 'Error text',
  } as unknown as Locator;

  const mockPage = {
    locator: (selector: string) => {
      if (selector === 'body') {
        return { innerText: async () => 'An error occurred during generation.' } as unknown as Locator;
      }
      return {
        count: async () => 0,
        nth: () => ({
          isVisible: async () => false,
        }),
        innerText: async () => '',
      } as unknown as Locator;
    },
  } as unknown as Page;

  await assert.rejects(
    driver['waitUntilStable'](mockPage, mockLocator, undefined),
    (err: Error) => {
      assert.ok(err instanceof BrowserFailure);
      assert.equal(err.kind, 'generation_interrupted');
      return true;
    }
  );
});

test('empty generation throws empty_response fast', async () => {
  const driver = new TestDriver();

  let stopVisible = true;
  driver.mockStopButton = {
    isVisible: async () => {
      const val = stopVisible;
      stopVisible = false;
      return val;
    }
  } as unknown as Locator;

  const mockLocator = {
    innerText: async () => '',
  } as unknown as Locator;

  const mockPage = {
    locator: () => {
      return {
        count: async () => 0,
        nth: () => ({ isVisible: async () => false }),
        innerText: async () => '',
      } as unknown as Locator;
    },
  } as unknown as Page;

  await assert.rejects(
    driver['waitUntilStable'](mockPage, mockLocator, undefined),
    (err: Error) => {
      assert.ok(err instanceof BrowserFailure);
      assert.equal(err.kind, 'empty_response');
      return true;
    }
  );
});

test('BrowserContextManager singleton behavior', async () => {
  const { BrowserContextManager } = await import('./context-manager.js');
  const instance1 = BrowserContextManager.getInstance();
  const instance2 = BrowserContextManager.getInstance();
  assert.equal(instance1, instance2);

  // Set mock browser env
  const originalMock = process.env.RELAY_MOCK_BROWSER;
  process.env.RELAY_MOCK_BROWSER = 'true';
  try {
    const context1 = await instance1.getContext();
    const context2 = await instance2.getContext();
    assert.equal(context1, context2);
    await instance1.close();
  } finally {
    process.env.RELAY_MOCK_BROWSER = originalMock;
  }
});

test('BrowserContextManager accepts visible launch options after a background context closes', async () => {
  const { BrowserContextManager } = await import('./context-manager.js');
  const originalMock = process.env.RELAY_MOCK_BROWSER;
  process.env.RELAY_MOCK_BROWSER = 'true';
  try {
    const automatic = BrowserContextManager.getInstance({ headless: true });
    const automaticContext = await automatic.getContext();
    await automaticContext.close();
    const manual = BrowserContextManager.getInstance({ headless: false });
    assert.equal(
      (manual as unknown as { options?: { headless?: boolean } }).options?.headless,
      false,
    );
    await manual.close();
  } finally {
    process.env.RELAY_MOCK_BROWSER = originalMock;
  }
});

test('session eviction is least-recently-used, not creation-order FIFO', async () => {
  const originalMock = process.env.RELAY_MOCK_BROWSER;
  process.env.RELAY_MOCK_BROWSER = 'true';
  try {
    const driver = new TestDriver({ maxSessions: 2 });
    const pages = (driver as unknown as { pages: Map<string, unknown> }).pages;
    const pageFor = (sessionId: string) =>
      (driver as unknown as { pageFor(id: string, reset: boolean): Promise<unknown> }).pageFor(sessionId, false);

    await pageFor('session-a'); // created first
    await pageFor('session-b'); // created second; map is now at maxSessions(2)
    await pageFor('session-a'); // touched again -- must now be the most-recently-used
    await pageFor('session-c'); // forces an eviction

    assert.ok(pages.has('session-a'), 'session-a was actively reused and must survive eviction');
    assert.ok(!pages.has('session-b'), 'session-b was genuinely idle and should be the one evicted');
    assert.ok(pages.has('session-c'));
  } finally {
    process.env.RELAY_MOCK_BROWSER = originalMock;
  }
});

test('assertNotBlocked never clicks any control on a login page — no automatic account selection', async () => {
  const driver = new TestDriver();
  let clicked = false;
  const mockPage = {
    url: () => 'https://test.com/login',
    locator: (_selector: string) => ({
      first: () => ({
        isVisible: async () => true,
        isEnabled: async () => true,
        click: async () => { clicked = true; },
      }),
      count: async () => 0,
      nth: () => ({ isVisible: async () => false }),
    }),
  } as unknown as Page;

  await assert.rejects(
    () => driver['assertNotBlocked'](mockPage),
    (err: unknown) => err instanceof BrowserFailure && err.kind === 'login_required',
  );
  assert.equal(clicked, false, 'the relay must never click a login control automatically');
});

test('base driver exposes no automatic SSO/account-selection method', () => {
  const driver = new TestDriver();
  assert.equal((driver as unknown as { handleSsoLogin?: unknown }).handleSsoLogin, undefined);
});

test('a usable anonymous composer is not rejected merely because sign-in is also offered', async () => {
  const driver = new TestDriver();
  const composer = new FixtureLocator('<textarea></textarea>');
  const page = {
    url: () => 'https://test.com/',
    locator: (selector: string) => {
      if (selector === 'composer') {
        return { count: async () => 1, nth: () => composer };
      }
      if (selector.includes(':has-text("Sign in")')) {
        return { first: () => ({ isVisible: async () => true }) };
      }
      return {
        first: () => ({ isVisible: async () => false }),
        innerText: async () => '',
      };
    },
  } as unknown as Page;
  await driver['assertNotBlocked'](page);
});

test('a visible provider login gate blocks a composer behind its modal', async () => {
  class LoginGateDriver extends TestDriver {
    protected override config(): SiteConfig {
      return { ...super.config(), loginRequiredSelectors: ['.login-gate'] };
    }
  }
  const driver = new LoginGateDriver();
  const gate = new FixtureLocator('<div class="login-gate"></div>');
  const page = {
    url: () => 'https://test.com/',
    locator: (selector: string) => selector === '.login-gate'
      ? { count: async () => 1, nth: () => gate }
      : {
          count: async () => 0,
          nth: () => undefined,
          first: () => ({ isVisible: async () => false }),
          innerText: async () => '',
        },
  } as unknown as Page;
  await assert.rejects(
    driver['assertNotBlocked'](page),
    (error: Error) => error instanceof BrowserFailure && error.kind === 'login_required',
  );
});

test('cancelling a request presses the site stop button instead of only abandoning the poll', async () => {
  const driver = new TestDriver();
  let stopClicked = false;
  driver.mockStopButton = {
    isVisible: async () => true,
    click: async () => { stopClicked = true; },
  } as unknown as Locator;

  const stillGrowing = new FixtureLocator('never stable');
  const page = {
    url: () => 'https://test.com/',
    locator: (_selector: string) => ({
      count: async () => 0,
      nth: () => stillGrowing,
      first: () => ({ isVisible: async () => false }),
      innerText: async () => '',
    }),
  } as unknown as Page;

  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    driver['waitUntilStable'](page, stillGrowing as unknown as Locator, controller.signal),
    (error: Error) => error instanceof BrowserFailure && error.kind === 'cancelled',
  );
  assert.equal(stopClicked, true, 'cancel must press the website stop control, not just stop polling');
});

test('a mid-answer pause is not returned as a truncated success when the stop button never resolves', async () => {
  // The polling loop itself samples every 300ms regardless of stableMs, so
  // this needs enough timeoutMs headroom for at least two real poll cycles
  // (transition detected, then confirmed stable) before the fixture's
  // answer settles.
  const driver = new TestDriver({ timeoutMs: 2000 });
  driver.mockStopButton = { isVisible: async () => false } as unknown as Locator;
  const start = Date.now();
  const elapsed = () => Date.now() - start;
  // Text pauses at a partial answer for 100ms (less than stableMs(50) * the
  // unevidenced multiplier(3) = 150ms required when no stop button is ever
  // seen), then the real answer arrives and holds steady.
  const growing = {
    innerText: async () => (elapsed() < 100 ? 'partial answer' : 'partial answer, now complete'),
  } as unknown as Locator;
  const page = {
    url: () => 'https://test.com/',
    locator: (_selector: string) => ({
      count: async () => 0,
      nth: () => growing,
      first: () => ({ isVisible: async () => false }),
      innerText: async () => '',
    }),
  } as unknown as Page;

  const result = await driver['waitUntilStable'](page, growing, undefined);
  assert.equal(result.text, 'partial answer, now complete', 'must not return the mid-pause text as final');
  assert.equal(result.truncationRisk, true, 'an unevidenced finish must be flagged, not returned as a clean success');
});

test('an evidenced finish (stop button appeared then disappeared) is not flagged as truncation risk', async () => {
  const driver = new TestDriver();
  const start = Date.now();
  const elapsed = () => Date.now() - start;
  driver.mockStopButton = { isVisible: async () => elapsed() < 20 } as unknown as Locator;
  const growing = { innerText: async () => 'complete answer' } as unknown as Locator;
  const page = {
    url: () => 'https://test.com/',
    locator: (_selector: string) => ({
      count: async () => 0,
      nth: () => growing,
      first: () => ({ isVisible: async () => false }),
      innerText: async () => '',
    }),
  } as unknown as Page;

  const result = await driver['waitUntilStable'](page, growing, undefined);
  assert.equal(result.text, 'complete answer');
  assert.equal(result.truncationRisk, false, 'a real stop-button transition is positive evidence, not a risk');
});

test('assertNotBlocked caches the full page-text read instead of re-fetching every poll tick', async () => {
  const driver = new TestDriver({ timeoutMs: 900 });
  let bodyReads = 0;
  // Text keeps changing every read so the loop never stabilizes and runs
  // for the full timeout window, giving assertNotBlocked several chances
  // to run across multiple 300ms poll ticks.
  let counter = 0;
  const growing = { innerText: async () => `still going ${counter++}` } as unknown as Locator;
  const page = {
    url: () => 'https://test.com/',
    locator: (selector: string) => {
      if (selector === 'body') {
        return {
          innerText: async () => { bodyReads++; return 'no captcha, no quota'; },
        } as unknown as Locator;
      }
      return { count: async () => 0, nth: () => undefined, first: () => ({ isVisible: async () => false }) } as unknown as Locator;
    },
  } as unknown as Page;

  await assert.rejects(driver['waitUntilStable'](page, growing, undefined));
  // Real elapsed time here spans multiple 300ms poll ticks (timeout=900ms),
  // which would mean 2-3 body reads uncached; the 1s cache floor should
  // hold it to exactly one.
  assert.equal(bodyReads, 1, 'body text should be read once and reused across poll ticks within the cache floor');
});
