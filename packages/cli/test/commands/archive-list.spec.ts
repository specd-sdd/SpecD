import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeArchiveListEntry,
  makeListResult,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
  DEFAULT_LIST_LIMIT,
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
    kernel.changes.listArchived.execute.mockResolvedValue(
      makeListResult([
        makeArchiveListEntry({
          name: 'add-oauth-login',
          archivedName: '2024-01-15-add-oauth-login',
          archivedAt: new Date('2024-01-15T12:00:00.000Z'),
          archivedBy: { name: 'alice', email: 'alice@test.com' },
        }),
        makeArchiveListEntry({
          name: 'update-billing',
          archivedName: '2024-01-10-update-billing',
          archivedAt: new Date('2024-01-10T09:00:00.000Z'),
        }),
      ]),
    )

    const program = makeProgram()
    registerArchiveList(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'list', '--archived-by'])

    const out = stdout()
    expect(out).toContain('add-oauth-login')
    expect(out).toContain('2024-01-15')
    expect(out).toContain('update-billing')
    expect(out).toContain('2024-01-10')
    expect(out).toContain('alice')
    expect(out).not.toContain('WORKSPACE')
  })

  it('--archived-by is opt-in', async () => {
    const { kernel } = setup()
    kernel.changes.listArchived.execute.mockResolvedValue(
      makeListResult([
        makeArchiveListEntry({
          archivedBy: { name: 'alice', email: 'alice@test.com' },
        }),
      ]),
    )

    const program = makeProgram()
    registerArchiveList(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'list'])

    expect(kernel.changes.listArchived.execute).toHaveBeenCalledWith({})
  })
})

describe('Output format — JSON', () => {
  it('JSON format output with meta', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listArchived.execute.mockResolvedValue(
      makeListResult([
        makeArchiveListEntry({
          name: 'add-oauth-login',
          archivedName: '2024-01-15-add-oauth-login',
          archivedAt: new Date('2024-01-15T12:00:00.000Z'),
          archivedBy: { name: 'alice', email: 'alice@test.com' },
        }),
      ]),
    )

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
    expect(obj).toHaveProperty('specIds')
    expect(obj).not.toHaveProperty('artifacts')
    expect(parsed.meta).toHaveProperty('total', 1)
    expect(parsed.meta.limit).toBe(DEFAULT_LIST_LIMIT)
  })
})

describe('Pagination', () => {
  it('forwards --after-key and --after-id instead of --start-at', async () => {
    const { kernel } = setup()
    kernel.changes.listArchived.execute.mockResolvedValue(makeListResult([]))

    const program = makeProgram()
    registerArchiveList(program.command('archive'))
    await program.parseAsync([
      'node',
      'specd',
      'archive',
      'list',
      '--limit',
      '25',
      '--after-key',
      '2024-01-15T12:00:00.000Z',
      '--after-id',
      'add-oauth-login',
    ])

    expect(kernel.changes.listArchived.execute).toHaveBeenCalledWith({
      limit: 25,
      after: { key: '2024-01-15T12:00:00.000Z', id: 'add-oauth-login' },
    })
  })

  it('rejects --page combined with --after-key', async () => {
    const { kernel, stderr } = setup()

    const program = makeProgram()
    registerArchiveList(program.command('archive'))
    await program
      .parseAsync(['node', 'specd', 'archive', 'list', '--page', '2', '--after-key', '2024-01-01'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/mutually exclusive/)
    expect(kernel.changes.listArchived.execute).not.toHaveBeenCalled()
  })

  it('prints truncation hint when partial page', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listArchived.execute.mockResolvedValue(
      makeListResult([makeArchiveListEntry({ name: 'one' })], { total: 200, count: 1 }),
    )

    const program = makeProgram()
    registerArchiveList(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'list'])

    expect(stdout()).toContain('showing 1 of 200 (use --limit/--page)')
  })
})

describe('Empty archive', () => {
  it('No archived changes — text', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listArchived.execute.mockResolvedValue(makeListResult([]))

    const program = makeProgram()
    registerArchiveList(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'list'])

    expect(stdout().toLowerCase()).toContain('no archived changes')
  })

  it('No archived changes — JSON', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listArchived.execute.mockResolvedValue(makeListResult([]))

    const program = makeProgram()
    registerArchiveList(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.items).toEqual([])
    expect(parsed.meta.total).toBe(0)
  })
})
