/**
 * Folder-level metadata contract for one skill template directory.
 */
export interface SkillTemplateMetadata {
  /**
   * Whether this template is a standard skill or a specialized agent.
   */
  readonly kind: 'skill' | 'agent'

  /**
   * Capability identifiers that templates in this folder may reference.
   */
  readonly supportedCapabilities: readonly string[]

  /**
   * Capability identifiers required for this skill to be installable.
   */
  readonly requiredCapabilities: readonly string[]

  /**
   * Shared template filenames required by this skill.
   */
  readonly requiredSharedTemplates: readonly string[]

  /**
   * Human-readable agent name.
   */
  readonly name?: string | undefined

  /**
   * Brief agent description for discovery.
   */
  readonly description?: string | undefined

  /**
   * List of tools the agent is allowed to use.
   */
  readonly allowedTools?: readonly string[] | undefined

  /**
   * Preferred model for the agent (e.g. 'sonnet', 'haiku').
   */
  readonly model?: string | undefined
}
