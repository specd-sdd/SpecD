/**
 * Asks the host runtime for a garbage collection when it exposes one; otherwise does nothing.
 */
export function requestGarbageCollection(): void {
  if (typeof globalThis.gc === 'function') {
    globalThis.gc()
  }
}
