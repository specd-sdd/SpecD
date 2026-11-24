import type { PluginInstallContext, SpecdPlugin } from './specd-plugin.js'

/**
 * Recursive variable values accepted by agent install rendering.
 */
export type TemplateVariable =
  | string
  | number
  | boolean
  | readonly TemplateVariable[]
  | {
      readonly [key: string]: TemplateVariable
    }

/**
 * Options used during agent install and uninstall operations.
 */
export interface AgentInstallOptions {
  /** Optional skill-name filter. When omitted, install all skills. */
  readonly skills?: readonly string[]
  /** Optional agent-name filter. When omitted, install all agents. */
  readonly agents?: readonly string[]
  /** Recursive variables used for template rendering. */
  readonly variables?: Readonly<Record<string, TemplateVariable>>
  /** Capability identifiers supported by the target runtime. */
  readonly capabilities?: readonly string[]
}

/**
 * Result returned by an agent-plugin install operation.
 */
export interface AgentInstallResult {
  /** Successfully installed skills and output paths. */
  readonly installed: ReadonlyArray<{ skill: string; path: string }>
  /** Skipped skills and the reason for skipping. */
  readonly skipped: ReadonlyArray<{ skill: string; reason: string }>
}

/**
 * Install context for agent plugins.
 */
export interface AgentInstallContext extends Omit<PluginInstallContext, 'options'> {
  /** Agent install options forwarded by the caller. */
  readonly options?: AgentInstallOptions
}

/**
 * Plugin contract specialized for AI-agent integrations.
 */
export interface AgentPlugin extends SpecdPlugin {
  /**
   * Installs agent assets into a project root.
   *
   * @param context - Install context
   * @returns Install summary
   */
  install(context: AgentInstallContext): Promise<AgentInstallResult>
  /**
   * Uninstalls agent assets from a project root.
   *
   * @param context - Uninstall context
   */
  uninstall(context: AgentInstallContext): Promise<void>
}

/**
 * Checks whether a plugin exposes agent install and uninstall hooks.
 *
 * @param value - Candidate plugin
 * @returns `true` when both hooks are functions
 */
export function isAgentPlugin(value: SpecdPlugin): value is AgentPlugin {
  const record = value as unknown as Record<string, unknown>
  return typeof record['install'] === 'function' && typeof record['uninstall'] === 'function'
}
