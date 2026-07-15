import { EventEmitter } from 'node:events';
import { AsyncLocalStorage } from 'node:async_hooks';

export const activePromptStorage = new AsyncLocalStorage<string>();

export class MockLocator {
  constructor(
    public page: MockPage,
    public selector: string,
    public index: number = 0
  ) {}

  async count(): Promise<number> {
    console.log('[MockLocator] count called for selector:', this.selector, 'activePrompt:', activePromptStorage.getStore());
    const activePrompt = activePromptStorage.getStore() || '';

    // Assistant message selectors
    if (this.isAssistantSelector()) {
      return this.page.assistantMessages.length;
    }
    // Captcha selectors
    if (this.selector.includes('captcha') || this.selector.includes('cf-turnstile')) {
      return activePrompt.includes('trigger:captcha') ? 1 : 0;
    }
    // Landing sign-in buttons
    if (this.selector.includes('has-text("Sign in")') || this.selector.includes('has-text("Log in")') || this.selector.includes('has-text("Use Gemini")')) {
      return activePrompt.includes('trigger:login') ? 1 : 0;
    }
    // Interruption / error alerts
    if (this.selector.includes('alert') || this.selector.includes('error-message') || this.selector.includes('text-red-500')) {
      return activePrompt.includes('trigger:generation_interrupted') ? 1 : 0;
    }
    // Arena checkbox and buttons
    if (this.selector.includes('input[type="checkbox"]') || this.selector.includes('Acknowledge') || this.selector.includes('Direct Chat')) {
      return 1;
    }
    // Stop button
    if (this.isStopSelector()) {
      if (this.page.sendTriggeredAt) {
        const elapsed = Date.now() - this.page.sendTriggeredAt;
        if (elapsed < 1000) {
          return 1;
        }
      }
      return 0;
    }
    // Default
    return 1;
  }

  private isAssistantSelector(): boolean {
    const sel = this.selector.toLowerCase();
    return sel.includes('assistant') || sel.includes('bot') || sel.includes('response');
  }

  private isStopSelector(): boolean {
    return this.selector.includes('Stop') || this.selector.includes('Cancel') || this.selector.includes('stop');
  }

  nth(index: number): MockLocator {
    return new MockLocator(this.page, this.selector, index);
  }

  first(): MockLocator {
    return this.nth(0);
  }

  last(): MockLocator {
    return this.nth(this.page.assistantMessages.length - 1);
  }

  async isVisible(): Promise<boolean> {
    const c = await this.count();
    return c > 0;
  }

  async isEnabled(): Promise<boolean> {
    const activePrompt = activePromptStorage.getStore() || '';
    if (this.selector.includes('composer') || this.selector.includes('textbox') || this.selector.includes('textarea')) {
      if (activePrompt.includes('trigger:composer_disabled')) {
        return false;
      }
    }
    return true;
  }

  async getAttribute(name: string): Promise<string | null> {
    const activePrompt = activePromptStorage.getStore() || '';
    if (name === 'aria-disabled') {
      if (activePrompt.includes('trigger:composer_disabled') && (this.selector.includes('composer') || this.selector.includes('textarea'))) {
        return 'true';
      }
    }
    return null;
  }

  async evaluate<R>(fn: (element: any) => R): Promise<R> {
    const activePrompt = activePromptStorage.getStore() || '';
    const isReadOnly = activePrompt.includes('trigger:composer_disabled') && (this.selector.includes('composer') || this.selector.includes('textarea'));
    const element = {
      tagName: 'textarea',
      getAttribute: (name: string) => {
        if (name === 'contenteditable') return 'true';
        return null;
      },
      readOnly: isReadOnly,
    };
    return fn(element);
  }

  async focus(): Promise<void> {
    return;
  }

  async click(options?: any): Promise<void> {
    void options;
    if (this.isStopSelector()) {
      return;
    }
    await this.page.triggerSend();
  }

  async press(key: string): Promise<void> {
    if (key === 'Enter') {
      await this.page.triggerSend();
    }
  }

  async check(options?: any): Promise<void> {
    void options;
    return;
  }

  async isChecked(): Promise<boolean> {
    return true;
  }

  async innerText(): Promise<string> {
    console.log('[MockLocator] innerText called for selector:', this.selector, 'index:', this.index);
    const activePrompt = activePromptStorage.getStore() || '';
    if (this.selector.includes('body')) {
      if (activePrompt.includes('trigger:rate_limit')) {
        return 'too many requests / rate limit exceeded';
      }
      if (activePrompt.includes('trigger:quota')) {
        return 'out of quota / usage limit reached';
      }
      if (activePrompt.includes('trigger:generation_interrupted')) {
        return 'something went wrong / error occurred';
      }
      return 'Mock page body text';
    }

    if (this.isAssistantSelector()) {
      const idx = this.index >= 0 ? this.index : this.page.assistantMessages.length - 1;
      return this.page.assistantMessages[idx] || '';
    }

    return '';
  }
}

export class MockPage extends EventEmitter {
  public composerText = '';
  public assistantMessages: string[] = [];
  public stopButtonChecks = 0;
  public sendTriggeredAt = 0;
  private _url = 'https://chatgpt.com/';
  private _closed = false;

  constructor(public context: MockBrowserContext) {
    super();
  }

  mainFrame() {
    return {
      parentFrame: () => null,
    };
  }

  async goto(url: string, options?: any): Promise<void> {
    void options;
    this._url = url;
    this.sendTriggeredAt = 0;
    this.emit('framenavigated', this.mainFrame());
  }

  bringToFront() {
    return Promise.resolve();
  }

  isClosed(): boolean {
    return this._closed;
  }

  async close(): Promise<void> {
    this._closed = true;
    this.context.removePage(this);
    this.emit('close');
  }

  url(): string {
    const activePrompt = activePromptStorage.getStore() || '';
    if (activePrompt.includes('trigger:login')) {
      if (this._url.includes('gemini')) {
        return 'https://accounts.google.com/signin';
      }
      return 'https://chatgpt.com/login';
    }
    return this._url;
  }

  screenshot(options?: any): Promise<Buffer> {
    void options;
    return Promise.resolve(Buffer.alloc(0));
  }

  locator(selector: string): MockLocator {
    return new MockLocator(this, selector);
  }

  keyboard = {
    press: async (key: string): Promise<void> => {
      if (key.includes('Backspace')) {
        this.composerText = '';
      }
    },
    insertText: async (text: string): Promise<void> => {
      this.composerText += text;
    }
  };

  async triggerSend(): Promise<void> {
    this.sendTriggeredAt = Date.now();
    const activePrompt = activePromptStorage.getStore() || '';
    if (activePrompt.includes('trigger:empty_response')) {
      this.assistantMessages.push('');
      return;
    }

    if (activePrompt.includes('trigger:generation_interrupted')) {
      this.assistantMessages.push('Err');
      return;
    }

    const nonceMatch = this.composerText.match(/<relay_tool_calls nonce="([^"]+)">/);
    const nonce = nonceMatch ? nonceMatch[1] : 'nonce123';

    if (activePrompt.includes('trigger:invalid_tool_call_unclosed')) {
      this.assistantMessages.push(`<relay_tool_calls nonce="${nonce}">[{"id":"call_1"`);
      return;
    }

    if (activePrompt.includes('trigger:invalid_tool_call_schema')) {
      this.assistantMessages.push(`<relay_tool_calls nonce="${nonce}">[{"id":"call_1","name":"terminal","arguments":{"command":123}}]</relay_tool_calls>`);
      return;
    }

    if (activePrompt.includes('trigger:invalid_tool_call_name')) {
      this.assistantMessages.push(`<relay_tool_calls nonce="${nonce}">[{"id":"call_1","name":"invalid_func","arguments":{}}]</relay_tool_calls>`);
      return;
    }

    if (activePrompt.includes('trigger:normal_text')) {
      this.assistantMessages.push(`Normal response without tools.`);
      return;
    }

    if (nonceMatch && activePrompt.toLowerCase().includes('multiple')) {
      const toolCallResponse = `I will run both commands.\n<relay_tool_calls nonce="${nonce}">\n[{"id":"call_1","name":"terminal","arguments":{"command":"pwd"}}, {"id":"call_2","name":"terminal","arguments":{"command":"ls"}}]\n</relay_tool_calls>`;
      this.assistantMessages.push(toolCallResponse);
      return;
    }

    // Check if composer has a tool calling instruction and active prompt explicitly asks for tools
    if (nonceMatch && (
      activePrompt.toLowerCase().includes('run') ||
      activePrompt.toLowerCase().includes('execute') ||
      activePrompt.toLowerCase().includes('tools') ||
      activePrompt.toLowerCase().includes('command') ||
      activePrompt.toLowerCase().includes('fallback')
    )) {
      const toolCallResponse = `I will run the command.\n<relay_tool_calls nonce="${nonce}">\n[{"id":"call_1","name":"terminal","arguments":{"command":"pwd"}}]\n</relay_tool_calls>`;
      this.assistantMessages.push(toolCallResponse);
      return;
    }

    // Standard completion
    this.assistantMessages.push(`Mock response for prompt: ${this.composerText}`);
  }
}

export class MockBrowserContext extends EventEmitter {
  private _pages: MockPage[] = [];

  constructor() {
    super();
  }

  pages(): MockPage[] {
    return this._pages;
  }

  async newPage(): Promise<MockPage> {
    const page = new MockPage(this);
    this._pages.push(page);
    this.emit('page', page);
    return page;
  }

  removePage(page: MockPage) {
    this._pages = this._pages.filter(p => p !== page);
  }

  async close(): Promise<void> {
    for (const page of [...this._pages]) {
      await page.close();
    }
    this.emit('close');
  }
}
