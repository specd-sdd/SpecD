import { type RelationType, isRelationType } from './relation-type.js'
import { InvalidRelationTypeError } from '../errors/invalid-relation-type-error.js'

/**
 * Represents a directed relationship between two nodes in the code graph.
 */
export interface Relation {
  readonly source: string
  readonly target: string
  readonly type: RelationType
  readonly metadata: Readonly<Record<string, unknown>> | undefined
}

/**
 * Creates a new Relation, validating the type string.
 * @param params - The relation properties.
 * @param params.source - The source node id or path.
 * @param params.target - The target node id or path.
 * @param params.type - The relation type string.
 * @param params.metadata - Optional adapter-specific metadata.
 * @returns A Relation value object.
 * @throws {InvalidRelationTypeError} If the type string is not a valid RelationType.
 */
export function createRelation(params: {
  source: string
  target: string
  type: string
  metadata?: Record<string, unknown>
}): Relation {
  if (!isRelationType(params.type)) {
    throw new InvalidRelationTypeError(params.type)
  }

  return {
    source: params.source,
    target: params.target,
    type: params.type,
    metadata: params.metadata,
  }
}
