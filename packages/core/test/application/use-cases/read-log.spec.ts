import { describe, expect, it } from 'vitest'
import { ReadLog } from '../../../src/application/use-cases/read-log.js'
import type { LogFormatter } from '../../../src/application/ports/log-formatter.port.js'
import type { LogEntry } from '../../../src/application/ports/logger.port.js'
import { LogRingBuffer } from '../../../src/infrastructure/logging/log-ring-buffer.js'
import { PinoPrettyLogFormatter } from '../../../src/infrastructure/logging/pino-pretty-log-formatter.js'

function entry(message: string, level: LogEntry['level'] = 'info'): LogEntry {
  return {
    timestamp: new Date('2026-05-25T12:00:00.000Z'),
    level,
    message,
    context: { source: 'test' },
  }
}

describe('ReadLog', () => {
  const formatter = new PinoPrettyLogFormatter({ colorize: false })

  it('returns newest-first structured entries', () => {
    const ring = new LogRingBuffer(10)
    ring.push(entry('first'))
    ring.push(entry('second', 'warn'))
    const result = new ReadLog(ring, formatter).execute({ limit: 2 })
    expect(result.entries).toHaveLength(2)
    expect(result.entries?.[0]?.message).toBe('second')
    expect(result.entries?.[1]?.message).toBe('first')
  })

  it('returns prettier lines when requested', () => {
    const ring = new LogRingBuffer(5)
    ring.push(entry('hello'))
    const result = new ReadLog(ring, formatter).execute({ prettier: true })
    expect(result.lines?.[0]).toContain('hello')
    expect(result.entries).toBeUndefined()
  })

  it('uses injected LogFormatter for pretty output', () => {
    const ring = new LogRingBuffer(5)
    ring.push(entry('x'))
    const stub: LogFormatter = {
      format: () => 'fmt:x',
    }
    const result = new ReadLog(ring, stub).execute({ prettier: true })
    expect(result.lines).toEqual(['fmt:x'])
  })

  it('evicts oldest entries when over capacity', () => {
    const ring = new LogRingBuffer(2)
    ring.push(entry('a'))
    ring.push(entry('b'))
    ring.push(entry('c'))
    const result = new ReadLog(ring, formatter).execute({ limit: 10 })
    expect(result.entries?.map((e) => e.message)).toEqual(['c', 'b'])
  })
})
