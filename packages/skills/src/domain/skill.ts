/**
 * Lazily-loaded template file associated with a skill.
 */
export interface SkillTemplate {
  /**
   * Template filename relative to the skill directory.
   */
  readonly filename: string

  /**
   * Loads the template content on demand.
   *
   * @returns The template content.
   */
  getContent(): Promise<string>
}

/**
 * Domain model describing a single skill.
 */
export interface Skill {
  /**
   * Unique skill identifier.
   */
  readonly name: string

  /**
   * Human-readable skill description.
   */
  readonly description: string

  /**
   * Templates that belong to this skill.
   */
  readonly templates: readonly SkillTemplate[]
}
