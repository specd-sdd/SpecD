import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@specd/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@specd/sdk')>()),
  openSpecdHost: vi.fn(),
  createSdkContext: vi.fn(),
  createBootstrapGraphConfig: vi.fn(),
  runIndexProjectGraph: vi.fn(),
}))
vi.mock('../src/helpers/cli-context.js', () => ({
  buildCliKernelOptions: vi.fn(() => ({ logger: 'cli' })),
}))

import {
  createBootstrapGraphConfig,
  createSdkContext,
  openSpecdHost,
  runIndexProjectGraph,
} from '@specd/sdk'
import { runGraphIndexTask } from '../src/graph-index-task.js'

afterEach(() => vi.clearAllMocks())

describe('runGraphIndexTask', () => {
  it('reconstructs configured CLI context and indexes once', async () => {
    const host = { dispose: vi.fn(async () => {}) } as never
    vi.mocked(openSpecdHost).mockResolvedValue(host)
    vi.mocked(runIndexProjectGraph).mockResolvedValue({ filesIndexed: 1 } as never)
    const output = await runGraphIndexTask(
      {
        context: { mode: 'configured', configFilePath: '/repo/specd.yaml' },
        index: { force: true },
      },
      vi.fn(),
    )
    expect(openSpecdHost).toHaveBeenCalledWith({
      configPath: '/repo/specd.yaml',
      options: { kernel: { logger: 'cli' }, plugins: false },
    })
    expect(createSdkContext).not.toHaveBeenCalled()
    expect(runIndexProjectGraph).toHaveBeenCalledTimes(1)
    expect(output).toEqual({ filesIndexed: 1 })
  })

  it('disposes the host it opened after a successful run', async () => {
    const dispose = vi.fn(async () => {})
    vi.mocked(openSpecdHost).mockResolvedValue({ dispose } as never)
    vi.mocked(runIndexProjectGraph).mockResolvedValue({ filesIndexed: 1 } as never)

    await runGraphIndexTask(
      {
        context: { mode: 'configured', configFilePath: '/repo/specd.yaml' },
        index: { force: false },
      },
      vi.fn(),
    )

    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('disposes the host it opened when indexing fails', async () => {
    const dispose = vi.fn(async () => {})
    vi.mocked(openSpecdHost).mockResolvedValue({ dispose } as never)
    vi.mocked(runIndexProjectGraph).mockRejectedValue(new Error('index failed'))

    await expect(
      runGraphIndexTask(
        {
          context: { mode: 'configured', configFilePath: '/repo/specd.yaml' },
          index: { force: false },
        },
        vi.fn(),
      ),
    ).rejects.toThrow('index failed')

    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('reconstructs bootstrap context and forwards options/progress unchanged', async () => {
    const config = {} as never
    const host = { dispose: vi.fn(async () => {}) } as never
    const emit = vi.fn()
    vi.mocked(createBootstrapGraphConfig).mockReturnValue(config)
    vi.mocked(createSdkContext).mockResolvedValue(host)
    vi.mocked(runIndexProjectGraph).mockResolvedValue({ filesIndexed: 2 } as never)
    await runGraphIndexTask(
      {
        context: { mode: 'bootstrap', projectRoot: '/repo', vcsRoot: '/repo/.git' },
        index: { force: false, excludePaths: ['a'] },
      },
      emit,
    )
    expect(createBootstrapGraphConfig).toHaveBeenCalledWith({
      projectRoot: '/repo',
      vcsRoot: '/repo/.git',
    })
    expect(openSpecdHost).not.toHaveBeenCalled()
    expect(createSdkContext).toHaveBeenCalledWith(config, {
      kernel: { logger: 'cli' },
      plugins: false,
    })
    expect(runIndexProjectGraph).toHaveBeenCalledWith(
      host,
      expect.objectContaining({
        force: false,
        excludePaths: ['a'],
        onProgress: expect.any(Function),
      }),
    )
    const progress = vi.mocked(runIndexProjectGraph).mock.calls[0]?.[1]?.onProgress
    progress?.(25, 'parse')
    expect(emit).toHaveBeenCalledWith({ percent: 25, phase: 'parse' })
  })

  it('keeps orchestration on the SDK boundary', () => {
    const source = readFileSync(new URL('../src/graph-index-task.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(
      /from '@specd\/code-graph'|from 'commander'|from 'node:child_process'|from .*index-lock/,
    )
  })
})
