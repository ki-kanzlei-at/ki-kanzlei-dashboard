/**
 * Globaler Semaphore zur Begrenzung gleichzeitiger Gemini-API-Calls.
 *
 * Pipeline-Worker erhöhen Throughput INNERHALB eines Jobs.
 * Der Semaphore verhindert, dass mehrere Jobs gemeinsam das Gemini-Rate-Limit sprengen.
 *
 * Beispiel: 5 Jobs × 25 Workers = 125 potenziell parallele Gemini-Calls
 *   → Semaphore (Limit 30) deckelt auf 30 → faire Slot-Verteilung über Jobs
 */

class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.permits = capacity;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  release(): void {
    const next = this.waiting.shift();
    if (next) {
      next();
    } else {
      this.permits++;
      if (this.permits > this.capacity) this.permits = this.capacity;
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  get stats() {
    return {
      capacity: this.capacity,
      inUse: this.capacity - this.permits,
      waiting: this.waiting.length,
    };
  }
}

const GEMINI_GLOBAL_CONCURRENCY = parseInt(
  process.env.GEMINI_GLOBAL_CONCURRENCY || "30",
  10,
);

/** Globaler Semaphore: max N gleichzeitige Gemini-Calls quer durch alle Jobs */
export const geminiSemaphore = new Semaphore(GEMINI_GLOBAL_CONCURRENCY);

export { Semaphore };
