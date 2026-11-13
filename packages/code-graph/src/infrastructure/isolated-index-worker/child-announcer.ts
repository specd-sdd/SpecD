import { GRAPH_INDEX_PROTOCOL, ACTIVITY_ITEM_MAX_CHARS, type ChildMessage } from './protocol.js'

/** Minimum interval between non-mandatory activity announcements (250 ms = 4/s). */
export const ACTIVITY_MIN_INTERVAL_MS = 250

/** Options for {@link createAnnouncer}. */
export interface CreateAnnouncerOptions {
  /** Optional monotonic clock function. */
  readonly now?: () => number
  /** Predicate returning whether the terminal message was sent. */
  readonly isTerminalSent?: () => boolean
  /** Predicate returning whether the IPC channel is connected. */
  readonly isConnected?: () => boolean
}

/**
 * Creates an announcer that rate-limits ordinary announcements to the supervisor.
 *
 * @param send - Function delivering child IPC messages.
 * @param options - Optional clock, termination, and connection predicates.
 * @param options.now - Optional monotonic clock function.
 * @param options.isTerminalSent - Predicate returning whether the terminal message was sent.
 * @param options.isConnected - Predicate returning whether the IPC channel is connected.
 * @returns An announce function.
 */
export function createAnnouncer(
  send: (message: ChildMessage) => void,
  options?: CreateAnnouncerOptions,
): (item: string, options?: { readonly mandatory?: boolean }) => void {
  let lastActivitySentAt = Number.NEGATIVE_INFINITY
  const nowFn = options?.now ?? (() => performance.now())
  const terminalFn = options?.isTerminalSent ?? (() => false)
  const connectedFn = options?.isConnected ?? (() => true)

  return (item: string, opts?: { readonly mandatory?: boolean }): void => {
    if (item === '' || terminalFn() || !connectedFn()) {
      return
    }
    const now = nowFn()
    if (opts?.mandatory !== true && now - lastActivitySentAt < ACTIVITY_MIN_INTERVAL_MS) {
      return
    }
    lastActivitySentAt = now
    try {
      send({
        protocol: GRAPH_INDEX_PROTOCOL,
        type: 'activity',
        item: item.slice(0, ACTIVITY_ITEM_MAX_CHARS),
      })
    } catch {
      // Observability only; broken channel is detected by next progress or terminal send.
    }
  }
}
