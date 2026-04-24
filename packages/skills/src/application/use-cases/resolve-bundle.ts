import type { SpecdConfig } from '@specd/core'
import type { SkillBundle } from '../../domain/skill-bundle.js'
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
   * Optional placeholder-substitution variables.
   */
  readonly variables?: Readonly<Record<string, string>>
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
    let variables = input.variables ?? {}

    if (input.config) {
      variables = {
        projectRoot: input.config.projectRoot,
        configPath: input.config.configPath,
        schemaRef: input.config.schemaRef,
        ...variables,
      }
    }

    const bundle = this.repository.getBundle(input.name, variables, input.config)
    return { bundle }
  }
}
