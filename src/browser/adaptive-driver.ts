import type {
  BrowserChatRequest,
  BrowserChatResult,
  BrowserLoginDriver,
} from './types.js';
import type { BrowserAutomationConfig } from '../extension/browser-bridge.js';
import { ExistingBrowserDriver, isExistingBrowserConnected } from './extension-driver.js';

/**
 * Prefer a paired signed-in Chrome profile, while retaining Patchright as a
 * safe no-extension fallback. Selection is per request; live login flows pin
 * one transport until they close so a prompt is never duplicated.
 */
export class AdaptiveBrowserDriver implements BrowserLoginDriver {
  private loginDriver?: BrowserLoginDriver;

  constructor(
    private readonly config: BrowserAutomationConfig,
    private readonly fallback: BrowserLoginDriver,
  ) {}

  async send(request: BrowserChatRequest): Promise<BrowserChatResult> {
    const driver = this.loginDriver
      ?? (isExistingBrowserConnected() ? new ExistingBrowserDriver(this.config) : this.fallback);
    return driver.send(request);
  }

  async openForLogin(): Promise<void> {
    this.loginDriver = isExistingBrowserConnected()
      ? new ExistingBrowserDriver(this.config)
      : this.fallback;
    return this.loginDriver.openForLogin();
  }

  async waitUntilReady(timeoutMs?: number, signal?: AbortSignal): Promise<void> {
    if (!this.loginDriver) {
      this.loginDriver = isExistingBrowserConnected()
        ? new ExistingBrowserDriver(this.config)
        : this.fallback;
    }
    return this.loginDriver.waitUntilReady(timeoutMs, signal);
  }

  async close(): Promise<void> {
    const selected = this.loginDriver;
    this.loginDriver = undefined;
    await selected?.close();
    if (selected !== this.fallback) await this.fallback.close();
  }
}
