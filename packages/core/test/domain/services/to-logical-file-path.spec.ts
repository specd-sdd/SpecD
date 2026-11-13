import { describe, it, expect } from 'vitest'
import { toLogicalFilePath } from '../../../src/domain/services/to-logical-file-path.js'

describe('toLogicalFilePath', () => {
  it('converts backslashes to forward slashes on win32', () => {
    expect(toLogicalFilePath('docs\\a\\b.md', 'win32')).toBe('docs/a/b.md')
  })

  it.each(['linux', 'darwin'] as const)('keeps backslashes unchanged on %s', (platform) => {
    expect(toLogicalFilePath('back\\slash.md', platform)).toBe('back\\slash.md')
  })

  it('leaves commas and spaces untouched on every platform', () => {
    const name = 'docs\\Análisis, dependencias y más.md'
    expect(toLogicalFilePath(name, 'win32')).toBe('docs/Análisis, dependencias y más.md')
    expect(toLogicalFilePath('docs/Análisis, dependencias.md', 'linux')).toBe(
      'docs/Análisis, dependencias.md',
    )
  })

  it('defaults to the host platform', () => {
    expect(toLogicalFilePath('a\\b')).toBe(process.platform === 'win32' ? 'a/b' : 'a\\b')
  })
})
