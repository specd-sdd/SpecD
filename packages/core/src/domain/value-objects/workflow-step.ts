/**
 * A single hook entry within a workflow step's `pre` or `post` array.
 *
 * `run:` hooks execute a shell command deterministically.
 * `instruction:` hooks inject text into the compiled agent instruction block.
 */
export type HookEntry =
  | {
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
      /** Discriminant: this is an agent instruction injection hook. */
      readonly type: 'instruction'
      /** The instruction text to inject into the compiled context block. */
      readonly text: string
    }

/**
 * A single entry in a schema's `workflow[]` array, defining which skill it
 * configures, which artifact IDs must be complete before the skill becomes
 * available, and optional pre/post hook arrays.
 *
 * Schema workflow steps fire first; project-level steps (`specd.yaml`) are
 * matched by `skill` name and appended after.
 */
export interface WorkflowStep {
  /**
   * The skill this step configures (e.g. `"apply"`, `"archive"`, `"verify"`).
   */
  readonly skill: string

  /**
   * Artifact IDs (from the same schema) that must have status `complete` before
   * this skill becomes available. Empty array means the skill is always available.
   */
  readonly requires: readonly string[]

  /** Pre- and post-event hooks for this skill. */
  readonly hooks: {
    /** Hooks that fire before the skill executes (`pre-<skill>` event). */
    readonly pre: readonly HookEntry[]
    /** Hooks that fire after the skill completes (`post-<skill>` event). */
    readonly post: readonly HookEntry[]
  }
}
