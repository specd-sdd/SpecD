import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeDraftedChangeListEntry,
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
    kernel.changes.listDrafts.execute.mockResolvedValue(
      makeListResult([
        makeDraftedChangeListEntry({
          name: 'old-experiment',
          state: 'drafting',
          draftedAt: new Date('2024-01-05T10:00:00Z'),
          draftedBy: { name: 'alice', email: 'alice@test.com' },
          reason: 'parked for later',
        }),
        makeDraftedChangeListEntry({
          name: 'shelved-work',
          state: 'designing',
          draftedAt: new Date('2024-01-03T10:00:00Z'),
          draftedBy: { name: 'bob', email: 'bob@test.com' },
        }),
      ]),
    )

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'list', '--reason'])

    const out = stdout()
    expect(out).toContain('old-experiment')
    expect(out).toContain('drafting')
    expect(out).toContain('2024-01-05')
    expect(out).toContain('alice')
    expect(out).toContain('parked for later')
    expect(out).toContain('shelved-work')
    expect(out).toContain('designing')
    expect(out).toContain('2024-01-03')
    expect(out).toContain('bob')
  })

  it('--reason is opt-in for reason column', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDrafts.execute.mockResolvedValue(
      makeListResult([
        makeDraftedChangeListEntry({
          name: 'old-experiment',
          reason: 'parked for later',
        }),
      ]),
    )

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'list'])

    expect(stdout()).not.toContain('parked for later')
    expect(kernel.changes.listDrafts.execute).toHaveBeenCalledWith(
      expect.not.objectContaining({ includeReason: true }),
    )
  })
})

describe('Output format — JSON', () => {
  it('JSON format output uses paginated envelope', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDrafts.execute.mockResolvedValue(
      makeListResult([
        makeDraftedChangeListEntry({
          name: 'old-experiment',
          state: 'drafting',
          draftedAt: new Date('2024-01-05T10:00:00.000Z'),
          draftedBy: { name: 'alice', email: 'alice@test.com' },
          reason: 'parked for later',
        }),
      ]),
    )

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'list', '--reason', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0].name).toBe('old-experiment')
    expect(parsed.items[0].state).toBe('drafting')
    expect(parsed.items[0].draftedAt).toBe('2024-01-05T10:00:00.000Z')
    expect(parsed.items[0].draftedBy).toBeDefined()
    expect(parsed.items[0].reason).toBe('parked for later')
    expect(parsed.items[0].specIds).toBeDefined()
    expect(parsed.meta.limit).toBe(DEFAULT_LIST_LIMIT)
  })

  it('JSON omits reason when --reason is absent', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDrafts.execute.mockResolvedValue(
      makeListResult([
        makeDraftedChangeListEntry({
          name: 'shelved-work',
          reason: 'parked',
        }),
      ]),
    )

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.items[0].reason).toBeUndefined()
    expect(parsed.items[0].draftedBy).toBeDefined()
  })
})

describe('Pagination and includes', () => {
  it('forwards --page with host default limit when --limit is omitted', async () => {
    const { kernel } = setup()
    kernel.changes.listDrafts.execute.mockResolvedValue(makeListResult([]))

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'list', '--page', '2', '--format', 'json'])

    expect(kernel.changes.listDrafts.execute).toHaveBeenCalledWith({ limit: 100, page: 2 })
  })

  it('forwards pagination flags to ListDrafts', async () => {
    const { kernel } = setup()
    kernel.changes.listDrafts.execute.mockResolvedValue(makeListResult([]))

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program.parseAsync([
      'node',
      'specd',
      'drafts',
      'list',
      '--limit',
      '10',
      '--page',
      '2',
      '--description',
      '--reason',
    ])

    expect(kernel.changes.listDrafts.execute).toHaveBeenCalledWith({
      limit: 10,
      page: 2,
      includeDescription: true,
      includeReason: true,
    })
  })

  it('rejects --page combined with --after-key', async () => {
    const { kernel, stderr } = setup()

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program
      .parseAsync(['node', 'specd', 'drafts', 'list', '--page', '2', '--after-key', '2024-01-01'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/mutually exclusive/)
    expect(kernel.changes.listDrafts.execute).not.toHaveBeenCalled()
  })

  it('omits limit when --limit all is passed', async () => {
    const { kernel } = setup()
    kernel.changes.listDrafts.execute.mockResolvedValue(makeListResult([]))

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program.parseAsync([
      'node',
      'specd',
      'drafts',
      'list',
      '--limit',
      'all',
      '--format',
      'json',
    ])

    expect(kernel.changes.listDrafts.execute).toHaveBeenCalledWith({})
  })

  it('rejects --page with --limit all', async () => {
    const { kernel, stderr } = setup()

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program
      .parseAsync(['node', 'specd', 'drafts', 'list', '--page', '2', '--limit', 'all'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/--page requires a numeric --limit/)
    expect(kernel.changes.listDrafts.execute).not.toHaveBeenCalled()
  })

  it('prints truncation hint when partial page', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDrafts.execute.mockResolvedValue(
      makeListResult([makeDraftedChangeListEntry({ name: 'one' })], { total: 50, count: 1 }),
    )

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'list'])

    expect(stdout()).toContain('showing 1 of 50 (use --limit/--page)')
  })
})

describe('Empty drafts', () => {
  it('No drafted changes — text', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDrafts.execute.mockResolvedValue(makeListResult([]))

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'list'])

    expect(stdout()).toContain('no drafts')
  })

  it('No drafted changes — JSON', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDrafts.execute.mockResolvedValue(makeListResult([]))

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.items).toEqual([])
    expect(parsed.meta.total).toBe(0)
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
