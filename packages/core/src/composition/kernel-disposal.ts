import { Logger } from '../application/logger.js'
import { DisposerFailedError } from '../application/errors/disposer-failed-error.js'
import { InvalidDisposerError } from '../application/errors/invalid-disposer-error.js'
import { RegistryConflictError } from '../application/errors/registry-conflict-error.js'

/**
 * A named, opaque cleanup action owned by the kernel once construction succeeds.
 *
 * Core treats the action as opaque: it never inspects what the disposer releases.
 */
export interface KernelDisposer {
  /** Non-empty name, unique per kernel; used in warnings and aggregated errors. */
  readonly name: string
  /** Cleanup work; may be synchronous or asynchronous. */
  readonly dispose: () => void | Promise<void>
}

/** Fixed upper bound, in milliseconds, for one disposer. */
export const KERNEL_DISPOSER_TIMEOUT_MS = 5000

/**
 * Tells whether an unknown value is a well-formed disposer entry.
 *
 * @param value - Candidate entry
 * @returns `true` when it has a non-empty string `name` and a callable `dispose`
 */
function isWellFormed(value: unknown): value is KernelDisposer {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as { readonly name?: unknown; readonly dispose?: unknown }
  return typeof entry.name === 'string' && entry.name !== '' && typeof entry.dispose === 'function'
}

/**
 * Validates a disposers array.
 *
 * @param disposers - Entries supplied through `KernelOptions.disposers`
 * @throws {InvalidDisposerError} When an entry has an empty or non-string name, or a non-callable `dispose`
 * @throws {RegistryConflictError} With registry `'disposers'` when two entries share a name
 */
export function validateDisposers(disposers: readonly KernelDisposer[]): void {
  const seen = new Set<string>()
  for (const entry of disposers) {
    if (!isWellFormed(entry)) {
      throw new InvalidDisposerError(
        'each entry needs a non-empty string name and a callable dispose',
      )
    }
    if (seen.has(entry.name)) {
      throw new RegistryConflictError('disposers', entry.name)
    }
    seen.add(entry.name)
  }
}

/**
 * Runs one disposer bounded by {@link KERNEL_DISPOSER_TIMEOUT_MS}.
 *
 * @param disposer - Disposer to run
 * @returns `'done'` when it settled, `'timeout'` when it was abandoned
 * @throws The original failure when the disposer rejects before the timeout
 */
async function runOne(disposer: KernelDisposer): Promise<'done' | 'timeout'> {
  // Starting inside a promise turns a synchronous throw into a rejection.
  const pending = Promise.resolve().then(() => disposer.dispose())
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), KERNEL_DISPOSER_TIMEOUT_MS)
    timer.unref()
  })
  try {
    const outcome = await Promise.race([pending.then(() => 'done' as const), timeout])
    if (outcome === 'timeout') {
      // The disposer is abandoned: swallow a late rejection so it is not unhandled.
      pending.catch(() => {})
    }
    return outcome
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Runs disposers in reverse order, one at a time, with failure isolation and a
 * per-disposer timeout.
 *
 * @param disposers - Disposers in registration order
 * @returns Resolves when every disposer ran and none failed
 * @throws {AggregateError} When at least one disposer failed; `errors` holds one
 *   {@link DisposerFailedError} per failure in execution order. Timeouts are not failures.
 */
export async function runDisposers(disposers: readonly KernelDisposer[]): Promise<void> {
  const errors: DisposerFailedError[] = []
  for (const disposer of [...disposers].reverse()) {
    try {
      const outcome = await runOne(disposer)
      if (outcome === 'timeout') {
        Logger.warn(
          `Disposer '${disposer.name}' did not finish within ${KERNEL_DISPOSER_TIMEOUT_MS} ms; abandoning it`,
          { disposer: disposer.name, timeoutMs: KERNEL_DISPOSER_TIMEOUT_MS },
        )
      }
    } catch (cause) {
      errors.push(new DisposerFailedError(disposer.name, cause))
    }
  }
  if (errors.length > 0) {
    const names = errors.map((error) => error.disposerName).join(', ')
    throw new AggregateError(errors, `${errors.length} disposer(s) failed: ${names}`)
  }
}

/**
 * Creates the memoized `dispose` function for a disposer list.
 *
 * @param disposers - Disposers in registration order
 * @returns A function whose first call starts disposal; later and concurrent calls share its promise
 */
export function createDispose(disposers: readonly KernelDisposer[]): () => Promise<void> {
  let disposal: Promise<void> | undefined
  return () => (disposal ??= runDisposers(disposers))
}

/**
 * Releases the well-formed entries of an array after a failed construction. Never throws.
 *
 * @param disposers - Entries supplied by the caller, possibly malformed
 */
export async function releaseAfterFailedConstruction(disposers: readonly unknown[]): Promise<void> {
  const wellFormed = disposers.filter(isWellFormed)
  if (wellFormed.length === 0) return
  try {
    await runDisposers(wellFormed)
  } catch (error) {
    const failures =
      error instanceof AggregateError
        ? error.errors.map((e: unknown) => String(e))
        : [String(error)]
    Logger.warn('Failed to release disposers after kernel construction failure', { failures })
  }
}
