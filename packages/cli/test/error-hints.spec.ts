import { describe, it, expect } from 'vitest'
import { resolveCliErrorHint, type CliCommandId } from '../src/error-hints.js'

describe('resolveCliErrorHint', () => {
  it('routes DEPENDS_ON_OVERWRITE by command', () => {
    expect(
      resolveCliErrorHint('DEPENDS_ON_OVERWRITE', { command: 'specs.generate-metadata' }),
    ).toContain('--force')

    const validateHint = resolveCliErrorHint('DEPENDS_ON_OVERWRITE', { command: 'specs.validate' })
    expect(validateHint).toContain('specd specs deps')
    expect(validateHint).toContain('specd specs generate-metadata --force')
    expect(validateHint).not.toContain('specs validate --force')

    expect(
      resolveCliErrorHint('DEPENDS_ON_OVERWRITE', { command: 'change.transition' }),
    ).toBeUndefined()
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

  it('routes impl.linksInScope only when isSkippable is true on transition/archive', () => {
    for (const command of ['change.transition', 'change.archive'] satisfies CliCommandId[]) {
      const hint = resolveCliErrorHint('impl.linksInScope', { command }, { isSkippable: true })
      expect(hint).toContain('--skip-checks impl.linksInScope')
      expect(hint).toContain('--allow-out-of-scope')
      expect(
        resolveCliErrorHint('impl.linksInScope', { command }, { isSkippable: false }),
      ).toBeUndefined()
    }
    expect(
      resolveCliErrorHint(
        'impl.linksInScope',
        { command: 'specs.validate' },
        { isSkippable: true },
      ),
    ).toBeUndefined()
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
