import { rm } from 'node:fs/promises'
import path from 'node:path'
import type { SpecdConfig } from '@specd/core'
import { createSkillRepository } from '@specd/skills'
import type { AgentInstallOptions } from '@specd/plugin-manager'

/**
 * Uninstalls selected or all specd skills from Open Code's project-local skills directory.
 */
export class UninstallSkills {
  /**
   * Removes installed skills from `.opencode/skills`.
   *
   * @param config - Project configuration.
   * @param options - Uninstall options.
   * @returns A promise that resolves when uninstall finishes.
   */
  async execute(config: SpecdConfig, options?: AgentInstallOptions): Promise<void> {
    const targetDir = path.join(config.projectRoot, '.opencode', 'skills')
    if (options?.skills !== undefined && options.skills.length > 0) {
      for (const skill of options.skills) {
        await rm(path.join(targetDir, skill), { recursive: true, force: true })
        await rm(path.join(targetDir, `${skill}.md`), { force: true })
      }
      return
    }
    const repository = createSkillRepository()
    for (const skill of repository.list()) {
      await rm(path.join(targetDir, skill.name), { recursive: true, force: true })
      await rm(path.join(targetDir, `${skill.name}.md`), { force: true })
    }
  }
}
