import {
  CHECK_LABELS,
  fail,
  pass,
  skip,
  type Check,
  type CheckExecutionContext,
  type CheckResult,
} from '../services/transition-checks.js'

/** Peer change that shares overlapping specs. */
export interface SpecOverlapPeerDetail {
  /** Overlapping peer change name. */
  readonly changeName: string
  /** Spec ids shared with this peer. */
  readonly overlappingSpecIds: readonly string[]
}

/** Facts for `spec.overlap`. */
export interface SpecOverlapFacts {
  readonly allowOverlap: boolean
  readonly specOverlapBlocked: boolean
  readonly specOverlapMessage?: string
  readonly specOverlapPeers?: readonly SpecOverlapPeerDetail[]
}

/**
 * Builds an actionable overlap fail message from peer details.
 *
 * @param peers - Named peers with overlapping spec ids
 * @param fallback - Message when peers are empty
 * @returns Human-readable summary
 */
function formatOverlapMessage(peers: readonly SpecOverlapPeerDetail[], fallback: string): string {
  if (peers.length === 0) {
    return fallback
  }
  const parts = peers.map((peer) => {
    const ids = peer.overlappingSpecIds.length === 0 ? '[]' : peer.overlappingSpecIds.join(', ')
    return `${peer.changeName} (${ids})`
  })
  return `Specs overlap with other active changes: ${parts.join('; ')}`
}

/**
 * `spec.overlap` (detection only; invalidation stays in ArchiveChange).
 * Operation `archive` is a registry binding.
 *
 * @param facts - Overlap flag + skip
 * @returns Check result
 */
export function runSpecOverlap(facts: SpecOverlapFacts): CheckResult {
  if (facts.allowOverlap) {
    return skip('spec.overlap')
  }
  if (!facts.specOverlapBlocked) {
    return pass('spec.overlap')
  }
  const peers = facts.specOverlapPeers ?? []
  const fallback = facts.specOverlapMessage ?? 'Specs overlap with other active changes'
  const message = formatOverlapMessage(peers, fallback)
  return fail('spec.overlap', 'OVERLAP_CONFLICT', message, {
    ...(peers.length > 0 ? { peers } : {}),
  })
}

/**
 * Predicate body.
 *
 * @param facts - Overlap flag + skip
 * @returns Check result
 */
export function run(facts: SpecOverlapFacts): CheckResult {
  return runSpecOverlap(facts)
}

/**
 * Domain stub execute. Application `create*` owns I/O.
 *
 * @param ctx - Host attempt context
 * @returns Check result
 */
function execute(ctx: CheckExecutionContext): Promise<CheckResult> {
  return Promise.resolve(
    run({
      allowOverlap: ctx.allowOverlap,
      specOverlapBlocked: false,
    }),
  )
}

/** Reusable `spec.overlap` check. */
export const specOverlap: Check = {
  id: 'spec.overlap',
  label: CHECK_LABELS['spec.overlap'],
  kind: 'predicate',
  execute,
}
