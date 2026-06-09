import { SpecdSkillsError } from './specd-skills-error.js'

/**
 * Thrown when a skill template metadata file is missing or malformed.
 */
export class InvalidSkillTemplateMetadataError extends SpecdSkillsError {
  /**
   * @inheritdoc
   */
  get code(): string {
    return 'INVALID_SKILL_TEMPLATE_METADATA'
  }

  /**
   * Creates a new `InvalidSkillTemplateMetadataError`.
   *
   * @param filename - Metadata file path or logical source.
   * @param reason - Human-readable validation failure.
   */
  constructor(filename: string, reason: string) {
    super(`Invalid skill template metadata in ${filename}: ${reason}`)
  }
}
