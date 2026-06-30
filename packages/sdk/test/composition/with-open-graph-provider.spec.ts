import { describe, expect, it, vi } from 'vitest'
import { type SdkHostContext } from '../../src/composition/host-context.js'
import { withOpenGraphProvider } from '../../src/composition/with-open-graph-provider.js'

function makeProvider(): {
  open: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
} {
  return {
    open: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  }
}

function makeContext(provider: ReturnType<typeof makeProvider>): SdkHostContext {
  return {
    kernel: {} as SdkHostContext['kernel'],
    createGraphProvider: () => provider as never,
  }
}

describe('withOpenGraphProvider', () => {
  it('opens before fn and closes after success', async () => {
    const provider = makeProvider()
    const order: string[] = []
    provider.open.mockImplementation(async () => {
      order.push('open')
    })
    provider.close.mockImplementation(async () => {
      order.push('close')
    })

    const result = await withOpenGraphProvider(makeContext(provider), async () => {
      order.push('fn')
      return 'ok'
    })

    expect(result).toBe('ok')
    expect(order).toEqual(['open', 'fn', 'close'])
  })

  it('preserves the callback error when close fails during cleanup', async () => {
    const provider = makeProvider()
    const fnError = new Error('fn failed')
    provider.close.mockRejectedValue(new Error('close failed'))

    await expect(
      withOpenGraphProvider(makeContext(provider), async () => {
        throw fnError
      }),
    ).rejects.toBe(fnError)
    expect(provider.close).toHaveBeenCalled()
  })

  it('invokes beforeOpen before open', async () => {
    const provider = makeProvider()
    const order: string[] = []
    const beforeOpen = vi.fn(async () => {
      order.push('beforeOpen')
    })
    provider.open.mockImplementation(async () => {
      order.push('open')
    })

    await withOpenGraphProvider(
      makeContext(provider),
      async () => {
        order.push('fn')
      },
      { beforeOpen },
    )

    expect(order).toEqual(['beforeOpen', 'open', 'fn'])
  })

  it('does not call process.exit', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const provider = makeProvider()
    await withOpenGraphProvider(makeContext(provider), async () => 'ok')
    expect(exitSpy).not.toHaveBeenCalled()
    exitSpy.mockRestore()
  })
})
