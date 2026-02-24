import { type DeltaConfig } from '../services/delta-merger.js'
import { type ValidationRule, type ContextSection } from './validation-rule.js'

/** Where an artifact lives after the change is archived. */
export type ArtifactScope = 'spec' | 'change'

/** Construction properties for {@link ArtifactType}. */
export interface ArtifactTypeProps {
  /** Stable identifier for this artifact (e.g. `"specs"`, `"tasks"`). */
  readonly id: string
  /**
   * Where this artifact lives after archiving. `"spec"` means the file is
   * synced to the `SpecRepository` (e.g. `spec.md`, `verify.md`). `"change"`
   * means it stays only in the change directory (e.g. `proposal.md`, `tasks.md`).
   */
  readonly scope: ArtifactScope
  /**
   * Glob pattern for the file(s) this artifact output
   * (e.g. `"proposal.md"`, `"specs/**\/spec.md"`).
   */
  readonly output: string
  /** The LLM instruction used to generate this artifact. */
  readonly instruction: string
  /**
   * IDs of other artifacts that must be `complete` before this artifact can
   * be generated. Defines the generation dependency order within a schema.
   */
  readonly requires: readonly string[]
  /**
   * When `true`, this artifact may be absent without failing validation.
   * When `false` (default), `ValidateSpec` requires it to be present.
   */
  readonly optional?: boolean
  /**
   * Per-section delta merge configurations. Determines which Markdown sections
   * are treated as delta sections and how named blocks within them are matched.
   */
  readonly deltas: readonly DeltaConfig[]
  /**
   * Structural validation rules applied to the *base* spec file after a delta
   * merge. Empty array means no post-merge validation is performed.
   */
  readonly validations: readonly ValidationRule[]
  /**
   * Structural validation rules applied to the *delta* file before merging.
   * Empty array means no pre-merge validation is performed.
   */
  readonly deltaValidations: readonly ValidationRule[]
  /**
   * Spec sections extracted and injected into the compiled instruction block
   * as context for the agent.
   */
  readonly contextSections: readonly ContextSection[]
}

/**
 * An artifact type defined in a schema, describing one category of file that
 * a change produces (e.g. proposal, specs, tasks).
 *
 * Immutable value object — equality is by identity (same schema, same `id`).
 */
export class ArtifactType {
  private readonly _id: string
  private readonly _scope: ArtifactScope
  private readonly _output: string
  private readonly _instruction: string
  private readonly _requires: readonly string[]
  private readonly _optional: boolean
  private readonly _deltas: readonly DeltaConfig[]
  private readonly _validations: readonly ValidationRule[]
  private readonly _deltaValidations: readonly ValidationRule[]
  private readonly _contextSections: readonly ContextSection[]

  /**
   * Creates a new `ArtifactType` from schema configuration.
   *
   * @param props - Artifact type configuration
   */
  constructor(props: ArtifactTypeProps) {
    this._id = props.id
    this._scope = props.scope
    this._output = props.output
    this._instruction = props.instruction
    this._requires = props.requires
    this._optional = props.optional ?? false
    this._deltas = props.deltas
    this._validations = props.validations
    this._deltaValidations = props.deltaValidations
    this._contextSections = props.contextSections
  }

  /**
   * Stable identifier for this artifact type (e.g. `"specs"`, `"tasks"`).
   * Used to reference this type in `requires[]` arrays and skill `requires[]`
   * arrays.
   *
   * @returns The artifact type ID
   */
  id(): string {
    return this._id
  }

  /**
   * Where this artifact lives after archiving. `"spec"` artifacts are synced
   * to the `SpecRepository`; `"change"` artifacts remain in the change directory.
   *
   * @returns The artifact scope
   */
  scope(): ArtifactScope {
    return this._scope
  }

  /**
   * Glob pattern for the file(s) this artifact output
   * (e.g. `"proposal.md"`, `"specs/**\/spec.md"`).
   *
   * @returns The glob pattern for generated files
   */
  output(): string {
    return this._output
  }

  /**
   * The LLM instruction used to generate this artifact.
   *
   * @returns The generation instruction text
   */
  instruction(): string {
    return this._instruction
  }

  /**
   * IDs of artifact types that must be `complete` before this artifact can be
   * generated. Determines the topological sort order within a schema.
   *
   * @returns Artifact IDs this type depends on
   */
  requires(): readonly string[] {
    return this._requires
  }

  /**
   * When `true`, this artifact may be absent without failing `ValidateSpec`.
   * When `false`, the artifact must be present in the change.
   *
   * @returns `true` if the artifact is optional
   */
  optional(): boolean {
    return this._optional
  }

  /**
   * Per-section delta merge configurations for this artifact's spec files.
   * Empty when this artifact type does not support delta merges.
   *
   * @returns Delta merge configurations
   */
  deltas(): readonly DeltaConfig[] {
    return this._deltas
  }

  /**
   * Structural validation rules applied to the base spec file after a delta
   * merge. Empty when no post-merge validation is configured.
   *
   * @returns Post-merge validation rules
   */
  validations(): readonly ValidationRule[] {
    return this._validations
  }

  /**
   * Structural validation rules applied to the delta file before merging.
   * Empty when no pre-merge validation is configured.
   *
   * @returns Pre-merge delta validation rules
   */
  deltaValidations(): readonly ValidationRule[] {
    return this._deltaValidations
  }

  /**
   * Spec sections extracted and injected into the compiled instruction block
   * for this artifact type. Empty when no context injection is configured.
   *
   * @returns Context section configurations
   */
  contextSections(): readonly ContextSection[] {
    return this._contextSections
  }
}
