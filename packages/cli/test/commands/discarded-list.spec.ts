import { describe, it, expect, vi, afterEach } from 'vitest'
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
import { registerDiscardedList } from '../../src/commands/discarded/list.js'

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

describe('Output format — text', () => {
  it('Discarded changes listed with correct fields', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDiscarded.execute.mockResolvedValue([
      {
        name: 'old-experiment',
        history: [
          {
            type: 'discarded',
            at: new Date('2024-01-10T09:00:00Z'),
            by: { name: 'alice', email: 'alice@test.com' },
            reason: 'no longer needed',
          },
        ],
      },
      {
        name: 'bad-idea',
        history: [
          {
            type: 'discarded',
            at: new Date('2024-01-08T09:00:00Z'),
            by: { name: 'bob', email: 'bob@test.com' },
            reason: 'duplicate effort',
            supersededBy: ['new-approach'],
          },
        ],
      },
    ])

    const program = makeProgram()
    registerDiscardedList(program.command('discarded'))
    await program.parseAsync(['node', 'specd', 'discarded', 'list'])

    const out = stdout()
    expect(out).toContain('old-experiment')
    expect(out).toContain('bad-idea')
    expect(out).toContain('2024-01-10')
    expect(out).toContain('2024-01-08')
    expect(out).toContain('alice')
    expect(out).toContain('no longer needed')
    expect(out).toContain('bob')
    expect(out).toContain('duplicate effort')
  })

  it('Discarded changes listed with supersededBy indicator', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDiscarded.execute.mockResolvedValue([
      {
        name: 'old-experiment',
        history: [
          {
            type: 'discarded',
            at: new Date('2024-01-10T09:00:00Z'),
            by: { name: 'alice', email: 'alice@test.com' },
            reason: 'no longer needed',
          },
        ],
      },
      {
        name: 'bad-idea',
        history: [
          {
            type: 'discarded',
            at: new Date('2024-01-08T09:00:00Z'),
            by: { name: 'bob', email: 'bob@test.com' },
            reason: 'duplicate effort',
            supersededBy: ['new-approach'],
          },
        ],
      },
    ])

    const program = makeProgram()
    registerDiscardedList(program.command('discarded'))
    await program.parseAsync(['node', 'specd', 'discarded', 'list'])

    const out = stdout()
    expect(out).toContain('→ new-approach')
    const oldLine = out.split('\n').find((l) => l.includes('old-experiment'))!
    expect(oldLine).not.toContain('→')
  })

  it('Rows sorted by discard date descending', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDiscarded.execute.mockResolvedValue([
      {
        name: 'older-discard',
        history: [
          {
            type: 'discarded',
            at: new Date('2024-01-01T00:00:00Z'),
            by: { name: 'alice', email: 'alice@test.com' },
            reason: 'old',
          },
        ],
      },
      {
        name: 'newer-discard',
        history: [
          {
            type: 'discarded',
            at: new Date('2024-02-01T00:00:00Z'),
            by: { name: 'bob', email: 'bob@test.com' },
            reason: 'new',
          },
        ],
      },
    ])

    const program = makeProgram()
    registerDiscardedList(program.command('discarded'))
    await program.parseAsync(['node', 'specd', 'discarded', 'list'])

    const out = stdout()
    const newerIdx = out.indexOf('newer-discard')
    const olderIdx = out.indexOf('older-discard')
    expect(newerIdx).toBeGreaterThan(-1)
    expect(olderIdx).toBeGreaterThan(-1)
    expect(newerIdx).toBeLessThan(olderIdx)
  })
})

describe('Output format — JSON', () => {
  it('JSON format output', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDiscarded.execute.mockResolvedValue([
      {
        name: 'old-experiment',
        history: [
          {
            type: 'discarded',
            at: new Date('2024-01-10T09:00:00.000Z'),
            by: { name: 'alice', email: 'alice@test.com' },
            reason: 'no longer needed',
          },
        ],
      },
    ])

    const program = makeProgram()
    registerDiscardedList(program.command('discarded'))
    await program.parseAsync(['node', 'specd', 'discarded', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout()) as unknown[]
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(1)
    const obj = parsed[0] as Record<string, unknown>
    expect(obj).toHaveProperty('name', 'old-experiment')
    expect(obj).toHaveProperty('discardedAt', '2024-01-10T09:00:00.000Z')
    expect(obj).toHaveProperty('discardedBy')
    expect(obj).toHaveProperty('reason', 'no longer needed')
    expect(obj).not.toHaveProperty('supersededBy')
  })

  it('JSON format output — supersededBy present', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDiscarded.execute.mockResolvedValue([
      {
        name: 'bad-idea',
        history: [
          {
            type: 'discarded',
            at: new Date('2024-01-08T09:00:00.000Z'),
            by: { name: 'bob', email: 'bob@test.com' },
            reason: 'duplicate effort',
            supersededBy: ['new-approach'],
          },
        ],
      },
    ])

    const program = makeProgram()
    registerDiscardedList(program.command('discarded'))
    await program.parseAsync(['node', 'specd', 'discarded', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout()) as unknown[]
    const obj = parsed[0] as Record<string, unknown>
    expect(obj).toHaveProperty('name', 'bad-idea')
    expect(obj).toHaveProperty('supersededBy')
    expect((obj as { supersededBy: string[] }).supersededBy).toContain('new-approach')
  })
})

describe('Empty discarded list', () => {
  it('No discarded changes — text', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDiscarded.execute.mockResolvedValue([])

    const program = makeProgram()
    registerDiscardedList(program.command('discarded'))
    await program.parseAsync(['node', 'specd', 'discarded', 'list'])

    expect(stdout().toLowerCase()).toContain('no discarded changes')
  })

  it('No discarded changes — JSON', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDiscarded.execute.mockResolvedValue([])

    const program = makeProgram()
    registerDiscardedList(program.command('discarded'))
    await program.parseAsync(['node', 'specd', 'discarded', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed).toEqual([])
  })
})

describe('Error cases', () => {
  it('I/O error reading discarded directory', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.listDiscarded.execute.mockRejectedValue(new Error('EACCES: permission denied'))

    const program = makeProgram()
    registerDiscardedList(program.command('discarded'))
    try {
      await program.parseAsync(['node', 'specd', 'discarded', 'list'])
    } catch (err) {
      expect(err).toBeInstanceOf(ExitSentinel)
      expect((err as ExitSentinel).code).toBe(3)
    }
    expect(stderr().toLowerCase()).toContain('fatal:')
  })
})
