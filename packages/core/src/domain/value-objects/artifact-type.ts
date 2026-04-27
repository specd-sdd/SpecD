import {
  type ValidationRule,
  type PreHashCleanup,
  type TaskCompletionCheck,
} from './validation-rule.js'

/** A rule entry with identity and instruction text, used in `rules.pre` / `rules.post`. */
export interface RuleEntry {
  readonly id: string
  readonly instruction: string
}

/** Pre- and post-instruction rules on an artifact type. */
export interface ArtifactRules {
  readonly pre: readonly RuleEntry[]
  readonly post: readonly RuleEntry[]
}

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
  /** Resolved template file content. */
  readonly template?: string
  /** Original template path reference as declared in the schema YAML. */
  readonly templateRef?: string
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
   * When `true`, the artifact is explicitly marked as containing trackable tasks.
   * This is the master switch for task capability.
   */
  readonly hasTasks?: boolean
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
   * Regex substitutions applied to artifact content before computing any hash.
   */
  readonly preHashCleanup: readonly PreHashCleanup[]
  /**
   * Declares how to detect task completion within this artifact's file content.
   */
  readonly taskCompletionCheck?: TaskCompletionCheck
  /**
   * Pre- and post-instruction rules. `pre` rules are injected before the
   * artifact instruction; `post` rules are injected after.
   */
  readonly rules?: ArtifactRules
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
  private readonly _templateRef: string | undefined
  private readonly _instruction: string | undefined
  private readonly _requires: readonly string[]
  private readonly _optional: boolean
  private readonly _hasTasks: boolean
  private readonly _format: ArtifactFormat | undefined
  private readonly _delta: boolean
  private readonly _deltaInstruction: string | undefined
  private readonly _validations: readonly ValidationRule[]
  private readonly _deltaValidations: readonly ValidationRule[]
  private readonly _preHashCleanup: readonly PreHashCleanup[]
  private readonly _taskCompletionCheck: TaskCompletionCheck | undefined
  private readonly _rules: ArtifactRules | undefined

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
    this._templateRef = props.templateRef
    this._instruction = props.instruction
    this._requires = [...props.requires]
    this._optional = props.optional ?? false
    this._hasTasks = props.hasTasks ?? false
    this._format = props.format
    this._delta = props.delta ?? false
    this._deltaInstruction = props.deltaInstruction
    this._validations = [...props.validations]
    this._deltaValidations = [...props.deltaValidations]
    this._preHashCleanup = [...props.preHashCleanup]
    this._taskCompletionCheck = props.taskCompletionCheck
    this._rules = props.rules
  }

  /** Stable identifier for this artifact type (e.g. `"specs"`, `"tasks"`). */
  get id(): string {
    return this._id
  }

  /** Where this artifact lives after archiving: `"spec"` or `"change"`. */
  get scope(): ArtifactScope {
    return this._scope
  }

  /** Glob pattern for the artifact's output files. */
  get output(): string {
    return this._output
  }

  /** Human-readable summary for tooling, or `undefined` if not set. */
  get description(): string | undefined {
    return this._description
  }

  /** Resolved template file content, or `undefined`. */
  get template(): string | undefined {
    return this._template
  }

  /** Original template path reference as declared in the schema YAML, or `undefined`. */
  get templateRef(): string | undefined {
    return this._templateRef
  }

  /** The LLM instruction text for generating this artifact, or `undefined`. */
  get instruction(): string | undefined {
    return this._instruction
  }

  /** IDs of artifact types that must be resolved before this one. */
  get requires(): readonly string[] {
    return this._requires
  }

  /** `true` if this artifact may be absent without failing validation. */
  get optional(): boolean {
    return this._optional
  }

  /** `true` if the artifact is explicitly marked as containing trackable tasks. */
  get hasTasks(): boolean {
    return this._hasTasks
  }

  /** The declared file format, or `undefined` if inferred from the output extension. */
  get format(): ArtifactFormat | undefined {
    return this._format
  }

  /** `true` if this artifact supports delta files. */
  get delta(): boolean {
    return this._delta
  }

  /** Domain-specific delta guidance injected by `CompileContext`, or `undefined`. */
  get deltaInstruction(): string | undefined {
    return this._deltaInstruction
  }

  /** Structural validation rules applied to the base artifact after delta application. */
  get validations(): readonly ValidationRule[] {
    return this._validations
  }

  /** Structural validation rules applied to the delta file before application. */
  get deltaValidations(): readonly ValidationRule[] {
    return this._deltaValidations
  }

  /** Regex substitutions applied to artifact content before computing any hash. */
  get preHashCleanup(): readonly PreHashCleanup[] {
    return this._preHashCleanup
  }

  /** Task completion detection config, or `undefined` if using defaults. */
  get taskCompletionCheck(): TaskCompletionCheck | undefined {
    return this._taskCompletionCheck
  }

  /** Pre- and post-instruction rules, or `undefined` if none declared. */
  get rules(): ArtifactRules | undefined {
    return this._rules
  }
}
