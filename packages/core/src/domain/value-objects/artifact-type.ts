import {
  type ValidationRule,
  type ContextSection,
  type PreHashCleanup,
  type TaskCompletionCheck,
} from './validation-rule.js'

/** Where an artifact lives after the change is archived. */
export type ArtifactScope = 'spec' | 'change'

/** File format of an artifact. */
export type ArtifactFormat = 'markdown' | 'json' | 'yaml' | 'plaintext'

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
   * Glob pattern for the file(s) this artifact outputs
   * (e.g. `"proposal.md"`, `"specs/**\/spec.md"`).
   */
  readonly output: string
  /** Human-readable summary for tooling. */
  readonly description?: string
  /** Path to a template file, relative to the schema directory. */
  readonly template?: string
  /** The LLM instruction used to generate this artifact. */
  readonly instruction?: string
  /**
   * IDs of other artifacts that must be resolved before this artifact can
   * be generated. Defines the generation dependency order within a schema.
   */
  readonly requires: readonly string[]
  /**
   * When `true`, this artifact may be absent without failing validation.
   * When `false` (default), `ValidateArtifacts` requires it to be present.
   */
  readonly optional?: boolean
  /**
   * Declared file format. When omitted, inferred from the output extension.
   */
  readonly format?: ArtifactFormat
  /**
   * When `true`, this artifact supports delta files. Only valid for `scope: spec`.
   */
  readonly delta?: boolean
  /**
   * Domain-specific guidance injected by `CompileContext` alongside format-level
   * delta instructions. Only valid when `delta: true`.
   */
  readonly deltaInstruction?: string
  /**
   * Structural validation rules applied to the base artifact content after
   * delta application. Empty array means no post-merge validation is performed.
   */
  readonly validations: readonly ValidationRule[]
  /**
   * Structural validation rules applied to the delta file before application.
   * Empty array means no pre-merge validation is performed. Only valid when `delta: true`.
   */
  readonly deltaValidations: readonly ValidationRule[]
  /**
   * Spec sections extracted and injected into the compiled instruction block
   * as context for the agent.
   */
  readonly contextSections: readonly ContextSection[]
  /**
   * Regex substitutions applied to artifact content before computing any hash.
   */
  readonly preHashCleanup: readonly PreHashCleanup[]
  /**
   * Declares how to detect task completion within this artifact's file content.
   */
  readonly taskCompletionCheck?: TaskCompletionCheck
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
  private readonly _description: string | undefined
  private readonly _template: string | undefined
  private readonly _instruction: string | undefined
  private readonly _requires: readonly string[]
  private readonly _optional: boolean
  private readonly _format: ArtifactFormat | undefined
  private readonly _delta: boolean
  private readonly _deltaInstruction: string | undefined
  private readonly _validations: readonly ValidationRule[]
  private readonly _deltaValidations: readonly ValidationRule[]
  private readonly _contextSections: readonly ContextSection[]
  private readonly _preHashCleanup: readonly PreHashCleanup[]
  private readonly _taskCompletionCheck: TaskCompletionCheck | undefined

  /**
   * Creates a new `ArtifactType` from schema configuration.
   *
   * @param props - Artifact type configuration
   */
  constructor(props: ArtifactTypeProps) {
    this._id = props.id
    this._scope = props.scope
    this._output = props.output
    this._description = props.description
    this._template = props.template
    this._instruction = props.instruction
    this._requires = [...props.requires]
    this._optional = props.optional ?? false
    this._format = props.format
    this._delta = props.delta ?? false
    this._deltaInstruction = props.deltaInstruction
    this._validations = [...props.validations]
    this._deltaValidations = [...props.deltaValidations]
    this._contextSections = [...props.contextSections]
    this._preHashCleanup = [...props.preHashCleanup]
    this._taskCompletionCheck = props.taskCompletionCheck
  }

  /**
   * Stable identifier for this artifact type (e.g. `"specs"`, `"tasks"`).
   *
   * @returns The artifact type ID
   */
  id(): string {
    return this._id
  }

  /**
   * Where this artifact lives after archiving: `"spec"` or `"change"`.
   *
   * @returns The artifact scope
   */
  scope(): ArtifactScope {
    return this._scope
  }

  /**
   * Glob pattern for the artifact's output files.
   *
   * @returns The output glob pattern
   */
  output(): string {
    return this._output
  }

  /**
   * Human-readable summary for tooling, or `undefined` if not set.
   *
   * @returns The description string, or `undefined`
   */
  description(): string | undefined {
    return this._description
  }

  /**
   * Path to a template file relative to the schema directory, or `undefined`.
   *
   * @returns The template path, or `undefined`
   */
  template(): string | undefined {
    return this._template
  }

  /**
   * The LLM instruction text for generating this artifact, or `undefined`.
   *
   * @returns The instruction text, or `undefined`
   */
  instruction(): string | undefined {
    return this._instruction
  }

  /**
   * IDs of artifact types that must be resolved before this one.
   *
   * @returns Array of prerequisite artifact type IDs
   */
  requires(): readonly string[] {
    return this._requires
  }

  /**
   * `true` if this artifact may be absent without failing validation.
   *
   * @returns Whether the artifact is optional
   */
  optional(): boolean {
    return this._optional
  }

  /**
   * The declared file format, or `undefined` if inferred from the output extension.
   *
   * @returns The artifact format, or `undefined`
   */
  format(): ArtifactFormat | undefined {
    return this._format
  }

  /**
   * `true` if this artifact supports delta files.
   *
   * @returns Whether delta files are supported
   */
  delta(): boolean {
    return this._delta
  }

  /**
   * Domain-specific delta guidance injected by `CompileContext`, or `undefined`.
   *
   * @returns The delta instruction text, or `undefined`
   */
  deltaInstruction(): string | undefined {
    return this._deltaInstruction
  }

  /**
   * Structural validation rules applied to the base artifact after delta application.
   *
   * @returns Post-merge validation rules
   */
  validations(): readonly ValidationRule[] {
    return this._validations
  }

  /**
   * Structural validation rules applied to the delta file before application.
   *
   * @returns Pre-merge delta validation rules
   */
  deltaValidations(): readonly ValidationRule[] {
    return this._deltaValidations
  }

  /**
   * Spec sections extracted and injected into the compiled instruction block.
   *
   * @returns Context section configurations
   */
  contextSections(): readonly ContextSection[] {
    return this._contextSections
  }

  /**
   * Regex substitutions applied to artifact content before computing any hash.
   *
   * @returns Pre-hash cleanup substitutions
   */
  preHashCleanup(): readonly PreHashCleanup[] {
    return this._preHashCleanup
  }

  /**
   * Task completion detection config, or `undefined` if using defaults.
   *
   * @returns The task completion check config, or `undefined`
   */
  taskCompletionCheck(): TaskCompletionCheck | undefined {
    return this._taskCompletionCheck
  }
}
