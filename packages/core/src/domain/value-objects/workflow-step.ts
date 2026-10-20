import { type ChangeState } from './change-state.js'
import { type TransitionAlong } from '../services/transition-checks.js'

/**
 * Failure policy for hook execution.
 * - 'abort' (default): Halt execution immediately and fail phase.
 * - 'warn': Capture failure as warning and proceed with remaining hooks.
 */
export type HookFailurePolicy = 'abort' | 'warn'

/**
 * A single hook entry within a workflow step's `pre` or `post` array.
 *
 * `run:` hooks execute a shell command deterministically.
 * `instruction:` hooks inject text into the compiled agent instruction block.
 * `external:` hooks dispatch opaque config to a registered external runner.
 */
export type HookEntry =
  | {
      /** Unique identifier for this hook entry within its array. */
      readonly id: string
      /** Discriminant: this is a shell execution hook. */
      readonly type: 'run'
      /**
       * The shell command to execute. May contain template variables:
       * `{{change.name}}`, `{{change.path}}`, `{{project.root}}`.
       */
      readonly command: string
      /** Hook failure policy ('abort' or 'warn'). Defaults to 'abort'. */
      readonly onFailure?: HookFailurePolicy
    }
  | {
      /** Unique identifier for this hook entry within its array. */
      readonly id: string
      /** Discriminant: this is an agent instruction injection hook. */
      readonly type: 'instruction'
      /** The instruction text to inject into the compiled context block. */
      readonly text: string
    }
  | {
      /** Unique identifier for this hook entry within its array. */
      readonly id: string
      /** Discriminant: this is an explicit external hook. */
      readonly type: 'external'
      /** Registered external hook type name used for runtime dispatch. */
      readonly externalType: string
      /** Runner-owned opaque config payload declared in workflow YAML. */
      readonly config: Record<string, unknown>
      /** Hook failure policy ('abort' or 'warn'). Defaults to 'abort'. */
      readonly onFailure?: HookFailurePolicy
    }

/**
 * Declaration associating a transition check with a workflow step in schema.yaml.
 * Evaluated when transitioning INTO this step (scope: 'transition').
 */
export interface WorkflowStepCheckDeclaration {
  /** Check identifier (must be registered in CheckRegistry). */
  readonly id: string
  /** Source state filter (defaults to '*'). */
  readonly from?: ChangeState | '*'
  /** Transition direction filter ('forward', 'backward', 'recovery', 'redesign', or '*'). Defaults to 'forward'. */
  readonly along?: TransitionAlong | '*'
  /** Failure policy ('abort' or 'collect'). Defaults to 'abort'. */
  readonly onFailure?: 'abort' | 'collect'
  /** Permission to bypass via `--skip-checks`, subject to governance locks. */
  readonly skippable?: boolean
  /** Whether this check is disabled for this workflow step, subject to governance locks. */
  readonly disabled?: boolean
  /** Step-specific configuration merged over check defaults. */
  readonly config?: Readonly<Record<string, unknown>>
}

/**
 * Declaration associating a step-skip check with an optional workflow step in schema.yaml.
 * Evaluated when this optional step is BYPASSED during a transition (scope: 'step-skip').
 */
export interface WorkflowStepSkipCheckDeclaration {
  /** Check identifier (must be registered in CheckRegistry). */
  readonly id: string
  /** Failure policy ('abort' or 'collect'). Defaults to 'abort'. */
  readonly onFailure?: 'abort' | 'collect'
  /** Permission to bypass via `--skip-checks`, subject to governance locks. */
  readonly skippable?: boolean
  /** Whether this check is disabled for skipping this step, subject to governance locks. */
  readonly disabled?: boolean
  /** Step-specific configuration merged over check defaults. */
  readonly config?: Readonly<Record<string, unknown>>
}

/**
 * A lookup row in schema `workflow[]`. `step` names an existing `ChangeState`;
 * the row attaches extras (`requires`, `requiresTaskCompletion`, `hooks`, `checks`, `skipChecks`).
 * It does not define protocol membership or legal hops.
 */
export interface WorkflowStep {
  /**
   * The lifecycle step name (e.g. `"designing"`, `"implementing"`, `"archiving"`).
   */
  readonly step: string

  /**
   * Whether this step is optional in the active workflow topology.
   * When true, the step may be bypassed if its associated step-skip checks pass.
   * Bedrock states cannot be optional. Defaults to false.
   */
  readonly optional?: boolean

  /**
   * Whether this step is disabled in the active workflow topology.
   * When true, the step is excluded from the active lifecycle graph.
   * Bedrock states cannot be disabled. Defaults to false.
   */
  readonly disabled?: boolean

  /**
   * Artifact IDs that must be complete/skipped for this lookup row’s extras.
   * Empty array means no artifact extras (`workflow.requires` skips). Other
   * predicates may still block the hop.
   */
  readonly requires: readonly string[]

  /**
   * Subset of `requires` for which task completion gating is enforced on this step.
   * Each listed artifact ID must be in `requires` and reference an artifact type
   * that declares `taskCompletionCheck`. Empty array means no task completion gating.
   */
  readonly requiresTaskCompletion: readonly string[]

  /** Pre- and post-event hooks for this step. */
  readonly hooks: {
    /** Hooks that fire before the step executes. */
    readonly pre: readonly HookEntry[]
    /** Hooks that fire after the step completes. */
    readonly post: readonly HookEntry[]
  }

  /** Checks declared for this workflow step (evaluated when entering this step). */
  readonly checks?: readonly WorkflowStepCheckDeclaration[]

  /** Checks declared for skipping this workflow step (evaluated when bypassing this optional step). */
  readonly skipChecks?: readonly WorkflowStepSkipCheckDeclaration[]
}
