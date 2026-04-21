import type { AgentPlugin } from '@specd/plugin-manager'
import { InstallSkills } from './application/use-cases/install-skills.js'
import { UninstallSkills } from './application/use-cases/uninstall-skills.js'
import { CopilotAgentPlugin } from './domain/types/copilot-plugin.js'

/**
 * Creates the Copilot agent plugin instance.
 *
 * @returns Copilot `AgentPlugin`.
 */
export function create(): AgentPlugin {
  const installSkills = new InstallSkills()
  const uninstallSkills = new UninstallSkills()
  return new CopilotAgentPlugin(
    (projectRoot, options) => installSkills.execute(projectRoot, options),
    (projectRoot, options) => uninstallSkills.execute(projectRoot, options),
  )
}
