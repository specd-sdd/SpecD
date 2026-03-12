/* eslint-disable @typescript-eslint/unbound-method */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { CommanderError } from 'commander'
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
import { registerChangeStatus } from '../../src/commands/change/status.js'
import { ChangeNotFoundError } from '@specd/core'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({ config, kernel })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('Command signature', () => {
  it('Missing name argument', async () => {
    setup()

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await expect(program.parseAsync(['node', 'specd', 'change', 'status'])).rejects.toThrow(
      CommanderError,
    )
  })
})

describe('Output format', () => {
  it('Normal status output', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({
      name: 'add-login',
      state: 'designing',
      specIds: ['auth/login'],
    })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      artifactStatuses: [{ type: 'proposal', effectiveStatus: 'complete' }],
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'add-login'])

    const out = stdout()
    expect(out).toContain('change:')
    expect(out).toContain('add-login')
    expect(out).toContain('state:')
    expect(out).toContain('designing')
    expect(out).toContain('specs:')
    expect(out).toContain('auth/login')
    expect(out).toContain('proposal')
  })

  it('Effective status reflects dependency cascading', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'my-change', state: 'designing' })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      artifactStatuses: [
        { type: 'proposal', effectiveStatus: 'in-progress' },
        { type: 'spec', effectiveStatus: 'in-progress' },
      ],
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    const out = stdout()
    const lines = out.split('\n')
    const specLine = lines.find((l: string) => l.includes('spec') && !l.includes('specs:'))
    expect(specLine).toContain('in-progress')
  })
})

describe('Schema version warning', () => {
  it('Schema mismatch', async () => {
    const { kernel, stderr } = setup()
    const change = makeMockChange({
      name: 'my-change',
      state: 'designing',
      schemaName: '@specd/schema-std',
      schemaVersion: 1,
    })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      artifactStatuses: [],
    })
    kernel.specs.getActiveSchema.execute.mockResolvedValue({
      name: () => '@specd/schema-std',
      version: () => 2,
      artifacts: () => [],
      workflow: () => [],
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    const err = stderr()
    expect(err).toContain('warning:')
    expect(err).toContain('@specd/schema-std@1')
    expect(err).toContain('@specd/schema-std@2')
  })
})

describe('Change not found', () => {
  it('Unknown change name', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockRejectedValue(new ChangeNotFoundError('nonexistent'))

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'nonexistent']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('JSON output contains correct structure', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({
      name: 'add-login',
      state: 'designing',
      specIds: ['auth/login'],
      schemaName: 'std',
      schemaVersion: 1,
    })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      artifactStatuses: [{ type: 'proposal', effectiveStatus: 'complete' }],
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'add-login', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.name).toBe('add-login')
    expect(parsed.state).toBe('designing')
    expect(parsed.specIds).toEqual(['auth/login'])
    expect(parsed.schema.name).toBe('std')
    expect(parsed.schema.version).toBe(1)
    expect(parsed.artifacts).toHaveLength(1)
    expect(parsed.artifacts[0].type).toBe('proposal')
    expect(parsed.artifacts[0].effectiveStatus).toBe('complete')
  })
})
