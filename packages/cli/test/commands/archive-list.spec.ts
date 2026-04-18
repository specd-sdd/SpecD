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
import { registerArchiveList } from '../../src/commands/archive/list.js'

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
  it('Archived changes listed with correct fields', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listArchived.execute.mockResolvedValue([
      {
        name: 'add-oauth-login',
        archivedName: '2024-01-15-add-oauth-login',
        archivedAt: new Date('2024-01-15T12:00:00.000Z'),
        workspaces: ['default'],
        archivedBy: { name: 'alice', email: 'alice@test.com' },
        artifacts: [],
      },
      {
        name: 'update-billing',
        archivedName: '2024-01-10-update-billing',
        archivedAt: new Date('2024-01-10T09:00:00.000Z'),
        workspaces: ['billing'],
        archivedBy: undefined,
        artifacts: [],
      },
    ])

    const program = makeProgram()
    registerArchiveList(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'list'])

    const out = stdout()
    // Each row shows name, workspace, and date
    expect(out).toContain('add-oauth-login')
    expect(out).toContain('default')
    expect(out).toContain('2024-01-15')
    expect(out).toContain('update-billing')
    expect(out).toContain('billing')
    expect(out).toContain('2024-01-10')
    // Row for add-oauth-login includes "by alice"
    expect(out).toContain('by alice')
    // Row for update-billing does not include a "by" segment
    const billingLine = out.split('\n').find((l) => l.includes('update-billing'))!
    expect(billingLine).not.toMatch(/by\s+\S/)
  })

  it('Rows sorted by archive date descending', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listArchived.execute.mockResolvedValue([
      {
        name: 'older-change',
        archivedName: '2024-01-01-older-change',
        archivedAt: new Date('2024-01-01T00:00:00Z'),
        workspaces: ['default'],
        artifacts: [],
      },
      {
        name: 'newer-change',
        archivedName: '2024-02-01-newer-change',
        archivedAt: new Date('2024-02-01T00:00:00Z'),
        workspaces: ['default'],
        artifacts: [],
      },
    ])

    const program = makeProgram()
    registerArchiveList(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'list'])

    const out = stdout()
    const newerIdx = out.indexOf('newer-change')
    const olderIdx = out.indexOf('older-change')
    expect(newerIdx).toBeGreaterThan(-1)
    expect(olderIdx).toBeGreaterThan(-1)
    expect(newerIdx).toBeLessThan(olderIdx)
  })
})

describe('Output format — JSON', () => {
  it('JSON format output', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listArchived.execute.mockResolvedValue([
      {
        name: 'add-oauth-login',
        archivedName: '2024-01-15-add-oauth-login',
        archivedAt: new Date('2024-01-15T12:00:00.000Z'),
        workspaces: ['default'],
        archivedBy: { name: 'alice', email: 'alice@test.com' },
        artifacts: new Set(['spec']),
      },
    ])

    const program = makeProgram()
    registerArchiveList(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout()) as unknown[]
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(1)
    const obj = parsed[0] as Record<string, unknown>
    expect(obj).toHaveProperty('name', 'add-oauth-login')
    expect(obj).toHaveProperty('archivedName')
    expect(obj).toHaveProperty('workspace', 'default')
    expect(obj).toHaveProperty('archivedAt', '2024-01-15T12:00:00.000Z')
    expect(obj).toHaveProperty('archivedBy')
    expect(obj).toHaveProperty('artifacts')
    expect(obj).not.toHaveProperty('state')
    expect(obj).not.toHaveProperty('specIds')
  })

  it('JSON format output — no actor recorded', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listArchived.execute.mockResolvedValue([
      {
        name: 'update-billing',
        archivedName: '2024-01-10-update-billing',
        archivedAt: new Date('2024-01-10T09:00:00.000Z'),
        workspaces: ['billing'],
        archivedBy: undefined,
        artifacts: new Set(),
      },
    ])

    const program = makeProgram()
    registerArchiveList(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout()) as unknown[]
    const obj = parsed[0] as Record<string, unknown>
    expect(obj).toHaveProperty('name', 'update-billing')
    expect(obj).not.toHaveProperty('archivedBy')
  })
})

describe('Empty archive', () => {
  it('No archived changes — text', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listArchived.execute.mockResolvedValue([])

    const program = makeProgram()
    registerArchiveList(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'list'])

    expect(stdout().toLowerCase()).toContain('no archived changes')
  })

  it('No archived changes — JSON', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listArchived.execute.mockResolvedValue([])

    const program = makeProgram()
    registerArchiveList(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed).toEqual([])
  })
})

describe('Error cases', () => {
  it('I/O error reading archive directory', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.listArchived.execute.mockRejectedValue(new Error('EACCES: permission denied'))

    const program = makeProgram()
    registerArchiveList(program.command('archive'))
    try {
      await program.parseAsync(['node', 'specd', 'archive', 'list'])
    } catch (err) {
      expect(err).toBeInstanceOf(ExitSentinel)
      expect((err as ExitSentinel).code).toBe(3)
    }
    expect(stderr().toLowerCase()).toContain('fatal:')
  })
})
