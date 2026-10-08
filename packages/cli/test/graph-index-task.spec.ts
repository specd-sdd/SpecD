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
  it('reconstructs forced CLI context and indexes once', async () => {
    const host = {} as never
    vi.mocked(openSpecdHost).mockResolvedValue(host)
    vi.mocked(runIndexProjectGraph).mockResolvedValue({ filesIndexed: 1 } as never)
    const output = await runGraphIndexTask(
      {
        context: { mode: 'forced', configPath: '/repo/specd.yaml' },
        index: { force: true },
      },
      vi.fn(),
    )
    expect(openSpecdHost).toHaveBeenCalledWith({
      configPath: '/repo/specd.yaml',
      options: { kernel: { logger: 'cli' } },
    })
    expect(createBootstrapGraphConfig).not.toHaveBeenCalled()
    expect(createSdkContext).not.toHaveBeenCalled()
    expect(runIndexProjectGraph).toHaveBeenCalledTimes(1)
    expect(output).toEqual({ filesIndexed: 1 })
  })

  it('reconstructs discovered CLI context from its parent start directory', async () => {
    const host = {} as never
    vi.mocked(openSpecdHost).mockResolvedValue(host)
    vi.mocked(runIndexProjectGraph).mockResolvedValue({ filesIndexed: 1 } as never)
    await runGraphIndexTask(
      {
        context: { mode: 'discovered', startDir: '/repo/packages/app' },
        index: { force: false },
      },
      vi.fn(),
    )
    expect(openSpecdHost).toHaveBeenCalledTimes(1)
    expect(openSpecdHost).toHaveBeenCalledWith({
      startDir: '/repo/packages/app',
      options: { kernel: { logger: 'cli' } },
    })
    expect(createSdkContext).not.toHaveBeenCalled()
    expect(runIndexProjectGraph).toHaveBeenCalledTimes(1)
  })

  it('propagates discovery failure without substituting bootstrap', async () => {
    const failure = new Error('config disappeared')
    vi.mocked(openSpecdHost).mockRejectedValue(failure)
    await expect(
      runGraphIndexTask(
        {
          context: { mode: 'discovered', startDir: '/repo/packages/app' },
          index: { force: false },
        },
        vi.fn(),
      ),
    ).rejects.toBe(failure)
    expect(createBootstrapGraphConfig).not.toHaveBeenCalled()
    expect(createSdkContext).not.toHaveBeenCalled()
    expect(runIndexProjectGraph).not.toHaveBeenCalled()
  })

  it('reconstructs bootstrap context and forwards options/progress unchanged', async () => {
    const config = {} as never
    const host = {} as never
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
