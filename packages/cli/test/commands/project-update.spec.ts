import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureStderr,
  captureStdout,
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  makeMockHost,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

vi.mock('../../src/commands/plugins/update.js', () => ({
  updatePluginsWithKernel: vi.fn(),
}))

import { ConfigValidationError } from '@specd/sdk'
import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { updatePluginsWithKernel } from '../../src/commands/plugins/update.js'
import { registerProjectUpdate } from '../../src/commands/project/update.js'

function setup() {
  vi.mocked(resolveCliContext).mockResolvedValue(
    makeMockHost({
      config: makeMockConfig(),
      configFilePath: '/project/specd.yaml',
      kernel: makeMockKernel(),
    }),
  )
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('project update', () => {
  it('prefixes text output with plugins step label', async () => {
    const { stdout } = setup()
    vi.mocked(updatePluginsWithKernel).mockResolvedValue({
      plugins: [{ name: '@specd/plugin-agent-claude', status: 'updated', detail: 'ok' }],
      hasErrors: false,
    })

    const program = makeProgram()
    registerProjectUpdate(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'update'])

    expect(stdout()).toContain('plugins: updated @specd/plugin-agent-claude')
    expect(resolveCliContext).toHaveBeenCalledWith(expect.objectContaining({ plugins: false }))
  })

  it('prints up-to-date message when there is nothing to update', async () => {
    const { stdout } = setup()
    vi.mocked(updatePluginsWithKernel).mockResolvedValue({
      plugins: [],
      hasErrors: false,
    })

    const program = makeProgram()
    registerProjectUpdate(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'update'])

    expect(stdout()).toContain('project is up to date')
    expect(process.exit).not.toHaveBeenCalled()
  })

  it('outputs grouped JSON results', async () => {
    const { stdout } = setup()
    vi.mocked(updatePluginsWithKernel).mockResolvedValue({
      plugins: [{ name: '@specd/plugin-agent-claude', status: 'updated', detail: 'ok' }],
      hasErrors: false,
    })

    const program = makeProgram()
    registerProjectUpdate(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'update', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(Array.isArray(parsed.plugins)).toBe(true)
    expect(parsed.plugins[0].name).toBe('@specd/plugin-agent-claude')
    expect(parsed.hasErrors).toBe(false)
  })

  it('outputs an empty plugin list with hasErrors false when nothing is declared', async () => {
    const { stdout } = setup()
    vi.mocked(updatePluginsWithKernel).mockResolvedValue({ plugins: [], hasErrors: false })
    const program = makeProgram()
    registerProjectUpdate(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'update', '--format', 'json'])
    expect(JSON.parse(stdout())).toEqual({ plugins: [], hasErrors: false })
  })

  it('exits with code 1 when plugin update fails', async () => {
    const { stderr } = setup()
    vi.mocked(updatePluginsWithKernel).mockResolvedValue({
      plugins: [{ name: '@specd/plugin-agent-claude', status: 'error', detail: 'boom' }],
      hasErrors: true,
    })

    const program = makeProgram()
    registerProjectUpdate(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'update']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toBe('')
  })

  it('prints an error line with the detail for a failed plugin and exits 1', async () => {
    const { stdout } = setup()
    vi.mocked(updatePluginsWithKernel).mockResolvedValue({
      plugins: [
        { name: '@acme/checks', status: 'error', detail: 'boom' },
        { name: '@acme/other', status: 'updated', detail: 'ok' },
      ],
      hasErrors: true,
    })

    const program = makeProgram()
    registerProjectUpdate(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'update']).catch(() => {})

    const lines = stdout().trim().split('\n')
    expect(lines).toEqual(['plugins: error @acme/checks (boom)', 'plugins: updated @acme/other'])
    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('includes hasErrors in JSON when a plugin update fails', async () => {
    const { stdout } = setup()
    vi.mocked(updatePluginsWithKernel).mockClear()
    vi.mocked(updatePluginsWithKernel).mockResolvedValue({
      plugins: [{ name: '@acme/checks', status: 'error', detail: 'boom' }],
      hasErrors: true,
    })
    const program = makeProgram()
    registerProjectUpdate(program.command('project'))
    await program
      .parseAsync(['node', 'specd', 'project', 'update', '--format', 'json'])
      .catch(() => {})
    const parsed = JSON.parse(stdout())
    expect(parsed.hasErrors).toBe(true)
    expect(parsed.plugins[0].status).toBe('error')
  })

  it('exits when specd.yaml cannot be loaded', async () => {
    const { stderr } = setup()
    vi.mocked(updatePluginsWithKernel).mockClear()
    vi.mocked(resolveCliContext).mockRejectedValue(
      new ConfigValidationError('/missing/specd.yaml', 'no config file found'),
    )
    const program = makeProgram()
    registerProjectUpdate(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'update']).catch(() => {})
    expect(stderr()).toContain('error:')
    expect(stderr()).toContain('no config file found')
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(updatePluginsWithKernel).not.toHaveBeenCalled()
  })
})
