import { type SchemaRegistry } from '../ports/schema-registry.js'
import { type ArtifactParserRegistry, type ArtifactNode } from '../ports/artifact-parser.js'
import { type Selector } from '../../domain/value-objects/selector.js'
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'
import { inferFormat } from '../../domain/services/format-inference.js'
import { safeRegex } from '../../domain/services/safe-regex.js'

/** Input for the {@link InferSpecSections} use case. */
export interface InferSpecSectionsInput {
  /** Loaded artifact file contents, keyed by filename. */
  readonly artifacts: ReadonlyMap<string, { readonly content: string }>
  /** Schema reference (e.g. `"@specd/schema-std"`). */
  readonly schemaRef: string
  /** Map of workspace name to absolute schemas directory path. */
  readonly workspaceSchemasPaths: ReadonlyMap<string, string>
}

/** Result returned by the {@link InferSpecSections} use case. */
export interface InferSpecSectionsResult {
  /** Inferred rule entries extracted from artifact context sections. */
  readonly rules: readonly string[]
  /** Inferred constraint entries extracted from artifact context sections. */
  readonly constraints: readonly string[]
  /** Inferred scenario entries extracted from artifact context sections. */
  readonly scenarios: readonly string[]
}

/**
 * Infers semantic sections (rules, constraints, scenarios) from a spec's
 * artifact files by matching schema-defined `contextSections` selectors
 * against parsed ASTs.
 *
 * This use case encapsulates the business logic of AST traversal and selector
 * matching that was previously inlined in the CLI's `spec metadata --infer`
 * command.
 */
export class InferSpecSections {
  private readonly _schemas: SchemaRegistry
  private readonly _parsers: ArtifactParserRegistry

  /**
   * Creates a new `InferSpecSections` use case instance.
   *
   * @param schemas - Registry for resolving schema references
   * @param parsers - Registry of artifact format parsers
   */
  constructor(schemas: SchemaRegistry, parsers: ArtifactParserRegistry) {
    this._schemas = schemas
    this._parsers = parsers
  }

  /**
   * Executes the use case.
   *
   * @param input - Inference parameters
   * @returns Inferred rules, constraints, and scenarios
   * @throws {SchemaNotFoundError} If the schema reference cannot be resolved
   */
  async execute(input: InferSpecSectionsInput): Promise<InferSpecSectionsResult> {
    const schema = await this._schemas.resolve(input.schemaRef, input.workspaceSchemasPaths)
    if (schema === null) throw new SchemaNotFoundError(input.schemaRef)

    const rules: string[] = []
    const constraints: string[] = []
    const scenarios: string[] = []

    for (const artifactType of schema.artifacts()) {
      if (artifactType.scope() !== 'spec') continue

      const format = artifactType.format() ?? inferFormat(artifactType.output())
      if (format === undefined) continue

      const parser = this._parsers.get(format)
      if (parser === undefined) continue

      const filename = artifactType.output()
      const artifact = input.artifacts.get(filename)
      if (artifact === undefined) continue

      const ast = parser.parse(artifact.content)

      for (const section of artifactType.contextSections()) {
        const nodes = this._findNodes(ast.root, section.selector)
        for (const node of nodes) {
          const extracted =
            section.extract === 'label'
              ? (node.label ?? '')
              : section.extract === 'both'
                ? `${node.label ?? ''}: ${parser.renderSubtree(node)}`
                : parser.renderSubtree(node)

          if (extracted.trim() === '') continue

          switch (section.role) {
            case 'rules':
              rules.push(extracted)
              break
            case 'constraints':
              constraints.push(extracted)
              break
            case 'scenarios':
              scenarios.push(extracted)
              break
          }
        }
      }
    }

    return { rules, constraints, scenarios }
  }

  /**
   * Finds all AST nodes matching the given selector.
   *
   * @param root - The root node to search from
   * @param selector - The selector criteria to match
   * @returns Array of matching nodes
   */
  private _findNodes(root: ArtifactNode, selector: Selector): ArtifactNode[] {
    const results: ArtifactNode[] = []
    this._collectNodes(root, selector, [], results)
    return results
  }

  /**
   * Recursively collects nodes matching the selector, tracking ancestors.
   *
   * @param node - The current node being examined
   * @param selector - The selector criteria to match
   * @param ancestors - Chain of ancestor nodes from root
   * @param results - Mutable array to collect matches
   */
  private _collectNodes(
    node: ArtifactNode,
    selector: Selector,
    ancestors: readonly ArtifactNode[],
    results: ArtifactNode[],
  ): void {
    if (this._selectorMatches(node, selector, ancestors)) {
      results.push(node)
    }
    const newAncestors = [...ancestors, node]
    for (const child of node.children ?? []) {
      this._collectNodes(child, selector, newAncestors, results)
    }
  }

  /**
   * Returns `true` if `node` matches all criteria in `selector`.
   *
   * @param node - The node to test
   * @param selector - The selector criteria
   * @param ancestors - Chain of ancestor nodes for parent matching
   * @returns True if the node matches
   */
  private _selectorMatches(
    node: ArtifactNode,
    selector: Selector,
    ancestors: readonly ArtifactNode[],
  ): boolean {
    if (node.type !== selector.type) return false

    if (selector.matches !== undefined) {
      const regex = safeRegex(selector.matches, 'i')
      if (regex === null || !regex.test(node.label ?? '')) return false
    }

    if (selector.contains !== undefined) {
      const regex = safeRegex(selector.contains, 'i')
      if (regex === null || !regex.test(String(node.value ?? ''))) return false
    }

    if (selector.parent !== undefined) {
      const nearestOfType = [...ancestors].reverse().find((a) => a.type === selector.parent!.type)
      if (nearestOfType === undefined) return false
      if (!this._selectorMatches(nearestOfType, selector.parent, [])) return false
    }

    return true
  }
}
