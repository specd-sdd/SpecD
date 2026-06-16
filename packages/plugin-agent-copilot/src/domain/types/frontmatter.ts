/**
 * Copilot skill frontmatter fields supported by the plugin install.
 */
export interface Frontmatter {
  /**
   * Display skill name.
   */
  readonly name: string

  /**
   * Skill description used by Copilot routing.
   */
  readonly description: string

  /**
   * Optional license declaration.
   */
  readonly license?: string

  /**
   * Optional allowed tools declaration (space-separated string or YAML list of strings).
   */
  readonly 'allowed-tools'?: string | string[]

  /**
   * Optional flag to mark user invocability.
   */
  readonly 'user-invocable'?: boolean

  /**
   * Optional flag to disable model invocation.
   */
  readonly 'disable-model-invocation'?: boolean
}
