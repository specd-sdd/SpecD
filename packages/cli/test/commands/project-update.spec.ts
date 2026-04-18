import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureStderr,
  captureStdout,
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

vi.mock('../../src/commands/plugins/update.js', () => ({
  updatePluginsWithKernel: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { updatePluginsWithKernel } from '../../src/commands/plugins/update.js'
import { registerProjectUpdate } from '../../src/commands/project/update.js'

function setup() {
  vi.mocked(resolveCliContext).mockResolvedValue({
    config: makeMockConfig(),
    configFilePath: '/project/specd.yaml',
    kernel: makeMockKernel(),
  })
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
    expect(stderr()).toContain('')
  })
})
