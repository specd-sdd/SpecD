import { describe, it, expect, vi, afterEach } from 'vitest'
import { captureStdout } from './helpers.js'

vi.mock('@specd/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@specd/core')>()
  return {
    ...actual,
    createVcsAdapter: vi.fn().mockResolvedValue({
      ref: vi.fn().mockResolvedValue('abc1234def'),
      rootDir: vi.fn().mockResolvedValue('/project'),
    }),
    FsSpecRepository: vi.fn().mockImplementation(() => ({
      count: vi.fn().mockResolvedValue(0),
      list: vi.fn().mockResolvedValue([]),
    })),
  }
})

import { makeMockConfig, makeMockKernel, makeProgram, mockProcessExit } from './helpers.js'
import * as resolveCtx from '../../src/commands/graph/resolve-graph-cli-context.js'
import { withProvider } from '../../src/commands/graph/with-provider.js'
import { registerGraphIndex } from '../../src/commands/graph/index-graph.js'
import { type CodeGraphProvider } from '@specd/code-graph'

vi.mock('../../src/commands/graph/with-provider.js', () => ({
  withProvider: vi.fn(),
}))

vi.mock('../../src/commands/graph/graph-index-lock.js', () => ({
  acquireGraphIndexLock: vi.fn(() => vi.fn()),
  assertGraphIndexUnlocked: vi.fn(),
}))

function setup(mode: 'configured' | 'bootstrap') {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  const mockProvider = {
    index: vi.fn().mockResolvedValue({
      filesDiscovered: 12,
      filesIndexed: 10,
      documentsIndexed: 3,
      filesRemoved: 1,
      filesSkipped: 2,
      specsDiscovered: 3,
      specsIndexed: 3,
      errors: [],
      duration: 1234,
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
      vcsRef: 'abc1234def',
      graphFingerprint: 'sha256:graph',
      fullRebuildReason: null,
    }),
    recreate: vi.fn().mockResolvedValue(undefined),
  }

  const mockWorkspaces = [
    {
      name: 'default',
      codeRoot: '/project',
      isExternal: false,
      ownership: 'owned' as const,
      specRepo: {} as any,
    },
  ]

  kernel.project.listWorkspaces.execute.mockResolvedValue(mockWorkspaces)

  vi.spyOn(resolveCtx, 'resolveGraphCliContext').mockResolvedValue({
    mode,
    config,
    configFilePath: mode === 'configured' ? '/project/specd.yaml' : null,
    kernel,
    projectRoot: '/project',
    vcsRoot: '/project',
  })

  vi.mocked(withProvider).mockImplementation(async (_cfg, _fmt, fn, options) => {
    await options?.beforeOpen?.(mockProvider as unknown as CodeGraphProvider)
    return fn(mockProvider as unknown as CodeGraphProvider)
  })

  const getStdout = captureStdout()
  mockProcessExit()
  return { config, kernel, mockProvider, getStdout }
}

function makeIndexProgram() {
  const program = makeProgram()
  const graph = program.command('graph')
  registerGraphIndex(graph)
  return program
}

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.SPECD_GRAPH_INDEX_NO_WORKER
})

describe('graph index', () => {
  it('builds configured workspaces from kernel', async () => {
    const { mockProvider, kernel } = setup('configured')
    process.env.SPECD_GRAPH_INDEX_NO_WORKER = 'true'

    const program = makeIndexProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'index'])

    expect(kernel.project.listWorkspaces.execute).toHaveBeenCalled()
    expect(mockProvider.index).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaces: expect.arrayContaining([
          expect.objectContaining({ name: 'default', codeRoot: '/project' }),
        ]),
      }),
    )
  })

  it('does not expose a --workspace option anymore', () => {
    const program = makeIndexProgram()
    const indexCommand = program.commands
      .find((c) => c.name() === 'graph')
      ?.commands.find((c) => c.name() === 'index')
    expect(indexCommand?.options.some((option) => option.long === '--workspace')).toBe(false)
  })

  it.skip('builds a synthetic default workspace in bootstrap mode', async () => {
    const { mockProvider } = setup('bootstrap')
    process.env.SPECD_GRAPH_INDEX_NO_WORKER = 'true'

    const program = makeIndexProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'index', '--path', '/tmp/repo'])

    expect(mockProvider.index).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaces: expect.arrayContaining([expect.objectContaining({ name: 'default' })]),
      }),
    )
  })

  it.skip('uses no-config fallback path by passing no overrides', async () => {
    const spy = vi.spyOn(resolveCtx, 'resolveGraphCliContext')
    setup('bootstrap')
    process.env.SPECD_GRAPH_INDEX_NO_WORKER = 'true'

    const program = makeIndexProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'index'])

    expect(spy).toHaveBeenCalledWith({
      configPath: undefined,
      repoPath: undefined,
    })
  })

  it.skip('populates graphConfig with exclude-path from CLI', async () => {
    const { mockProvider } = setup('configured')
    process.env.SPECD_GRAPH_INDEX_NO_WORKER = 'true'

    const program = makeIndexProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'index', '--exclude-path', 'foo,bar'])

    expect(mockProvider.index).toHaveBeenCalledWith(
      expect.objectContaining({
        graphConfig: expect.objectContaining({
          workspaces: expect.any(Map),
        }),
      }),
    )

    const call = mockProvider.index.mock.calls[0]![0]
    const wsConfig = call.graphConfig.workspaces.get('default')
    expect(wsConfig.excludePaths).toEqual(['foo', 'bar'])
  })

  it('delegates --force recreation to the provider before indexing', async () => {
    const { mockProvider } = setup('bootstrap')
    process.env.SPECD_GRAPH_INDEX_NO_WORKER = 'true'

    const program = makeIndexProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'index', '--path', '/tmp/repo', '--force'])

    expect(mockProvider.recreate).toHaveBeenCalledTimes(1)
    expect(mockProvider.index).toHaveBeenCalled()
  })

  it('renders the text summary block required by the CLI contract', async () => {
    const { getStdout } = setup('configured')
    process.env.SPECD_GRAPH_INDEX_NO_WORKER = 'true'

    const program = makeIndexProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'index'])

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

  it.skip('acquires the shared graph index lock before indexing', async () => {
    const { config } = setup('configured')
    process.env.SPECD_GRAPH_INDEX_NO_WORKER = 'true'

    const program = makeIndexProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'index'])

    const { acquireGraphIndexLock } = await import('../../src/commands/graph/graph-index-lock.js')
    expect(acquireGraphIndexLock).toHaveBeenCalledWith(config)
  })
})
