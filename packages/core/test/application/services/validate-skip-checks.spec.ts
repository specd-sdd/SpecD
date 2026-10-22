import { describe, expect, it } from 'vitest'
import {
  HOOK_CHECK_NOT_SKIPPABLE_REASON,
  validateSkipChecks,
} from '../../../src/application/services/validate-skip-checks.js'
import { CheckRegistry } from '../../../src/domain/services/check-registry.js'
import { ARCHIVE_BINDINGS } from '../../../src/domain/services/check-bindings.js'
import {
  CheckNotSkippableError,
  UnknownCheckError,
} from '../../../src/domain/errors/check-registry-errors.js'
import { type CheckBinding } from '../../../src/domain/services/transition-checks.js'

const registry = new CheckRegistry()

function validate(
  skipChecks: readonly string[],
  bindings: readonly CheckBinding[] = ARCHIVE_BINDINGS,
): readonly string[] {
  return validateSkipChecks({
    skipChecks,
    effectiveBindings: bindings,
    checkRegistry: registry,
  })
}

describe('validateSkipChecks', () => {
  it('returns an empty list for an empty request', () => {
    expect(validate([])).toEqual([])
  })

  it('accepts skippable bound ids and keeps caller order', () => {
    expect(validate(['impl.linksInScope', 'spec.overlap'])).toEqual([
      'impl.linksInScope',
      'spec.overlap',
    ])
  })

  it('collapses duplicates', () => {
    expect(validate(['spec.overlap', 'spec.overlap'])).toEqual(['spec.overlap'])
  })

  it('rejects an id that is neither bound nor registered', () => {
    expect(() => validate(['nope.check'])).toThrow(UnknownCheckError)
  })

  it('treats ids as case-sensitive', () => {
    expect(() => validate(['Spec.Overlap'])).toThrow(UnknownCheckError)
  })

  it('rejects hook checks with the shared reason', () => {
    try {
      validate(['hook.pre'])
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(CheckNotSkippableError)
      expect((error as CheckNotSkippableError).reason).toBe(HOOK_CHECK_NOT_SKIPPABLE_REASON)
    }
  })

  it('rejects non-skippable bound ids', () => {
    for (const id of ['workspace.readOnly', 'impl.filesResolved', 'deps.consistent']) {
      expect(() => validate([id]), id).toThrow(CheckNotSkippableError)
    }
    expect(() => validate(['verification.current'])).toThrow(CheckNotSkippableError)
  })

  it('accepts a registered id that has no binding for this attempt', () => {
    expect(validate(['approval.spec'])).toEqual(['approval.spec'])
  })

  it('accepts an id the schema removed from the effective bindings', () => {
    const withoutOverlap = ARCHIVE_BINDINGS.filter((b) => b.check.id !== 'spec.overlap')
    expect(validate(['spec.overlap'], withoutOverlap)).toEqual(['spec.overlap'])
  })

  it('rejects the whole request on the first invalid id, in input order', () => {
    expect(() => validate(['spec.overlap', 'nope.check', 'workspace.readOnly'])).toThrow(
      UnknownCheckError,
    )
    expect(() => validate(['spec.overlap', 'workspace.readOnly', 'nope.check'])).toThrow(
      CheckNotSkippableError,
    )
  })

  it('recognizes only bound ids when no registry is given', () => {
    expect(() =>
      validateSkipChecks({ skipChecks: ['approval.spec'], effectiveBindings: ARCHIVE_BINDINGS }),
    ).toThrow(UnknownCheckError)
  })
})
