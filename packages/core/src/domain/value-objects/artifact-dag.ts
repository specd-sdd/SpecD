import { ArtifactType, type ArtifactScope } from './artifact-type.js'

/**
 * Schema-derived artifact dependency DAG.
 *
 * Built from `artifacts[].requires` with stable tie-breaking using schema
 * declaration order.
 */
export class ArtifactDag {
  private readonly _roots: readonly string[]
  private readonly _children: ReadonlyMap<string, readonly string[]>
  private readonly _topologicalOrder: readonly string[]
  private readonly _orderIndex: ReadonlyMap<string, number>

  /**
   * Internal constructor for a validated schema-derived DAG snapshot.
   *
   * @param roots - Artifact ids with no incoming `requires` edges
   * @param children - Direct dependents keyed by parent id
   * @param topologicalOrder - All ids in parent-before-child order
   * @param orderIndex - Schema declaration order for tie-breaking
   */
  private constructor(
    roots: readonly string[],
    children: ReadonlyMap<string, readonly string[]>,
    topologicalOrder: readonly string[],
    orderIndex: ReadonlyMap<string, number>,
  ) {
    this._roots = roots
    this._children = children
    this._topologicalOrder = topologicalOrder
    this._orderIndex = orderIndex
  }

  /**
   * Builds an {@link ArtifactDag} from schema artifact type definitions.
   *
   * @param artifacts - Artifact types in schema declaration order
   * @returns A cached-query value object for the artifact DAG
   * @throws {Error} When the requires graph has a cycle or unresolved dependencies
   */
  static from(artifacts: readonly ArtifactType[]): ArtifactDag {
    const declarationOrder = artifacts.map((a) => a.id)
    const orderIndex = new Map(declarationOrder.map((id, index) => [id, index]))

    const childrenMutable = new Map<string, string[]>()
    for (const id of declarationOrder) {
      childrenMutable.set(id, [])
    }
    for (const artifact of artifacts) {
      for (const dep of artifact.requires) {
        const kids = childrenMutable.get(dep)
        if (kids === undefined) {
          childrenMutable.set(dep, [artifact.id])
        } else {
          kids.push(artifact.id)
        }
      }
    }

    const children = new Map<string, readonly string[]>()
    for (const [id, kids] of childrenMutable) {
      kids.sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0))
      children.set(id, kids)
    }

    const inDegree = new Map<string, number>()
    for (const artifact of artifacts) {
      inDegree.set(artifact.id, artifact.requires.length)
    }

    const ready: string[] = artifacts
      .filter((a) => a.requires.length === 0)
      .map((a) => a.id)
      .sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0))

    const topologicalOrder: string[] = []
    while (ready.length > 0) {
      const current = ready.shift()!
      topologicalOrder.push(current)
      for (const child of children.get(current) ?? []) {
        const next = (inDegree.get(child) ?? 0) - 1
        inDegree.set(child, next)
        if (next === 0) {
          ready.push(child)
          ready.sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0))
        }
      }
    }

    if (topologicalOrder.length !== declarationOrder.length) {
      throw new Error('ArtifactDag: cycle detected in artifact requires graph')
    }

    const roots = artifacts
      .filter((a) => a.requires.length === 0)
      .map((a) => a.id)
      .sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0))

    return new ArtifactDag(roots, children, topologicalOrder, orderIndex)
  }

  /**
   * Artifact ids with no `requires` entries, in schema declaration order.
   *
   * @returns Root artifact type ids
   */
  roots(): readonly string[] {
    return this._roots
  }

  /**
   * Direct dependents of `id` (inverse of `requires`), in schema declaration order.
   *
   * @param id - Parent artifact type id
   * @returns Child artifact ids
   */
  childrenOf(id: string): readonly string[] {
    return this._children.get(id) ?? []
  }

  /**
   * All artifact ids in topological order (parents before children).
   *
   * @returns Artifact type ids in DAG order
   */
  topologicalOrder(): readonly string[] {
    return this._topologicalOrder
  }

  /**
   * All transitive dependents of the given ids, excluding the seed ids themselves.
   *
   * @param ids - Root artifact type ids
   * @returns Descendant ids in topological order
   */
  descendantsOf(ids: readonly string[]): readonly string[] {
    const seeds = new Set(ids)
    const visited = new Set<string>()
    const queue = [...ids]

    while (queue.length > 0) {
      const current = queue.shift()!
      for (const child of this._children.get(current) ?? []) {
        if (visited.has(child)) continue
        visited.add(child)
        queue.push(child)
      }
    }

    return this._topologicalOrder.filter((id) => visited.has(id) && !seeds.has(id))
  }
}

/** Minimal artifact type inputs for building a DAG from persisted change artifacts. */
export interface ChangeArtifactDagNode {
  readonly type: string
  readonly requires: readonly string[]
  readonly scope?: ArtifactScope
}

/**
 * Builds an {@link ArtifactDag} from change-persisted artifact `requires` edges.
 *
 * @param artifacts - Change artifacts (or compatible node descriptors)
 * @returns DAG for invalidation expansion when a live {@link Schema} is unavailable
 */
export function artifactDagFromChangeArtifacts(
  artifacts: Iterable<ChangeArtifactDagNode>,
): ArtifactDag {
  const types = [...artifacts].map(
    (artifact) =>
      new ArtifactType({
        id: artifact.type,
        scope: artifact.scope ?? 'change',
        output: `${artifact.type}.md`,
        requires: [...artifact.requires],
        validations: [],
        deltaValidations: [],
        preHashCleanup: [],
      }),
  )
  if (types.length === 0) {
    return ArtifactDag.from([
      new ArtifactType({
        id: 'proposal',
        scope: 'change',
        output: 'proposal.md',
        requires: [],
        validations: [],
        deltaValidations: [],
        preHashCleanup: [],
      }),
    ])
  }
  return ArtifactDag.from(types)
}
