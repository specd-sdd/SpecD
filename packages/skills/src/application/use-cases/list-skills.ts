import type { Skill } from '../../domain/skill.js'
import type { SkillRepository } from '../ports/skill-repository.js'

/**
 * Input contract for list-skills use case.
 */
export interface ListSkillsInput {}

/**
 * Output contract for list-skills use case.
 */
export interface ListSkillsOutput {
  /**
   * Available skill metadata.
   */
  readonly skills: readonly Skill[]
}

/**
 * Lists all available skills.
 */
export class ListSkills {
  /**
   * Creates a list-skills use case.
   *
   * @param repository - Skill repository dependency.
   */
  constructor(private readonly repository: SkillRepository) {}

  /**
   * Executes the use case.
   *
   * @param _input - Empty input payload.
   * @returns Skill collection.
   */
  async execute(_input: ListSkillsInput): Promise<ListSkillsOutput> {
    const skills = await this.repository.list()
    return { skills }
  }
}
