import { type Selector } from './selector.js'

/** Cardinality constraints for selector matches. */
export interface ValidationUniqueCount {
  readonly by: CrossArtifactKeySpec
  readonly minUnique?: number
  readonly maxUnique?: number
  readonly exactlyUnique?: number
}

/** Cardinality constraints for selector matches. */
export interface ValidationCount {
  readonly exactly?: number
  readonly min?: number
  readonly max?: number
  readonly unique?: ValidationUniqueCount
}

/** Scope shared by all participants in one cross-artifact rule. */
export type CrossArtifactScope = 'spec' | 'change'

/** Source field used when extracting comparable keys from selected nodes. */
export type CrossArtifactKeySource = 'label' | 'value' | 'content'

/** Supported relation operators for participant key collections. */
export type CrossArtifactRelationKind = 'all-equal' | 'subset' | 'superset'

/** Ordering mode applied during relation comparison. */
export type CrossArtifactOrdering = 'ignore' | 'strict'

/** Key-extraction options for one participant. */
export interface CrossArtifactKeySpec {
  readonly from: CrossArtifactKeySource
  readonly capture?: string
  readonly strip?: string
}

/** One artifact participant within a relational rule. */
export interface CrossArtifactParticipant {
  readonly artifact: string
  readonly as: string
  readonly selector: Selector
  readonly keySelector?: Selector
  readonly key: CrossArtifactKeySpec
}

/** Relation definition for a cross-artifact rule. */
export interface CrossArtifactRelation {
  readonly kind: CrossArtifactRelationKind
  readonly between: readonly string[]
  readonly options?: {
    readonly ordering?: CrossArtifactOrdering
  }
}

/** Schema-level relational rule spanning multiple artifact participants. */
export interface CrossArtifactValidationRule {
  readonly id: string
  readonly scope: CrossArtifactScope
  readonly participants: readonly CrossArtifactParticipant[]
  readonly relation: CrossArtifactRelation
}
