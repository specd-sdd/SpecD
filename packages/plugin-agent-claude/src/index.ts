import type { AgentPlugin } from '@specd/plugin-manager'
import { InstallSkills } from './application/use-cases/install-skills.js'
import { UninstallSkills } from './application/use-cases/uninstall-skills.js'
import { ClaudeAgentPlugin } from './domain/types/claude-plugin.js'

/**
 * Creates the Claude agent plugin instance.
 *
 * @returns Claude `AgentPlugin`.
 */
export function create(): AgentPlugin {
  const installSkills = new InstallSkills()
  const uninstallSkills = new UninstallSkills()
  return new ClaudeAgentPlugin(
    (projectRoot, options) => installSkills.execute(projectRoot, options),
    (projectRoot, options) => uninstallSkills.execute(projectRoot, options),
  )
}
