/** Resolves after `ms` milliseconds. Shared by the polling runtimes. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Runs `worker` over every item while keeping at most `limit` operations in
 * flight, preserving the original result order. Errors are captured per item so
 * one failing call does not cancel the others; the caller decides how to
 * surface them.
 *
 * Used for MCP tool fan-out: a model can ask for an arbitrary number of tool
 * calls in one round, and running them all at once bursts the network and the
 * main thread.
 */
export async function mapWithConcurrencyResults<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<Array<{ ok: true; value: R } | { ok: false; error: unknown }>> {
  const results = new Array<{ ok: true; value: R } | { ok: false; error: unknown }>(items.length)
  let cursor = 0

  const run = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      try {
        results[index] = { ok: true, value: await worker(items[index], index) }
      } catch (error) {
        results[index] = { ok: false, error }
      }
    }
  }

  const workers = Math.min(Math.max(limit, 1), items.length)
  await Promise.all(Array.from({ length: workers }, () => run()))
  return results
}

/**
 * Runs `task` over every item while keeping at most `limit` operations in
 * flight. `Promise.all(items.map(...))` on a large collection (clearing a
 * clipboard history can be tens of thousands of files) opens one filesystem
 * request per item and exhausts the libuv threadpool / file descriptors.
 */
export async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<unknown>
): Promise<void> {
  await mapWithConcurrencyResults(items, limit, (item) => task(item)).then(() => undefined)
}
