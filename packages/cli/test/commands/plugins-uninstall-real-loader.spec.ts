import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureStderr,
  captureStdout,
  makeMockConfig,
  makeMockHost,
  makeProgram,
  mockProcessExit,
} from './helpers.js'
import { writeProjectWithPluginSource } from './plugins-real-loader-fixtures.js'

const mockRemovePlugin = vi.fn().mockResolvedValue(undefined)

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

vi.mock('@specd/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@specd/sdk')>()),
  createConfigWriter: vi.fn(() => ({ removePlugin: mockRemovePlugin })),
}))

// The real plugin-manager runs: the use case and the loader resolve packages from disk.
import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerPluginsUninstall } from '../../src/commands/plugins/uninstall.js'

const tempDirs: string[] = []

afterEach(async () => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

/**
 * Runs `plugins uninstall --format json` for one declared plugin and returns the entries.
 *
 * @param projectRoot - Project root that resolves (or not) the package
 * @param name - Declared plugin name
 * @returns Parsed result entries
 */
async function runUninstall(
  projectRoot: string,
  name: string,
): Promise<Array<{ name: string; status: string; detail: string }>> {
  const config = makeMockConfig({ projectRoot, plugins: [{ name }] })
  vi.mocked(resolveCliContext).mockResolvedValue(
    makeMockHost({ config, configFilePath: join(projectRoot, 'specd.yaml') }),
  )
  const stdout = captureStdout()
  captureStderr()
  mockProcessExit()
  const program = makeProgram()
  registerPluginsUninstall(program.command('plugins'))
  await program.parseAsync(['node', 'specd', 'plugins', 'uninstall', name, '--format', 'json'])
  return (
    JSON.parse(stdout()) as { plugins: Array<{ name: string; status: string; detail: string }> }
  ).plugins
}

describe('plugins uninstall with the real use case and plugin loader', () => {
  it('removes the declaration of a non-agent plugin that has no uninstall hook', async () => {
    const projectRoot = await writeProjectWithPluginSource(
      tempDirs,
      '@acme/plain',
      'export function create() { return { name: "@acme/plain", version: "1.0.0", init() {}, destroy() {} } }\n',
    )

    const plugins = await runUninstall(projectRoot, '@acme/plain')

    expect(plugins).toEqual([
      { name: '@acme/plain', status: 'uninstalled', detail: "uninstalled '@acme/plain'" },
    ])
    expect(mockRemovePlugin).toHaveBeenCalledTimes(1)
    expect(mockRemovePlugin).toHaveBeenCalledWith(join(projectRoot, 'specd.yaml'), '@acme/plain')
  })

  it('runs the real uninstall hook of a plugin that implements one, then removes the declaration', async () => {
    const projectRoot = await writeProjectWithPluginSource(
      tempDirs,
      '@acme/hooked',
      [
        'import { writeFileSync } from "node:fs"',
        'export function create() {',
        '  return { name: "@acme/hooked", version: "1.0.0", init() {}, destroy() {},',
        '    uninstall() { writeFileSync(new URL("./hook-ran", import.meta.url), "yes") } }',
        '}',
        '',
      ].join('\n'),
    )

    const plugins = await runUninstall(projectRoot, '@acme/hooked')

    expect(plugins[0]?.status).toBe('uninstalled')
    expect(existsSync(join(projectRoot, 'node_modules', '@acme', 'hooked', 'hook-ran'))).toBe(true)
    expect(mockRemovePlugin).toHaveBeenCalledTimes(1)
  })

  it('removes only the declaration when the package cannot be resolved', async () => {
    const projectRoot = await writeProjectWithPluginSource(
      tempDirs,
      '@acme/other',
      'export function create() { return {} }\n',
    )

    const plugins = await runUninstall(projectRoot, '@acme/missing')

    expect(plugins).toEqual([
      {
        name: '@acme/missing',
        status: 'uninstalled',
        detail: 'package not found; only the declaration was removed',
      },
    ])
    expect(mockRemovePlugin).toHaveBeenCalledWith(join(projectRoot, 'specd.yaml'), '@acme/missing')
  })
})
