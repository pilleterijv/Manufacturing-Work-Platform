// Small, process-local connection cache. Values are connection pools, never
// authorization decisions. Failed connects are evicted; shutdown closes all pools.
export class ConnectionCache<T> {
  private entries = new Map<string, Promise<T>>();
  constructor(
    private closeValue: (value: T) => Promise<unknown>,
    private max = 20,
  ) {}
  async get(key: string, create: () => Promise<T>): Promise<T> {
    const old = this.entries.get(key);
    if (old) return old;
    if (this.entries.size >= this.max)
      throw Error("External connection pool limit reached");
    const pending = Promise.resolve().then(create);
    this.entries.set(key, pending);
    try {
      return await pending;
    } catch (e) {
      if (this.entries.get(key) === pending) this.entries.delete(key);
      throw e;
    }
  }
  async retain(keys: Set<string>) {
    const removed = [...this.entries].filter(([key]) => !keys.has(key));
    for (const [key] of removed) this.entries.delete(key);
    await Promise.allSettled(
      removed.map(async ([, pending]) => this.closeValue(await pending)),
    );
  }
  async close() {
    await this.retain(new Set());
  }
}
