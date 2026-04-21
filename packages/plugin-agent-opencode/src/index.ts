import type { AgentPlugin } from '@specd/plugin-manager'
import { InstallSkills } from './application/use-cases/install-skills.js'
import { UninstallSkills } from './application/use-cases/uninstall-skills.js'
import { OpenCodeAgentPlugin } from './domain/types/opencode-plugin.js'

/**
 * Creates the Open Code agent plugin instance.
 *
 * @returns Open Code `AgentPlugin`.
 */
export function create(): AgentPlugin {
  const installSkills = new InstallSkills()
  const uninstallSkills = new UninstallSkills()
  return new OpenCodeAgentPlugin(
    (projectRoot, options) => installSkills.execute(projectRoot, options),
    (projectRoot, options) => uninstallSkills.execute(projectRoot, options),
  )
}
