import type {
  BrowserChatRequest,
  BrowserChatResult,
  BrowserLoginDriver,
} from './types.js';
import { BrowserFailure } from './types.js';
import {
  browserExtensionBridge,
  type BrowserAutomationConfig,
  type BrowserBridgeResult,
} from '../extension/browser-bridge.js';

function unwrap(result: BrowserBridgeResult, provider: string): BrowserBridgeResult {
  if (result.ok) return result;
  const kind = result.error?.kind ?? 'layout_changed';
  throw new BrowserFailure(
    kind,
    result.error?.message ?? `${provider} failed in the existing browser.`,
  );
}

export class ExistingBrowserDriver implements BrowserLoginDriver {
  constructor(private readonly config: BrowserAutomationConfig) {}

  async openForLogin(): Promise<void> {
    unwrap(await browserExtensionBridge.dispatch({
      action: 'open_provider',
      provider: this.config.name,
      config: this.config,
      timeout_ms: 30_000,
    }), this.config.label);
  }

  async waitUntilReady(timeoutMs = 10 * 60_000, signal?: AbortSignal): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const chunkMs = Math.min(15_000, Math.max(1, deadline - Date.now()));
      const result = await browserExtensionBridge.dispatch({
        action: 'wait_until_ready',
        provider: this.config.name,
        config: this.config,
        timeout_ms: chunkMs,
      }, { signal });
      if (result.ok && result.ready) return;
      if (result.error?.kind !== 'login_required') {
        unwrap(result, this.config.label);
      }
    }
    throw new BrowserFailure(
      'login_required',
      `${this.config.label} did not become ready before the sign-in window expired.`,
    );
  }

  async send(request: BrowserChatRequest): Promise<BrowserChatResult> {
    const result = unwrap(await browserExtensionBridge.dispatch({
      action: 'send_prompt',
      provider: this.config.name,
      config: this.config,
      timeout_ms: 180_000,
      prompt: request.prompt,
      reset_session: request.resetSession,
      ...(request.sessionId ? { session_id: request.sessionId } : {}),
    }, { signal: request.signal }), this.config.label);
    if (!result.text?.trim()) {
      throw new BrowserFailure('empty_response', `${this.config.label} returned an empty response.`);
    }
    return {
      text: result.text,
      ...(result.conversation_url ? { conversationUrl: result.conversation_url } : {}),
    };
  }

  async close(): Promise<void> {
    // The extension owns its tabs. Closing a provider must never close the
    // operator's normal Chrome window or sign them out.
  }
}

export function isExistingBrowserConnected(): boolean {
  return browserExtensionBridge.isConnected();
}
