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

  constructor() {
    super({ stableMs: 50, timeoutMs: 500 });
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
    assert.equal(res, text);
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


