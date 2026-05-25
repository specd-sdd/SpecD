import { describe, expect, it, vi } from 'vitest'
import type { ChangeDetailDto } from '@specd/client'

describe('usePatchChange (port contract)', () => {
  it('patchChange updates description on memory adapter', async () => {
    const { MemorySpecdDataAdapter } = await import('@specd/client')
    const port = new MemorySpecdDataAdapter()
    const detail = await port.patchChange('demo-change', { description: 'updated in test' })
    expect(detail.description).toBe('updated in test')
    const loaded = await port.getChange('demo-change')
    expect(loaded.description).toBe('updated in test')
  })

  it('onPatched callback receives ChangeDetailDto', async () => {
    const { MemorySpecdDataAdapter } = await import('@specd/client')
    const port = new MemorySpecdDataAdapter()
    const onPatched = vi.fn<(detail: ChangeDetailDto) => void>()
    const detail = await port.patchChange('demo-change', { description: 'cb test' })
    onPatched(detail)
    expect(onPatched).toHaveBeenCalledWith(expect.objectContaining({ description: 'cb test' }))
  })
})
