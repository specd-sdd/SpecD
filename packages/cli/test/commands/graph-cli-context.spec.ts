import { describe, it, expect, vi, afterEach } from 'vitest'
import { makeMockConfig } from './helpers.js'

vi.mock('@specd/sdk', async () => {
  const actual = await vi.importActual<typeof import('@specd/sdk')>('@specd/sdk')
  return {
    ...actual,
    createVcsAdapter: vi.fn(),
    withOpenGraphProvider: vi.fn(async (_ctx, fn): Promise<void> => {
      await fn({} as CodeGraphProvider)
    }),
    createSdkContext: vi.fn(),
  }
})

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
  buildCliKernelOptions: vi.fn(() => ({})),
}))

vi.mock('../../src/load-config.js', () => ({
  resolveConfigPath: vi.fn(),
}))

import {
  withOpenGraphProvider,
  createSdkContext,
  createVcsAdapter,
  type CodeGraphProvider,
} from '@specd/sdk'
import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { resolveConfigPath } from '../../src/load-config.js'
import { withProvider } from '../../src/commands/graph/with-provider.js'
import { resolveGraphCliContext } from '../../src/commands/graph/resolve-graph-cli-context.js'

describe('graph CLI context', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('withProvider delegates to withOpenGraphProvider', async () => {
    const config = makeMockConfig()
    await withProvider(config, 'text', async () => {})

    expect(withOpenGraphProvider).toHaveBeenCalled()
    expect(process.listenerCount('SIGINT')).toBe(0)
    expect(process.listenerCount('SIGTERM')).toBe(0)
  })

  it('creates bootstrap context with a resolved VCS root', async () => {
    vi.mocked(createVcsAdapter).mockResolvedValue({
      rootDir: vi.fn().mockReturnValue('/repository'),
    } as never)

    await expect(
      resolveGraphCliContext({ repoPath: '/repository/packages/cli' }),
    ).resolves.toMatchObject({
      mode: 'bootstrap',
      projectRoot: '/repository',
      vcsRoot: '/repository',
      configFilePath: null,
      kernel: null,
    })
  })

  it('rejects no-config bootstrap outside VCS', async () => {
    vi.mocked(resolveConfigPath).mockResolvedValue(null)
    vi.mocked(createVcsAdapter).mockRejectedValue(new Error('not a repository'))

    await expect(resolveGraphCliContext()).rejects.toThrow(
      'Graph bootstrap mode requires a path inside a VCS repository or a discovered specd.yaml',
    )
  })

  it('resolves an explicit config outside VCS without bootstrap validation', async () => {
    const config = makeMockConfig({ projectRoot: '/non-vcs/project' })
    const kernel = {} as never
    vi.mocked(resolveCliContext).mockResolvedValue({
      config,
      configFilePath: '/non-vcs/project/specd.yaml',
      kernel,
    })
    vi.mocked(createVcsAdapter).mockRejectedValue(new Error('not a repository'))

    await expect(
      resolveGraphCliContext({ configPath: '/non-vcs/project/specd.yaml' }),
    ).resolves.toEqual({
      mode: 'configured',
      config,
      configFilePath: '/non-vcs/project/specd.yaml',
      kernel,
      projectRoot: '/non-vcs/project',
      vcsRoot: null,
    })
    expect(resolveCliContext).toHaveBeenCalledWith({ configPath: '/non-vcs/project/specd.yaml' })
    expect(createVcsAdapter).not.toHaveBeenCalled()
  })

  it('resolves discovered config outside VCS without bootstrap validation', async () => {
    const config = makeMockConfig({ projectRoot: '/non-vcs/discovered-project' })
    const kernel = {} as never
    vi.mocked(resolveConfigPath).mockResolvedValue('/non-vcs/discovered-project/specd.yaml')
    vi.mocked(resolveCliContext).mockResolvedValue({
      config,
      configFilePath: '/non-vcs/discovered-project/specd.yaml',
      kernel,
    })
    vi.mocked(createVcsAdapter).mockRejectedValue(new Error('not a repository'))

    await expect(resolveGraphCliContext()).resolves.toEqual({
      mode: 'configured',
      config,
      configFilePath: '/non-vcs/discovered-project/specd.yaml',
      kernel,
      projectRoot: '/non-vcs/discovered-project',
      vcsRoot: null,
    })
    expect(resolveConfigPath).toHaveBeenCalledOnce()
    expect(resolveCliContext).toHaveBeenCalledWith()
    expect(createVcsAdapter).not.toHaveBeenCalled()
  })
})
