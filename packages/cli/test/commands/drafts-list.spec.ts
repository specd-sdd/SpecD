import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerDraftsList } from '../../src/commands/drafts/list.js'

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

describe('Output format — text', () => {
  it('Drafts listed with correct fields', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDrafts.execute.mockResolvedValue([
      {
        name: 'old-experiment',
        state: 'drafting',
        createdAt: new Date('2024-01-05T00:00:00Z'),
        history: [
          {
            type: 'drafted',
            at: new Date('2024-01-05T10:00:00Z'),
            by: { name: 'alice', email: 'alice@test.com' },
            reason: 'parked for later',
          },
        ],
      },
      {
        name: 'shelved-work',
        state: 'designing',
        createdAt: new Date('2024-01-03T00:00:00Z'),
        history: [
          {
            type: 'drafted',
            at: new Date('2024-01-03T10:00:00Z'),
            by: { name: 'bob', email: 'bob@test.com' },
          },
        ],
      },
    ])

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'list'])

    const out = stdout()
    // Each row shows name, bracketed state, date, and actor
    expect(out).toContain('old-experiment')
    expect(out).toContain('drafting')
    expect(out).toContain('2024-01-05')
    expect(out).toContain('alice')
    // Row for old-experiment includes the reason
    expect(out).toContain('parked for later')

    expect(out).toContain('shelved-work')
    expect(out).toContain('designing')
    expect(out).toContain('2024-01-03')
    expect(out).toContain('bob')
  })

  it('Rows sorted by createdAt ascending', async () => {
    const { kernel, stdout } = setup()
    // b-change created before a-change (alphabetically later but older)
    kernel.changes.listDrafts.execute.mockResolvedValue([
      {
        name: 'b-change',
        state: 'designing',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        history: [
          {
            type: 'drafted',
            at: new Date('2024-01-01T10:00:00Z'),
            by: { name: 'dev', email: 'dev@test.com' },
          },
        ],
      },
      {
        name: 'a-change',
        state: 'designing',
        createdAt: new Date('2024-01-05T00:00:00Z'),
        history: [
          {
            type: 'drafted',
            at: new Date('2024-01-05T10:00:00Z'),
            by: { name: 'dev', email: 'dev@test.com' },
          },
        ],
      },
    ])

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'list'])

    const out = stdout()
    const bIdx = out.indexOf('b-change')
    const aIdx = out.indexOf('a-change')
    expect(bIdx).toBeLessThan(aIdx)
  })
})

describe('Output format — JSON', () => {
  it('JSON format output', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDrafts.execute.mockResolvedValue([
      {
        name: 'old-experiment',
        state: 'drafting',
        createdAt: new Date('2024-01-05T00:00:00Z'),
        history: [
          {
            type: 'drafted',
            at: new Date('2024-01-05T10:00:00.000Z'),
            by: { name: 'alice', email: 'alice@test.com' },
            reason: 'parked for later',
          },
        ],
      },
    ])

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe('old-experiment')
    expect(parsed[0].state).toBe('drafting')
    expect(parsed[0].draftedAt).toBe('2024-01-05T10:00:00.000Z')
    expect(parsed[0].draftedBy).toBeDefined()
    expect(parsed[0].reason).toBe('parked for later')
    // Must not contain specIds or schema fields
    expect(parsed[0].specIds).toBeUndefined()
    expect(parsed[0].schema).toBeUndefined()
  })

  it('JSON format output — no reason or actor', async () => {
    const { kernel, stdout } = setup()
    // No drafted event in history → evt is undefined → draftedBy and reason omitted
    kernel.changes.listDrafts.execute.mockResolvedValue([
      {
        name: 'shelved-work',
        state: 'designing',
        createdAt: new Date('2024-01-03T00:00:00Z'),
        history: [],
      },
    ])

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe('shelved-work')
    expect(parsed[0].reason).toBeUndefined()
    expect(parsed[0].draftedBy).toBeUndefined()
  })
})

describe('Empty drafts', () => {
  it('No drafted changes — text', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDrafts.execute.mockResolvedValue([])

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'list'])

    expect(stdout()).toContain('no drafts')
  })

  it('No drafted changes — JSON', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDrafts.execute.mockResolvedValue([])

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'list', '--format', 'json'])

    expect(stdout().trim()).toBe('[]')
  })
})

describe('Error cases', () => {
  it('I/O error reading drafts directory', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.listDrafts.execute.mockRejectedValue(new Error('EACCES: permission denied'))

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'list']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(3)
    expect(stderr()).toMatch(/fatal:/)
  })
})
