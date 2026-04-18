import type { Skill } from '../../domain/skill.js'
import type { SkillRepository } from '../ports/skill-repository.js'

/**
 * Input contract for get-skill use case.
 */
export interface GetSkillInput {
  /**
   * Skill identifier.
   */
  readonly name: string
}

/**
 * Successful get-skill output.
 */
export interface GetSkillSuccess {
  /**
   * Resolved skill.
   */
  readonly skill: Skill
}

/**
 * Not-found get-skill output.
 */
export interface GetSkillNotFound {
  /**
   * Not-found discriminator.
   */
  readonly error: 'NOT_FOUND'
}

/**
 * Output union for get-skill.
 */
export type GetSkillOutput = GetSkillSuccess | GetSkillNotFound

/**
 * Loads one skill by name.
 */
export class GetSkill {
  /**
   * Creates a get-skill use case.
   *
   * @param repository - Skill repository dependency.
   */
  constructor(private readonly repository: SkillRepository) {}

  /**
   * Executes the use case.
   *
   * @param input - Skill lookup input.
   * @returns Success with skill or `NOT_FOUND`.
   */
  async execute(input: GetSkillInput): Promise<GetSkillOutput> {
    if (input.name.trim().length === 0) {
      return { error: 'NOT_FOUND' }
    }

    const skill = await this.repository.get(input.name)
    return skill === undefined ? { error: 'NOT_FOUND' } : { skill }
  }
}
