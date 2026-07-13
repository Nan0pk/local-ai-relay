export interface BrowserChatRequest {
  prompt: string;
  sessionId?: string;
  resetSession: boolean;
  signal?: AbortSignal;
}

export interface BrowserChatResult {
  text: string;
  conversationUrl?: string;
}

/** Site-independent boundary used by browser providers and unit tests. */
export interface BrowserChatDriver {
  send(request: BrowserChatRequest): Promise<BrowserChatResult>;
  close(): Promise<void>;
}

/**
 * Browser driver that also supports interactive login.
 *
 * The login CLI uses these methods to open the persistent profile and wait
 * for the user to sign in. They are optional relative to the core
 * {@link BrowserChatDriver} contract so test fakes don't need them.
 */
export interface BrowserLoginDriver extends BrowserChatDriver {
  /** Open the persistent profile without submitting a prompt. */
  openForLogin(): Promise<void>;
  /** Wait until the site's composer is usable after login. */
  waitUntilReady(timeoutMs?: number): Promise<void>;
}

/**
 * Shared, recoverable browser failure categories.
 *
 * Each driver maps site-specific DOM/URL signals onto these classes so the
 * HTTP layer can return a stable error type without learning provider
 * internals. Drivers MUST NOT auto-recover or fall back to another provider
 * when these are thrown; the caller decides what to do.
 */
export type BrowserFailureKind =
  | 'login_required'
  | 'captcha'
  | 'rate_limit'
  | 'quota_exhausted'
  | 'composer_disabled'
  | 'generation_interrupted'
  | 'layout_changed'
  | 'timeout'
  | 'cancelled'
  | 'empty_response';

export class BrowserFailure extends Error {
  readonly kind: BrowserFailureKind;
  constructor(kind: BrowserFailureKind, message: string) {
    super(message);
    this.name = 'BrowserFailure';
    this.kind = kind;
  }
}
