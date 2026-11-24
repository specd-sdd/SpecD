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
} from '../helpers.js'

const mockRemovePlugin = vi.fn().mockResolvedValue(undefined)

vi.mock('../../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

vi.mock('@specd/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@specd/sdk')>()),
  createConfigWriter: vi.fn(() => ({ removePlugin: mockRemovePlugin })),
}))

import { resolveCliContext } from '../../../src/helpers/cli-context.js'
import { registerPluginsUninstall } from '../../../src/commands/plugins/uninstall.js'

const tempDirs: string[] = []

afterEach(async () => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

/**
 * Writes a plugin package under `<project>/node_modules` with an invalid manifest.
 *
 * @param name - Scoped plugin package name
 * @returns Absolute project root that resolves the package
 */
async function writeProjectWithInvalidManifest(name: string): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'specd-uninstall-real-loader-'))
  tempDirs.push(projectRoot)
  const packageRoot = join(projectRoot, 'node_modules', ...name.split('/'))
  await mkdir(packageRoot, { recursive: true })
  await writeFile(
    join(packageRoot, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', type: 'module', main: './index.js' }),
    'utf8',
  )
  await writeFile(join(packageRoot, 'index.js'), 'export function create() { return {} }\n', 'utf8')
  await writeFile(join(packageRoot, 'specd-plugin.json'), '{ "not": "a manifest" }', 'utf8')
  return projectRoot
}

describe('plugins uninstall with the real plugin loader', () => {
  it('removes only the declaration when the manifest is invalid', async () => {
    const projectRoot = await writeProjectWithInvalidManifest('@acme/z')
    const config = makeMockConfig({ projectRoot, plugins: [{ name: '@acme/z' }] })
    vi.mocked(resolveCliContext).mockResolvedValue(
      makeMockHost({ config, configFilePath: join(projectRoot, 'specd.yaml') }),
    )
    const stdout = captureStdout()
    captureStderr()
    mockProcessExit()
    const program = makeProgram()
    registerPluginsUninstall(program.command('plugins'))

    await program.parseAsync([
      'node',
      'specd',
      'plugins',
      'uninstall',
      '@acme/z',
      '--format',
      'json',
    ])

    expect(mockRemovePlugin).toHaveBeenCalledWith(join(projectRoot, 'specd.yaml'), '@acme/z')
    const [entry] = JSON.parse(stdout()).plugins
    expect(entry.status).toBe('uninstalled')
    expect(entry.detail).toMatch(/^plugin failed to load \(.+\); only the declaration was removed$/)
    expect(process.exit).not.toHaveBeenCalled()
  })

  it('removes only the declaration when the package does not exist on disk', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'specd-uninstall-real-loader-'))
    tempDirs.push(projectRoot)
    const config = makeMockConfig({ projectRoot, plugins: [{ name: '@acme/gone' }] })
    vi.mocked(resolveCliContext).mockResolvedValue(
      makeMockHost({ config, configFilePath: join(projectRoot, 'specd.yaml') }),
    )
    const stdout = captureStdout()
    captureStderr()
    mockProcessExit()
    const program = makeProgram()
    registerPluginsUninstall(program.command('plugins'))

    await program.parseAsync([
      'node',
      'specd',
      'plugins',
      'uninstall',
      '@acme/gone',
      '--format',
      'json',
    ])

    expect(mockRemovePlugin).toHaveBeenCalledWith(join(projectRoot, 'specd.yaml'), '@acme/gone')
    const [entry] = JSON.parse(stdout()).plugins
    expect(entry.status).toBe('uninstalled')
    expect(entry.detail).toBe('package not found; only the declaration was removed')
    expect(process.exit).not.toHaveBeenCalled()
  })
})
