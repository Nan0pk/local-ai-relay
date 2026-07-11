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
