import { BaseBrowserDriver, type SiteConfig, type BaseDriverOptions } from './base-driver.js';

export type ArenaDriverOptions = BaseDriverOptions;

/**
 * Arena (arena.ai) webchat driver.
 *
 * The current first-party interface exposes its composer directly. Historical
 * LMSYS Gradio terms/direct-chat automation is intentionally not carried into
 * the new domain.
 */
export class ArenaPlaywrightDriver extends BaseBrowserDriver {
  constructor(options: ArenaDriverOptions = {}) {
    super(options);
  }

  protected config(): SiteConfig {
    return {
      name: 'arena',
      url: 'https://arena.ai/',
      profileEnvVar: 'RELAY_BROWSER_PROFILE_ARENA',
      composerSelectors: [
        'textarea[placeholder*="Ask anything" i]',
        'textarea[data-testid="textbox"]',
        'textarea[placeholder*="Type a message" i]',
        'textarea[placeholder*="Send a message" i]',
        'textarea[placeholder*="Enter message" i]',
        '.gradio-container textarea',
        'textarea',
      ],
      sendButtonSelectors: [
        'button[aria-label*="Send message" i]',
        'button:has-text("Submit")',
        'button:has-text("Send")',
        'button#submit',
        'button[id*="submit" i]',
        'button.primary',
      ],
      stopButtonSelectors: [
        'button:has-text("Stop")',
        'button:has-text("Cancel")',
        'button#stop',
        'button[id*="stop" i]',
      ],
      assistantMessageSelectors: [
        'div[data-testid="chatbot"] div.message.bot',
        '.chatbot .bot',
        '.chatbot div.bot',
        'div.bot',
        'div.message.bot',
      ],
      loginUrlPattern: /\b$/i, // Login-free, so pattern matches nothing
      signInButtonLabels: [],
      loginRequiredSelectors: ['[role="dialog"]'],
      rateLimitPattern: /rate limit|too many requests/i,
      quotaPattern: /out of quota|usage (limit|cap) reached/i,
    };
  }

}
