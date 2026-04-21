/**
 * Codex skill frontmatter fields supported by the plugin install.
 */
export interface Frontmatter {
  /**
   * Display skill name.
   */
  readonly name: string

  /**
   * Skill description used by Codex routing.
   */
  readonly description: string
}
