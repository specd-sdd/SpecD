import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { acquireGraphIndexLock } from '@specd/sdk'
import { captureStdout } from './helpers.js'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, spawn: vi.fn() }
})

vi.mock('../../src/helpers/sdk-host.js', () => ({
  resolveSdkHostContext: vi.fn(),
}))

vi.mock('@specd/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@specd/sdk')>()
  return {
    ...actual,
    acquireGraphIndexLock: vi.fn(() => vi.fn()),
    createVcsAdapter: vi.fn().mockResolvedValue({
      ref: vi.fn().mockResolvedValue('abc1234def'),
      rootDir: vi.fn().mockResolvedValue('/project'),
    }),
    runIndexProjectGraph: vi.fn(),
    createSdkContext: vi.fn(),
  }
})

import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  ExitSentinel,
} from './helpers.js'
import * as resolveCtx from '../../src/commands/graph/resolve-graph-cli-context.js'
import { registerGraphIndex } from '../../src/commands/graph/index-graph.js'
import { runIndexProjectGraph } from '@specd/sdk'
import { resolveSdkHostContext } from '../../src/helpers/sdk-host.js'

const mockIndexResult = {
  filesIndexed: 10,
  filesDiscovered: 12,
  documentsIndexed: 3,
  filesRemoved: 1,
  filesSkipped: 2,
  specsDiscovered: 3,
  specsIndexed: 3,
  errors: [],
  duration: 1234,
  vcsRef: 'abc1234',
  graphFingerprint: 'fp-test',
  workspaces: [
    {
      name: 'default',
      filesDiscovered: 12,
      filesIndexed: 10,
      documentsIndexed: 3,
      filesSkipped: 2,
      filesRemoved: 1,
      specsDiscovered: 3,
      specsIndexed: 3,
    },
  ],
  fullRebuild: false,
  fullRebuildReason: null,
  phaseMetrics: {
    importResolution: { count: 0, durationMs: 0 },
    dependencyFacts: { count: 0, durationMs: 0 },
    adapterRelations: { count: 0, durationMs: 0 },
    reexports: { count: 0, durationMs: 0 },
    hierarchyOverrides: { count: 0, durationMs: 0 },
    persistence: { count: 0, durationMs: 0 },
    searchIndexRebuild: { count: 0, durationMs: 0 },
  },
}

async function runIndex(
  program: ReturnType<typeof makeIndexProgram>,
  ...args: string[]
): Promise<void> {
  try {
    await program.parseAsync(['node', 'specd', ...args])
  } catch (error) {
    if (!(error instanceof ExitSentinel)) throw error
  }
}

function setup(mode: 'configured' | 'bootstrap') {
  const config = makeMockConfig()
  const kernel = mode === 'configured' ? makeMockKernel() : null
  if (kernel !== null) {
    kernel.project.listWorkspaces.execute.mockResolvedValue([
      {
        name: 'default',
        codeRoot: '/project',
        isExternal: false,
        ownership: 'owned' as const,
        specRepo: {} as never,
      },
    ])
  }

  vi.mocked(runIndexProjectGraph).mockResolvedValue(mockIndexResult)
  vi.mocked(resolveSdkHostContext).mockImplementation(async (config, kernel) => {
    const hostKernel = kernel ?? makeMockKernel()
    vi.mocked(hostKernel.project.getConfig.execute).mockReturnValue(config)
    return {
      kernel: hostKernel,
      createGraphProvider: vi.fn(),
    }
  })

  vi.spyOn(resolveCtx, 'resolveGraphCliContext').mockResolvedValue({
    mode,
    config,
    configFilePath: mode === 'configured' ? '/project/specd.yaml' : null,
    kernel,
    projectRoot: '/project',
    vcsRoot: '/project',
  })

  const getStdout = captureStdout()
  mockProcessExit()
  return { config, kernel, getStdout }
}

function makeIndexProgram() {
  const program = makeProgram()
  const graph = program.command('graph')
  registerGraphIndex(graph)
  return program
}

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

beforeEach(() => {
  vi.stubEnv('SPECD_GRAPH_INDEX_NO_WORKER', 'true')
})

describe('graph index', () => {
  it('delegates indexing to runIndexProjectGraph in configured mode', async () => {
    const { config, kernel } = setup('configured')

    const program = makeIndexProgram()
    await runIndex(program, 'graph', 'index')

    expect(resolveSdkHostContext).toHaveBeenCalledWith(config, kernel)
    expect(runIndexProjectGraph).toHaveBeenCalled()
  })

  it('owns the shared lock in a parent process and propagates worker exit', async () => {
    setup('configured')
    vi.stubEnv('SPECD_GRAPH_INDEX_NO_WORKER', '')
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() })
    vi.mocked(spawn).mockImplementation(() => {
      setImmediate(() => child.emit('exit', 0, null))
      return child as never
    })

    const program = makeIndexProgram()
    await runIndex(program, 'graph', 'index')

    expect(acquireGraphIndexLock).toHaveBeenCalledTimes(1)
    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      process.argv.slice(1),
      expect.objectContaining({
        stdio: 'inherit',
        env: expect.objectContaining({
          SPECD_GRAPH_INDEX_WORKER: 'true',
          SPECD_GRAPH_INDEX_LOCK_HELD: 'true',
        }),
      }),
    )
    expect(runIndexProjectGraph).not.toHaveBeenCalled()
  })

  it('does not expose a --workspace option anymore', () => {
    const program = makeIndexProgram()
    const indexCommand = program.commands
      .find((c) => c.name() === 'graph')
      ?.commands.find((c) => c.name() === 'index')
    expect(indexCommand?.options.some((option) => option.long === '--workspace')).toBe(false)
  })

  it('delegates indexing in bootstrap mode', async () => {
    const { config } = setup('bootstrap')

    const program = makeIndexProgram()
    await runIndex(program, 'graph', 'index', '--path', '/tmp/repo')

    expect(resolveSdkHostContext).toHaveBeenCalledWith(config, null)
    expect(runIndexProjectGraph).toHaveBeenCalled()
  })

  it('uses no-config fallback path by passing no overrides', async () => {
    setup('bootstrap')

    const program = makeIndexProgram()
    await runIndex(program, 'graph', 'index')

    expect(resolveCtx.resolveGraphCliContext).toHaveBeenCalledWith({
      configPath: undefined,
      repoPath: undefined,
    })
  })

  it('forwards exclude-path to runIndexProjectGraph', async () => {
    setup('configured')

    const program = makeIndexProgram()
    await runIndex(program, 'graph', 'index', '--exclude-path', 'foo,bar')

    expect(runIndexProjectGraph).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ excludePaths: ['foo', 'bar'] }),
    )
  })

  it('forwards --force to runIndexProjectGraph', async () => {
    setup('bootstrap')

    const program = makeIndexProgram()
    await runIndex(program, 'graph', 'index', '--path', '/tmp/repo', '--force')

    expect(runIndexProjectGraph).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ force: true }),
    )
  })

  it('renders the text summary block required by the CLI contract', async () => {
    const { getStdout } = setup('configured')

    const program = makeIndexProgram()
    await runIndex(program, 'graph', 'index')

    const stdout = getStdout()
    expect(stdout).toContain('Indexed 10 file(s) in 1234ms')
    expect(stdout).toContain('discovered: 12')
    expect(stdout).toContain('documents:  3')
    expect(stdout).toContain('skipped:    2')
    expect(stdout).toContain('removed:    1')
    expect(stdout).toContain('specs:      3')
    expect(stdout).toContain('errors:     0')
    expect(stdout).toContain('workspaces:')
    expect(stdout).toContain('3 documents')
  })

  it('exits with code 3 when runIndexProjectGraph throws', async () => {
    setup('configured')
    vi.mocked(runIndexProjectGraph).mockRejectedValueOnce(new Error('indexing failed'))
    mockProcessExit()

    const program = makeIndexProgram()
    await expect(program.parseAsync(['node', 'specd', 'graph', 'index'])).rejects.toThrow(
      ExitSentinel,
    )

    expect(process.exit).toHaveBeenCalledWith(3)
  })
})
