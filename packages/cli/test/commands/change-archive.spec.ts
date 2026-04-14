/* eslint-disable @typescript-eslint/unbound-method */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/load-config.js', () => ({
  loadConfig: vi.fn(),
  resolveConfigPath: vi.fn().mockResolvedValue(null),
}))
vi.mock('../../src/kernel.js', () => ({ createCliKernel: vi.fn() }))

import { loadConfig } from '../../src/load-config.js'
import { createCliKernel } from '../../src/kernel.js'
import { ChangeNotFoundError } from '@specd/core'
import { registerChangeArchive } from '../../src/commands/change/archive.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(loadConfig).mockResolvedValue(config)
  vi.mocked(createCliKernel).mockResolvedValue(kernel)
  kernel.changes.status.execute.mockResolvedValue({
    change: { workspaces: ['default'] },
    artifactStatuses: [],
  })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('change archive', () => {
  it('confirms archive in text format', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.archive.execute.mockResolvedValue({
      archivedChange: {
        name: 'feat',
        archivedName: '2026-01-15-feat',
        archivedAt: new Date('2026-01-15T10:00:00Z'),
      },
      archiveDirPath: '/project/.specd/archive/2026-01/feat',
      postHookFailures: [],
      invalidatedChanges: [],
    })

    const program = makeProgram()
    registerChangeArchive(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'archive', 'feat'])

    expect(stdout()).toContain('archived change feat')
    expect(stdout()).toContain('→')
  })

  it('exits 2 when post-hook fails without printing success', async () => {
    const { kernel, stdout, stderr } = setup()
    kernel.changes.archive.execute.mockResolvedValue({
      archivedChange: {
        name: 'feat',
        archivedName: '2026-01-15-feat',
        archivedAt: new Date('2026-01-15T10:00:00Z'),
      },
      archiveDirPath: '/project/.specd/archive/2026-01/feat',
      postHookFailures: ['notify-team'],
      invalidatedChanges: [],
    })

    const program = makeProgram()
    registerChangeArchive(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'archive', 'feat']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(2)
    expect(stderr()).toContain('notify-team')
    expect(stdout()).not.toContain('archived change')
  })

  it('outputs JSON with archivePath', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.archive.execute.mockResolvedValue({
      archivedChange: {
        name: 'feat',
        archivedName: '2026-01-15-feat',
        archivedAt: new Date('2026-01-15T10:00:00Z'),
      },
      archiveDirPath: '/project/.specd/archive/2026-01/feat',
      postHookFailures: [],
      invalidatedChanges: [],
    })

    const program = makeProgram()
    registerChangeArchive(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'archive', 'feat', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.name).toBe('feat')
    expect(typeof parsed.archivePath).toBe('string')
    expect(parsed.invalidatedChanges).toEqual([])
  })

  it('reports invalidated changes in text output', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.archive.execute.mockResolvedValue({
      archivedChange: {
        name: 'feat',
        archivedName: '2026-01-15-feat',
        archivedAt: new Date('2026-01-15T10:00:00Z'),
      },
      archiveDirPath: '/project/.specd/archive/2026-01/feat',
      postHookFailures: [],
      invalidatedChanges: [
        { name: 'beta', specIds: ['core:core/config', 'core:core/kernel'] },
        { name: 'gamma', specIds: ['core:core/config'] },
      ],
    })

    const program = makeProgram()
    registerChangeArchive(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'archive', 'feat'])

    expect(stdout()).toContain('invalidated 2 overlapping changes:')
    expect(stdout()).toContain('beta (specs: core:core/config, core:core/kernel)')
    expect(stdout()).toContain('gamma (specs: core:core/config)')
  })

  it('reports invalidated changes in JSON output', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.archive.execute.mockResolvedValue({
      archivedChange: {
        name: 'feat',
        archivedName: '2026-01-15-feat',
        archivedAt: new Date('2026-01-15T10:00:00Z'),
      },
      archiveDirPath: '/project/.specd/archive/2026-01/feat',
      postHookFailures: [],
      invalidatedChanges: [{ name: 'beta', specIds: ['core:core/config'] }],
    })

    const program = makeProgram()
    registerChangeArchive(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'archive', 'feat', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.invalidatedChanges).toHaveLength(1)
    expect(parsed.invalidatedChanges[0].name).toBe('beta')
    expect(parsed.invalidatedChanges[0].specIds).toEqual(['core:core/config'])
  })

  it('exits 1 when change not found', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.archive.execute.mockRejectedValue(new ChangeNotFoundError('missing'))

    const program = makeProgram()
    registerChangeArchive(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'archive', 'missing']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('exits 1 when name argument is missing', async () => {
    setup()

    const program = makeProgram()
    registerChangeArchive(program.command('change'))
    await expect(program.parseAsync(['node', 'specd', 'change', 'archive'])).rejects.toThrow()
  })

  it('exits 1 when change is not in archivable state', async () => {
    const { kernel, stderr } = setup()
    const { InvalidStateTransitionError } = await import('@specd/core')
    kernel.changes.archive.execute.mockRejectedValue(
      new InvalidStateTransitionError('done', 'archivable'),
    )

    const program = makeProgram()
    registerChangeArchive(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'archive', 'feat']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('passes skipHookPhases with all when --skip-hooks all is set', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.archive.execute.mockResolvedValue({
      archivedChange: {
        name: 'feat',
        archivedName: '2026-01-15-feat',
        archivedAt: new Date('2026-01-15T10:00:00Z'),
      },
      archiveDirPath: '/project/.specd/archive/2026-01/feat',
      postHookFailures: [],
      invalidatedChanges: [],
    })

    const program = makeProgram()
    registerChangeArchive(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'archive', 'feat', '--skip-hooks', 'all'])

    const call = kernel.changes.archive.execute.mock.calls[0]![0] as {
      skipHookPhases?: Set<string>
    }
    expect(call.skipHookPhases).toEqual(new Set(['all']))
    expect(stdout()).toContain('archived change feat')
  })

  it('passes skipHookPhases with pre and post values', async () => {
    const { kernel } = setup()
    kernel.changes.archive.execute.mockResolvedValue({
      archivedChange: {
        name: 'feat',
        archivedName: '2026-01-15-feat',
        archivedAt: new Date('2026-01-15T10:00:00Z'),
      },
      archiveDirPath: '/project/.specd/archive/2026-01/feat',
      postHookFailures: [],
      invalidatedChanges: [],
    })

    const program = makeProgram()
    registerChangeArchive(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'archive',
      'feat',
      '--skip-hooks',
      'pre,post',
    ])

    const call = kernel.changes.archive.execute.mock.calls[0]![0] as {
      skipHookPhases?: Set<string>
    }
    expect(call.skipHookPhases).toEqual(new Set(['pre', 'post']))
  })

  it('passes empty skipHookPhases by default (no --skip-hooks flag)', async () => {
    const { kernel } = setup()
    kernel.changes.archive.execute.mockResolvedValue({
      archivedChange: {
        name: 'feat',
        archivedName: '2026-01-15-feat',
        archivedAt: new Date('2026-01-15T10:00:00Z'),
      },
      archiveDirPath: '/project/.specd/archive/2026-01/feat',
      postHookFailures: [],
      invalidatedChanges: [],
    })

    const program = makeProgram()
    registerChangeArchive(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'archive', 'feat'])

    const call = kernel.changes.archive.execute.mock.calls[0]![0] as {
      skipHookPhases?: Set<string>
    }
    expect(call.skipHookPhases).toEqual(new Set())
  })
})
