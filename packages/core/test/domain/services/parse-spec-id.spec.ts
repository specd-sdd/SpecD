import { describe, it, expect } from 'vitest'
import { parseSpecId } from '../../../src/domain/services/parse-spec-id.js'

describe('parseSpecId', () => {
  it('splits workspace:capPath on the first colon', () => {
    expect(parseSpecId('billing:payments/checkout')).toEqual({
      workspace: 'billing',
      capPath: 'payments/checkout',
    })
  })

  it('defaults to "default" workspace when no colon is present', () => {
    expect(parseSpecId('auth/login')).toEqual({
      workspace: 'default',
      capPath: 'auth/login',
    })
  })

  it('accepts a custom default workspace', () => {
    expect(parseSpecId('auth/login', 'primary')).toEqual({
      workspace: 'primary',
      capPath: 'auth/login',
    })
  })

  it('handles bare name without slashes', () => {
    expect(parseSpecId('overview')).toEqual({
      workspace: 'default',
      capPath: 'overview',
    })
  })

  it('handles workspace with empty capPath after colon', () => {
    expect(parseSpecId('billing:')).toEqual({
      workspace: 'billing',
      capPath: '',
    })
  })

  it('splits only on the first colon', () => {
    expect(parseSpecId('a:b:c')).toEqual({
      workspace: 'a',
      capPath: 'b:c',
    })
  })
})
