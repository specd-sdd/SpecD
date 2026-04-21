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
   * Optional allowed tools declaration.
   */
  readonly 'allowed-tools'?: string

  /**
   * Optional flag to mark user invocability.
   */
  readonly 'user-invocable'?: boolean

  /**
   * Optional flag to disable model invocation.
   */
  readonly 'disable-model-invocation'?: boolean
}
