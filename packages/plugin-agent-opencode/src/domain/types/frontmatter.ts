/**
 * Open Code skill frontmatter fields supported by the plugin install.
 */
export interface Frontmatter {
  /**
   * Display skill name.
   */
  readonly name: string

  /**
   * Skill description used by Open Code routing.
   */
  readonly description: string

  /**
   * Optional license declaration.
   */
  readonly license?: string

  /**
   * Optional compatibility hint.
   */
  readonly compatibility?: string

  /**
   * Optional metadata map.
   */
  readonly metadata?: Record<string, string>
}
