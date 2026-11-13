import { describe, expect, it } from 'vitest'
import { formatSize } from '../../../src/commands/graph/index-graph.js'

describe('formatSize', () => {
  it('formats bytes below 1024 as N B', () => {
    expect(formatSize(0)).toBe('0 B')
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(1023)).toBe('1023 B')
  })

  it('formats bytes below 1 MiB as Math.ceil(bytes / 1024) KB', () => {
    expect(formatSize(1024)).toBe('1 KB')
    expect(formatSize(1536)).toBe('2 KB')
    expect(formatSize(262144)).toBe('256 KB')
    expect(formatSize(262145)).toBe('257 KB')
    expect(formatSize(1048575)).toBe('1024 KB')
  })

  it('formats bytes at or above 1 MiB as MB with one decimal place', () => {
    expect(formatSize(1048576)).toBe('1.0 MB')
    expect(formatSize(1572864)).toBe('1.5 MB')
    expect(formatSize(10485760)).toBe('10.0 MB')
  })
})
