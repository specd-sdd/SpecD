import { describe, it, expect } from 'vitest'
import { ReadOnlyWorkspaceError } from '../../../src/domain/errors/read-only-workspace-error.js'
import { SpecdError } from '../../../src/domain/errors/specd-error.js'

describe('ReadOnlyWorkspaceError', () => {
  it('extends SpecdError', () => {
    const err = new ReadOnlyWorkspaceError('test message')
    expect(err).toBeInstanceOf(SpecdError)
    expect(err).toBeInstanceOf(Error)
  })

  it('preserves the provided message', () => {
    const message =
      'Cannot write to spec "platform:auth/tokens" — workspace "platform" is readOnly.'
    const err = new ReadOnlyWorkspaceError(message)
    expect(err.message).toBe(message)
  })

  it('returns READ_ONLY_WORKSPACE as the error code', () => {
    const err = new ReadOnlyWorkspaceError('any')
    expect(err.code).toBe('READ_ONLY_WORKSPACE')
  })
})
