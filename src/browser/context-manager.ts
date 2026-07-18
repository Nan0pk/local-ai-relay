import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getWritableHome } from './paths.js';
import type { BrowserContext } from 'patchright';
import { launchPersistentRelayContext } from './runtime.js';

export interface ContextManagerOptions {
  profileDir?: string;
  headless?: boolean;
}

export class BrowserContextManager {
  private static instance: BrowserContextManager | null = null;
  private context: BrowserContext | null = null;

  private constructor(private options?: ContextManagerOptions) {}

  public static getInstance(options?: ContextManagerOptions): BrowserContextManager {
    if (!BrowserContextManager.instance) {
      BrowserContextManager.instance = new BrowserContextManager(options);
    }
    return BrowserContextManager.instance;
  }

  public async getContext(): Promise<BrowserContext> {
    if (!this.context) {
      const pDir = this.options?.profileDir ?? join(getWritableHome(), '.local-ai-relay', 'browser-profiles', 'shared');
      const headless = this.options?.headless ?? process.env.RELAY_BROWSER_HEADLESS === '1';
      await mkdir(pDir, { recursive: true });
      this.context = await launchPersistentRelayContext(pDir, {
        headless,
        viewport: { width: 1440, height: 960 },
      });
      this.context.on('close', () => {
        this.context = null;
      });
    }
    return this.context;
  }

  public async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    BrowserContextManager.instance = null;
  }
}
