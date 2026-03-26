import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeMockChange,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerChangeList } from '../../src/commands/change/list.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({ config, configFilePath: null, kernel })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('Output format', () => {
  it('Only active changes shown', async () => {
    const { kernel, stdout } = setup()
    const activeChange = makeMockChange({ name: 'active-one', state: 'designing' })
    kernel.changes.list.execute.mockResolvedValue([activeChange])

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'list'])

    const out = stdout()
    expect(out).toContain('active-one')
  })

  it('Discarded changes not shown', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.list.execute.mockResolvedValue([])

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'list'])

    expect(stdout()).toContain('no changes')
  })

  it('Rows contain name, state, specIds, and schema', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({
      name: 'add-login',
      state: 'designing',
      specIds: ['auth/login'],
      schemaName: 'std',
      schemaVersion: 1,
    })
    kernel.changes.list.execute.mockResolvedValue([change])

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'list'])

    const out = stdout()
    expect(out).toContain('add-login')
    expect(out).toContain('designing')
    expect(out).toContain('auth/login')
    expect(out).toContain('std@1')
  })

  it('JSON format output', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({
      name: 'add-login',
      state: 'designing',
      specIds: ['auth/login'],
      schemaName: 'std',
      schemaVersion: 1,
    })
    kernel.changes.list.execute.mockResolvedValue([change])

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe('add-login')
    expect(parsed[0].state).toBe('designing')
    expect(parsed[0].specIds).toEqual(['auth/login'])
    expect(parsed[0].schema.name).toBe('std')
    expect(parsed[0].schema.version).toBe(1)
  })
})

describe('Empty output', () => {
  it('No active changes — text mode', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.list.execute.mockResolvedValue([])

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'list'])

    expect(stdout()).toContain('no changes')
  })

  it('No active changes — JSON mode', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.list.execute.mockResolvedValue([])

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed).toEqual([])
  })
})
