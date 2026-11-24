import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
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

const mockAddPlugin = vi.fn().mockResolvedValue(undefined)

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

vi.mock('@specd/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@specd/sdk')>()),
  createConfigWriter: vi.fn(() => ({ addPlugin: mockAddPlugin })),
}))

// The real plugin-manager runs; only `createPluginLoader` is wrapped to record its arguments.
vi.mock('@specd/plugin-manager', async (importOriginal) => {
  const original = await importOriginal<typeof import('@specd/plugin-manager')>()
  return { ...original, createPluginLoader: vi.fn(original.createPluginLoader) }
})

import { UnknownContributionKindError, createPluginLoader } from '@specd/plugin-manager'
import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerPluginsInstall } from '../../src/commands/plugins/install.js'

const tempDirs: string[] = []

afterEach(async () => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

/**
 * Writes a plugin package under `<project>/node_modules` whose manifest declares one kind.
 *
 * @param name - Scoped plugin package name
 * @param kind - Contribution kind declared by the manifest
 * @returns Absolute project root that resolves the package
 */
async function writeProjectWithPlugin(name: string, kind: string): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'specd-install-real-loader-'))
  tempDirs.push(projectRoot)
  const packageRoot = join(projectRoot, 'node_modules', ...name.split('/'))
  await mkdir(packageRoot, { recursive: true })
  await writeFile(
    join(packageRoot, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', type: 'module', main: './index.js' }),
    'utf8',
  )
  await writeFile(join(packageRoot, 'index.js'), 'export function create() { return {} }\n', 'utf8')
  await writeFile(
    join(packageRoot, 'specd-plugin.json'),
    JSON.stringify({
      schemaVersion: 2,
      name,
      version: '1.0.0',
      contributes: { [kind]: { lint: {} } },
    }),
    'utf8',
  )
  return projectRoot
}

describe('plugins install with the real plugin loader', () => {
  it('reports a kind without a handler with the exact UnknownContributionKindError message', async () => {
    const projectRoot = await writeProjectWithPlugin('@acme/x', 'checks')
    const config = makeMockConfig({ projectRoot })
    vi.mocked(resolveCliContext).mockResolvedValue(
      makeMockHost({ config, configFilePath: join(projectRoot, 'specd.yaml') }),
    )
    const stdout = captureStdout()
    captureStderr()
    mockProcessExit()
    const program = makeProgram()
    registerPluginsInstall(program.command('plugins'))

    await expect(
      program.parseAsync(['node', 'specd', 'plugins', 'install', '@acme/x', '--format', 'json']),
    ).rejects.toMatchObject({ code: 1 })

    const expected = new UnknownContributionKindError('@acme/x', 'checks')
    expect(expected.message).toContain("'@acme/x'")
    expect(expected.message).toContain("'checks'")
    const parsed = JSON.parse(stdout())
    expect(parsed.hasErrors).toBe(true)
    expect(parsed.plugins).toEqual([{ name: '@acme/x', status: 'error', detail: expected.message }])
    expect(mockAddPlugin).not.toHaveBeenCalled()
  })

  it('registers only the built-in agents handler: the loader is created with the config alone', async () => {
    const projectRoot = await writeProjectWithPlugin('@acme/y', 'checks')
    const config = makeMockConfig({ projectRoot })
    vi.mocked(resolveCliContext).mockResolvedValue(
      makeMockHost({ config, configFilePath: join(projectRoot, 'specd.yaml') }),
    )
    captureStdout()
    captureStderr()
    mockProcessExit()
    const program = makeProgram()
    registerPluginsInstall(program.command('plugins'))
    await program
      .parseAsync(['node', 'specd', 'plugins', 'install', '@acme/y', '--format', 'json'])
      .catch(() => {})

    expect(createPluginLoader).toHaveBeenCalledTimes(1)
    const options = vi.mocked(createPluginLoader).mock.calls[0]?.[0]
    expect(options).toEqual({ config })
    expect(options).not.toHaveProperty('handlers')
  })
})
