import { describe, expect, it } from 'vitest'
import {
  buildPathSubject,
  computePathBase,
  createPathRuleSet,
  isOutsideProject,
  isRootAnchoredPattern,
} from '../../../src/domain/services/project-path-rules.js'

describe('isRootAnchoredPattern', () => {
  it('Given patterns containing a slash, when tested, then they are root-anchored', () => {
    for (const pattern of ['/app/vendors/*', 'app/tmp/', 'src/**', '!/a/b']) {
      expect(isRootAnchoredPattern(pattern), pattern).toBe(true)
    }
  })

  it('Given unanchored patterns, when tested, then they are not root-anchored', () => {
    for (const pattern of ['node_modules/', '*.spec.ts', '**/*.test.*', 'dist/', '!build/']) {
      expect(isRootAnchoredPattern(pattern), pattern).toBe(false)
    }
  })
})

describe('computePathBase', () => {
  it('Given equal roots, then the base is empty', () => {
    expect(computePathBase('/repo', '/repo')).toBe('')
  })

  it('Given a nested code root, then the base is the relative path', () => {
    expect(computePathBase('/repo', '/repo/app')).toBe('app')
    expect(computePathBase('/repo', '/repo/app/webroot')).toBe('app/webroot')
  })

  it('Given a sibling code root, then the base starts with ../', () => {
    expect(computePathBase('/repo', '/shared')).toBe('../shared')
  })
})

describe('isOutsideProject', () => {
  it('detects parent, absolute and drive paths', () => {
    expect(isOutsideProject('..')).toBe(true)
    expect(isOutsideProject('../x')).toBe(true)
    expect(isOutsideProject('/x')).toBe(true)
    expect(isOutsideProject('C:/x')).toBe(true)
    expect(isOutsideProject('')).toBe(false)
    expect(isOutsideProject('app/x')).toBe(false)
  })
})

describe('buildPathSubject', () => {
  it('returns the relative path for an empty or outside base', () => {
    expect(buildPathSubject('', 'x/y')).toBe('x/y')
    expect(buildPathSubject('../shared', 'x/y')).toBe('x/y')
  })

  it('prefixes the base otherwise', () => {
    expect(buildPathSubject('app', 'x/y')).toBe('app/x/y')
  })
})

describe('createPathRuleSet', () => {
  it('Given ordered patterns, when tested, then the last matching rule decides and reports negation', () => {
    const set = createPathRuleSet(['app/vendors/*', '!app/vendors/iccms'], '')
    expect(set.test('app/vendors/other', false)).toEqual({
      ignored: true,
      unignored: false,
      rule: { pattern: 'app/vendors/*', negated: false },
    })
    const negated = set.test('app/vendors/iccms', false)
    expect(negated.ignored).toBe(false)
    expect(negated.unignored).toBe(true)
    expect(negated.rule).toEqual({ pattern: '!app/vendors/iccms', negated: true })
    expect(set.test('src/a.ts', false).rule).toBeNull()
  })

  it('Given a directory subject, when tested, then directory patterns match', () => {
    const set = createPathRuleSet(['app/tmp/'], '')
    expect(set.test('app/tmp', true).ignored).toBe(true)
    expect(set.test('app/tmp', false).ignored).toBe(false)
  })

  it('Given an empty list or empty subject, then the result is empty', () => {
    expect(createPathRuleSet([], '').test('a', false).rule).toBeNull()
    expect(createPathRuleSet(['a'], '').test('', false).rule).toBeNull()
  })

  it('Given an outside base, when built, then anchored patterns are dropped and unanchored kept', () => {
    const set = createPathRuleSet(['shared/gen/**', '*.log'], '../shared')
    expect(set.test('gen/a.ts', false).ignored).toBe(false)
    expect(set.test('gen/a.log', false).ignored).toBe(true)
  })

  it('Given several negations, then the last one that matches is reported', () => {
    const set = createPathRuleSet(['gen/*.ts', '!gen/keep*.ts', '!gen/keep1.ts'], '')
    expect(set.test('gen/keep1.ts', false).rule).toEqual({
      pattern: '!gen/keep1.ts',
      negated: true,
    })
    expect(set.test('gen/keep2.ts', false).rule).toEqual({
      pattern: '!gen/keep*.ts',
      negated: true,
    })
    expect(set.test('gen/other.ts', false).ignored).toBe(true)
  })

  it('Given a directory negation, then the directory reports that negation', () => {
    const set = createPathRuleSet(['app/vendors/*', '!app/vendors/iccms'], '')
    expect(set.test('app/vendors/iccms', true)).toMatchObject({
      unignored: true,
      rule: { pattern: '!app/vendors/iccms', negated: true },
    })
  })

  it('Given an invalid pattern among valid ones, then it is dropped without failing', () => {
    const set = createPathRuleSet(['', '   ', 'build/'], '')
    expect(set.test('build/x.ts', false).ignored).toBe(true)
  })

  it('Given an unignored result, then rule is not enumerable and spreading does not replay it', () => {
    const result = createPathRuleSet(['gen/*.ts', '!gen/keep.ts'], '').test('gen/keep.ts', false)
    expect(Object.keys(result).sort()).toEqual(['ignored', 'unignored'])
    expect({ ...result }).toEqual({ ignored: false, unignored: true })
    expect(result.rule).toEqual({ pattern: '!gen/keep.ts', negated: true })
  })
})
