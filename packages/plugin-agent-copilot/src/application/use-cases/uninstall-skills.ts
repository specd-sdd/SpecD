import { rm } from 'node:fs/promises'
import {
  createSkillRepository,
  removeSharedFolderIfEmpty,
  removeSharedOwner,
  removeSpecdBlock,
  resolveSharedFolder,
  selectManagedNames,
  type UninstallResult,
} from '@specd/skills'
import path from 'node:path'
import type { SpecdConfig } from '@specd/core'
import type { AgentInstallOptions } from '@specd/plugin-manager'

/**
 * Uninstalls selected or all specd skills from Copilot's project-local skills directory.
 */
export class UninstallSkills {
  /**
   * Removes installed skills from `.github/skills` and specd-managed agent files.
   *
   * Names in `options.skills` / `options.agents` are validated against the specd-managed
   * names before the filesystem is touched; unknown or unsafe names are skipped and reported.
   *
   * @param config - Project configuration.
   * @param options - Uninstall options.
   * @returns The requested names that were skipped because they are not specd-managed.
   */
  async execute(config: SpecdConfig, options?: AgentInstallOptions): Promise<UninstallResult> {
    const targetDir = path.join(config.projectRoot, '.github', 'skills')
    const sharedDir = resolveSharedFolder(
      config.projectRoot,
      config.configPath,
      typeof options?.variables?.['sharedFolder'] === 'string'
        ? options.variables['sharedFolder']
        : undefined,
    ).absolutePath
    const capabilities = options?.capabilities ?? ['frontmatter', 'agents']
    const supportsAgents = capabilities.includes('agents')
    const runtimeAgentsDir = path.join(config.projectRoot, '.github', 'agents')
    const filteredAgentsDir = supportsAgents ? runtimeAgentsDir : sharedDir
    const filteredAgentFile = (agent: string): string => `${agent}.agent.md`

    const managedItems = await createSkillRepository().list()
    const managedSkills = managedItems
      .filter((item) => item.kind === 'skill')
      .map((item) => item.name)
    const managedAgents = managedItems
      .filter((item) => item.kind === 'agent')
      .map((item) => item.name)

    const skillFilter = options?.skills !== undefined && options.skills.length > 0
    const agentFilter = options?.agents !== undefined && options.agents.length > 0
    if (skillFilter || agentFilter) {
      const selectedSkills = selectManagedNames(
        skillFilter ? (options.skills ?? []) : [],
        managedSkills,
      )
      const selectedAgents = selectManagedNames(
        agentFilter ? (options.agents ?? []) : [],
        managedAgents,
      )
      for (const skill of selectedSkills.accepted) {
        await rm(path.join(targetDir, skill), { recursive: true, force: true })
        await rm(path.join(targetDir, `${skill}.md`), { force: true })
      }
      for (const agent of selectedAgents.accepted) {
        await rm(path.join(filteredAgentsDir, filteredAgentFile(agent)), { force: true })
      }
      return { skipped: [...selectedSkills.skipped, ...selectedAgents.skipped] }
    }

    for (const skill of managedSkills) {
      await rm(path.join(targetDir, skill), { recursive: true, force: true })
      await rm(path.join(targetDir, `${skill}.md`), { force: true })
    }
    for (const agent of managedAgents) {
      await rm(path.join(runtimeAgentsDir, `${agent}.agent.md`), { force: true })
    }

    await removeSpecdBlock(
      path.join(config.projectRoot, '.github', 'copilot-instructions.md'),
      'copilot',
    )

    const release = await removeSharedOwner(sharedDir, 'copilot')
    if (release.hadMarker && release.remaining.length === 0) {
      await rm(path.join(sharedDir, 'shared.md'), { force: true })
      for (const agent of managedAgents) {
        await rm(path.join(sharedDir, `${agent}.agent.md`), { force: true })
      }
      await removeSharedFolderIfEmpty(sharedDir)
    }
    return { skipped: [] }
  }
}
