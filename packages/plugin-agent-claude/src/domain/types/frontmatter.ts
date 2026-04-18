/**
 * Claude skill frontmatter fields supported by phase-1 plugin install.
 */
export interface Frontmatter {
  /**
   * Display skill name.
   */
  readonly name?: string

  /**
   * Skill description used by Claude routing.
   */
  readonly description: string

  /**
   * Optional allowed tools declaration.
   */
  readonly allowed_tools?: string

  /**
   * Optional argument hint.
   */
  readonly argument_hint?: string

  /**
   * Optional usage guidance for Claude routing.
   */
  readonly when_to_use?: string

  /**
   * Optional flag to disable model invocation.
   */
  readonly disable_model_invocation?: boolean

  /**
   * Optional flag to mark user invocability.
   */
  readonly user_invocable?: boolean

  /**
   * Optional model hint.
   */
  readonly model?: string

  /**
   * Optional effort hint.
   */
  readonly effort?: string

  /**
   * Optional context hint.
   */
  readonly context?: string

  /**
   * Optional agent hint.
   */
  readonly agent?: string

  /**
   * Optional hooks map.
   */
  readonly hooks?: Record<string, unknown>

  /**
   * Optional path selector.
   */
  readonly paths?: string

  /**
   * Optional shell hint.
   */
  readonly shell?: string
}
