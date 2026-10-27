import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@specd/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@specd/sdk')>()),
  runIsolatedGraphIndex: vi.fn(),
}))

import { runIsolatedGraphIndex, GraphIndexWorkerExitError } from '@specd/sdk'
import { registerGraphIndex } from '../../src/commands/graph/index-graph.js'
import * as resolveContext from '../../src/commands/graph/resolve-graph-cli-context.js'
import {
  captureStderr,
  captureStdout,
  ExitSentinel,
  makeMockConfig,
  makeProgram,
  mockProcessExit,
} from './helpers.js'

const result = {
  filesIndexed: 10,
  filesDiscovered: 12,
  documentsIndexed: 3,
  filesRemoved: 1,
  filesSkipped: 2,
  filesSkippedForSize: 0,
  largestSkippedForSize: [],
  sizeExemptAnalysed: [],
  specsDiscovered: 3,
  specsIndexed: 3,
  errors: [{ filePath: 'bad.ts', message: 'parse error' }],
  diagnostics: [],
  duration: 1234,
  vcsRef: 'abc1234',
  graphFingerprint: 'fp-test',
  workspaces: [],
  fullRebuild: false,
  fullRebuildReason: null,
  phaseMetrics: { importResolution: { count: 0, durationMs: 0 } },
  coverage: {
    total: 12,
    byStatus: { indexed: 10, excluded: 0, unsupported: 2, 'parse-failed': 0, partial: 0 },
    reasons: ['no-language-adapter'],
  },
  coverageDiagnostics: [
    {
      specId: 'code-graph:indexer',
      filePath: 'code-graph:src/index.ts',
      symbolName: 'missingSymbol',
      reason: 'SYMBOL_NOT_FOUND',
    },
  ],
}

function makeIndexProgram() {
  const program = makeProgram()
  registerGraphIndex(program.command('graph'))
  return program
}

async function run(program: ReturnType<typeof makeIndexProgram>, ...args: string[]) {
  try {
    await program.parseAsync(['node', 'specd', 'graph', 'index', ...args])
  } catch (error) {
    if (!(error instanceof ExitSentinel)) throw error
  }
}

function setup(mode: 'configured' | 'bootstrap' = 'configured') {
  const config = makeMockConfig()
  vi.spyOn(resolveContext, 'resolveGraphCliContext').mockResolvedValue({
    mode,
    config,
    configFilePath: mode === 'configured' ? '/project/specd.yaml' : null,
    kernel: null,
    projectRoot: '/project',
    vcsRoot: '/project',
  })
  vi.mocked(runIsolatedGraphIndex).mockResolvedValue(result)
  mockProcessExit()
  return config
}

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('graph index', () => {
  it('delegates explicit config as a forced descriptor', async () => {
    const config = setup()
    await run(
      makeIndexProgram(),
      '--config',
      '/project/specd.yaml',
      '--force',
      '--exclude-path',
      'foo,bar',
    )
    expect(runIsolatedGraphIndex).toHaveBeenCalledTimes(1)
    expect(runIsolatedGraphIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        storageRoot: config.configPath,
        taskModule: expect.any(URL),
        taskInput: {
          context: { mode: 'forced', configPath: '/project/specd.yaml' },
          index: { force: true, excludePaths: ['foo', 'bar'] },
        },
        onProgress: expect.any(Function),
      }),
    )
    expect(
      (vi.mocked(runIsolatedGraphIndex).mock.calls[0]?.[0].taskModule as URL).pathname,
    ).toContain('graph-index-task.js')
  })

  it('replays automatic discovery from the parent start directory', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/project/packages/app')
    const config = setup()
    await run(makeIndexProgram())
    expect(runIsolatedGraphIndex).toHaveBeenCalledTimes(1)
    expect(runIsolatedGraphIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        storageRoot: config.configPath,
        taskInput: {
          context: { mode: 'discovered', startDir: '/project/packages/app' },
          index: { force: false },
        },
      }),
    )
  })

  it('uses an exact bootstrap descriptor and only supplies progress for text output', async () => {
    setup('bootstrap')
    await run(makeIndexProgram(), '--path', '/tmp/repo', '--format', 'json')
    expect(runIsolatedGraphIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        taskInput: {
          context: { mode: 'bootstrap', projectRoot: '/project', vcsRoot: '/project' },
          index: { force: false },
        },
      }),
    )
    expect(vi.mocked(runIsolatedGraphIndex).mock.calls[0]?.[0].onProgress).toBeUndefined()
  })

  it('renders text progress and preserves the successful per-file-error result', async () => {
    setup()
    const stdout = captureStdout()
    await run(makeIndexProgram())
    const onProgress = vi.mocked(runIsolatedGraphIndex).mock.calls[0]?.[0].onProgress
    onProgress?.({ percent: 12.5, phase: 'symbols' })
    expect(stdout()).toContain('Indexed 10 file(s) in 1234ms')
    expect(stdout()).toContain('bad.ts: parse error')
    expect(stdout()).toContain('coverage:   12 input(s)')
    expect(stdout()).toContain(
      'code-graph:indexer: code-graph:src/index.ts#missingSymbol (SYMBOL_NOT_FOUND)',
    )
    expect(stdout()).toContain('Indexing: 13% symbols')
    // A successful run ends the process explicitly with code 0 (it must not rely on an empty event loop)
    expect(process.exit).toHaveBeenCalledWith(0)
  })

  it('keeps validation failures local and maps worker errors to code 3', async () => {
    setup()
    await run(makeIndexProgram(), '--config', 'a', '--path', 'b')
    expect(runIsolatedGraphIndex).not.toHaveBeenCalled()
    expect(process.exit).toHaveBeenCalledWith(1)

    vi.restoreAllMocks()
    setup()
    vi.mocked(runIsolatedGraphIndex).mockRejectedValueOnce(new Error('GRAPH_INDEX_WORKER_PROTOCOL'))
    await run(makeIndexProgram())
    expect(process.exit).toHaveBeenCalledWith(3)
  })

  it('maps discovered replay failure to code 3 without changing its descriptor', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/project/packages/app')
    setup()
    vi.mocked(runIsolatedGraphIndex).mockRejectedValueOnce(new Error('config disappeared'))
    await run(makeIndexProgram())
    expect(runIsolatedGraphIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        taskInput: {
          context: { mode: 'discovered', startDir: '/project/packages/app' },
          index: { force: false },
        },
      }),
    )
    expect(process.exit).toHaveBeenCalledWith(3)
  })

  it('contains no CLI-owned isolation bypass or direct Code Graph dependency', () => {
    const source = readFileSync(
      new URL('../../src/commands/graph/index-graph.ts', import.meta.url),
      'utf8',
    )
    const packageJson = readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
    expect(source).not.toMatch(
      /child_process|SPECD_GRAPH_INDEX_(?:WORKER|NO_WORKER|LOCK_HELD)|acquireGraphIndexLock/,
    )
    expect(packageJson).not.toContain('"@specd/code-graph"')
  })

  it('renders size-skip section with count, limit, files, YAML snippet and memory note in text mode', async () => {
    setup()
    vi.mocked(runIsolatedGraphIndex).mockResolvedValueOnce({
      ...result,
      filesSkippedForSize: 2,
      largestSkippedForSize: [
        {
          filePath: '/project/src/huge.ts',
          projectRelativePath: 'src/huge.ts',
          sizeBytes: 524288,
          limitBytes: 262144,
        },
        {
          filePath: '/project/src/large.ts',
          projectRelativePath: 'src/large.ts',
          sizeBytes: 300000,
          limitBytes: 262144,
        },
      ],
      sizeExemptAnalysed: [],
    })
    const stdout = captureStdout()
    await run(makeIndexProgram())

    const output = stdout()
    expect(output).toContain(
      'size limit: 2 file(s) skipped (larger than graph.maxFileBytes, 262144 bytes)',
    )
    expect(output).toContain('src/huge.ts   512 KB')
    expect(output).toContain('src/large.ts   293 KB')
    expect(output).toContain('to index them anyway, add to specd.yaml:')
    expect(output).toContain('largeFilePaths:')
    expect(output).toContain('- src/huge.ts')
    expect(output).toContain('- src/large.ts')
    expect(output).toContain('or raise graph.maxFileBytes (0 disables the limit).')
    expect(output).toContain(
      'large files cost roughly 3 KB of memory per source byte while they are analysed.',
    )
  })

  it('caps skipped files listing at 10 and prints ... and N more', async () => {
    setup()
    const skippedList = Array.from({ length: 12 }, (_, i) => ({
      filePath: `/project/src/file-${i}.ts`,
      projectRelativePath: `src/file-${i}.ts`,
      sizeBytes: 300000 + i * 1000,
      limitBytes: 262144,
    }))
    vi.mocked(runIsolatedGraphIndex).mockResolvedValueOnce({
      ...result,
      filesSkippedForSize: 12,
      largestSkippedForSize: skippedList,
      sizeExemptAnalysed: [],
    })
    const stdout = captureStdout()
    await run(makeIndexProgram())

    const output = stdout()
    expect(output).toContain('size limit: 12 file(s) skipped')
    expect(output).toContain('src/file-0.ts')
    expect(output).toContain('src/file-9.ts')
    expect(output).toContain('... and 2 more')
  })

  it('renders separate exempt list when sizeExemptAnalysed is present', async () => {
    setup()
    vi.mocked(runIsolatedGraphIndex).mockResolvedValueOnce({
      ...result,
      filesSkippedForSize: 0,
      largestSkippedForSize: [],
      sizeExemptAnalysed: [
        {
          filePath: '/project/src/exempt.ts',
          projectRelativePath: 'src/exempt.ts',
          sizeBytes: 1572864,
        },
      ],
    })
    const stdout = captureStdout()
    await run(makeIndexProgram())

    const output = stdout()
    expect(output).toContain('size-exempt files analysed:')
    expect(output).toContain('src/exempt.ts   1.5 MB')
  })

  it('leaves text output unchanged when filesSkippedForSize is 0 and sizeExemptAnalysed is empty', async () => {
    setup()
    const stdout = captureStdout()
    await run(makeIndexProgram())

    const output = stdout()
    expect(output).not.toContain('size limit:')
    expect(output).not.toContain('size-exempt files analysed:')
    expect(output).not.toContain('largeFilePaths:')
  })

  it('prints resolution diagnostics as warnings and keeps exit code 0', async () => {
    setup()
    vi.mocked(runIsolatedGraphIndex).mockResolvedValueOnce({
      ...result,
      errors: [],
      diagnostics: [
        { filePath: 'backend:<manifest>', message: 'Package identity collision: "a/b"' },
        { filePath: 'cake:<manifest>', message: 'Package identity collision: "a/b"' },
      ],
    })
    const stdout = captureStdout()
    await run(makeIndexProgram())

    const output = stdout()
    expect(output).toContain('finished with 2 diagnostic(s):')
    expect(output).toContain('warning: backend:<manifest>: Package identity collision: "a/b"')
    expect(output).toContain('errors:     0')
    expect(process.exit).toHaveBeenCalledWith(0)
  })

  it('omits the diagnostics section when there are none', async () => {
    setup()
    const stdout = captureStdout()
    await run(makeIndexProgram())

    expect(stdout()).not.toContain('diagnostic(s)')
  })

  it('exposes diagnostics next to errors in json mode', async () => {
    setup()
    vi.mocked(runIsolatedGraphIndex).mockResolvedValueOnce({
      ...result,
      diagnostics: [{ filePath: 'backend:<manifest>', message: 'collision' }],
    })
    const stdout = captureStdout()
    await run(makeIndexProgram(), '--format', 'json')

    const json = JSON.parse(stdout())
    expect(json.diagnostics).toEqual([{ filePath: 'backend:<manifest>', message: 'collision' }])
    expect(json.errors).toHaveLength(1)
  })

  it('includes size-skip fields in structured JSON format without hints', async () => {
    setup()
    vi.mocked(runIsolatedGraphIndex).mockResolvedValueOnce({
      ...result,
      filesSkippedForSize: 1,
      largestSkippedForSize: [
        {
          filePath: '/project/src/big.ts',
          projectRelativePath: 'src/big.ts',
          sizeBytes: 400000,
          limitBytes: 262144,
        },
      ],
      sizeExemptAnalysed: [],
    })
    const stdout = captureStdout()
    await run(makeIndexProgram(), '--format', 'json')

    const json = JSON.parse(stdout())
    expect(json.filesSkippedForSize).toBe(1)
    expect(json.largestSkippedForSize).toHaveLength(1)
    expect(json.sizeExemptAnalysed).toHaveLength(0)
    expect(stdout()).not.toContain('to index them anyway')
  })

  it('prints warning on stderr for resource-disposal-failed progress in text mode', async () => {
    setup()
    const stderr = captureStderr()
    await run(makeIndexProgram())

    const onProgress = vi.mocked(runIsolatedGraphIndex).mock.calls[0]?.[0].onProgress
    onProgress?.({
      event: {
        kind: 'resource-disposal-failed',
        filePath: '/project/bad.ts',
        message: 'Disposal failed',
      },
    })

    expect(stderr()).toContain(
      'warning: could not release a parser resource while processing /project/bad.ts: Disposal failed',
    )
  })

  it('prints worker-silent warning on stderr only in text mode', async () => {
    setup()
    const stderr = captureStderr()
    await run(makeIndexProgram())

    const onEvent = vi.mocked(runIsolatedGraphIndex).mock.calls[0]?.[0].onEvent
    onEvent?.({
      kind: 'worker-silent',
      item: 'slow.ts',
      silentForMs: 15000,
    })

    expect(stderr()).toContain(
      'warning: no progress for 15s while processing slow.ts. If that file is not needed, add it to graph.excludePaths or lower graph.maxFileBytes.',
    )
  })

  it('renders worker failure diagnostics with exit code 3 in text mode', async () => {
    setup()
    const workerError = new GraphIndexWorkerExitError('Worker crashed')
    workerError.withDiagnostics({
      cause: 'resource-limit',
      lastActivity: { item: 'giant.ts', agoMs: 500 },
      stdoutTail: 'Processing giant.ts\n',
      stderrTail: 'FATAL ERROR: JavaScript heap out of memory\n',
    })
    vi.mocked(runIsolatedGraphIndex).mockRejectedValueOnce(workerError)
    const stderr = captureStderr()

    await run(makeIndexProgram())

    expect(process.exit).toHaveBeenCalledWith(3)
    const errText = stderr()
    expect(errText).toContain('Worker crashed')
    expect(errText).toContain('cause: resource-limit')
    expect(errText).toContain('last file: giant.ts')
    expect(errText).toContain('JavaScript heap out of memory')
  })

  it('carries the failure cause and tails as structured data in json mode, without detail lines', async () => {
    setup()
    const workerError = new GraphIndexWorkerExitError('Worker crashed')
    workerError.withDiagnostics({
      cause: 'native-crash',
      lastActivity: { item: 'giant.ts', agoMs: 500 },
      stdoutTail: 'Processing giant.ts\n',
      stderrTail: 'segmentation fault\n',
    })
    vi.mocked(runIsolatedGraphIndex).mockRejectedValueOnce(workerError)
    const stdout = captureStdout()
    const stderr = captureStderr()

    await run(makeIndexProgram(), '--format', 'json')

    expect(process.exit).toHaveBeenCalledWith(3)
    const payload = JSON.parse(stdout()) as {
      result: string
      metadata: { cause: string; lastActivity: { item: string }; stderrTail: string }
    }
    expect(payload.result).toBe('error')
    expect(payload.metadata.cause).toBe('native-crash')
    expect(payload.metadata.lastActivity.item).toBe('giant.ts')
    expect(payload.metadata.stderrTail).toContain('segmentation fault')
    expect(stderr()).not.toContain('last file:')
  })

  it('carries the failure cause as structured data in toon mode', async () => {
    setup()
    const workerError = new GraphIndexWorkerExitError('Worker crashed')
    workerError.withDiagnostics({
      cause: 'exited',
      lastActivity: null,
      stdoutTail: '',
      stderrTail: '',
    })
    vi.mocked(runIsolatedGraphIndex).mockRejectedValueOnce(workerError)
    const stdout = captureStdout()

    await run(makeIndexProgram(), '--format', 'toon')

    expect(process.exit).toHaveBeenCalledWith(3)
    expect(stdout()).toContain('cause')
    expect(stdout()).toContain('exited')
  })

  it('exposes the size-skip fields in toon mode without hint text', async () => {
    setup()
    vi.mocked(runIsolatedGraphIndex).mockResolvedValueOnce({
      ...result,
      filesSkippedForSize: 1,
      largestSkippedForSize: [
        {
          filePath: '/project/src/big.ts',
          projectRelativePath: 'src/big.ts',
          sizeBytes: 400000,
          limitBytes: 262144,
        },
      ],
      sizeExemptAnalysed: [],
    })
    const stdout = captureStdout()

    await run(makeIndexProgram(), '--format', 'toon')

    expect(stdout()).toContain('filesSkippedForSize')
    expect(stdout()).toContain('src/big.ts')
    expect(stdout()).not.toContain('to index them anyway')
  })

  it('never writes to the project configuration file', () => {
    // The command only reads configuration; it must not import any file-writing primitive
    const source = readFileSync(
      fileURLToPath(new URL('../../src/commands/graph/index-graph.ts', import.meta.url)),
      'utf-8',
    )
    expect(source).not.toMatch(/writeFile|appendFile|createWriteStream|copyFile|rename\(/)
  })
})
