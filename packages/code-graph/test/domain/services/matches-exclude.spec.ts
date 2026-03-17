import { describe, it, expect } from 'vitest'
import { matchesExclude } from '../../../src/domain/services/matches-exclude.js'

describe('matchesExclude', () => {
  it('returns false when no exclusions are provided', () => {
    expect(matchesExclude('core:src/foo.ts')).toBe(false)
    expect(matchesExclude('core:src/foo.ts', undefined, undefined)).toBe(false)
    expect(matchesExclude('core:src/foo.ts', [], [])).toBe(false)
  })

  it('excludes by workspace name', () => {
    expect(matchesExclude('cli:src/main.ts', undefined, ['cli'])).toBe(true)
    expect(matchesExclude('core:src/main.ts', undefined, ['cli'])).toBe(false)
  })

  it('excludes by multiple workspaces', () => {
    expect(matchesExclude('cli:src/main.ts', undefined, ['cli', 'mcp'])).toBe(true)
    expect(matchesExclude('mcp:src/server.ts', undefined, ['cli', 'mcp'])).toBe(true)
    expect(matchesExclude('core:src/foo.ts', undefined, ['cli', 'mcp'])).toBe(false)
  })

  it('excludes by glob pattern with * wildcard', () => {
    expect(matchesExclude('core:test/foo.spec.ts', ['*:test/*'])).toBe(true)
    expect(matchesExclude('core:src/foo.ts', ['*:test/*'])).toBe(false)
  })

  it('excludes by file extension glob', () => {
    expect(matchesExclude('core:src/foo.spec.ts', ['*.spec.ts'])).toBe(true)
    expect(matchesExclude('core:src/foo.ts', ['*.spec.ts'])).toBe(false)
  })

  it('glob matching is case-insensitive', () => {
    expect(matchesExclude('core:Test/Foo.ts', ['*:test/*'])).toBe(true)
  })

  it('excludes when any pattern matches', () => {
    expect(matchesExclude('core:test/foo.spec.ts', ['*:test/*', '*.spec.ts'])).toBe(true)
    expect(matchesExclude('core:src/foo.spec.ts', ['*:test/*', '*.spec.ts'])).toBe(true)
    expect(matchesExclude('core:src/foo.ts', ['*:test/*', '*.spec.ts'])).toBe(false)
  })

  it('combines workspace and path exclusions', () => {
    // Excluded by workspace
    expect(matchesExclude('cli:src/main.ts', ['*:test/*'], ['cli'])).toBe(true)
    // Excluded by path
    expect(matchesExclude('core:test/foo.ts', ['*:test/*'], ['cli'])).toBe(true)
    // Not excluded by either
    expect(matchesExclude('core:src/foo.ts', ['*:test/*'], ['cli'])).toBe(false)
  })

  it('handles paths without colons (single-segment workspace)', () => {
    expect(matchesExclude('standalone', undefined, ['standalone'])).toBe(true)
    expect(matchesExclude('standalone', undefined, ['other'])).toBe(false)
  })
})
