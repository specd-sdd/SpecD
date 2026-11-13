import { describe, expect, it, vi } from 'vitest'
import {
  createAnnouncer,
  ACTIVITY_MIN_INTERVAL_MS,
} from '../../../src/infrastructure/isolated-index-worker/child-announcer.js'
import {
  GRAPH_INDEX_PROTOCOL,
  ACTIVITY_ITEM_MAX_CHARS,
  type ChildMessage,
} from '../../../src/infrastructure/isolated-index-worker/protocol.js'

describe('createAnnouncer', () => {
  it('throttles ordinary announcements to at most four per second', () => {
    const sent: ChildMessage[] = []
    let currentTime = 1000
    const announce = createAnnouncer((msg) => sent.push(msg), {
      now: () => currentTime,
    })

    // 1st announcement at t=1000 -> sent
    announce('file-1.ts')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toEqual({
      protocol: GRAPH_INDEX_PROTOCOL,
      type: 'activity',
      item: 'file-1.ts',
    })

    // Announcement at t=1100 (<250ms interval) -> dropped
    currentTime = 1100
    announce('file-2.ts')
    expect(sent).toHaveLength(1)

    // Announcement at t=1249 (<250ms interval) -> dropped
    currentTime = 1249
    announce('file-3.ts')
    expect(sent).toHaveLength(1)

    // Announcement at t=1250 (>=250ms interval) -> sent
    currentTime = 1250
    announce('file-4.ts')
    expect(sent).toHaveLength(2)
    expect(sent[1]).toEqual({
      protocol: GRAPH_INDEX_PROTOCOL,
      type: 'activity',
      item: 'file-4.ts',
    })
  })

  it('always sends mandatory announcements and updates interval timestamp', () => {
    const sent: ChildMessage[] = []
    let currentTime = 1000
    const announce = createAnnouncer((msg) => sent.push(msg), {
      now: () => currentTime,
    })

    // Ordinary at t=1000 -> sent
    announce('normal-1.ts')
    expect(sent).toHaveLength(1)

    // Mandatory at t=1050 -> sent despite being within 250ms
    currentTime = 1050
    announce('large-1.ts', { mandatory: true })
    expect(sent).toHaveLength(2)
    expect(sent[1]).toEqual({
      protocol: GRAPH_INDEX_PROTOCOL,
      type: 'activity',
      item: 'large-1.ts',
    })

    // Ordinary at t=1150 -> dropped because it's only 100ms after mandatory
    currentTime = 1150
    announce('normal-2.ts')
    expect(sent).toHaveLength(2)

    // Mandatory at t=1200 -> sent
    currentTime = 1200
    announce('large-2.ts', { mandatory: true })
    expect(sent).toHaveLength(3)

    // Ordinary at t=1450 (250ms after large-2.ts) -> sent
    currentTime = 1450
    announce('normal-3.ts')
    expect(sent).toHaveLength(4)
  })

  it('ignores empty item strings', () => {
    const sent: ChildMessage[] = []
    const announce = createAnnouncer((msg) => sent.push(msg))
    announce('')
    announce('', { mandatory: true })
    expect(sent).toHaveLength(0)
  })

  it('truncates items exceeding 4096 characters', () => {
    const sent: ChildMessage[] = []
    const announce = createAnnouncer((msg) => sent.push(msg))
    const longItem = 'x'.repeat(5000)
    announce(longItem)

    expect(sent).toHaveLength(1)
    const item = (sent[0] as { item: string }).item
    expect(item).toHaveLength(ACTIVITY_ITEM_MAX_CHARS)
    expect(item).toBe('x'.repeat(ACTIVITY_ITEM_MAX_CHARS))
  })

  it('ignores announcements once the terminal message has been sent', () => {
    const sent: ChildMessage[] = []
    let isTerminal = false
    const announce = createAnnouncer((msg) => sent.push(msg), {
      isTerminalSent: () => isTerminal,
    })

    announce('first.ts')
    expect(sent).toHaveLength(1)

    isTerminal = true
    announce('second.ts', { mandatory: true })
    expect(sent).toHaveLength(1)
  })

  it('ignores announcements when disconnected', () => {
    const sent: ChildMessage[] = []
    let connected = false
    const announce = createAnnouncer((msg) => sent.push(msg), {
      isConnected: () => connected,
    })

    announce('first.ts', { mandatory: true })
    expect(sent).toHaveLength(0)

    connected = true
    announce('second.ts', { mandatory: true })
    expect(sent).toHaveLength(1)
  })

  it('swallows synchronous exceptions from send', () => {
    const throwingSend = vi.fn(() => {
      throw new Error('IPC socket write error')
    })
    const announce = createAnnouncer(throwingSend)
    expect(() => {
      announce('test.ts')
    }).not.toThrow()
  })
})
