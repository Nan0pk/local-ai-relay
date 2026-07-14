import assert from 'node:assert/strict';
import test from 'node:test';
import type { Locator, Page } from 'patchright';
import { isComposerUsable, isLoggedOutLanding, resolveVisibleSelector } from './base-driver.js';
import type { SiteConfig } from './base-driver.js';

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
        first: () => matches[0] ?? new FixtureLocator('<button hidden></button>'),
      };
    },
  } as unknown as Page;
}

const authFixtureConfig: SiteConfig = {
  name: 'fixture',
  url: 'https://example.test/',
  profileEnvVar: 'FIXTURE_PROFILE',
  composerSelectors: ['#composer'],
  sendButtonSelectors: ['#send'],
  stopButtonSelectors: ['#stop'],
  assistantMessageSelectors: ['#assistant'],
  loginUrlPattern: /\/login/,
  signInButtonLabels: ['Sign in'],
};

const signInSelector = 'a:has-text("Sign in"), button:has-text("Sign in")';

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

test('visible sign-in chrome does not override a usable composer', async () => {
  const page = fixturePage({
    [signInSelector]: [new FixtureLocator('<button>Sign in</button>')],
    '#composer': [new FixtureLocator('<textarea></textarea>')],
  });
  assert.equal(await isLoggedOutLanding(page, authFixtureConfig), false);
});

test('visible sign-in chrome still means logged out when no usable composer exists', async () => {
  const page = fixturePage({
    [signInSelector]: [new FixtureLocator('<button>Sign in</button>')],
  });
  assert.equal(await isLoggedOutLanding(page, authFixtureConfig), true);
});

test('disabled composer does not mask a logged-out landing page', async () => {
  const page = fixturePage({
    [signInSelector]: [new FixtureLocator('<button>Sign in</button>')],
    '#composer': [new FixtureLocator('<textarea disabled></textarea>')],
  });
  assert.equal(await isLoggedOutLanding(page, authFixtureConfig), true);
});
