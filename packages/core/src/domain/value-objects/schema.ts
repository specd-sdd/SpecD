import { ArtifactType } from './artifact-type.js'
import { type MetadataExtraction } from './metadata-extraction.js'
import { type WorkflowStep } from './workflow-step.js'

/** Schema kind discriminator. */
export type SchemaKind = 'schema' | 'schema-plugin'

/**
 * A fully-parsed schema loaded from a `schema.yaml` file.
 *
 * Schemas are resolved by {@link SchemaRegistry} using a three-level lookup:
 * project-local → user override → npm package. Once resolved, the schema is
 * immutable for the lifetime of the operation.
 *
 * Use `artifact(id)` for O(1) lookup instead of iterating `artifacts()`.
 */
export class Schema {
  private readonly _kind: SchemaKind
  private readonly _name: string
  private readonly _version: number
  private readonly _extends: string | undefined
  private readonly _artifacts: readonly ArtifactType[]
  private readonly _artifactIndex: ReadonlyMap<string, ArtifactType>
  private readonly _metadataExtraction: MetadataExtraction | undefined
  private readonly _workflow: readonly WorkflowStep[]
  private readonly _workflowIndex: ReadonlyMap<string, WorkflowStep>

  /**
   * Creates a fully-resolved schema instance.
   *
   * @param kind - The schema kind (`schema` or `schema-plugin`)
   * @param name - The resolved schema name (e.g. `"@specd/schema-std"`, `"my-team-schema"`)
   * @param version - The schema version integer, monotonically increasing
   * @param artifacts - Artifact type definitions in schema-declared order
   * @param workflow - Workflow step configurations in schema-declared order
   * @param metadataExtraction - Optional metadata extraction declarations
   * @param extendsRef - Optional parent schema reference
   */
  constructor(
    kind: SchemaKind,
    name: string,
    version: number,
    artifacts: readonly ArtifactType[],
    workflow: readonly WorkflowStep[],
    metadataExtraction?: MetadataExtraction,
    extendsRef?: string,
  ) {
    this._kind = kind
    this._name = name
    this._version = version
    this._extends = extendsRef
    this._artifacts = artifacts
    this._artifactIndex = new Map(artifacts.map((a) => [a.id, a]))
    this._metadataExtraction = metadataExtraction
    this._workflow = workflow
    this._workflowIndex = new Map(workflow.map((s) => [s.step, s]))
  }

  /**
   * The resolved schema name (e.g. `"@specd/schema-std"`, `"my-team-schema"`).
   *
   * @returns The schema name
   */
  name(): string {
    return this._name
  }

  /**
   * The schema version integer from `schema.yaml`. Monotonically increasing.
   *
   * @returns The schema version
   */
  version(): number {
    return this._version
  }

  /**
   * All artifact type definitions in schema-declared order.
   *
   * @returns All artifact types in declaration order
   */
  artifacts(): readonly ArtifactType[] {
    return this._artifacts
  }

  /**
   * Returns the artifact type with the given `id`, or `null` if not found.
   *
   * @param id - The artifact type ID (e.g. `"specs"`, `"tasks"`)
   * @returns The matching artifact type, or `null`
   */
  artifact(id: string): ArtifactType | null {
    return this._artifactIndex.get(id) ?? null
  }

  /**
   * The metadata extraction declarations, or `undefined` if the schema does
   * not declare `metadataExtraction`.
   *
   * @returns The metadata extraction configuration, or `undefined`
   */
  metadataExtraction(): MetadataExtraction | undefined {
    return this._metadataExtraction
  }

  /**
   * All workflow step configurations in schema-declared order.
   *
   * @returns All workflow steps in declaration order
   */
  workflow(): readonly WorkflowStep[] {
    return this._workflow
  }

  /**
   * Returns the workflow step for the given step name, or `null` if not found.
   *
   * @param step - The step name (e.g. `"implementing"`, `"archiving"`)
   * @returns The matching workflow step, or `null`
   */
  workflowStep(step: string): WorkflowStep | null {
    return this._workflowIndex.get(step) ?? null
  }

  /**
   * The schema kind discriminator (`schema` or `schema-plugin`).
   *
   * @returns The schema kind
   */
  kind(): SchemaKind {
    return this._kind
  }

  /**
   * The parent schema reference from `extends`, or `undefined` if this schema
   * does not extend another.
   *
   * @returns The parent schema reference, or `undefined`
   */
  extendsRef(): string | undefined {
    return this._extends
  }
}
