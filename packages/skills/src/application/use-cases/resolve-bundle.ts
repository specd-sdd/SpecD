import type { SpecdConfig } from '@specd/core'
import type { SkillBundle } from '../../domain/skill-bundle.js'
import type { SkillTemplateContext } from '../../domain/template-context.js'
import { resolveSharedFolder, toRelativeProjectPath } from '../../domain/shared-folder.js'
import type { SkillRepository } from '../ports/skill-repository.js'

/**
 * Input contract for resolve-bundle use case.
 */
export interface ResolveBundleInput {
  /**
   * Skill identifier.
   */
  readonly name: string

  /**
   * Optional project configuration for built-in variables.
   */
  readonly config?: SpecdConfig

  /**
   * Optional install-time render context.
   */
  readonly context?: SkillTemplateContext
}

/**
 * Output contract for resolve-bundle use case.
 */
export interface ResolveBundleOutput {
  /**
   * Installable skill bundle.
   */
  readonly bundle: SkillBundle
}

/**
 * Resolves one skill into an installable bundle.
 */
export class ResolveBundle {
  /**
   * Creates a resolve-bundle use case.
   *
   * @param repository - Skill repository dependency.
   */
  constructor(private readonly repository: SkillRepository) {}

  /**
   * Executes the use case.
   *
   * @param input - Bundle-resolution input.
   * @returns Resolved bundle.
   */
  async execute(input: ResolveBundleInput): Promise<ResolveBundleOutput> {
    let variables = input.context?.variables ?? {}

    if (input.config) {
      const safeConfigPath = toRelativeProjectPath(
        input.config.projectRoot,
        input.config.configPath,
      )
      const resolvedSharedFolder = resolveSharedFolder(
        input.config.projectRoot,
        input.config.configPath,
        typeof variables['sharedFolder'] === 'string' ? variables['sharedFolder'] : undefined,
      )
      variables = {
        configPath: safeConfigPath,
        schemaRef: input.config.schemaRef,
        ...variables,
        sharedFolder: resolvedSharedFolder.relativePath,
      }
    }

    const mergedContext: SkillTemplateContext = {
      variables,
      capabilities: input.context?.capabilities ?? [],
    }

    const bundle = this.repository.getBundle(input.name, mergedContext)
    return { bundle }
  }
}
