/**
 * A single hook entry within a workflow step's `pre` or `post` array.
 *
 * `run:` hooks execute a shell command deterministically.
 * `instruction:` hooks inject text into the compiled agent instruction block.
 */
export type HookEntry =
  | {
      /** Unique identifier for this hook entry within its array. */
      readonly id: string
      /** Discriminant: this is a shell execution hook. */
      readonly type: 'run'
      /**
       * The shell command to execute. May contain template variables:
       * `{{change.name}}`, `{{change.workspace}}`, `{{change.path}}`,
       * `{{project.root}}`.
       */
      readonly command: string
    }
  | {
      /** Unique identifier for this hook entry within its array. */
      readonly id: string
      /** Discriminant: this is an agent instruction injection hook. */
      readonly type: 'instruction'
      /** The instruction text to inject into the compiled context block. */
      readonly text: string
    }

/**
 * A single entry in a schema's `workflow[]` array, defining a named lifecycle
 * phase, which artifact IDs must be complete before the phase becomes available,
 * and optional pre/post hook arrays.
 *
 * Schema workflow steps fire first; project-level steps (`specd.yaml`) are
 * matched by `step` name and appended after.
 */
export interface WorkflowStep {
  /**
   * The lifecycle step name (e.g. `"designing"`, `"implementing"`, `"archiving"`).
   */
  readonly step: string

  /**
   * Artifact IDs (from the same schema) that must have status `complete` before
   * this step becomes available. Empty array means the step is always available.
   */
  readonly requires: readonly string[]

  /** Pre- and post-event hooks for this step. */
  readonly hooks: {
    /** Hooks that fire before the step executes. */
    readonly pre: readonly HookEntry[]
    /** Hooks that fire after the step completes. */
    readonly post: readonly HookEntry[]
  }
}
