import { BaseBrowserDriver, type SiteConfig } from './base-driver.js';

/** DeepSeek (chat.deepseek.com) webchat driver. */
export class DeepSeekPlaywrightDriver extends BaseBrowserDriver {
  protected config(): SiteConfig {
    return {
      name: 'deepseek',
      url: 'https://chat.deepseek.com/',
      profileEnvVar: 'RELAY_BROWSER_PROFILE_DEEPSEEK',
      composerSelectors: [
        'textarea#chat-input',
        'textarea[placeholder*="Message" i]',
        'div[contenteditable="true"]',
        'textarea',
      ],
      sendButtonSelectors: [
        'button[aria-label*="Send" i]',
        'button[data-testid="send-button"]',
        'div[role="button"][aria-label*="Send" i]',
      ],
      stopButtonSelectors: [
        'button[aria-label*="Stop" i]',
        'div[role="button"][aria-label*="Stop" i]',
      ],
      assistantMessageSelectors: [
        'div[class*="message-content"]',
        'div.markdown-body',
        'div[class*="assistant"]',
      ],
      loginUrlPattern: /\/sign_?in|\/login|\/auth\//i,
      signInButtonLabels: ['Sign in', 'Log in', 'Login'],
      rateLimitPattern: /rate limit|too many requests|请求过于频繁/i,
      quotaPattern: /out of quota|usage (limit|cap) reached|you.?ve reached your limit/i,
    };
  }
}
