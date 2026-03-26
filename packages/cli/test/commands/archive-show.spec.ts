import { describe, it, expect, vi, afterEach } from 'vitest'
import { CommanderError } from 'commander'
import { ChangeNotFoundError } from '@specd/core'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
  ExitSentinel,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerArchiveShow } from '../../src/commands/archive/show.js'

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

describe('Command signature', () => {
  it('Missing name argument', async () => {
    setup()

    const program = makeProgram()
    registerArchiveShow(program.command('archive'))
    await expect(program.parseAsync(['node', 'specd', 'archive', 'show'])).rejects.toThrow(
      CommanderError,
    )
  })
})

describe('Output format — text', () => {
  it('Normal text output', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.getArchived.execute.mockResolvedValue({
      name: 'add-oauth-login',
      specIds: new Set(['auth/oauth']),
      schemaName: 'schema-std',
      schemaVersion: 1,
    })

    const program = makeProgram()
    registerArchiveShow(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'show', 'add-oauth-login'])

    const out = stdout()
    expect(out).toContain('name:')
    expect(out).toContain('add-oauth-login')
    expect(out).toContain('state:')
    expect(out).toContain('archivable')
    expect(out).toContain('specs:')
    expect(out).toContain('auth/oauth')
    expect(out).toContain('schema:')
    expect(out).toContain('schema-std@1')
  })
})

describe('Output format — JSON', () => {
  it('JSON format output', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.getArchived.execute.mockResolvedValue({
      name: 'add-oauth-login',
      specIds: new Set(['auth/oauth']),
      schemaName: 'schema-std',
      schemaVersion: 1,
    })

    const program = makeProgram()
    registerArchiveShow(program.command('archive'))
    await program.parseAsync([
      'node',
      'specd',
      'archive',
      'show',
      'add-oauth-login',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout()) as Record<string, unknown>
    expect(parsed).toHaveProperty('name', 'add-oauth-login')
    expect(parsed).toHaveProperty('state', 'archivable')
    expect(parsed).toHaveProperty('specIds')
    expect((parsed as { specIds: string[] }).specIds).toContain('auth/oauth')
    expect(parsed).toHaveProperty('schema')
    const schema = parsed['schema'] as Record<string, unknown>
    expect(schema).toHaveProperty('name', 'schema-std')
    expect(schema).toHaveProperty('version', 1)
  })
})

describe('Error cases', () => {
  it('Change not found in archive', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.getArchived.execute.mockRejectedValue(new ChangeNotFoundError('nonexistent'))

    const program = makeProgram()
    registerArchiveShow(program.command('archive'))
    try {
      await program.parseAsync(['node', 'specd', 'archive', 'show', 'nonexistent'])
    } catch (err) {
      expect(err).toBeInstanceOf(ExitSentinel)
      expect((err as ExitSentinel).code).toBe(1)
    }
    expect(stderr()).toContain('error:')
  })
})
