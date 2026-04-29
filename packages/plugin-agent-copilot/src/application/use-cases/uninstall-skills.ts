import { rm } from 'node:fs/promises'
import { createSkillRepository } from '@specd/skills'
import path from 'node:path'
import type { SpecdConfig } from '@specd/core'
import type { AgentInstallOptions } from '@specd/plugin-manager'

/**
 * Uninstalls selected or all specd skills from Copilot's project-local skills directory.
 */
export class UninstallSkills {
  /**
   * Removes installed skills from `.github/skills`.
   *
   * @param config - Project configuration.
   * @param options - Uninstall options.
   * @returns A promise that resolves when uninstall finishes.
   */
  async execute(config: SpecdConfig, options?: AgentInstallOptions): Promise<void> {
    const targetDir = path.join(config.projectRoot, '.github', 'skills')
    if (options?.skills !== undefined && options.skills.length > 0) {
      for (const skill of options.skills) {
        await rm(path.join(targetDir, skill), { recursive: true, force: true })
        await rm(path.join(targetDir, `${skill}.md`), { force: true })
      }
      return
    }
    const managedSkills = createSkillRepository()
      .list()
      .map((skill) => skill.name)
    for (const skill of managedSkills) {
      await rm(path.join(targetDir, skill), { recursive: true, force: true })
      await rm(path.join(targetDir, `${skill}.md`), { force: true })
    }
    await rm(path.join(targetDir, '_specd-shared'), { recursive: true, force: true })
  }
}
