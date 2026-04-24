import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PluginValidationError } from '@specd/plugin-manager'
import type { AgentPlugin, PluginLoaderOptions } from '@specd/plugin-manager'
import { InstallSkills } from './application/use-cases/install-skills.js'
import { UninstallSkills } from './application/use-cases/uninstall-skills.js'
import { CopilotAgentPlugin } from './domain/types/copilot-plugin.js'

/**
 * Reads the plugin manifest from the filesystem.
 *
 * @returns Plugin name and version from manifest.
 */
async function readManifest(): Promise<{ name: string; version: string }> {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.join(dir, 'specd-plugin.json'),
    path.join(dir, '..', 'specd-plugin.json'),
  ]
  for (const candidate of candidates) {
    try {
      const raw = await readFile(candidate, 'utf8')
      const manifest = JSON.parse(raw) as { name: string; version: string }
      return { name: manifest.name, version: manifest.version }
    } catch {
      continue
    }
  }
  throw new PluginValidationError('@specd/plugin-agent-copilot', ['specd-plugin.json'])
}

/**
 * Creates a Copilot agent plugin instance.
 *
 * @param _options - Loader options.
 * @returns Configured CopilotAgentPlugin instance.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function create(_options: PluginLoaderOptions): Promise<AgentPlugin> {
  const { name, version } = await readManifest()
  const installSkills = new InstallSkills()
  const uninstallSkills = new UninstallSkills()
  return new CopilotAgentPlugin(
    name,
    version,
    (targetConfig, installOptions) => installSkills.execute(targetConfig, installOptions),
    (targetConfig, uninstallOptions) => uninstallSkills.execute(targetConfig, uninstallOptions),
  )
}
