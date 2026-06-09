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
    kernel.changes.listArchived.execute.mockResolvedValue({
      items: [
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
          workspaces: ['payments'],
          archivedBy: undefined,
          artifacts: [],
        },
      ],
      meta: { total: 2, count: 2, limit: 100, page: 1 },
    })

    const program = makeProgram()
    registerArchiveList(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'list'])

    const out = stdout()
    expect(out).toContain('add-oauth-login')
    expect(out).toContain('2024-01-15')
    expect(out).toContain('update-billing')
    expect(out).toContain('2024-01-10')
    expect(out).toContain('by alice')
    expect(out).toContain('Showing 2 archived changes of 2.')
    // WORKSPACE column removed
    expect(out).not.toContain('WORKSPACE')
    expect(out).not.toContain('payments')
  })

  it('Rows sorted by archive date descending', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listArchived.execute.mockResolvedValue({
      items: [
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
      ],
      meta: { total: 2, count: 2, limit: 100, page: 1 },
    })

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
  it('JSON format output with meta', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listArchived.execute.mockResolvedValue({
      items: [
        {
          name: 'add-oauth-login',
          archivedName: '2024-01-15-add-oauth-login',
          archivedAt: new Date('2024-01-15T12:00:00.000Z'),
          workspaces: ['default'],
          archivedBy: { name: 'alice', email: 'alice@test.com' },
          artifacts: ['spec'],
        },
      ],
      meta: { total: 1, count: 1, limit: 100, page: 1 },
    })

    const program = makeProgram()
    registerArchiveList(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed).toHaveProperty('items')
    expect(parsed).toHaveProperty('meta')
    expect(parsed.items).toHaveLength(1)
    const obj = parsed.items[0]
    expect(obj).toHaveProperty('name', 'add-oauth-login')
    expect(obj).toHaveProperty('archivedAt', '2024-01-15T12:00:00.000Z')
    expect(parsed.meta).toHaveProperty('total', 1)
  })
})

describe('Empty archive', () => {
  it('No archived changes — text', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listArchived.execute.mockResolvedValue({
      items: [],
      meta: { total: 0, count: 0, limit: 100, page: 1 },
    })

    const program = makeProgram()
    registerArchiveList(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'list'])

    expect(stdout().toLowerCase()).toContain('no archived changes')
  })

  it('No archived changes — JSON', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listArchived.execute.mockResolvedValue({
      items: [],
      meta: { total: 0, count: 0, limit: 100, page: 1 },
    })

    const program = makeProgram()
    registerArchiveList(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.items).toEqual([])
    expect(parsed.meta.total).toBe(0)
  })
})
