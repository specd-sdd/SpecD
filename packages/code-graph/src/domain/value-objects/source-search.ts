import { type FileNode } from './file-node.js'
import { type SourceRange } from './symbol-node.js'

/** Provenance tier for an exact source-content occurrence. */
export type SourceSearchMatchKind = 'full-query' | 'raw-token' | 'expanded-token'

/** Backend-neutral request for a deterministic page of source-content candidates. */
export interface SourceContentCandidateQuery {
  readonly normalizedQuery: string
  readonly rawTerms: readonly string[]
  readonly expandedTerms: readonly string[]
  readonly limit: number
  readonly cursor?: string | undefined
  readonly filePattern?: string | undefined
  readonly workspace?: string | undefined
  readonly excludePaths?: readonly string[] | undefined
  readonly excludeWorkspaces?: readonly string[] | undefined
}

/** One backend-ranked source file that Code Graph must verify against persisted content. */
export interface SourceContentCandidate {
  readonly file: FileNode
  readonly backendScore: number
}

/** Deterministic candidate page. An absent cursor means the backend is exhausted. */
export interface SourceContentCandidatePage {
  readonly candidates: readonly SourceContentCandidate[]
  readonly nextCursor?: string | undefined
}

/** Optional preview around an exact occurrence. */
export interface SourceSearchSnippet {
  readonly range: SourceRange
  readonly content: string
}

/** Exact occurrence verified by Code Graph against persisted FileNode content. */
export interface SourceContentMatch {
  readonly range: SourceRange
  readonly matchedText: string
  readonly matchKind: SourceSearchMatchKind
  readonly sourceToken: string
  readonly snippet?: SourceSearchSnippet | undefined
}

/** One source file grouped with all remaining ordered occurrences. */
export interface SourceFileSearchResult {
  readonly file: FileNode
  readonly score: number
  readonly matches: readonly SourceContentMatch[]
  /** Number of visible occurrences after symbol-overlap suppression. */
  readonly totalMatches: number
  /** Number of visible occurrences omitted from this projection. */
  readonly omittedMatches: number
}
