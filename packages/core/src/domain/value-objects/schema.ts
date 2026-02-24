import { type OperationKeywords } from '../services/delta-merger.js'
import { ArtifactType } from './artifact-type.js'
import { type WorkflowStep } from './workflow-step.js'

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
  private readonly _name: string
  private readonly _version: number
  private readonly _artifacts: readonly ArtifactType[]
  private readonly _artifactIndex: ReadonlyMap<string, ArtifactType>
  private readonly _workflow: readonly WorkflowStep[]
  private readonly _workflowIndex: ReadonlyMap<string, WorkflowStep>
  private readonly _deltaOperations: OperationKeywords

  /**
   * Creates a fully-resolved schema instance.
   *
   * @param name - The resolved schema name (e.g. `"@specd/schema-std"`, `"my-team-schema"`)
   * @param version - The schema version integer, monotonically increasing
   * @param artifacts - Artifact type definitions in schema-declared order
   * @param workflow - Workflow step configurations in schema-declared order
   * @param deltaOperations - Operation keywords for delta section recognition
   */
  constructor(
    name: string,
    version: number,
    artifacts: readonly ArtifactType[],
    workflow: readonly WorkflowStep[],
    deltaOperations: OperationKeywords,
  ) {
    this._name = name
    this._version = version
    this._artifacts = artifacts
    this._artifactIndex = new Map(artifacts.map((a) => [a.id(), a]))
    this._workflow = workflow
    this._workflowIndex = new Map(workflow.map((s) => [s.step, s]))
    this._deltaOperations = deltaOperations
  }

  /**
   * The resolved schema name as it appears in `specd.yaml` or the registry
   * (e.g. `"@specd/schema-std"`, `"my-team-schema"`).
   *
   * @returns The schema name
   */
  name(): string {
    return this._name
  }

  /**
   * The schema version integer from `schema.yaml`. Monotonically increasing.
   * Recorded in the change manifest at creation time so specd can detect
   * schema upgrades that occurred after a change was opened.
   *
   * @returns The schema version
   */
  version(): number {
    return this._version
  }

  /**
   * All artifact type definitions in schema-declared order.
   *
   * The declaration order reflects the intended generation sequence, but
   * callers that need strict topological order should sort by `requires[]`
   * dependency chains.
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
   * All workflow step configurations in schema-declared order.
   *
   * Schema steps fire first; project-level steps from `specd.yaml` are
   * appended after by the use case that compiles the instruction block.
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
   * The operation keywords used to recognise delta section headings.
   * Defaults to `ADDED`, `MODIFIED`, `REMOVED`, `RENAMED`, `FROM`, `TO`
   * when not overridden in the schema.
   *
   * @returns The configured delta operation keywords
   */
  deltaOperations(): OperationKeywords {
    return this._deltaOperations
  }
}
