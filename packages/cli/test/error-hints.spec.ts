import { describe, it, expect } from 'vitest'
import {
  CLI_ERROR_HINTS,
  CLI_ERROR_HINT_RULES,
  resolveCliErrorHint,
  skippableCheckHint,
  type CliCommandId,
  type CliHintId,
} from '../src/error-hints.js'

describe('resolveCliErrorHint', () => {
  it('routes DEPENDS_ON_OVERWRITE by command', () => {
    expect(
      resolveCliErrorHint('DEPENDS_ON_OVERWRITE', { command: 'specs.generate-metadata' }),
    ).toContain('--force')

    const validateHint = resolveCliErrorHint('DEPENDS_ON_OVERWRITE', { command: 'specs.validate' })
    expect(validateHint).toContain('specd specs deps')
    expect(validateHint).toContain('specd specs generate-metadata --force')
    expect(validateHint).not.toContain('specs validate --force')

    expect(resolveCliErrorHint('DEPENDS_ON_OVERWRITE', { command: 'change.transition' })).toContain(
      'specd specs deps',
    )
  })

  it('routes IMPLEMENTATION_DETECTED for change.draft and change.discard only', () => {
    expect(resolveCliErrorHint('IMPLEMENTATION_DETECTED', { command: 'change.draft' })).toContain(
      '--force',
    )
    expect(resolveCliErrorHint('IMPLEMENTATION_DETECTED', { command: 'change.discard' })).toContain(
      '--force',
    )
    expect(
      resolveCliErrorHint('IMPLEMENTATION_DETECTED', { command: 'change.archive' }),
    ).toBeUndefined()
  })

  it('routes INVALIDATE_REQUIRES_FORCE and INVALID_INPUT for change.invalidate', () => {
    expect(
      resolveCliErrorHint('INVALIDATE_REQUIRES_FORCE', { command: 'change.invalidate' }),
    ).toContain('--force')
    expect(resolveCliErrorHint('INVALID_INPUT', { command: 'change.invalidate' })).toContain(
      '--target',
    )
    expect(
      resolveCliErrorHint('INVALIDATE_REQUIRES_FORCE', { command: 'change.transition' }),
    ).toBeUndefined()
  })

  it('routes HAPPY_PATH_NEXT_UNAVAILABLE for change.transition only', () => {
    const hint = resolveCliErrorHint('HAPPY_PATH_NEXT_UNAVAILABLE', {
      command: 'change.transition',
    })
    expect(hint).toContain('<step>')
    expect(hint).toContain('--next')
    expect(hint).not.toContain('--to')
    expect(
      resolveCliErrorHint('HAPPY_PATH_NEXT_UNAVAILABLE', { command: 'change.archive' }),
    ).toBeUndefined()
  })

  it('routes SPEC_NOT_IN_CHANGE for any command using specId metadata', () => {
    expect(
      resolveCliErrorHint(
        'SPEC_NOT_IN_CHANGE',
        { command: 'change.transition' },
        { specId: 'core:auth' },
      ),
    ).toBe('Run: specd specs show core:auth to view the canonical spec')

    expect(resolveCliErrorHint('SPEC_NOT_IN_CHANGE', {}, {})).toBe(
      'Run: specd specs show <spec-path> to view the canonical spec',
    )
  })

  it('routes INVALID_SPEC_LOCK only when lockRepairHint or specs.deps and fieldPath is under dependsOn', () => {
    expect(
      resolveCliErrorHint(
        'INVALID_SPEC_LOCK',
        { command: 'specs.deps' },
        { fieldPath: 'dependsOn.0' },
      ),
    ).toContain('specd specs deps')

    expect(
      resolveCliErrorHint(
        'INVALID_SPEC_LOCK',
        { lockRepairHint: true },
        { fieldPath: 'dependsOn' },
      ),
    ).toContain('specd specs deps')

    expect(
      resolveCliErrorHint(
        'INVALID_SPEC_LOCK',
        { command: 'specs.deps' },
        { fieldPath: 'fingerprint' },
      ),
    ).toBeUndefined()

    expect(
      resolveCliErrorHint(
        'INVALID_SPEC_LOCK',
        { command: 'specs.validate' },
        { fieldPath: 'dependsOn' },
      ),
    ).toBeUndefined()
  })

  it('routes INVALID_INPUT for change.deps', () => {
    const hint = resolveCliErrorHint('INVALID_INPUT', { command: 'change.deps' })
    expect(hint).toContain('--add')
    expect(hint).toContain('--remove')
    expect(hint).toContain('--set')
    expect(hint).toContain('--clear')
  })

  it('has no check-specific hint for impl.linksInScope; the generic skippable hint applies', () => {
    for (const command of ['change.transition', 'change.archive'] satisfies CliCommandId[]) {
      expect(
        resolveCliErrorHint('impl.linksInScope', { command }, { isSkippable: true }),
      ).toBeUndefined()
    }
    expect(skippableCheckHint('impl.linksInScope')).toBe(
      'Retry with --skip-checks impl.linksInScope if an exception is granted',
    )
    expect(skippableCheckHint('@plugin.check')).toBe(
      'Retry with --skip-checks @plugin.check if an exception is granted',
    )
    expect(skippableCheckHint('impl.linksInScope')).not.toContain('--allow-out-of-scope')
  })

  it('routes VERIFICATION_STALE to the verification start command for the change', () => {
    expect(resolveCliErrorHint('VERIFICATION_STALE', {}, { changeName: 'checkout-retry' })).toBe(
      'Renew the verification evidence with: specd changes verification start checkout-retry',
    )
    const fallback = resolveCliErrorHint('VERIFICATION_STALE', {}, {})
    expect(fallback).toBeDefined()
    expect(fallback).not.toContain('<name>')
  })

  it('routes CHECK_NOT_SKIPPABLE for hook.* checks on transition/archive to --skip-hooks', () => {
    for (const command of ['change.transition', 'change.archive'] satisfies CliCommandId[]) {
      const hint = resolveCliErrorHint('CHECK_NOT_SKIPPABLE', { command }, { checkId: 'hook.pre' })
      expect(hint).toContain('--skip-hooks')
      expect(
        resolveCliErrorHint('CHECK_NOT_SKIPPABLE', { command }, { checkId: 'spec.overlap' }),
      ).toBeUndefined()
    }
  })

  it('returns undefined for unknown error codes', () => {
    expect(resolveCliErrorHint('UNKNOWN_CODE', { command: 'change.transition' })).toBeUndefined()
  })
})

describe('SPEC_NOT_INITIALIZED and hint catalog', () => {
  it('routes SPEC_NOT_INITIALIZED to specd specs init for any command', () => {
    expect(
      resolveCliErrorHint(
        'SPEC_NOT_INITIALIZED',
        { command: 'change.transition' },
        { specId: 'core:core/a' },
      ),
    ).toBe('Initialize its persisted state with: specd specs init core:core/a')
    expect(resolveCliErrorHint('SPEC_NOT_INITIALIZED', {}, {})).toBe(
      'Initialize its persisted state with: specd specs init <spec-id>',
    )
  })

  it('has a formatter for every rule hintId', () => {
    expect(CLI_ERROR_HINT_RULES.length).toBeGreaterThan(0)
    for (const rule of CLI_ERROR_HINT_RULES) {
      expect(typeof CLI_ERROR_HINTS[rule.hintId], rule.hintId).toBe('function')
      expect(CLI_ERROR_HINTS[rule.hintId]({ specId: 's', changeName: 'c' })).toEqual(
        expect.any(String),
      )
    }
    expect(CLI_ERROR_HINT_RULES.some((rule) => rule.hintId === 'spec.init')).toBe(true)
  })

  it('every formatter has at least one rule', () => {
    const used = new Set(CLI_ERROR_HINT_RULES.map((rule) => rule.hintId))
    for (const id of Object.keys(CLI_ERROR_HINTS)) {
      expect(used.has(id as CliHintId), id).toBe(true)
    }
  })

  it('hints DEPENDS_ON_OVERWRITE for commands without a dedicated rule', () => {
    expect(resolveCliErrorHint('DEPENDS_ON_OVERWRITE', { command: 'change.archive' })).toContain(
      'specd specs generate-metadata --force',
    )
    expect(resolveCliErrorHint('DEPENDS_ON_OVERWRITE')).toContain('specd specs deps')
  })
})

describe('deps.consistent hint', () => {
  it('applies only when the check is not skippable', () => {
    expect(
      resolveCliErrorHint('deps.consistent', { command: 'change.archive' }, { isSkippable: false }),
    ).toContain('dependency extraction')
    expect(resolveCliErrorHint('deps.consistent', { command: 'change.transition' }, {})).toContain(
      'dependency extraction',
    )
    expect(
      resolveCliErrorHint('deps.consistent', { command: 'change.archive' }, { isSkippable: true }),
    ).toBeUndefined()
  })
})
