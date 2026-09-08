/** Simple token-bucket limiter used to keep Exa request rate under the
 * configured per-minute budget without needing an external dependency. */
export class RateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillIntervalMs = 60_000;
  private lastRefill: number;
  private readonly queue: Array<() => void> = [];
  private readonly ticker: NodeJS.Timeout;

  constructor(requestsPerMinute: number) {
    this.maxTokens = requestsPerMinute;
    this.tokens = requestsPerMinute;
    this.lastRefill = Date.now();
    this.ticker = setInterval(() => this.refillAndDrain(), 250);
    this.ticker.unref?.();
  }

  private refillAndDrain(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed > 0) {
      const refillAmount = (elapsed / this.refillIntervalMs) * this.maxTokens;
      if (refillAmount >= 0.01) {
        this.tokens = Math.min(this.maxTokens, this.tokens + refillAmount);
        this.lastRefill = now;
      }
    }
    while (this.tokens >= 1 && this.queue.length > 0) {
      this.tokens -= 1;
      const resolve = this.queue.shift();
      resolve?.();
    }
  }

  async acquire(): Promise<void> {
    this.refillAndDrain();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }
}
