import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PluginValidationError } from '@specd/plugin-manager'
import type { AgentPlugin, PluginLoaderOptions } from '@specd/plugin-manager'
import { InstallSkills } from './application/use-cases/install-skills.js'
import { UninstallSkills } from './application/use-cases/uninstall-skills.js'
import { AgentStandardAgentPlugin } from './domain/types/agent-standard-plugin.js'

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
  throw new PluginValidationError('@specd/plugin-agent-standard', ['specd-plugin.json'])
}

/**
 * Creates an Agent Skills standard agent plugin instance.
 *
 * @param options - Loader options.
 * @returns Configured AgentStandardAgentPlugin instance.
 */
export async function create(options: PluginLoaderOptions): Promise<AgentPlugin> {
  void options
  const { name, version } = await readManifest()
  const installSkills = new InstallSkills()
  const uninstallSkills = new UninstallSkills()
  return new AgentStandardAgentPlugin(
    name,
    version,
    (targetConfig, installOptions) => installSkills.execute(targetConfig, installOptions),
    (targetConfig, uninstallOptions) => uninstallSkills.execute(targetConfig, uninstallOptions),
  )
}
