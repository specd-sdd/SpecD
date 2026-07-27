import { rm } from 'node:fs/promises'
import { createSkillRepository, removeSpecdBlock } from '@specd/skills'
import path from 'node:path'
import type { SpecdConfig } from '@specd/core'
import type { AgentInstallOptions } from '@specd/plugin-manager'
import { resolveSharedFolder } from './shared-folder.js'

/**
 * Uninstalls selected or all specd skills from Codex's project-local skills directory.
 */
export class UninstallSkills {
  /**
   * Removes installed skills from `.codex/skills`.
   *
   * @param config - Project configuration.
   * @param options - Uninstall options.
   * @returns A promise that resolves when uninstall finishes.
   */
  async execute(config: SpecdConfig, options?: AgentInstallOptions): Promise<void> {
    const targetDir = path.join(config.projectRoot, '.codex', 'skills')
    const agentsTargetDir = path.join(config.projectRoot, '.codex', 'agents')
    const sharedDir = resolveSharedFolder(
      config.projectRoot,
      config.configPath,
      typeof options?.variables?.['sharedFolder'] === 'string'
        ? options.variables['sharedFolder']
        : undefined,
    ).absolutePath
    let hasFilter = false
    if (options?.skills !== undefined && options.skills.length > 0) {
      hasFilter = true
      for (const skill of options.skills) {
        await rm(path.join(targetDir, skill), { recursive: true, force: true })
        await rm(path.join(targetDir, `${skill}.md`), { force: true })
      }
    }
    if (options?.agents !== undefined && options.agents.length > 0) {
      hasFilter = true
      for (const agent of options.agents) {
        await rm(path.join(agentsTargetDir, `${agent}.toml`), { force: true })
      }
    }
    if (hasFilter) {
      return
    }
    const repository = createSkillRepository()
    const managedItems = await repository.list()
    const managedSkills = managedItems.filter((s) => s.kind === 'skill').map((s) => s.name)
    const managedAgents = managedItems.filter((s) => s.kind === 'agent').map((s) => s.name)
    for (const skill of managedSkills) {
      await rm(path.join(targetDir, skill), { recursive: true, force: true })
      await rm(path.join(targetDir, `${skill}.md`), { force: true })
    }
    for (const agent of managedAgents) {
      await rm(path.join(agentsTargetDir, `${agent}.toml`), { force: true })
      await rm(path.join(sharedDir, `${agent}.agent.md`), { force: true })
    }
    await rm(path.join(sharedDir, 'shared.md'), { force: true })
    try {
      await rm(sharedDir)
    } catch {
      // Ignore if sharedDir contains other non-specd user files
    }

    // Remove plugin registration from AGENTS.md (reference-counted block manager removes block when 0 agents remain)
    const agentsMdPath = path.join(config.projectRoot, 'AGENTS.md')
    await removeSpecdBlock(agentsMdPath, 'codex')
  }
}
