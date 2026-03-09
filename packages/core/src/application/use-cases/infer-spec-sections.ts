import { type SchemaRegistry } from '../ports/schema-registry.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'
import { inferFormat } from '../../domain/services/format-inference.js'
import { findNodes } from './_shared/selector-matching.js'

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
        const nodes = findNodes(ast.root, section.selector)
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
}
