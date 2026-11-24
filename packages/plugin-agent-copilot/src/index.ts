import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PluginValidationError } from '@specd/plugin-manager'
import type { AgentPlugin, PluginLoaderOptions } from '@specd/plugin-manager'
import { InstallSkills } from './application/use-cases/install-skills.js'
import { UninstallSkills } from './application/use-cases/uninstall-skills.js'
import { CopilotAgentPlugin } from './domain/types/copilot-plugin.js'

/**
 * Checks that a manifest field is a non-empty string.
 *
 * @param value - Raw manifest field.
 * @returns `true` when the value is a string with at least one character.
 */
function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0
}

/**
 * Reads the plugin manifest from the filesystem.
 *
 * @returns Plugin name and version from manifest.
 * @throws PluginValidationError When the manifest is missing or its `name`/`version` is not a non-empty string.
 */
async function readManifest(): Promise<{ name: string; version: string }> {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.join(dir, 'specd-plugin.json'),
    path.join(dir, '..', 'specd-plugin.json'),
  ]
  for (const candidate of candidates) {
    let manifest: { name?: unknown; version?: unknown }
    try {
      manifest = JSON.parse(await readFile(candidate, 'utf8')) as {
        name?: unknown
        version?: unknown
      }
    } catch {
      continue
    }
    const invalid = ['name', 'version'].filter(
      (field) => !isNonEmptyString(manifest?.[field as 'name']),
    )
    if (
      invalid.length > 0 ||
      typeof manifest.name !== 'string' ||
      typeof manifest.version !== 'string'
    ) {
      throw new PluginValidationError(
        '@specd/plugin-agent-copilot',
        invalid.map((field) => `specd-plugin.json: ${field}`),
      )
    }
    return { name: manifest.name, version: manifest.version }
  }
  throw new PluginValidationError('@specd/plugin-agent-copilot', ['specd-plugin.json'])
}

/**
 * Creates a Copilot agent plugin instance.
 *
 * The factory is async. The plugin loader awaits it before using the plugin.
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
