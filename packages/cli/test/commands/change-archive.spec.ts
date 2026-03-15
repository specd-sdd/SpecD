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

vi.mock('../../src/load-config.js', () => ({ loadConfig: vi.fn() }))
vi.mock('../../src/kernel.js', () => ({ createCliKernel: vi.fn() }))

import { loadConfig } from '../../src/load-config.js'
import { createCliKernel } from '../../src/kernel.js'
import { ChangeNotFoundError } from '@specd/core'
import { registerChangeArchive } from '../../src/commands/change/archive.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(loadConfig).mockResolvedValue(config)
  vi.mocked(createCliKernel).mockReturnValue(kernel)
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
    })

    const program = makeProgram()
    registerChangeArchive(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'archive', 'feat', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.name).toBe('feat')
    expect(typeof parsed.archivePath).toBe('string')
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

  it('passes skipHooks: true when --no-hooks is set', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.archive.execute.mockResolvedValue({
      archivedChange: {
        name: 'feat',
        archivedName: '2026-01-15-feat',
        archivedAt: new Date('2026-01-15T10:00:00Z'),
      },
      archiveDirPath: '/project/.specd/archive/2026-01/feat',
      postHookFailures: [],
    })

    const program = makeProgram()
    registerChangeArchive(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'archive', 'feat', '--no-hooks'])

    const call = kernel.changes.archive.execute.mock.calls[0]![0] as { skipHooks?: boolean }
    expect(call.skipHooks).toBe(true)
    expect(stdout()).toContain('archived change feat')
  })

  it('passes skipHooks: false by default (no --no-hooks flag)', async () => {
    const { kernel } = setup()
    kernel.changes.archive.execute.mockResolvedValue({
      archivedChange: {
        name: 'feat',
        archivedName: '2026-01-15-feat',
        archivedAt: new Date('2026-01-15T10:00:00Z'),
      },
      archiveDirPath: '/project/.specd/archive/2026-01/feat',
      postHookFailures: [],
    })

    const program = makeProgram()
    registerChangeArchive(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'archive', 'feat'])

    const call = kernel.changes.archive.execute.mock.calls[0]![0] as { skipHooks?: boolean }
    expect(call.skipHooks).toBe(false)
  })
})
