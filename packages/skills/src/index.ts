export type { Skill, SkillTemplate, ResolvedFile, SkillBundle } from './domain/index.js'
export type { SharedFile, SkillRepository } from './application/ports/index.js'
export {
  GetSkill,
  ListSkills,
  ResolveBundle,
  type GetSkillInput,
  type GetSkillOutput,
  type ListSkillsInput,
  type ListSkillsOutput,
  type ResolveBundleInput,
  type ResolveBundleOutput,
} from './application/use-cases/index.js'
export { createSkillRepository, type SkillRepositoryOptions } from './infrastructure/index.js'

/**
 * Legacy flat skill shape kept temporarily for the old CLI `skills *` commands
 * during migration.
 */
export interface LegacySkill {
  /**
   * Skill identifier.
   */
  readonly name: string

  /**
   * Human-readable description.
   */
  readonly description: string

  /**
   * Full markdown content.
   */
  readonly content: string
}

/**
 * Legacy synchronous API kept for backwards compatibility with pre-plugin
 * CLI commands while migration is in progress.
 *
 * @returns Currently an empty list.
 */
export function listSkills(): readonly LegacySkill[] {
  return []
}

/**
 * Legacy synchronous getter kept for backwards compatibility with pre-plugin
 * CLI commands while migration is in progress.
 *
 * @param name - Skill name.
 * @returns Always `undefined` until the migration removes legacy call sites.
 */
export function getSkill(name: string): LegacySkill | undefined {
  return listSkills().find((skill) => skill.name === name)
}
