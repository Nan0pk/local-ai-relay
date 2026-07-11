/**
 * Browser pages are stateful and ChatGPT Free has tight usage limits.
 * Keep browser work serialized until a future scheduler can prove two
 * conversations are safe to run concurrently.
 */
export class SerialQueue {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }
}
