/* eslint-disable @typescript-eslint/unbound-method */

/**
 * Tests for list-only commands:
 * drafts list, discarded list, archive list, spec list
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockChange,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/load-config.js', () => ({ loadConfig: vi.fn() }))
vi.mock('../../src/kernel.js', () => ({ createCliKernel: vi.fn() }))

import { loadConfig } from '../../src/load-config.js'
import { createCliKernel } from '../../src/kernel.js'
import { ChangeNotFoundError } from '@specd/core'
import { registerDraftsList } from '../../src/commands/drafts/list.js'
import { registerDraftsShow } from '../../src/commands/drafts/show.js'
import { registerDiscardedList } from '../../src/commands/discarded/list.js'
import { registerDiscardedShow } from '../../src/commands/discarded/show.js'
import { registerArchiveList } from '../../src/commands/archive/list.js'
import { registerArchiveShow } from '../../src/commands/archive/show.js'
import { registerSpecList } from '../../src/commands/spec/list.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(loadConfig).mockResolvedValue(config)
  vi.mocked(createCliKernel).mockReturnValue(kernel)
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

// ---------------------------------------------------------------------------
// drafts list
// ---------------------------------------------------------------------------

describe('drafts list', () => {
  it('prints "no drafts" when empty', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'list'])

    expect(stdout()).toContain('no drafts')
  })

  it('lists drafted changes', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDrafts.execute.mockResolvedValue([
      makeMockChange({ name: 'feat-a', state: 'designing' }),
    ])

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'list'])

    expect(stdout()).toContain('feat-a')
    expect(stdout()).toContain('designing')
  })

  it('returns JSON array', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDrafts.execute.mockResolvedValue([
      makeMockChange({ name: 'feat-a', state: 'designing' }),
    ])

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0].name).toBe('feat-a')
  })

  it('JSON omits reason when no drafted event has reason', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDrafts.execute.mockResolvedValue([
      makeMockChange({
        name: 'feat-a',
        state: 'designing',
        history: [
          {
            type: 'drafted',
            at: new Date('2026-01-05T10:00:00Z'),
            by: { name: 'alice', email: 'a@test.com' },
          },
        ],
      }),
    ])

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed[0].reason).toBeUndefined()
  })

  it('JSON includes reason and draftedBy when present', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDrafts.execute.mockResolvedValue([
      makeMockChange({
        name: 'feat-a',
        state: 'designing',
        history: [
          {
            type: 'drafted',
            reason: 'parked',
            at: new Date('2026-01-05T10:00:00Z'),
            by: { name: 'alice', email: 'a@test.com' },
          },
        ],
      }),
    ])

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed[0].reason).toBe('parked')
    expect(parsed[0].draftedBy.name).toBe('alice')
  })

  it('JSON returns [] when no drafted changes', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerDraftsList(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// drafts show
// ---------------------------------------------------------------------------

describe('drafts show', () => {
  it('exits 1 when change not found', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockRejectedValue(new ChangeNotFoundError('nonexistent'))

    const program = makeProgram()
    registerDraftsShow(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'show', 'nonexistent']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('shows change details with name, state, specs, schema', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', state: 'designing', isDrafted: true }),
      artifactStatuses: [{ type: 'spec', effectiveStatus: 'pending' }],
    })

    const program = makeProgram()
    registerDraftsShow(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'show', 'feat'])

    const out = stdout()
    expect(out).toContain('name:')
    expect(out).toContain('feat')
    expect(out).toContain('state:')
    expect(out).toContain('designing')
    expect(out).toContain('specs:')
    expect(out).toContain('schema:')
  })

  it('outputs JSON with name, state, specIds, schema object', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', state: 'designing', isDrafted: true }),
      artifactStatuses: [],
    })

    const program = makeProgram()
    registerDraftsShow(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'show', 'feat', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.name).toBe('feat')
    expect(parsed.state).toBe('designing')
    expect(Array.isArray(parsed.specIds)).toBe(true)
    expect(parsed.schema).toEqual({ name: '@specd/schema-std', version: 1 })
    expect(parsed.isDrafted).toBeUndefined()
    expect(parsed.workspaces).toBeUndefined()
    expect(parsed.artifacts).toBeUndefined()
  })

  it('exits 1 when name argument is missing', async () => {
    setup()

    const program = makeProgram()
    registerDraftsShow(program.command('drafts'))
    await expect(program.parseAsync(['node', 'specd', 'drafts', 'show'])).rejects.toThrow()
  })

  it('exits 1 when change is not in drafts', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'designing', isDrafted: false }),
      artifactStatuses: [],
    })

    const program = makeProgram()
    registerDraftsShow(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'show', 'my-change']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })
})

// ---------------------------------------------------------------------------
// discarded list
// ---------------------------------------------------------------------------

describe('discarded list', () => {
  it('prints "no discarded changes" when empty', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerDiscardedList(program.command('discarded'))
    await program.parseAsync(['node', 'specd', 'discarded', 'list'])

    expect(stdout()).toContain('no discarded changes')
  })

  it('lists discarded change names', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDiscarded.execute.mockResolvedValue([makeMockChange({ name: 'old-feat' })])

    const program = makeProgram()
    registerDiscardedList(program.command('discarded'))
    await program.parseAsync(['node', 'specd', 'discarded', 'list'])

    expect(stdout()).toContain('old-feat')
  })

  it('returns JSON array without createdAt', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDiscarded.execute.mockResolvedValue([
      makeMockChange({
        name: 'old-feat',
        history: [
          {
            type: 'discarded',
            at: new Date('2026-01-01T00:00:00Z'),
            by: { name: 'bob', email: 'b@test.com' },
          },
        ],
      }),
    ])

    const program = makeProgram()
    registerDiscardedList(program.command('discarded'))
    await program.parseAsync(['node', 'specd', 'discarded', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0].name).toBe('old-feat')
    expect(parsed[0].discardedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(parsed[0].createdAt).toBeUndefined()
  })

  it('JSON includes reason and discardedAt fields', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listDiscarded.execute.mockResolvedValue([
      makeMockChange({
        name: 'old-experiment',
        history: [
          {
            type: 'discarded',
            reason: 'no longer needed',
            at: new Date('2024-01-10T09:00:00Z'),
            by: { name: 'alice', email: 'alice@test.com' },
          },
        ],
      }),
    ])

    const program = makeProgram()
    registerDiscardedList(program.command('discarded'))
    await program.parseAsync(['node', 'specd', 'discarded', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed[0].discardedAt).toBe('2024-01-10T09:00:00.000Z')
    expect(parsed[0].reason).toBe('no longer needed')
    expect(parsed[0].discardedBy).toBeDefined()
  })

  it('JSON returns [] when no discarded changes', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerDiscardedList(program.command('discarded'))
    await program.parseAsync(['node', 'specd', 'discarded', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// discarded show
// ---------------------------------------------------------------------------

describe('discarded show', () => {
  it('shows name, specs, schema, reason from history', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({
        name: 'old-feat',
        history: [{ type: 'discarded', reason: 'no longer needed', at: new Date(), by: {} }],
      }),
      artifactStatuses: [],
    })

    const program = makeProgram()
    registerDiscardedShow(program.command('discarded'))
    await program.parseAsync(['node', 'specd', 'discarded', 'show', 'old-feat'])

    const out = stdout()
    expect(out).toContain('name:')
    expect(out).toContain('old-feat')
    expect(out).toContain('specs:')
    expect(out).toContain('schema:')
    expect(out).toContain('reason:')
    expect(out).toContain('no longer needed')
  })

  it('outputs JSON with specIds, schema object, reason — no state/createdAt', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({
        name: 'old-feat',
        history: [{ type: 'discarded', reason: 'replaced', at: new Date(), by: {} }],
      }),
      artifactStatuses: [],
    })

    const program = makeProgram()
    registerDiscardedShow(program.command('discarded'))
    await program.parseAsync(['node', 'specd', 'discarded', 'show', 'old-feat', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.reason).toBe('replaced')
    expect(parsed.name).toBe('old-feat')
    expect(Array.isArray(parsed.specIds)).toBe(true)
    expect(parsed.schema).toEqual({ name: '@specd/schema-std', version: 1 })
    expect(parsed.state).toBeUndefined()
    expect(parsed.createdAt).toBeUndefined()
  })

  it('exits 1 when name argument is missing', async () => {
    setup()

    const program = makeProgram()
    registerDiscardedShow(program.command('discarded'))
    await expect(program.parseAsync(['node', 'specd', 'discarded', 'show'])).rejects.toThrow()
  })

  it('exits 1 when change not found in discarded', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockRejectedValue(new ChangeNotFoundError('nonexistent'))

    const program = makeProgram()
    registerDiscardedShow(program.command('discarded'))
    await program.parseAsync(['node', 'specd', 'discarded', 'show', 'nonexistent']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })
})

// ---------------------------------------------------------------------------
// archive list
// ---------------------------------------------------------------------------

describe('archive list', () => {
  it('prints "no archived changes" when empty', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerArchiveList(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'list'])

    expect(stdout()).toContain('no archived changes')
  })

  it('lists archived changes with timestamp', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listArchived.execute.mockResolvedValue([
      {
        name: 'old-feat',
        archivedName: '2026-01-15-old-feat',
        archivedAt: new Date('2026-01-15T10:00:00Z'),
        artifacts: new Set(['spec.md']),
      },
    ])

    const program = makeProgram()
    registerArchiveList(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'list'])

    const out = stdout()
    expect(out).toContain('old-feat')
    expect(out).toContain('2026-01-15')
  })

  it('returns JSON array with workspace and artifacts', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listArchived.execute.mockResolvedValue([
      {
        name: 'old-feat',
        archivedName: '2026-01-15-old-feat',
        archivedAt: new Date('2026-01-15T10:00:00Z'),
        workspace: { toString: () => 'default' },
        artifacts: new Set(['spec']),
      },
    ])

    const program = makeProgram()
    registerArchiveList(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed[0].name).toBe('old-feat')
    expect(parsed[0].archivedName).toBe('2026-01-15-old-feat')
    expect(parsed[0].workspace).toBe('default')
    expect(parsed[0].artifacts).toEqual(['spec'])
  })

  it('rows sorted by archive date descending', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.listArchived.execute.mockResolvedValue([
      {
        name: 'older-change',
        archivedName: '2024-01-10-older-change',
        archivedAt: new Date('2024-01-10T10:00:00Z'),
        artifacts: new Set(['spec.md']),
      },
      {
        name: 'newer-change',
        archivedName: '2024-01-15-newer-change',
        archivedAt: new Date('2024-01-15T10:00:00Z'),
        artifacts: new Set(['spec.md']),
      },
    ])

    const program = makeProgram()
    registerArchiveList(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'list'])

    const out = stdout()
    const newerIdx = out.indexOf('newer-change')
    const olderIdx = out.indexOf('older-change')
    expect(newerIdx).toBeLessThan(olderIdx)
  })

  it('JSON returns [] when no archived changes', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerArchiveList(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// archive show
// ---------------------------------------------------------------------------

describe('archive show', () => {
  it('exits 1 when change not found in archive', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.getArchived.execute.mockRejectedValue(new ChangeNotFoundError('nonexistent'))

    const program = makeProgram()
    registerArchiveShow(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'show', 'nonexistent']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('shows archived change with name, state, specs, schema', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.getArchived.execute.mockResolvedValue({
      name: 'old-feat',
      archivedName: '2026-01-15-old-feat',
      archivedAt: new Date('2026-01-15T10:00:00Z'),
      workspace: { toString: () => 'default' },
      specIds: ['auth/login'],
      schemaName: 'schema-std',
      schemaVersion: 1,
      artifacts: ['spec.md', 'design.md'],
    })

    const program = makeProgram()
    registerArchiveShow(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'show', 'old-feat'])

    const out = stdout()
    expect(out).toContain('name:')
    expect(out).toContain('old-feat')
    expect(out).toContain('state:')
    expect(out).toContain('archivable')
    expect(out).toContain('specs:')
    expect(out).toContain('auth/login')
    expect(out).toContain('schema:')
    expect(out).toContain('schema-std@1')
  })

  it('outputs JSON with schema object', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.getArchived.execute.mockResolvedValue({
      name: 'old-feat',
      archivedName: '2026-01-15-old-feat',
      archivedAt: new Date('2026-01-15T10:00:00Z'),
      workspace: { toString: () => 'default' },
      specIds: ['auth/login'],
      schemaName: 'schema-std',
      schemaVersion: 1,
      artifacts: ['spec.md'],
    })

    const program = makeProgram()
    registerArchiveShow(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'show', 'old-feat', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.name).toBe('old-feat')
    expect(parsed.state).toBe('archivable')
    expect(parsed.specIds).toEqual(['auth/login'])
    expect(parsed.schema).toEqual({ name: 'schema-std', version: 1 })
  })

  it('exits 1 when name argument is missing', async () => {
    setup()

    const program = makeProgram()
    registerArchiveShow(program.command('archive'))
    await expect(program.parseAsync(['node', 'specd', 'archive', 'show'])).rejects.toThrow()
  })

  it('text output shows state field as archivable', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.getArchived.execute.mockResolvedValue({
      name: 'add-oauth-login',
      archivedName: '2024-01-15-add-oauth-login',
      archivedAt: new Date('2024-01-15T12:00:00Z'),
      workspace: { toString: () => 'default' },
      specIds: ['auth/oauth'],
      schemaName: 'schema-std',
      schemaVersion: 1,
      artifacts: ['spec.md'],
    })

    const program = makeProgram()
    registerArchiveShow(program.command('archive'))
    await program.parseAsync(['node', 'specd', 'archive', 'show', 'add-oauth-login'])

    const out = stdout()
    expect(out).toContain('state:')
    expect(out).toContain('archivable')
  })

  it('JSON shows state=archivable, specIds, and schema object', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.getArchived.execute.mockResolvedValue({
      name: 'add-oauth-login',
      archivedName: '2024-01-15-add-oauth-login',
      archivedAt: new Date('2024-01-15T12:00:00Z'),
      workspace: { toString: () => 'default' },
      specIds: ['auth/oauth'],
      schemaName: 'schema-std',
      schemaVersion: 1,
      artifacts: ['spec.md'],
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

    const parsed = JSON.parse(stdout())
    expect(parsed.state).toBe('archivable')
    expect(parsed.specIds).toEqual(['auth/oauth'])
    expect(parsed.schema).toEqual({ name: 'schema-std', version: 1 })
  })
})

// ---------------------------------------------------------------------------
// spec list
// ---------------------------------------------------------------------------

describe('spec list', () => {
  it('preserves spec ordering from use case', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.list.execute.mockResolvedValue([
      { workspace: 'default', path: 'a/spec', title: 'A Spec' },
      { workspace: 'default', path: 'm/spec', title: 'M Spec' },
      { workspace: 'default', path: 'z/spec', title: 'Z Spec' },
    ])

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list'])

    const out = stdout()
    const aIdx = out.indexOf('default:a/spec')
    const mIdx = out.indexOf('default:m/spec')
    const zIdx = out.indexOf('default:z/spec')
    expect(aIdx).toBeLessThan(mIdx)
    expect(mIdx).toBeLessThan(zIdx)
  })

  it('displays title from metadata in spec list', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.list.execute.mockResolvedValue([
      { workspace: 'default', path: 'auth/login', title: 'Login Flow' },
    ])

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list'])

    expect(stdout()).toContain('Login Flow')
  })

  it('shows workspace with (none) when workspace has no specs', async () => {
    const { stdout } = setup()
    // kernel.specs.list returns [] by default

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list'])

    const out = stdout()
    expect(out).toContain('default')
    expect(out).toContain('(none)')
  })

  it('lists specs grouped by workspace with PATH and TITLE columns', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.list.execute.mockResolvedValue([
      { workspace: 'default', path: 'auth/login', title: 'Login' },
      { workspace: 'default', path: 'auth/register', title: 'Register' },
    ])

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list'])

    const out = stdout()
    expect(out).toContain('default')
    expect(out).toContain('default:auth/login')
    expect(out).toContain('Login')
    expect(out).toContain('PATH')
    expect(out).toContain('TITLE')
  })

  it('returns JSON with workspaces structure', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.list.execute.mockResolvedValue([
      { workspace: 'default', path: 'auth/login', title: 'Login' },
    ])

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(Array.isArray(parsed.workspaces)).toBe(true)
    expect(parsed.workspaces[0].name).toBe('default')
    expect(parsed.workspaces[0].specs[0].path).toBe('default:auth/login')
    expect(parsed.workspaces[0].specs[0].title).toBe('Login')
  })

  it('title falls back to last path segment when no metadata title', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.list.execute.mockResolvedValue([
      { workspace: 'default', path: 'auth/login', title: 'login' },
    ])

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list'])

    expect(stdout()).toContain('login')
  })

  it('shows "no workspaces configured" when no workspaces', async () => {
    const config = makeMockConfig({ workspaces: [] })
    vi.mocked(loadConfig).mockResolvedValue(config)
    vi.mocked(createCliKernel).mockReturnValue(makeMockKernel())
    const stdout = captureStdout()
    captureStderr()
    mockProcessExit()

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list'])

    expect(stdout()).toContain('no workspaces configured')
  })
})
