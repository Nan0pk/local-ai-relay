export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
}

export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly options: RateLimiterOptions = { windowMs: 60_000, maxRequests: 60 }) {}

  public isAllowed(key: string): { allowed: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;
    const timestamps = (this.hits.get(key) ?? []).filter((t) => t > windowStart);

    if (timestamps.length >= this.options.maxRequests) {
      const oldest = timestamps[0] ?? now;
      return {
        allowed: false,
        remaining: 0,
        resetMs: oldest + this.options.windowMs - now,
      };
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);
    return {
      allowed: true,
      remaining: this.options.maxRequests - timestamps.length,
      resetMs: this.options.windowMs,
    };
  }

  public reset(): void {
    this.hits.clear();
  }
}
