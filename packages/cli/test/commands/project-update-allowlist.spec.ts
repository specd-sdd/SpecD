import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureStdout,
  makeMockConfig,
  makeMockHost,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
} from './helpers.js'

const mockUpdate = vi.fn().mockResolvedValue({ success: true, message: 'ok' })
const mockAddPlugin = vi.fn()
const mockRemovePlugin = vi.fn()

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

vi.mock('@specd/plugin-manager', () => ({
  createPluginLoader: vi.fn().mockReturnValue({}),
  UpdatePlugin: vi.fn(function UpdatePluginMock() {
    return { execute: mockUpdate }
  }),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerProjectUpdate } from '../../src/commands/project/update.js'

afterEach(() => vi.clearAllMocks())

describe('project update (real update path)', () => {
  it('passes the declared allowlist to UpdatePlugin, opens the host without plugins and leaves specd.yaml untouched', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'specd-project-update-'))
    const configPath = join(dir, 'specd.yaml')
    const original = 'schema: "@specd/schema-std"\nplugins:\n  - name: "@acme/x"\n'
    await writeFile(configPath, original, 'utf8')

    const config = makeMockConfig({
      plugins: [{ name: '@acme/x', contributions: ['audit'] }, { name: '@acme/y' }],
    })
    vi.mocked(resolveCliContext).mockResolvedValue(
      makeMockHost({ config, configFilePath: configPath, kernel: makeMockKernel() }),
    )
    captureStdout()
    mockProcessExit()

    const program = makeProgram()
    registerProjectUpdate(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'update'])

    expect(resolveCliContext).toHaveBeenCalledWith(expect.objectContaining({ plugins: false }))
    expect(mockUpdate).toHaveBeenCalledTimes(2)
    expect(mockUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ pluginName: '@acme/x', contributions: ['audit'] }),
    )
    expect(mockUpdate.mock.calls[1]?.[0]).not.toHaveProperty('contributions')
    expect(mockAddPlugin).not.toHaveBeenCalled()
    expect(mockRemovePlugin).not.toHaveBeenCalled()
    expect(await readFile(configPath, 'utf8')).toBe(original)
  })
})
