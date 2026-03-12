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
import { registerDiscardedShow } from '../../src/commands/discarded/show.js'

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
    registerDiscardedShow(program.command('discarded'))
    await expect(program.parseAsync(['node', 'specd', 'discarded', 'show'])).rejects.toThrow(
      CommanderError,
    )
  })
})

describe('Output format — text', () => {
  it('Normal text output includes reason', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: {
        name: 'old-experiment',
        specIds: new Set(['auth/legacy']),
        schemaName: 'schema-std',
        schemaVersion: 1,
        history: [
          {
            type: 'discarded',
            at: new Date('2024-01-10T09:00:00Z'),
            by: { name: 'alice', email: 'alice@test.com' },
            reason: 'approach superseded by new-design',
          },
        ],
      },
      artifactStatuses: [],
    })

    const program = makeProgram()
    registerDiscardedShow(program.command('discarded'))
    await program.parseAsync(['node', 'specd', 'discarded', 'show', 'old-experiment'])

    const out = stdout()
    expect(out).toContain('name:')
    expect(out).toContain('old-experiment')
    expect(out).toContain('specs:')
    expect(out).toContain('auth/legacy')
    expect(out).toContain('schema:')
    expect(out).toContain('schema-std@1')
    expect(out).toContain('reason:')
    expect(out).toContain('approach superseded by new-design')
  })
})

describe('Output format — JSON', () => {
  it('JSON format output', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: {
        name: 'old-experiment',
        specIds: new Set(['auth/legacy']),
        schemaName: 'schema-std',
        schemaVersion: 1,
        history: [
          {
            type: 'discarded',
            at: new Date('2024-01-10T09:00:00Z'),
            by: { name: 'alice', email: 'alice@test.com' },
            reason: 'approach superseded by new-design',
          },
        ],
      },
      artifactStatuses: [],
    })

    const program = makeProgram()
    registerDiscardedShow(program.command('discarded'))
    await program.parseAsync([
      'node',
      'specd',
      'discarded',
      'show',
      'old-experiment',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout()) as Record<string, unknown>
    expect(parsed).toHaveProperty('name', 'old-experiment')
    expect(parsed).toHaveProperty('specIds')
    expect((parsed as { specIds: string[] }).specIds).toContain('auth/legacy')
    expect(parsed).toHaveProperty('schema')
    const schema = parsed['schema'] as Record<string, unknown>
    expect(schema).toHaveProperty('name', 'schema-std')
    expect(schema).toHaveProperty('version', 1)
    expect(parsed).toHaveProperty('reason', 'approach superseded by new-design')
  })
})

describe('Error cases', () => {
  it('Change not found in discarded', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockRejectedValue(new ChangeNotFoundError('nonexistent'))

    const program = makeProgram()
    registerDiscardedShow(program.command('discarded'))
    try {
      await program.parseAsync(['node', 'specd', 'discarded', 'show', 'nonexistent'])
    } catch (err) {
      expect(err).toBeInstanceOf(ExitSentinel)
      expect((err as ExitSentinel).code).toBe(1)
    }
    expect(stderr()).toContain('error:')
  })
})
