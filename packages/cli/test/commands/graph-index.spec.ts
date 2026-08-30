import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@specd/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@specd/sdk')>()),
  runIsolatedGraphIndex: vi.fn(),
}))

import { runIsolatedGraphIndex } from '@specd/sdk'
import { registerGraphIndex } from '../../src/commands/graph/index-graph.js'
import * as resolveContext from '../../src/commands/graph/resolve-graph-cli-context.js'
import {
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
  specsDiscovered: 3,
  specsIndexed: 3,
  errors: [{ filePath: 'bad.ts', message: 'parse error' }],
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
  it('delegates one configured run to the SDK worker with its packaged task', async () => {
    const config = setup()
    await run(makeIndexProgram(), '--force', '--exclude-path', 'foo,bar')
    expect(runIsolatedGraphIndex).toHaveBeenCalledTimes(1)
    expect(runIsolatedGraphIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        storageRoot: config.configPath,
        taskModule: expect.any(URL),
        taskInput: {
          context: { mode: 'configured', configFilePath: '/project/specd.yaml' },
          index: { force: true, excludePaths: ['foo', 'bar'] },
        },
        onProgress: expect.any(Function),
      }),
    )
    expect(
      (vi.mocked(runIsolatedGraphIndex).mock.calls[0]?.[0].taskModule as URL).pathname,
    ).toContain('graph-index-task.js')
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
})
