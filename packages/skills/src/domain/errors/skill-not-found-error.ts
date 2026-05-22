import { SpecdSkillsError } from './specd-skills-error.js'

/**
 * Thrown when a requested skill cannot be found.
 */
export class SkillNotFoundError extends SpecdSkillsError {
  /**
   * @inheritdoc
   */
  get code(): string {
    return 'SKILL_NOT_FOUND'
  }

  /**
   * Creates a new `SkillNotFoundError`.
   *
   * @param name - The name of the skill that was not found
   */
  constructor(name: string) {
    super(`Skill not found: ${name}`)
  }
}
