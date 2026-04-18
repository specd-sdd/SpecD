import type { Skill } from '../../domain/skill.js'
import type { SkillBundle } from '../../domain/skill-bundle.js'

/**
 * Shared template file referenced by one or more skills.
 */
export interface SharedFile {
  /**
   * Shared filename.
   */
  readonly filename: string

  /**
   * Shared file content.
   */
  readonly content: string

  /**
   * Skill names that consume this shared file.
   */
  readonly skills: readonly string[]
}

/**
 * Repository port for loading skills and installable bundles.
 */
export interface SkillRepository {
  /**
   * Lists all available skills as metadata.
   *
   * @returns Skill metadata collection.
   */
  list(): readonly Skill[]

  /**
   * Gets a skill by name.
   *
   * @param name - Skill name.
   * @returns Matching skill, or `undefined`.
   */
  get(name: string): Skill | undefined

  /**
   * Resolves a concrete bundle for installation.
   *
   * @param name - Skill name.
   * @param variables - Placeholder substitution values.
   * @returns Resolved install bundle.
   */
  getBundle(name: string, variables?: Readonly<Record<string, string>>): SkillBundle

  /**
   * Lists shared files declared under `templates/shared`.
   *
   * @returns Shared-file entries.
   */
  listSharedFiles(): readonly SharedFile[]
}
