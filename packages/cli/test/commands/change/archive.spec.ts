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
import {
  ChangeNotFoundError,
  CheckNotSkippableError,
  CheckPredicateFailedError,
  InvalidStateTransitionError,
  OverlapEntry,
  SpecOverlapError,
  UnknownCheckError,
} from '@specd/sdk'
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
  it.each(['changes', 'change'])(
    'parses the %s archive alias through the shared group',
    async (group) => {
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
      const changes = program.command('changes').alias('change')
      registerChangeArchive(changes)
      await program.parseAsync(['node', 'specd', group, 'archive', 'feat'])

      expect(kernel.changes.archive.execute).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'feat' }),
        expect.any(Function),
      )
    },
  )

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

  describe('bypass flags', () => {
    const okResult = {
      archivedChange: {
        name: 'feat',
        archivedName: '2026-01-15-feat',
        archivedAt: new Date('2026-01-15T10:00:00Z'),
      },
      archiveDirPath: '/project/.specd/archive/2026-01/feat',
      postHookFailures: [],
      invalidatedChanges: [],
    }

    async function run(args: string[], group = 'changes'): Promise<Record<string, unknown>> {
      const { kernel } = setup()
      kernel.changes.archive.execute.mockResolvedValue(okResult)
      const program = makeProgram()
      const parent = program.command(group)
      if (group === 'changes') parent.alias('change')
      registerChangeArchive(parent)
      await program.parseAsync(['node', 'specd', group, 'archive', 'feat', ...args])
      return kernel.changes.archive.execute.mock.calls[0]![0] as Record<string, unknown>
    }

    it('translates --allow-overlap into the spec.overlap id', async () => {
      const call = await run(['--allow-overlap'])
      expect(call.skipChecks).toEqual(['spec.overlap'])
      expect(call).not.toHaveProperty('allowOverlap')
      expect(call).not.toHaveProperty('allowOutOfScope')
    })

    it('translates --allow-out-of-scope into the impl.linksInScope id', async () => {
      const call = await run(['--allow-out-of-scope'])
      expect(call.skipChecks).toEqual(['impl.linksInScope'])
      expect(call).not.toHaveProperty('allowOutOfScope')
    })

    it('omits skipChecks and the bypass booleans when no flag is set', async () => {
      const call = await run([])
      expect(call).not.toHaveProperty('skipChecks')
      expect(call).not.toHaveProperty('allowOverlap')
      expect(call).not.toHaveProperty('allowOutOfScope')
    })

    it('accepts a comma-separated --skip-checks list', async () => {
      const call = await run(['--skip-checks', 'spec.overlap,impl.linksInScope'])
      expect(call.skipChecks).toEqual(['spec.overlap', 'impl.linksInScope'])
    })

    it('accumulates a repeated --skip-checks flag', async () => {
      const call = await run([
        '--skip-checks',
        'spec.overlap',
        '--skip-checks',
        '@security.code-scan',
      ])
      expect(call.skipChecks).toEqual(['spec.overlap', '@security.code-scan'])
    })

    it('trims whitespace and ignores empty entries', async () => {
      const call = await run(['--skip-checks', 'spec.overlap, ,impl.linksInScope,'])
      expect(call.skipChecks).toEqual(['spec.overlap', 'impl.linksInScope'])
    })

    it('treats a blank --skip-checks value as omitted', async () => {
      const call = await run(['--skip-checks', ' , '])
      expect(call).not.toHaveProperty('skipChecks')
    })

    it('collapses duplicates between the flag and the aliases', async () => {
      const call = await run(['--skip-checks', 'spec.overlap', '--allow-overlap'])
      expect(call.skipChecks).toEqual(['spec.overlap'])
    })

    it('keeps ids case-sensitive and forwards them untouched', async () => {
      const call = await run(['--skip-checks', 'Spec.Overlap'])
      expect(call.skipChecks).toEqual(['Spec.Overlap'])
    })

    it('accepts the same flags through the singular change alias', async () => {
      const call = await run(['--skip-checks', 'spec.overlap'], 'change')
      expect(call.skipChecks).toEqual(['spec.overlap'])
    })

    it('combines --skip-hooks and --skip-checks independently', async () => {
      const call = await run(['--skip-hooks', 'all', '--skip-checks', 'spec.overlap'])
      expect(call.skipChecks).toEqual(['spec.overlap'])
      expect(call.skipHookPhases).toEqual(new Set(['all']))
    })

    it('rejects --skip-checks without a value and archives nothing', async () => {
      const { kernel } = setup()
      const program = makeProgram()
      registerChangeArchive(program.command('change'))
      await expect(
        program.parseAsync(['node', 'specd', 'change', 'archive', 'feat', '--skip-checks']),
      ).rejects.toThrow()
      expect(kernel.changes.archive.execute).not.toHaveBeenCalled()
    })

    it('lists the flags and describes the aliases in --help', () => {
      const program = makeProgram()
      const parent = program.command('change')
      registerChangeArchive(parent)
      const archive = parent.commands.find((command) => command.name() === 'archive')!
      const help = archive.helpInformation()
      expect(help).toContain('--skip-checks <ids>')
      expect(help).toContain('--allow-overlap')
      expect(help).toContain('alias of --skip-checks spec.overlap')
      expect(help).toContain('--allow-out-of-scope')
      expect(help).toContain('alias of --skip-checks impl.linksInScope')
    })
  })

  describe('bypass error cases', () => {
    it('exits 1 and reports an unknown check id', async () => {
      const { kernel, stderr } = setup()
      kernel.changes.archive.execute.mockRejectedValue(new UnknownCheckError('nope.check'))
      const program = makeProgram()
      registerChangeArchive(program.command('change'))
      await program
        .parseAsync(['node', 'specd', 'change', 'archive', 'feat', '--skip-checks', 'nope.check'])
        .catch(() => {})
      expect(process.exit).toHaveBeenCalledWith(1)
      expect(stderr()).toContain('nope.check')
    })

    it('exits 1 and points to --skip-hooks when a hook check is passed to --skip-checks', async () => {
      const { kernel, stderr } = setup()
      kernel.changes.archive.execute.mockRejectedValue(
        new CheckNotSkippableError(
          'hook.pre',
          'Effect checks (hooks) are governed exclusively by skipHookPhases (CLI: --skip-hooks)',
        ),
      )
      const program = makeProgram()
      registerChangeArchive(program.command('change'))
      await program
        .parseAsync(['node', 'specd', 'change', 'archive', 'feat', '--skip-checks', 'hook.pre'])
        .catch(() => {})
      expect(process.exit).toHaveBeenCalledWith(1)
      expect(stderr()).toContain('hook.pre')
      expect(stderr()).toContain('--skip-hooks')
    })

    it('exits 1 and reports a non-skippable check id, also through an alias', async () => {
      const { kernel, stderr } = setup()
      kernel.changes.archive.execute.mockRejectedValue(new CheckNotSkippableError('spec.overlap'))
      const program = makeProgram()
      registerChangeArchive(program.command('change'))
      await program
        .parseAsync(['node', 'specd', 'change', 'archive', 'feat', '--allow-overlap'])
        .catch(() => {})
      expect(process.exit).toHaveBeenCalledWith(1)
      expect(stderr()).toContain('spec.overlap')
      expect(stderr()).toContain('cannot be skipped')
    })

    it('emits the structured error record in json mode', async () => {
      const { kernel, stdout, stderr } = setup()
      kernel.changes.archive.execute.mockRejectedValue(
        new CheckNotSkippableError('workspace.readOnly'),
      )
      const program = makeProgram()
      registerChangeArchive(program.command('change'))
      await program
        .parseAsync([
          'node',
          'specd',
          'change',
          'archive',
          'feat',
          '--skip-checks',
          'workspace.readOnly',
          '--format',
          'json',
        ])
        .catch(() => {})
      expect(process.exit).toHaveBeenCalledWith(1)
      const output = `${stdout()}${stderr()}`
      expect(output).toContain('CHECK_NOT_SKIPPABLE')
    })

    it('suggests the canonical bypass when the overlap is skippable', async () => {
      const { kernel, stderr } = setup()
      kernel.changes.archive.execute.mockRejectedValue(
        new SpecOverlapError([
          new OverlapEntry('core:config', [{ name: 'beta', state: 'designing' }]),
        ]),
      )
      const program = makeProgram()
      registerChangeArchive(program.command('change'))
      await program.parseAsync(['node', 'specd', 'change', 'archive', 'feat']).catch(() => {})
      expect(process.exit).toHaveBeenCalledWith(1)
      expect(stderr()).toContain('core:config')
      expect(
        stderr().trimEnd().endsWith('Use --skip-checks spec.overlap to proceed despite overlap.'),
      ).toBe(true)
      expect(stderr()).not.toContain('--allow-overlap')
    })

    it('suggests no bypass when the overlap is not skippable', async () => {
      const { kernel, stderr } = setup()
      kernel.changes.archive.execute.mockRejectedValue(
        new SpecOverlapError(
          [new OverlapEntry('core:config', [{ name: 'beta', state: 'designing' }])],
          {
            skippable: false,
          },
        ),
      )
      const program = makeProgram()
      registerChangeArchive(program.command('change'))
      await program.parseAsync(['node', 'specd', 'change', 'archive', 'feat']).catch(() => {})
      expect(process.exit).toHaveBeenCalledWith(1)
      expect(stderr()).toContain('core:config')
      expect(stderr()).not.toContain('--skip-checks')
      expect(stderr()).not.toContain('--allow-overlap')
    })

    it('reports SpecOverlapError through the structured error record in json mode', async () => {
      const { kernel, stdout, stderr } = setup()
      kernel.changes.archive.execute.mockRejectedValue(
        new SpecOverlapError([
          new OverlapEntry('core:config', [{ name: 'beta', state: 'designing' }]),
        ]),
      )
      const program = makeProgram()
      registerChangeArchive(program.command('change'))
      await program
        .parseAsync(['node', 'specd', 'change', 'archive', 'feat', '--format', 'json'])
        .catch(() => {})
      expect(process.exit).toHaveBeenCalledWith(1)
      expect(`${stdout()}${stderr()}`).toContain('SPEC_OVERLAP')
    })

    function pluginFailure(skippable: boolean): CheckPredicateFailedError {
      return new CheckPredicateFailedError(
        '@security.code-scan',
        'Scanning code',
        'SECURITY_FINDINGS',
        '2 findings',
        'pnpm audit:fix',
        { count: 2 },
        skippable,
      )
    }

    it('prints the check, command and a bypass line for a skippable plugin failure', async () => {
      const { kernel, stderr } = setup()
      kernel.changes.archive.execute.mockRejectedValue(pluginFailure(true))
      const program = makeProgram()
      registerChangeArchive(program.command('change'))
      await program.parseAsync(['node', 'specd', 'change', 'archive', 'feat']).catch(() => {})
      expect(process.exit).toHaveBeenCalledWith(1)
      const output = stderr()
      expect(output).toContain('check:   Scanning code (@security.code-scan)')
      expect(output).toContain('command: pnpm audit:fix')
      expect(output).toContain(
        'bypass:  Retry with --skip-checks @security.code-scan if an exception is granted',
      )
    })

    it('prints no bypass line for a non-skippable plugin failure', async () => {
      const { kernel, stderr } = setup()
      kernel.changes.archive.execute.mockRejectedValue(pluginFailure(false))
      const program = makeProgram()
      registerChangeArchive(program.command('change'))
      await program.parseAsync(['node', 'specd', 'change', 'archive', 'feat']).catch(() => {})
      expect(process.exit).toHaveBeenCalledWith(1)
      expect(stderr()).toContain('check:   Scanning code (@security.code-scan)')
      expect(stderr()).not.toContain('bypass:')
    })

    it('reports a plugin failure through the structured error record in json mode', async () => {
      const { kernel, stdout, stderr } = setup()
      kernel.changes.archive.execute.mockRejectedValue(pluginFailure(true))
      const program = makeProgram()
      registerChangeArchive(program.command('change'))
      await program
        .parseAsync(['node', 'specd', 'change', 'archive', 'feat', '--format', 'json'])
        .catch(() => {})
      expect(process.exit).toHaveBeenCalledWith(1)
      expect(`${stdout()}${stderr()}`).toContain('SECURITY_FINDINGS')
    })

    it('still exits 1 naming the state when the change is not archivable', async () => {
      const { kernel, stderr } = setup()
      kernel.changes.archive.execute.mockRejectedValue(
        new InvalidStateTransitionError('designing', 'archiving'),
      )
      const program = makeProgram()
      registerChangeArchive(program.command('change'))
      await program
        .parseAsync(['node', 'specd', 'change', 'archive', 'feat', '--skip-checks', 'spec.overlap'])
        .catch(() => {})
      expect(process.exit).toHaveBeenCalledWith(1)
      expect(stderr()).toContain('designing')
    })
  })

  it('reports invalidated peers when archiving with --skip-checks spec.overlap', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.archive.execute.mockResolvedValue({
      archivedChange: {
        name: 'feat',
        archivedName: '2026-01-15-feat',
        archivedAt: new Date('2026-01-15T10:00:00Z'),
      },
      archiveDirPath: '/project/.specd/archive/2026-01/feat',
      postHookFailures: [],
      invalidatedChanges: [{ name: 'beta', specIds: ['core:config'] }],
    })
    const program = makeProgram()
    registerChangeArchive(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'archive',
      'feat',
      '--skip-checks',
      'spec.overlap',
    ])
    const output = stdout()
    expect(output).toContain('invalidated 1 overlapping changes')
    expect(output).toContain('beta')
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

  it('streams hook.pre progress lines under Running pre hooks before check-done on the same bus', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.archive.execute.mockImplementation((_input, onProgress) => {
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
        line: 'step 1 ok',
      })
      onProgress?.({
        type: 'check-progress',
        id: 'hook.pre',
        label: 'Running pre hooks',
        detail: 'hook-output',
        hookId: 'lint',
        stream: 'stdout',
        line: 'step 2 ok',
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
    const startIdx = output.indexOf('Running pre hooks (hook.pre)')
    const line1Idx = output.indexOf('step 1 ok')
    const line2Idx = output.indexOf('step 2 ok')
    const doneIdx = output.indexOf('✓ Running pre hooks')
    expect(startIdx).toBeGreaterThanOrEqual(0)
    expect(line1Idx).toBeGreaterThan(startIdx)
    expect(line2Idx).toBeGreaterThan(line1Idx)
    expect(doneIdx).toBeGreaterThan(line2Idx)
  })
})
