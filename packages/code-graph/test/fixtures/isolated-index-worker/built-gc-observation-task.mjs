/** Runnable ESM fixture to observe that globalThis.gc is exposed in the child worker. */
export async function runGraphIndexTask(input) {
  return {
    marker: input.marker,
    hasGc: typeof globalThis.gc === 'function',
    pid: process.pid,
  }
}
