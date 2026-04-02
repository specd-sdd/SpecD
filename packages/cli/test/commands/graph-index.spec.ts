import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureStdout,
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
} from './helpers.js'

vi.mock('../../src/commands/graph/resolve-graph-cli-context.js', () => ({
  resolveGraphCliContext: vi.fn(),
}))

vi.mock('../../src/commands/graph/with-provider.js', () => ({
  withProvider: vi.fn(),
}))

vi.mock('../../src/commands/graph/build-workspace-targets.js', () => ({
  buildWorkspaceTargets: vi.fn(),
}))

vi.mock('../../src/commands/graph/graph-index-lock.js', () => ({
  acquireGraphIndexLock: vi.fn(() => vi.fn()),
}))

vi.mock('@specd/core', async () => {
  const actual = await vi.importActual<typeof import('@specd/core')>('@specd/core')
  return {
    ...actual,
    createVcsAdapter: vi.fn().mockResolvedValue({
      ref: vi.fn().mockResolvedValue('abc1234def'),
    }),
  }
})

import { resolveGraphCliContext } from '../../src/commands/graph/resolve-graph-cli-context.js'
import { withProvider } from '../../src/commands/graph/with-provider.js'
import { buildWorkspaceTargets } from '../../src/commands/graph/build-workspace-targets.js'
import { acquireGraphIndexLock } from '../../src/commands/graph/graph-index-lock.js'
import { registerGraphIndex } from '../../src/commands/graph/index-graph.js'

function setup(mode: 'configured' | 'bootstrap' = 'configured') {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveGraphCliContext).mockResolvedValue({
    mode,
    config,
    configFilePath: mode === 'configured' ? '/project/specd.yaml' : null,
    kernel,
    projectRoot: '/project',
    vcsRoot: '/project',
  })

  vi.mocked(buildWorkspaceTargets).mockResolvedValue([
    {
      name: 'default',
      codeRoot: '/project',
      repoRoot: '/project',
      specs: async () => [],
    },
  ])

  const mockProvider = {
    recreate: vi.fn().mockResolvedValue(undefined),
    index: vi.fn().mockResolvedValue({
      filesIndexed: 0,
      filesDiscovered: 0,
      filesSkipped: 0,
      filesRemoved: 0,
      specsIndexed: 0,
      errors: [],
      duration: 1,
      workspaces: [],
    }),
  }
  vi.mocked(withProvider).mockImplementation(async (_config, _format, fn, options) => {
    await options?.beforeOpen?.(mockProvider as never)
    await fn(mockProvider as never)
  })

  const getStdout = captureStdout()
  mockProcessExit()
  return { mockProvider, kernel, getStdout }
}

function makeIndexProgram() {
  const program = makeProgram()
  const graph = program.command('graph')
  registerGraphIndex(graph)
  return program
}

afterEach(() => vi.restoreAllMocks())

describe('graph index', () => {
  it('builds configured workspaces from config and kernel', async () => {
    const { mockProvider, kernel } = setup('configured')

    const program = makeIndexProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'index'])

    expect(buildWorkspaceTargets).toHaveBeenCalledWith(expect.anything(), kernel, undefined)
    expect(mockProvider.index).toHaveBeenCalledWith(
      expect.objectContaining({
        projectRoot: '/project',
      }),
    )
  })

  it('builds a synthetic default workspace in bootstrap mode', async () => {
    const { mockProvider } = setup('bootstrap')

    const program = makeIndexProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'index', '--path', '/tmp/repo'])

    expect(buildWorkspaceTargets).not.toHaveBeenCalled()
    expect(mockProvider.index).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaces: [
          expect.objectContaining({
            name: 'default',
            codeRoot: '/project',
            repoRoot: '/project',
          }),
        ],
      }),
    )
  })

  it('uses no-config fallback path by passing no overrides', async () => {
    setup('bootstrap')

    const program = makeIndexProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'index'])

    expect(resolveGraphCliContext).toHaveBeenCalledWith({
      configPath: undefined,
      repoPath: undefined,
    })
  })

  it('merges exclude-path values onto bootstrap workspace targets', async () => {
    const { mockProvider } = setup('bootstrap')

    const program = makeIndexProgram()
    await program.parseAsync([
      'node',
      'specd',
      'graph',
      'index',
      '--path',
      '/tmp/repo',
      '--exclude-path',
      'fixtures/',
    ])

    expect(mockProvider.index).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaces: [
          expect.objectContaining({
            excludePaths: expect.arrayContaining(['fixtures/']),
          }),
        ],
      }),
    )
  })

  it('delegates --force recreation to the provider before indexing', async () => {
    const { mockProvider } = setup('bootstrap')

    const program = makeIndexProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'index', '--path', '/tmp/repo', '--force'])

    expect(mockProvider.recreate).toHaveBeenCalledTimes(1)
    expect(mockProvider.index).toHaveBeenCalledTimes(1)
  })

  it('acquires the shared graph index lock before indexing', async () => {
    setup('bootstrap')

    const program = makeIndexProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'index', '--path', '/tmp/repo'])

    expect(acquireGraphIndexLock).toHaveBeenCalledWith(
      expect.objectContaining({ configPath: '/project/.specd/config' }),
    )
  })
})
