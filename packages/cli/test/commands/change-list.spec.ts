import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeActiveChangeListEntry,
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
    kernel.changes.list.execute.mockResolvedValue(
      makeListResult([makeActiveChangeListEntry({ name: 'active-one' })]),
    )

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'list'])

    expect(stdout()).toContain('active-one')
  })

  it('Discarded changes not shown', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.list.execute.mockResolvedValue(makeListResult([]))

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'list'])

    expect(stdout()).toContain('no changes')
  })

  it('Rows contain name, state, specIds, and schema without description by default', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.list.execute.mockResolvedValue(
      makeListResult([
        makeActiveChangeListEntry({
          name: 'add-login',
          state: 'designing',
          specIds: ['auth/login'],
          schemaName: 'std',
          schemaVersion: 1,
        }),
      ]),
    )

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'list'])

    const out = stdout()
    expect(out).toContain('add-login')
    expect(out).toContain('designing')
    expect(out).toContain('auth/login')
    expect(out).toContain('std@1')
  })

  it('--description includes description sub-row', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.list.execute.mockResolvedValue(
      makeListResult([
        makeActiveChangeListEntry({
          name: 'add-login',
          description: 'Add OAuth2 login',
        }),
      ]),
    )

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'list', '--description'])

    expect(stdout()).toContain('Add OAuth2 login')
    expect(kernel.changes.list.execute).toHaveBeenCalledWith(
      expect.objectContaining({ includeDescription: true }),
    )
  })

  it('JSON format output uses paginated envelope', async () => {
    const { kernel, stdout } = setup()
    const createdAt = new Date('2026-01-15T10:00:00.000Z')
    kernel.changes.list.execute.mockResolvedValue(
      makeListResult([
        makeActiveChangeListEntry({
          name: 'add-login',
          state: 'designing',
          specIds: ['auth/login'],
          schemaName: 'std',
          schemaVersion: 1,
          createdAt,
        }),
      ]),
    )

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0].name).toBe('add-login')
    expect(parsed.items[0].state).toBe('designing')
    expect(parsed.items[0].specIds).toEqual(['auth/login'])
    expect(parsed.items[0].schemaName).toBe('std')
    expect(parsed.items[0].schemaVersion).toBe(1)
    expect(parsed.items[0].createdAt).toBe('2026-01-15T10:00:00.000Z')
    expect(parsed.items[0].description).toBeUndefined()
    expect(parsed.meta).toMatchObject({
      total: 1,
      count: 1,
      limit: DEFAULT_LIST_LIMIT,
      page: 1,
    })
  })

  it('CLI preserves use-case item order', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.list.execute.mockResolvedValue(
      makeListResult([
        makeActiveChangeListEntry({ name: 'z-change' }),
        makeActiveChangeListEntry({ name: 'a-change' }),
      ]),
    )

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.items.map((c: { name: string }) => c.name)).toEqual(['z-change', 'a-change'])
    expect(stdout()).toContain('z-change')
    expect(stdout()).toContain('a-change')
  })
})

describe('Pagination and includes', () => {
  it('forwards default limit 100 when --limit is omitted', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.list.execute.mockResolvedValue(makeListResult([]))

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'list', '--format', 'json'])

    expect(kernel.changes.list.execute).toHaveBeenCalledWith({})
    const parsed = JSON.parse(stdout())
    expect(parsed.meta.limit).toBe(DEFAULT_LIST_LIMIT)
  })

  it('forwards --limit and --page to ListChanges', async () => {
    const { kernel } = setup()
    kernel.changes.list.execute.mockResolvedValue(makeListResult([]))

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'list',
      '--limit',
      '25',
      '--page',
      '2',
      '--format',
      'json',
    ])

    expect(kernel.changes.list.execute).toHaveBeenCalledWith({ limit: 25, page: 2 })
  })

  it('forwards keyset cursor with tiebreak id', async () => {
    const { kernel } = setup()
    kernel.changes.list.execute.mockResolvedValue(makeListResult([]))

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'list',
      '--after-key',
      '2024-01-01T00:00:00.000Z',
      '--after-id',
      'add-login',
      '--format',
      'json',
    ])

    expect(kernel.changes.list.execute).toHaveBeenCalledWith({
      after: { key: '2024-01-01T00:00:00.000Z', id: 'add-login' },
    })
  })

  it('rejects --page combined with --after-key', async () => {
    const { kernel, stderr } = setup()

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'list',
        '--page',
        '2',
        '--after-key',
        '2024-01-01T00:00:00.000Z',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/mutually exclusive/)
    expect(kernel.changes.list.execute).not.toHaveBeenCalled()
  })

  it('rejects --after-id without --after-key', async () => {
    const { kernel, stderr } = setup()

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'list', '--after-id', 'add-login'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/requires --after-key/)
    expect(kernel.changes.list.execute).not.toHaveBeenCalled()
  })

  it('prints truncation hint when count is less than total', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.list.execute.mockResolvedValue(
      makeListResult([makeActiveChangeListEntry({ name: 'only-one' })], {
        total: 125,
        count: 1,
        limit: DEFAULT_LIST_LIMIT,
      }),
    )

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'list'])

    expect(stdout()).toContain('showing 1 of 125 (use --limit/--page)')
  })

  it('omits truncation hint when full result set is shown', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.list.execute.mockResolvedValue(
      makeListResult([makeActiveChangeListEntry({ name: 'only-one' })], {
        total: 1,
        count: 1,
      }),
    )

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'list'])

    expect(stdout()).not.toContain('showing')
  })
})

describe('Empty output', () => {
  it('No active changes — text mode', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.list.execute.mockResolvedValue(makeListResult([]))

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'list'])

    expect(stdout()).toContain('no changes')
  })

  it('No active changes — JSON mode', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.list.execute.mockResolvedValue(makeListResult([]))

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed).toEqual({
      items: [],
      meta: { total: 0, count: 0, limit: DEFAULT_LIST_LIMIT, page: 1 },
    })
  })
})
