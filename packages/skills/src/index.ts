/** A specd skill definition. */
export interface Skill {
  /** Unique skill identifier (e.g. `'gemini-reviewer'`). */
  name: string
  /** Short description of what the skill does. */
  description: string
  /** The full markdown content of the skill file. */
  content: string
}

/**
 * Returns all available skills.
 *
 * Currently empty — skill definitions will be added as they are developed.
 *
 * @returns All registered skills
 */
export function listSkills(): Skill[] {
  return []
}

/**
 * Returns the skill with the given name, or `undefined` if not found.
 *
 * @param name - The skill name to look up
 * @returns The skill, or `undefined` if not found
 */
export function getSkill(name: string): Skill | undefined {
  return listSkills().find((s) => s.name === name)
}
