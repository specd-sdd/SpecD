/**
 * Returns `true` if `err` is a Node.js `ENOENT` filesystem error.
 *
 * @param err - The caught error value to inspect
 * @returns Whether `err` is an ENOENT error
 */
export function isEnoent(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as NodeJS.ErrnoException).code === 'ENOENT'
}
