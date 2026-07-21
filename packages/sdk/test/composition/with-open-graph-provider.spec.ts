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

  it('runs afterClose after a successful operation', async () => {
    const provider = makeProvider()
    const order: string[] = []
    const afterClose = vi.fn(async () => {
      order.push('afterClose')
    })
    provider.open.mockImplementation(async () => {
      order.push('open')
    })
    provider.close.mockImplementation(async () => {
      order.push('close')
    })

    await withOpenGraphProvider(
      makeContext(provider),
      async () => {
        order.push('fn')
      },
      { afterClose },
    )

    expect(order).toEqual(['open', 'fn', 'close', 'afterClose'])
  })

  it('runs afterClose exactly once when it fails after a successful operation', async () => {
    const provider = makeProvider()
    const afterCloseError = new Error('afterClose failed')
    const afterClose = vi.fn().mockRejectedValue(afterCloseError)

    await expect(
      withOpenGraphProvider(makeContext(provider), async () => 'ok', { afterClose }),
    ).rejects.toBe(afterCloseError)

    expect(provider.close).toHaveBeenCalledOnce()
    expect(afterClose).toHaveBeenCalledOnce()
  })

  it('runs afterClose when provider close fails on a successful operation', async () => {
    const provider = makeProvider()
    const closeError = new Error('close failed')
    const afterClose = vi.fn(async () => undefined)
    provider.close.mockRejectedValue(closeError)

    await expect(
      withOpenGraphProvider(makeContext(provider), async () => 'ok', { afterClose }),
    ).rejects.toBe(closeError)

    expect(afterClose).toHaveBeenCalledOnce()
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

  it('runs close and afterClose when open fails after beforeOpen', async () => {
    const provider = makeProvider()
    const order: string[] = []
    const openError = new Error('open failed')
    const beforeOpen = vi.fn(async () => {
      order.push('beforeOpen')
    })
    const afterClose = vi.fn(async () => {
      order.push('afterClose')
    })
    provider.open.mockImplementation(async () => {
      order.push('open')
      throw openError
    })
    provider.close.mockImplementation(async () => {
      order.push('close')
    })

    await expect(
      withOpenGraphProvider(makeContext(provider), async () => 'ok', { beforeOpen, afterClose }),
    ).rejects.toBe(openError)

    expect(order).toEqual(['beforeOpen', 'open', 'close', 'afterClose'])
  })

  it('runs close and afterClose when open fails without beforeOpen', async () => {
    const provider = makeProvider()
    const openError = new Error('open failed')
    const afterClose = vi.fn(async () => undefined)
    provider.open.mockRejectedValue(openError)

    await expect(
      withOpenGraphProvider(makeContext(provider), async () => 'ok', { afterClose }),
    ).rejects.toBe(openError)
    expect(provider.close).toHaveBeenCalledOnce()
    expect(afterClose).toHaveBeenCalledWith(provider)
  })

  it('does not call process.exit', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const provider = makeProvider()
    await withOpenGraphProvider(makeContext(provider), async () => 'ok')
    expect(exitSpy).not.toHaveBeenCalled()
    exitSpy.mockRestore()
  })
})
