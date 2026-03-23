import { type RelationType } from './relation-type.js'

/**
 * Aggregate statistics about the contents of a code graph.
 */
export interface GraphStatistics {
  readonly fileCount: number
  readonly symbolCount: number
  readonly specCount: number
  readonly relationCounts: Readonly<Record<RelationType, number>>
  readonly languages: readonly string[]
  readonly lastIndexedAt: string | undefined
  readonly lastIndexedRef: string | null
}
