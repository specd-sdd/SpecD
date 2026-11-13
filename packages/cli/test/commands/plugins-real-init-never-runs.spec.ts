import { existsSync } from 'node:fs'
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
const mockRemovePlugin = vi.fn().mockResolvedValue(undefined)

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

vi.mock('@specd/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@specd/sdk')>()),
  createConfigWriter: vi.fn(() => ({
    addPlugin: mockAddPlugin,
    removePlugin: mockRemovePlugin,
  })),
}))

// The real plugin-manager runs: the plugin below is loaded from disk.
import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerPluginsInstall } from '../../src/commands/plugins/install.js'
import { registerPluginsUninstall } from '../../src/commands/plugins/uninstall.js'
import { registerPluginsUpdate } from '../../src/commands/plugins/update.js'
import { registerPluginsList } from '../../src/commands/plugins/list.js'
import { registerPluginsShow } from '../../src/commands/plugins/show.js'

const PLUGIN = '@acme/boom'
const tempDirs: string[] = []

afterEach(async () => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

/**
 * Writes an agents plugin whose `init` records a marker file and throws.
 *
 * @returns Project root and the marker path that exists only when `init` ran
 */
async function writeBoomPlugin(): Promise<{ projectRoot: string; marker: string }> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'specd-real-init-'))
  tempDirs.push(projectRoot)
  const packageRoot = join(projectRoot, 'node_modules', '@acme', 'boom')
  await mkdir(packageRoot, { recursive: true })
  const marker = join(packageRoot, 'init-ran')
  await writeFile(
    join(packageRoot, 'package.json'),
    JSON.stringify({ name: PLUGIN, version: '1.0.0', type: 'module', main: './index.js' }),
    'utf8',
  )
  await writeFile(
    join(packageRoot, 'index.js'),
    [
      "import { writeFileSync } from 'node:fs'",
      'export function create() {',
      '  return {',
      `    name: '${PLUGIN}',`,
      "    version: '1.0.0',",
      `    init() { writeFileSync(${JSON.stringify(marker)}, 'x'); throw new Error('INIT RAN') },`,
      '    destroy() {},',
      '    install() {},',
      '    uninstall() {},',
      '  }',
      '}',
      '',
    ].join('\n'),
    'utf8',
  )
  await writeFile(
    join(packageRoot, 'specd-plugin.json'),
    JSON.stringify({
      schemaVersion: 2,
      name: PLUGIN,
      version: '1.0.0',
      contributes: { agents: { boom: {} } },
    }),
    'utf8',
  )
  return { projectRoot, marker }
}

/**
 * Prepares the host mock and output capture for one command run.
 *
 * @param projectRoot - Root that resolves the plugin package
 * @param declared - Whether the plugin is declared in the config
 * @returns Stdout capture
 */
function setup(projectRoot: string, declared: boolean): () => string {
  const config = makeMockConfig({
    projectRoot,
    ...(declared ? { plugins: [{ name: PLUGIN }] } : {}),
  })
  vi.mocked(resolveCliContext).mockResolvedValue(
    makeMockHost({ config, configFilePath: join(projectRoot, 'specd.yaml') }),
  )
  const stdout = captureStdout()
  captureStderr()
  mockProcessExit()
  return stdout
}

describe('plugin commands never run a plugin init (real plugin, plugins: false)', () => {
  it('install', async () => {
    const { projectRoot, marker } = await writeBoomPlugin()
    const stdout = setup(projectRoot, false)
    const program = makeProgram()
    registerPluginsInstall(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'install', PLUGIN, '--format', 'json'])
    expect(JSON.parse(stdout()).plugins[0].status).toBe('installed')
    expect(mockAddPlugin).toHaveBeenCalledOnce()
    expect(existsSync(marker)).toBe(false)
    expect(resolveCliContext).toHaveBeenCalledWith(expect.objectContaining({ plugins: false }))
  })

  it('uninstall', async () => {
    const { projectRoot, marker } = await writeBoomPlugin()
    const stdout = setup(projectRoot, true)
    const program = makeProgram()
    registerPluginsUninstall(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'uninstall', PLUGIN, '--format', 'json'])
    expect(JSON.parse(stdout()).plugins[0].status).toBe('uninstalled')
    expect(mockRemovePlugin).toHaveBeenCalledOnce()
    expect(existsSync(marker)).toBe(false)
  })

  it('update', async () => {
    const { projectRoot, marker } = await writeBoomPlugin()
    const stdout = setup(projectRoot, true)
    const program = makeProgram()
    registerPluginsUpdate(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'update', '--format', 'json'])
    expect(JSON.parse(stdout()).plugins[0].status).toBe('updated')
    expect(existsSync(marker)).toBe(false)
  })

  it('list', async () => {
    const { projectRoot, marker } = await writeBoomPlugin()
    const stdout = setup(projectRoot, true)
    const program = makeProgram()
    registerPluginsList(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'list', '--format', 'json'])
    expect(JSON.parse(stdout()).plugins[0]).toMatchObject({ name: PLUGIN, status: 'installed' })
    expect(existsSync(marker)).toBe(false)
  })

  it('show', async () => {
    const { projectRoot, marker } = await writeBoomPlugin()
    const stdout = setup(projectRoot, true)
    const program = makeProgram()
    registerPluginsShow(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'show', PLUGIN, '--format', 'json'])
    expect(JSON.parse(stdout()).name).toBe(PLUGIN)
    expect(existsSync(marker)).toBe(false)
  })
})
