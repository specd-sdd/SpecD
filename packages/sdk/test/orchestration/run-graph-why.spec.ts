import { describe, expect, it, vi } from 'vitest'
import { type CodeGraphProvider } from '@specd/code-graph'
import * as sdk from '../../src/index.js'
import { type SdkHostContext } from '../../src/composition/host-context.js'
import { runGraphWhy } from '../../src/orchestration/run-graph-why.js'

const EXPLANATION = {
  input: 'app/src/a.ts',
  projectRelativePath: 'app/src/a.ts',
  verdict: 'indexable' as const,
  owners: ['backend'],
  candidates: [],
  diagnostics: [],
}

function makeProvider(explainPath = vi.fn().mockResolvedValue(EXPLANATION)) {
  return {
    explainPath,
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    isOpen: vi.fn().mockReturnValue(true),
  } as unknown as CodeGraphProvider & {
    explainPath: ReturnType<typeof vi.fn>
    open: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
  }
}

function makeContext(provider: CodeGraphProvider): SdkHostContext {
  return { kernel: {} as never, createGraphProvider: () => provider }
}

describe('runGraphWhy', () => {
  it('opens and closes a transient provider when the caller does not provide one', async () => {
    const provider = makeProvider()
    await runGraphWhy(makeContext(provider), { path: 'app/src/a.ts' })
    expect(provider.open).toHaveBeenCalledTimes(1)
    expect(provider.close).toHaveBeenCalledTimes(1)
  })

  it('does not close a caller-owned provider', async () => {
    const provider = makeProvider()
    await runGraphWhy(makeContext(provider), { path: 'app/src/a.ts', provider })
    expect(provider.open).not.toHaveBeenCalled()
    expect(provider.close).not.toHaveBeenCalled()
  })

  it('returns the provider explanation unchanged, with no added fields', async () => {
    const provider = makeProvider()
    const result = await runGraphWhy(makeContext(provider), { path: 'ws:src/a.ts', provider })
    expect(provider.explainPath).toHaveBeenCalledWith('ws:src/a.ts')
    expect(result).toBe(EXPLANATION)
    expect(Object.keys(result).sort()).toEqual(
      ['candidates', 'diagnostics', 'input', 'owners', 'projectRelativePath', 'verdict'].sort(),
    )
  })

  it('propagates errors unchanged', async () => {
    const failure = Object.assign(new Error('Unknown workspace'), { code: 'UNKNOWN_WORKSPACE' })
    const provider = makeProvider(vi.fn().mockRejectedValue(failure))
    await expect(runGraphWhy(makeContext(provider), { path: 'nope:a.ts', provider })).rejects.toBe(
      failure,
    )
    const transient = makeProvider(vi.fn().mockRejectedValue(failure))
    await expect(runGraphWhy(makeContext(transient), { path: 'nope:a.ts' })).rejects.toBe(failure)
    expect(transient.close).toHaveBeenCalledTimes(1)
  })

  it('is exported from the SDK entry point', () => {
    expect(sdk.runGraphWhy).toBe(runGraphWhy)
  })
})
