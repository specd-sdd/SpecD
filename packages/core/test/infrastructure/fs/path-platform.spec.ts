import { describe, expect, it, vi } from 'vitest'
import {
  isPathInside,
  normalizeNewlines,
  normalizeVcsRoot,
  retryOnLock,
  toPortablePath,
} from '../../../src/infrastructure/fs/path-platform.js'

describe('path platform helpers', () => {
  it('uppercases a Windows drive letter without calling realpath', () => {
    expect(normalizeVcsRoot('  c:/repo  ')).toBe('C:\\repo')
  })

  it('treats drive-letter case as inside and a longer prefix as outside', () => {
    expect(isPathInside('C:/repo', 'c:/repo/specd.yaml')).toBe(true)
    expect(isPathInside('C:/repo', 'C:/repository')).toBe(false)
    expect(isPathInside('C:/work/app', 'C:/work/application')).toBe(false)
  })

  it('converts separators without collapsing parent segments', () => {
    expect(toPortablePath('src\\..\\secret')).toBe('src/../secret')
  })

  it('normalizes CRLF and lone CR to LF', () => {
    expect(normalizeNewlines('a\r\nb\rc')).toBe('a\nb\nc')
  })

  it('surfaces the original lock error after five attempts', async () => {
    vi.useFakeTimers()
    const error = Object.assign(new Error('busy'), { code: 'EBUSY' })
    const operation = vi.fn(() => Promise.reject(error))
    const pending = retryOnLock(operation)
    const assertion = expect(pending).rejects.toBe(error)
    await vi.runAllTimersAsync()
    await assertion
    expect(operation).toHaveBeenCalledTimes(5)
    vi.useRealTimers()
  })
})
