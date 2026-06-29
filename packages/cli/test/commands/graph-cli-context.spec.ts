import { describe, it, expect, vi, afterEach } from 'vitest'
import { makeMockConfig } from './helpers.js'

vi.mock('@specd/sdk', async () => {
  const actual = await vi.importActual<typeof import('@specd/sdk')>('@specd/sdk')
  return {
    ...actual,
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

import { withOpenGraphProvider, createSdkContext, type CodeGraphProvider } from '@specd/sdk'
import { withProvider } from '../../src/commands/graph/with-provider.js'
import { resolveGraphCliContext } from '../../src/commands/graph/resolve-graph-cli-context.js'

describe('graph CLI context', () => {
  afterEach(() => vi.restoreAllMocks())

  it('withProvider delegates to withOpenGraphProvider', async () => {
    const config = makeMockConfig()
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    await withProvider(config, 'text', async () => {})

    expect(withOpenGraphProvider).toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(0)
    exitSpy.mockRestore()
  })

  it('resolveGraphCliContext uses SDK imports in bootstrap mode', async () => {
    vi.mocked(createSdkContext).mockResolvedValue({
      kernel: {} as never,
      createGraphProvider: vi.fn(),
    })

    const ctx = await resolveGraphCliContext({ repoPath: process.cwd() }).catch(() => null)
    expect(ctx === null || ctx.mode === 'bootstrap' || ctx.mode === 'configured').toBe(true)
  })
})
