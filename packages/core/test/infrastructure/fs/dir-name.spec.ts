import { describe, expect, it } from 'vitest'
import { formatDirTimestamp, changeDirName } from '../../../src/infrastructure/fs/dir-name.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('formatDirTimestamp', () => {
  it('formats a UTC date as YYYYMMDD-HHmmss', () => {
    // 2025-03-15T09:05:07Z
    const date = new Date(Date.UTC(2025, 2, 15, 9, 5, 7))
    expect(formatDirTimestamp(date)).toBe('20250315-090507')
  })

  it('zero-pads single-digit segments', () => {
    // 2025-01-02T03:04:05Z
    const date = new Date(Date.UTC(2025, 0, 2, 3, 4, 5))
    expect(formatDirTimestamp(date)).toBe('20250102-030405')
  })

  it('handles midnight correctly', () => {
    const date = new Date(Date.UTC(2025, 11, 31, 0, 0, 0))
    expect(formatDirTimestamp(date)).toBe('20251231-000000')
  })

  it('handles end-of-day correctly', () => {
    const date = new Date(Date.UTC(2025, 5, 10, 23, 59, 59))
    expect(formatDirTimestamp(date)).toBe('20250610-235959')
  })
})

describe('changeDirName', () => {
  it('combines timestamp prefix with change name', () => {
    const date = new Date(Date.UTC(2025, 2, 15, 9, 5, 7))
    expect(changeDirName('add-auth-flow', date)).toBe('20250315-090507-add-auth-flow')
  })

  it('preserves the change name as-is', () => {
    const date = new Date(Date.UTC(2025, 0, 1, 0, 0, 0))
    expect(changeDirName('my-change', date)).toBe('20250101-000000-my-change')
  })
})
