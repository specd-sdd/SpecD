import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureStderr,
  captureStdout,
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  ExitSentinel,
  makeMockHost,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

vi.mock('../../src/commands/change/_implementation-tracking.js', () => ({
  enrichImplementationTracking: vi.fn(),
}))

import { ImplementationFileNotFoundError } from '@specd/sdk'
import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { enrichImplementationTracking } from '../../src/commands/change/_implementation-tracking.js'
import { registerChangeImplementation } from '../../src/commands/change/implementation.js'

afterEach(() => vi.restoreAllMocks())

describe('change implementation', () => {
  it('review shows stale symbols and out-of-scope sidecar preview', async () => {
    const kernel = makeMockKernel()
    vi.mocked(resolveCliContext).mockResolvedValue(
      makeMockHost({
        config: makeMockConfig(),
        configFilePath: null,
        kernel,
      }),
    )
    kernel.changes.getImplementationReview.execute.mockResolvedValue({
      specIds: ['core:change'],
      implementationTracking: {
        trackedFiles: [{ file: 'packages/core/src/change.ts', state: 'resolved' }],
        links: [
          {
            specId: 'core:get-status',
            file: 'packages/core/src/change.ts',
            fileLinkExplicit: true,
            symbols: ['GetStatus.execute'],
          },
        ],
      },
    })
    vi.mocked(enrichImplementationTracking).mockResolvedValue({
      trackedFiles: [{ file: 'packages/core/src/change.ts', state: 'resolved' }],
      graphHint: {
        status: 'fresh',
        message: 'Code graph is fresh; stale symbol diagnostics are authoritative.',
      },
      links: [
        {
          specId: 'core:get-status',
          file: 'packages/core/src/change.ts',
          fileLinkExplicit: true,
          symbols: ['GetStatus.execute'],
          symbolResolutions: [],
        },
      ],
    })
    const stdout = captureStdout()

    const program = makeProgram()
    registerChangeImplementation(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'implementation', 'review', 'my-change'])

    const out = stdout()
    expect(out).toContain('out-of-scope sidecars:')
    expect(out).toContain('core:get-status')
    expect(out).toContain('symbols:')
    expect(out).toContain('GetStatus.execute')
  })

  it('add fails when the implementation file does not exist', async () => {
    const kernel = makeMockKernel()
    vi.mocked(resolveCliContext).mockResolvedValue(
      makeMockHost({
        config: makeMockConfig(),
        configFilePath: null,
        kernel,
      }),
    )
    kernel.changes.updateImplementationTracking.execute.mockRejectedValue(
      new ImplementationFileNotFoundError('missing.ts'),
    )
    mockProcessExit()
    const stderr = captureStderr()

    const program = makeProgram()
    registerChangeImplementation(program.command('change'))

    try {
      await program.parseAsync([
        'node',
        'specd',
        'change',
        'implementation',
        'add',
        'my-change',
        '--spec',
        'core:change',
        '--file',
        'missing.ts',
      ])
    } catch (e) {
      if (!(e instanceof ExitSentinel)) throw e
      expect(e.code).toBe(1)
    }

    expect(stderr()).toContain('error: Implementation file "missing.ts" does not exist')
  })

  it('resolve supports repeated and variadic --file values', async () => {
    const kernel = makeMockKernel()
    vi.mocked(resolveCliContext).mockResolvedValue(
      makeMockHost({
        config: makeMockConfig(),
        configFilePath: null,
        kernel,
      }),
    )

    const program = makeProgram()
    registerChangeImplementation(program.command('change'))

    await program.parseAsync([
      'node',
      'specd',
      'change',
      'implementation',
      'resolve',
      'my-change',
      '--file',
      'f1.ts',
      'f2.ts',
    ])

    expect(kernel.changes.updateImplementationTracking.execute).toHaveBeenCalledWith(
      expect.objectContaining({ file: 'f1.ts', files: ['f1.ts', 'f2.ts'] }),
    )
  })

  it('ignore keeps a comma-named file as one path', async () => {
    const kernel = makeMockKernel()
    vi.mocked(resolveCliContext).mockResolvedValue(
      makeMockHost({
        config: makeMockConfig(),
        configFilePath: null,
        kernel,
      }),
    )
    kernel.changes.updateImplementationTracking.execute.mockResolvedValue({
      implementationTracking: {
        trackedFiles: [{ file: 'Análisis, dependencias y casos de uso.md', state: 'ignored' }],
        links: [],
      },
    })

    const program = makeProgram()
    registerChangeImplementation(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'implementation',
      'ignore',
      'my-change',
      '--file',
      'Análisis, dependencias y casos de uso.md',
    ])

    expect(kernel.changes.updateImplementationTracking.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ignore',
        files: ['Análisis, dependencias y casos de uso.md'],
      }),
    )
  })

  it('ignore fails with the whole name when f3.ts,f4.ts is missing', async () => {
    const kernel = makeMockKernel()
    vi.mocked(resolveCliContext).mockResolvedValue(
      makeMockHost({
        config: makeMockConfig(),
        configFilePath: null,
        kernel,
      }),
    )
    kernel.changes.updateImplementationTracking.execute.mockRejectedValueOnce(
      new ImplementationFileNotFoundError('f3.ts,f4.ts'),
    )
    mockProcessExit()
    const stderr = captureStderr()

    const program = makeProgram()
    registerChangeImplementation(program.command('change'))

    try {
      await program.parseAsync([
        'node',
        'specd',
        'change',
        'implementation',
        'ignore',
        'my-change',
        '--file',
        'f3.ts,f4.ts',
      ])
    } catch (e) {
      if (!(e instanceof ExitSentinel)) throw e
    }

    expect(stderr()).toContain('error: Implementation file "f3.ts,f4.ts" does not exist')
    expect(kernel.changes.updateImplementationTracking.execute).toHaveBeenCalledWith(
      expect.objectContaining({ files: ['f3.ts,f4.ts'] }),
    )
  })

  it('forwards a raw spec ID on add', async () => {
    const kernel = makeMockKernel()
    vi.mocked(resolveCliContext).mockResolvedValue(
      makeMockHost({
        config: makeMockConfig(),
        configFilePath: null,
        kernel,
      }),
    )
    kernel.changes.updateImplementationTracking.execute.mockResolvedValue({
      implementationTracking: { trackedFiles: [], links: [] },
    })

    const program = makeProgram()
    registerChangeImplementation(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'implementation',
      'add',
      'my-change',
      '--spec',
      'auth/login',
      '--file',
      'src/x.ts',
    ])

    expect(kernel.changes.updateImplementationTracking.execute).toHaveBeenCalledWith(
      expect.objectContaining({ specId: 'auth/login', files: ['src/x.ts'] }),
    )
  })

  it('list text prints one file name per line', async () => {
    const kernel = makeMockKernel()
    vi.mocked(resolveCliContext).mockResolvedValue(
      makeMockHost({
        config: makeMockConfig(),
        configFilePath: null,
        kernel,
      }),
    )
    kernel.changes.getImplementationReview.execute.mockResolvedValue({
      specIds: [],
      implementationTracking: {
        trackedFiles: [
          { file: 'a,b.ts', state: 'open' },
          { file: 'c.ts', state: 'open' },
        ],
        links: [],
      },
    })
    vi.mocked(enrichImplementationTracking).mockResolvedValue({
      trackedFiles: [
        { file: 'a,b.ts', state: 'open' },
        { file: 'c.ts', state: 'open' },
      ],
      graphHint: { status: 'fresh', message: 'Code graph is fresh.' },
      links: [],
    })
    const stdout = captureStdout()

    const program = makeProgram()
    registerChangeImplementation(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'implementation', 'list', 'my-change'])

    const out = stdout()
    expect(out).toContain('    a,b.ts\n')
    expect(out).toContain('    c.ts\n')
  })

  it('review displays removed tracked files', async () => {
    const kernel = makeMockKernel()
    vi.mocked(resolveCliContext).mockResolvedValue(
      makeMockHost({
        config: makeMockConfig(),
        configFilePath: null,
        kernel,
      }),
    )
    kernel.changes.getImplementationReview.execute.mockResolvedValue({
      specIds: [],
      implementationTracking: {
        trackedFiles: [
          { file: 'src/active.ts', state: 'open' },
          { file: 'src/deleted.ts', state: 'removed' },
        ],
        links: [],
      },
    })
    vi.mocked(enrichImplementationTracking).mockResolvedValue({
      trackedFiles: [
        { file: 'src/active.ts', state: 'open' },
        { file: 'src/deleted.ts', state: 'removed' },
      ],
      graphHint: {
        status: 'fresh',
        message: 'Code graph is fresh.',
      },
      links: [],
    })
    const stdout = captureStdout()

    const program = makeProgram()
    registerChangeImplementation(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'implementation', 'review', 'my-change'])

    const out = stdout()
    expect(out).toContain('removed')
    expect(out).toContain('src/deleted.ts')
  })

  it('unresolve calls updateImplementationTracking with unresolve action', async () => {
    const kernel = makeMockKernel()
    vi.mocked(resolveCliContext).mockResolvedValue(
      makeMockHost({
        config: makeMockConfig(),
        configFilePath: null,
        kernel,
      }),
    )
    kernel.changes.updateImplementationTracking.execute.mockResolvedValue({
      implementationTracking: {
        trackedFiles: [{ file: 'src/foo.ts', state: 'open' }],
        links: [],
      },
    })

    const program = makeProgram()
    registerChangeImplementation(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'implementation',
      'unresolve',
      'my-change',
      '--file',
      'src/foo.ts',
    ])

    expect(kernel.changes.updateImplementationTracking.execute).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'unresolve', file: 'src/foo.ts' }),
    )
  })

  it('start calls updateImplementationTracking with start action and formats text', async () => {
    const kernel = makeMockKernel()
    vi.mocked(resolveCliContext).mockResolvedValue(
      makeMockHost({
        config: makeMockConfig(),
        configFilePath: null,
        kernel,
      }),
    )
    kernel.changes.updateImplementationTracking.execute.mockResolvedValue({
      implementationTracking: {
        trackedFiles: [],
        links: [],
      },
    })
    const stdout = captureStdout()

    const program = makeProgram()
    registerChangeImplementation(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'implementation', 'start', 'my-change'])

    expect(kernel.changes.updateImplementationTracking.execute).toHaveBeenCalledWith({
      name: 'my-change',
      action: 'start',
    })
    const out = stdout()
    expect(out).toContain("✓ Implementation tracking is active for 'my-change'.")
  })

  it('start prints the start timestamp in text output', async () => {
    const kernel = makeMockKernel()
    vi.mocked(resolveCliContext).mockResolvedValue(
      makeMockHost({
        config: makeMockConfig(),
        configFilePath: null,
        kernel,
      }),
    )
    kernel.changes.updateImplementationTracking.execute.mockResolvedValue({
      implementationTracking: { trackedFiles: [], links: [] },
      trackingStartedAt: new Date('2026-11-08T10:00:00.000Z'),
    })
    const stdout = captureStdout()

    const program = makeProgram()
    registerChangeImplementation(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'implementation', 'start', 'my-change'])

    expect(stdout()).toContain(
      "✓ Implementation tracking is active for 'my-change' (started 2026-11-08T10:00:00.000Z).",
    )
  })

  it('start reports name, trackingActive and startedAt in json output', async () => {
    const kernel = makeMockKernel()
    vi.mocked(resolveCliContext).mockResolvedValue(
      makeMockHost({
        config: makeMockConfig(),
        configFilePath: null,
        kernel,
      }),
    )
    kernel.changes.updateImplementationTracking.execute.mockResolvedValue({
      implementationTracking: { trackedFiles: [], links: [] },
      trackingStartedAt: new Date('2026-11-08T10:00:00.000Z'),
    })
    const stdout = captureStdout()

    const program = makeProgram()
    registerChangeImplementation(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'implementation',
      'start',
      'my-change',
      '--format',
      'json',
    ])

    const payload = JSON.parse(stdout()) as Record<string, unknown>
    expect(payload).toMatchObject({
      result: 'ok',
      name: 'my-change',
      action: 'start',
      trackingActive: true,
      startedAt: '2026-11-08T10:00:00.000Z',
    })
  })
})

describe('change implementation gaps (audit hardening)', () => {
  function setupKernel() {
    const kernel = makeMockKernel()
    vi.mocked(resolveCliContext).mockResolvedValue(
      makeMockHost({
        config: makeMockConfig(),
        configFilePath: null,
        kernel,
      }),
    )
    kernel.changes.updateImplementationTracking.execute.mockResolvedValue({
      implementationTracking: { trackedFiles: [], links: [] },
    })
    return kernel
  }

  async function run(args: string[]): Promise<void> {
    const program = makeProgram()
    registerChangeImplementation(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'implementation', ...args])
  }

  it('resolve keeps "a, b.md" as one path', async () => {
    const kernel = setupKernel()
    await run(['resolve', 'my-change', '--file', 'a, b.md'])

    expect(kernel.changes.updateImplementationTracking.execute).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'resolve', files: ['a, b.md'] }),
    )
  })

  it('resolve accepts repeated --file and variadic --file equivalently', async () => {
    const kernel = setupKernel()
    await run(['resolve', 'my-change', '--file', 'a.ts', '--file', 'b.ts'])
    await run(['resolve', 'my-change', '--file', 'a.ts', 'b.ts'])

    const calls = kernel.changes.updateImplementationTracking.execute.mock.calls
    expect(calls[0]![0]).toMatchObject({ files: ['a.ts', 'b.ts'] })
    expect(calls[1]![0]).toMatchObject({ files: ['a.ts', 'b.ts'] })
  })

  it('unresolve accepts repeated --file and a comma name', async () => {
    const kernel = setupKernel()
    await run(['unresolve', 'my-change', '--file', 'a,b.ts', '--file', 'c.ts'])

    expect(kernel.changes.updateImplementationTracking.execute).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'unresolve', files: ['a,b.ts', 'c.ts'] }),
    )
  })

  it('forwards a file name with surrounding spaces untouched', async () => {
    const kernel = setupKernel()
    await run(['ignore', 'my-change', '--file', ' spaced.md '])

    expect(kernel.changes.updateImplementationTracking.execute).toHaveBeenCalledWith(
      expect.objectContaining({ files: [' spaced.md '] }),
    )
  })

  it('json output keeps comma file names as separate array entries', async () => {
    const kernel = makeMockKernel()
    vi.mocked(resolveCliContext).mockResolvedValue(
      makeMockHost({
        config: makeMockConfig(),
        configFilePath: null,
        kernel,
      }),
    )
    vi.mocked(enrichImplementationTracking).mockResolvedValue({
      trackedFiles: [
        { file: 'a,b.ts', state: 'open' },
        { file: 'c.ts', state: 'open' },
      ],
      graphHint: { status: 'fresh', message: 'Code graph is fresh.' },
      links: [],
    })
    const stdout = captureStdout()

    await run(['list', 'my-change', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.trackedFiles.map((entry: { file: string }) => entry.file)).toEqual([
      'a,b.ts',
      'c.ts',
    ])
  })

  it('remove forwards --symbol "A.b,c" raw', async () => {
    const kernel = setupKernel()
    await run([
      'remove',
      'my-change',
      '--spec',
      'core:change',
      '--file',
      'x.ts',
      '--symbol',
      'A.b,c',
    ])

    expect(kernel.changes.updateImplementationTracking.execute).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'remove', symbols: ['A.b,c'] }),
    )
  })

  it('--help lists all eight subcommands', () => {
    const program = makeProgram()
    registerChangeImplementation(program.command('change'))
    const group = program.commands[0]!.commands.find((c) => c.name() === 'implementation')!
    const names = group.commands.map((c) => c.name())

    expect(names).toEqual(
      expect.arrayContaining([
        'list',
        'review',
        'start',
        'add',
        'remove',
        'ignore',
        'resolve',
        'unresolve',
      ]),
    )
    expect(names).toHaveLength(8)
  })

  it('documents structured output on all eight leaves', () => {
    const program = makeProgram()
    registerChangeImplementation(program.command('change'))
    const group = program.commands[0]!.commands.find((c) => c.name() === 'implementation')!
    for (const leaf of group.commands) {
      const stdout = captureStdout()
      leaf.outputHelp()
      expect(stdout()).toContain('JSON/TOON output schema:')
      expect(stdout()).toContain(
        leaf.name() === 'list' || leaf.name() === 'review'
          ? 'trackedFiles:'
          : 'implementationTracking:',
      )
      vi.restoreAllMocks()
    }
  })

  it('start is idempotent on a second run', async () => {
    const kernel = setupKernel()
    const stdout = captureStdout()

    await run(['start', 'my-change'])
    await run(['start', 'my-change'])

    expect(kernel.changes.updateImplementationTracking.execute).toHaveBeenCalledTimes(2)
    expect(stdout().match(/Implementation tracking is active/g)).toHaveLength(2)
  })
})
