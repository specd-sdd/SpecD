export type GraphHealthWarningDto = {
  readonly type: string
  readonly message: string
}

const FINGERPRINT_MISMATCH_MESSAGE =
  'Derivation fingerprint mismatch — code-graph version or workspace configuration changed since last index'

function shortRef(ref: string): string {
  return ref.slice(0, 7)
}

/**
 * Builds stable graph health warnings aligned with CLI `warnGraphStale` copy.
 */
export function deriveGraphHealthWarnings(input: {
  readonly stale: boolean | null
  readonly fingerprintMismatch: boolean | null
  readonly lastIndexedRef?: string | null
  readonly currentRef?: string | null
}): readonly GraphHealthWarningDto[] {
  const warnings: GraphHealthWarningDto[] = []

  if (input.stale === true) {
    if (
      input.lastIndexedRef != null &&
      input.lastIndexedRef !== '' &&
      input.currentRef != null &&
      input.currentRef !== ''
    ) {
      warnings.push({
        type: 'graph-stale',
        message: `Graph is stale (indexed at ${shortRef(input.lastIndexedRef)}, current: ${shortRef(input.currentRef)})`,
      })
    } else {
      warnings.push({
        type: 'graph-stale',
        message: 'Graph is stale — run graph index to refresh',
      })
    }
  }

  if (input.fingerprintMismatch === true) {
    warnings.push({
      type: 'graph-fingerprint-mismatch',
      message: FINGERPRINT_MISMATCH_MESSAGE,
    })
  }

  return warnings
}
