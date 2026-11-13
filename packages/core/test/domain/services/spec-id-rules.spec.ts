import { describe, expect, it } from 'vitest'
import {
  isValidCapabilitySegment,
  isValidWorkspaceName,
} from '../../../src/domain/services/spec-id-rules.js'
import { parseSpecPattern } from '../../../src/domain/services/parse-spec-pattern.js'

describe('isValidWorkspaceName', () => {
  it.each(['ab', 'plugin-agent-claude', 'con-foo'])('accepts %j', (name) => {
    expect(isValidWorkspaceName(name)).toBe(true)
  })

  it.each(['a', 'Core', '1core', 'my_ws', 'nul'])('rejects %j', (name) => {
    expect(isValidWorkspaceName(name)).toBe(false)
  })
})

describe('isValidCapabilitySegment', () => {
  it.each(['api-v2', '_global', '2fa'])('accepts %j', (segment) => {
    expect(isValidCapabilitySegment(segment)).toBe(true)
  })

  it.each(['Login', 'a b', 'a,b', 'v1.2', '-bad', 'nul'])('rejects %j', (segment) => {
    expect(isValidCapabilitySegment(segment)).toBe(false)
  })
})

describe('capability path segment rule in patterns', () => {
  it('rejects core:Auth/* naming the offending segment', () => {
    expect(() => parseSpecPattern('core:Auth/*')).toThrow("segment 'Auth' is invalid")
  })

  it('accepts a two-character workspace qualifier', () => {
    expect(parseSpecPattern('ab:auth/*')).toEqual({
      workspace: 'ab',
      kind: 'prefix',
      path: 'auth',
    })
  })
})
