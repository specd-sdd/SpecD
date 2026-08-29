import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from '../helpers.js'

vi.mock('../../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
  buildCliKernelOptions: vi.fn(() => ({})),
}))

import { resolveCliContext } from '../../../src/helpers/cli-context.js'
import { ChangeNotFoundError } from '@specd/sdk'
import { registerChangeArchive } from '../../../src/commands/change/archive.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({
    config: config,
    configFilePath: null,
    kernel: kernel,
  })
  kernel.changes.status.execute.mockResolvedValue({
    change: { workspaces: ['default'] },
    artifactStatuses: [],
    specDependsOn: {},
    implementationTracking: { trackedFiles: [], links: [] },
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
    expect(kernel.changes.status.execute).not.toHaveBeenCalled()
    expect(kernel.changes.archive.execute).toHaveBeenCalled()
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
    expect(parsed.stream).toBe('change-archive')
    expect(parsed.event.type).toBe('complete')
    expect(parsed.event.result.result).toBe('ok')
    expect(parsed.event.result.name).toBe('feat')
    expect(typeof parsed.event.result.archivePath).toBe('string')
    expect(parsed.event.result.invalidatedChanges).toEqual([])
  })

  it('JSON output streams check-progress then complete on change-archive', async () => {
    const { kernel, stdout, stderr } = setup()
    kernel.changes.archive.execute.mockImplementation((_input, onProgress) => {
      onProgress?.({ type: 'check-start', id: 'spec.overlap', label: 'Checking spec overlap' })
      onProgress?.({
        type: 'check-done',
        id: 'spec.overlap',
        label: 'Checking spec overlap',
        outcome: 'pass',
      })
      return {
        archivedChange: {
          name: 'feat',
          archivedName: '2026-01-15-feat',
          archivedAt: new Date('2026-01-15T10:00:00Z'),
        },
        archiveDirPath: '/project/.specd/archive/2026-01/feat',
        postHookFailures: [],
        invalidatedChanges: [],
      }
    })

    const program = makeProgram()
    registerChangeArchive(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'archive', 'feat', '--format', 'json'])

    expect(stderr()).toBe('')
    const lines = stdout()
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { stream: string; event: { type: string } })
    expect(lines.map((row) => row.stream)).toEqual([
      'change-archive',
      'change-archive',
      'change-archive',
    ])
    expect(lines.map((row) => row.event.type)).toEqual(['check-start', 'check-done', 'complete'])
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
    expect(parsed.event.result.invalidatedChanges).toHaveLength(1)
    expect(parsed.event.result.invalidatedChanges[0].name).toBe('beta')
    expect(parsed.event.result.invalidatedChanges[0].specIds).toEqual(['core:core/config'])
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

  it('forwards archive when change is in archiving state', async () => {
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

    expect(kernel.changes.archive.execute).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'feat' }),
      expect.any(Function),
    )
    expect(stdout()).toContain('archived change feat')
    expect(kernel.changes.status.execute).not.toHaveBeenCalled()
  })

  it('exits 1 when change is not in archivable state', async () => {
    const { kernel, stderr } = setup()
    const { InvalidStateTransitionError } = await import('@specd/sdk')
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

  it('passes skipHookPhases with pre only', async () => {
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
    await program.parseAsync(['node', 'specd', 'change', 'archive', 'feat', '--skip-hooks', 'pre'])

    const call = kernel.changes.archive.execute.mock.calls[0]![0] as {
      skipHookPhases?: Set<string>
    }
    expect(call.skipHookPhases).toEqual(new Set(['pre']))
  })

  it('passes skipHookPhases with post only', async () => {
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
    await program.parseAsync(['node', 'specd', 'change', 'archive', 'feat', '--skip-hooks', 'post'])

    const call = kernel.changes.archive.execute.mock.calls[0]![0] as {
      skipHookPhases?: Set<string>
    }
    expect(call.skipHookPhases).toEqual(new Set(['post']))
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

  it('passes allowOverlap when --allow-overlap is set', async () => {
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
    await program.parseAsync(['node', 'specd', 'change', 'archive', 'feat', '--allow-overlap'])

    const call = kernel.changes.archive.execute.mock.calls[0]![0] as {
      allowOverlap?: boolean
    }
    expect(call.allowOverlap).toBe(true)
  })

  it('passes allowOutOfScope when --allow-out-of-scope is set', async () => {
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
    await program.parseAsync(['node', 'specd', 'change', 'archive', 'feat', '--allow-out-of-scope'])

    const call = kernel.changes.archive.execute.mock.calls[0]![0] as {
      allowOutOfScope?: boolean
    }
    expect(call.allowOutOfScope).toBe(true)
  })

  it('omits allowOverlap and allowOutOfScope when those flags are not set', async () => {
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
      allowOverlap?: boolean
      allowOutOfScope?: boolean
    }
    expect(call.allowOverlap).toBeUndefined()
    expect(call.allowOutOfScope).toBeUndefined()
  })

  it('renders archive check progress with gerund label and no Executing prefix', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.archive.execute.mockImplementation((_input, onProgress) => {
      onProgress?.({
        type: 'check-start',
        id: 'workspace.readOnly',
        label: 'Checking workspace ownership',
      })
      onProgress?.({
        type: 'check-done',
        id: 'workspace.readOnly',
        label: 'Checking workspace ownership',
        outcome: 'pass',
      })
      onProgress?.({
        type: 'check-start',
        id: 'hook.pre',
        label: 'Running pre hooks',
      })
      onProgress?.({
        type: 'check-progress',
        id: 'hook.pre',
        label: 'Running pre hooks',
        detail: 'hook-output',
        hookId: 'lint',
        stream: 'stdout',
        line: 'preflight ok',
      })
      onProgress?.({
        type: 'check-done',
        id: 'hook.pre',
        label: 'Running pre hooks',
        outcome: 'pass',
      })
      return {
        archivedChange: {
          name: 'feat',
          archivedName: '2026-01-15-feat',
          archivedAt: new Date('2026-01-15T10:00:00Z'),
        },
        archiveDirPath: '/project/.specd/archive/2026-01/feat',
        postHookFailures: [],
        invalidatedChanges: [],
      }
    })

    const program = makeProgram()
    registerChangeArchive(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'archive', 'feat'])

    const output = stderr()
    expect(output).toContain('Checking workspace ownership (workspace.readOnly)')
    expect(output).toContain('✓ Checking workspace ownership')
    expect(output).toContain('Running pre hooks (hook.pre)')
    expect(output).toContain('preflight ok')
    expect(output).not.toContain('Executing:')
  })
})
