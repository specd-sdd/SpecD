import type { AgentPlugin } from '@specd/plugin-manager'
import { InstallSkills } from './application/use-cases/install-skills.js'
import { UninstallSkills } from './application/use-cases/uninstall-skills.js'
import { CodexAgentPlugin } from './domain/types/codex-plugin.js'

/**
 * Creates the Codex agent plugin instance.
 *
 * @returns Codex `AgentPlugin`.
 */
export function create(): AgentPlugin {
  const installSkills = new InstallSkills()
  const uninstallSkills = new UninstallSkills()
  return new CodexAgentPlugin(
    (projectRoot, options) => installSkills.execute(projectRoot, options),
    (projectRoot, options) => uninstallSkills.execute(projectRoot, options),
  )
}
