import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PluginValidationError } from '@specd/plugin-manager'
import type { AgentPlugin } from '@specd/plugin-manager'
import { InstallSkills } from './application/use-cases/install-skills.js'
import { UninstallSkills } from './application/use-cases/uninstall-skills.js'
import { OpenCodeAgentPlugin } from './domain/types/opencode-plugin.js'

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
  throw new PluginValidationError('@specd/plugin-agent-opencode', ['specd-plugin.json'])
}

/**
 * Creates an Open Code agent plugin instance.
 *
 * @returns Configured OpenCodeAgentPlugin instance.
 */
export async function create(): Promise<AgentPlugin> {
  const { name, version } = await readManifest()
  const installSkills = new InstallSkills()
  const uninstallSkills = new UninstallSkills()
  return new OpenCodeAgentPlugin(
    name,
    version,
    (projectRoot, options) => installSkills.execute(projectRoot, options),
    (projectRoot, options) => uninstallSkills.execute(projectRoot, options),
  )
}
