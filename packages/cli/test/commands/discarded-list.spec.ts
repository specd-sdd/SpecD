import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeDiscardedChangeListEntry,
  makeListResult,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
  ExitSentinel,
  DEFAULT_LIST_LIMIT,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerDiscardedList } from '../../src/commands/discarded/list.js'

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
  it('Discarded changes listed with correct fields when includes are set', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDiscarded.execute.mockResolvedValue(
      makeListResult([
        makeDiscardedChangeListEntry({
          name: 'old-experiment',
          discardedAt: new Date('2024-01-10T09:00:00Z'),
          discardedBy: { name: 'alice', email: 'alice@test.com' },
          reason: 'no longer needed',
        }),
        makeDiscardedChangeListEntry({
          name: 'bad-idea',
          discardedAt: new Date('2024-01-08T09:00:00Z'),
          discardedBy: { name: 'bob', email: 'bob@test.com' },
          reason: 'duplicate effort',
          supersededBy: 'new-approach',
        }),
      ]),
    )

    const program = makeProgram()
    registerDiscardedList(program.command('discarded'))
    await program.parseAsync(['node', 'specd', 'discarded', 'list', '--reason', '--superseded-by'])

    const out = stdout()
    expect(out).toContain('old-experiment')
    expect(out).toContain('bad-idea')
    expect(out).toContain('2024-01-10')
    expect(out).toContain('2024-01-08')
    expect(out).toContain('alice')
    expect(out).toContain('no longer needed')
    expect(out).toContain('bob')
    expect(out).toContain('duplicate effort')
    expect(out).toContain('→ new-approach')
  })

  it('Include flags are opt-in', async () => {
    const { kernel } = setup()
    kernel.changes.listDiscarded.execute.mockResolvedValue(makeListResult([]))

    const program = makeProgram()
    registerDiscardedList(program.command('discarded'))
    await program.parseAsync(['node', 'specd', 'discarded', 'list'])

    expect(kernel.changes.listDiscarded.execute).toHaveBeenCalledWith({ limit: DEFAULT_LIST_LIMIT })
  })
})

describe('Output format — JSON', () => {
  it('JSON format output uses paginated envelope', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDiscarded.execute.mockResolvedValue(
      makeListResult([
        makeDiscardedChangeListEntry({
          name: 'old-experiment',
          discardedAt: new Date('2024-01-10T09:00:00.000Z'),
          discardedBy: { name: 'alice', email: 'alice@test.com' },
          reason: 'no longer needed',
        }),
      ]),
    )

    const program = makeProgram()
    registerDiscardedList(program.command('discarded'))
    await program.parseAsync(['node', 'specd', 'discarded', 'list', '--reason', '--format', 'json'])

    const parsed = JSON.parse(stdout()) as {
      items: Record<string, unknown>[]
      meta: Record<string, unknown>
    }
    expect(parsed.items).toHaveLength(1)
    const obj = parsed.items[0]!
    expect(obj).toHaveProperty('name', 'old-experiment')
    expect(obj).toHaveProperty('discardedAt', '2024-01-10T09:00:00.000Z')
    expect(obj).toHaveProperty('discardedBy')
    expect(obj).toHaveProperty('reason', 'no longer needed')
    expect(obj).not.toHaveProperty('supersededBy')
    expect(parsed.meta.limit).toBe(DEFAULT_LIST_LIMIT)
  })

  it('JSON includes supersededBy when --superseded-by is passed', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDiscarded.execute.mockResolvedValue(
      makeListResult([
        makeDiscardedChangeListEntry({
          name: 'bad-idea',
          reason: 'duplicate effort',
          supersededBy: 'new-approach',
        }),
      ]),
    )

    const program = makeProgram()
    registerDiscardedList(program.command('discarded'))
    await program.parseAsync([
      'node',
      'specd',
      'discarded',
      'list',
      '--superseded-by',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout()) as { items: Record<string, unknown>[] }
    expect(parsed.items[0]!.supersededBy).toBe('new-approach')
  })
})

describe('Pagination', () => {
  it('forwards --page with host default limit when --limit is omitted', async () => {
    const { kernel } = setup()
    kernel.changes.listDiscarded.execute.mockResolvedValue(makeListResult([]))

    const program = makeProgram()
    registerDiscardedList(program.command('discarded'))
    await program.parseAsync([
      'node',
      'specd',
      'discarded',
      'list',
      '--page',
      '2',
      '--format',
      'json',
    ])

    expect(kernel.changes.listDiscarded.execute).toHaveBeenCalledWith({ limit: 100, page: 2 })
  })

  it('forwards --after-key and --after-id', async () => {
    const { kernel } = setup()
    kernel.changes.listDiscarded.execute.mockResolvedValue(makeListResult([]))

    const program = makeProgram()
    registerDiscardedList(program.command('discarded'))
    await program.parseAsync([
      'node',
      'specd',
      'discarded',
      'list',
      '--after-key',
      '2024-01-10',
      '--after-id',
      'bad-idea',
    ])

    expect(kernel.changes.listDiscarded.execute).toHaveBeenCalledWith({
      after: { key: '2024-01-10', id: 'bad-idea' },
      limit: DEFAULT_LIST_LIMIT,
    })
  })

  it('omits limit when --limit all is passed', async () => {
    const { kernel } = setup()
    kernel.changes.listDiscarded.execute.mockResolvedValue(makeListResult([]))

    const program = makeProgram()
    registerDiscardedList(program.command('discarded'))
    await program.parseAsync([
      'node',
      'specd',
      'discarded',
      'list',
      '--limit',
      'all',
      '--format',
      'json',
    ])

    expect(kernel.changes.listDiscarded.execute).toHaveBeenCalledWith({})
  })

  it('rejects --page with --limit all', async () => {
    const { kernel, stderr } = setup()

    const program = makeProgram()
    registerDiscardedList(program.command('discarded'))
    await program
      .parseAsync(['node', 'specd', 'discarded', 'list', '--page', '2', '--limit', 'all'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/--page requires a numeric --limit/)
    expect(kernel.changes.listDiscarded.execute).not.toHaveBeenCalled()
  })

  it('prints truncation hint when partial page', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDiscarded.execute.mockResolvedValue(
      makeListResult([makeDiscardedChangeListEntry({ name: 'one' })], { total: 20, count: 1 }),
    )

    const program = makeProgram()
    registerDiscardedList(program.command('discarded'))
    await program.parseAsync(['node', 'specd', 'discarded', 'list'])

    expect(stdout()).toContain('showing 1 of 20 (use --limit/--page)')
  })
})

describe('Empty discarded list', () => {
  it('No discarded changes — text', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDiscarded.execute.mockResolvedValue(makeListResult([]))

    const program = makeProgram()
    registerDiscardedList(program.command('discarded'))
    await program.parseAsync(['node', 'specd', 'discarded', 'list'])

    expect(stdout().toLowerCase()).toContain('no discarded changes')
  })

  it('No discarded changes — JSON', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDiscarded.execute.mockResolvedValue(makeListResult([]))

    const program = makeProgram()
    registerDiscardedList(program.command('discarded'))
    await program.parseAsync(['node', 'specd', 'discarded', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.items).toEqual([])
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
