import { type HookResult, type TemplateVariables } from './hook-runner.js'

export type { HookResult, TemplateVariables }

/**
 * Opaque external hook definition normalized from workflow YAML.
 *
 * The runtime dispatches these hooks to an {@link ExternalHookRunner} whose
 * `acceptedTypes` contains `type`.
 */
export interface ExternalHookDefinition {
  /** Unique identifier for the hook entry within its workflow phase array. */
  readonly id: string
  /** Registered external hook type name, e.g. `"docker"` or `"http"`. */
  readonly type: string
  /** Runner-owned opaque configuration payload from workflow YAML. */
  readonly config: Record<string, unknown>
}

/**
 * Port for executing explicit external workflow hooks.
 *
 * This is separate from {@link HookRunner}, which remains shell-only for
 * built-in `run:` hooks. Implementations must declare the external hook types
 * they accept so the kernel can build an unambiguous dispatch table.
 */
export interface ExternalHookRunner {
  /** External hook type names this runner accepts. */
  readonly acceptedTypes: readonly string[]

  /**
   * Executes an explicit external hook.
   *
   * @param definition - The normalized external hook definition
   * @param variables - Template variables available for runtime expansion
   * @returns The workflow-compatible execution result
   */
  run(definition: ExternalHookDefinition, variables: TemplateVariables): Promise<HookResult>
}
