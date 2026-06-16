import type { Skill } from '../../domain/skill.js'
import type { SkillBundle } from '../../domain/skill-bundle.js'
import type { SkillTemplateContext } from '../../domain/template-context.js'

/**
 * Shared template file available to skills that require it.
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
  list(): Promise<readonly Skill[]>

  /**
   * Gets a skill by name.
   *
   * @param name - Skill name.
   * @returns Matching skill, or `undefined`.
   */
  get(name: string): Promise<Skill | undefined>

  /**
   * Resolves a concrete bundle for installation.
   *
   * @param name - Skill name.
   * @param context - Structured install-time render context.
   * @returns Resolved install bundle.
   *
   * Shared files included from `templates/shared` MUST preserve their shared
   * origin metadata in the resolved bundle output.
   */
  getBundle(name: string, context?: SkillTemplateContext): Promise<SkillBundle>

  /**
   * Lists shared files declared under `templates/shared`.
   *
   * @returns Shared-file entries.
   */
  listSharedFiles(): Promise<readonly SharedFile[]>
}

/**
 * Alias for the SkillRepository interface port.
 */
export type SkillRepositoryPort = SkillRepository
