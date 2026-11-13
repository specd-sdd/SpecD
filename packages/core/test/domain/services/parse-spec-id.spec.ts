import { describe, expect, it } from 'vitest'
import { isFullyQualifiedSpecId, parseSpecId } from '../../../src/domain/services/parse-spec-id.js'
import { InvalidSpecIdError } from '../../../src/domain/errors/invalid-spec-id-error.js'
import { WorkspaceNotFoundError } from '../../../src/domain/errors/workspace-not-found-error.js'
import { WorkspaceNotFoundError as ApplicationWorkspaceNotFoundError } from '../../../src/application/errors/workspace-not-found-error.js'

describe('parseSpecId', () => {
  it('parses a nested capability path with an explicit workspace', () => {
    expect(parseSpecId('billing:payments/checkout/review')).toEqual({
      workspace: 'billing',
      capPath: 'payments/checkout/review',
      specId: 'billing:payments/checkout/review',
    })
  })

  it('defaults a bare path to the default workspace', () => {
    expect(parseSpecId('auth/login')).toEqual({
      workspace: 'default',
      capPath: 'auth/login',
      specId: 'default:auth/login',
    })
  })

  it('uses defaultWorkspace for bare paths', () => {
    expect(parseSpecId('auth/login', { defaultWorkspace: 'primary' })).toEqual({
      workspace: 'primary',
      capPath: 'auth/login',
      specId: 'primary:auth/login',
    })
  })

  it.each(['', 'a', 'Bad Id', 'nul'])(
    'rejects invalid defaultWorkspace %j with and without configured membership',
    (defaultWorkspace) => {
      expect(() => parseSpecId('auth/login', { defaultWorkspace })).toThrow(InvalidSpecIdError)
      expect(() =>
        parseSpecId('auth/login', { defaultWorkspace, workspaces: ['default', 'billing'] }),
      ).toThrow(InvalidSpecIdError)
    },
  )

  it('distinguishes a valid but unconfigured defaultWorkspace', () => {
    expect(() =>
      parseSpecId('auth/login', {
        defaultWorkspace: 'billing',
        workspaces: ['default', 'core'],
      }),
    ).toThrow(WorkspaceNotFoundError)
  })

  it('handles a bare leaf name without slashes', () => {
    expect(parseSpecId('overview')).toEqual({
      workspace: 'default',
      capPath: 'overview',
      specId: 'default:overview',
    })
  })

  describe('invalid inputs', () => {
    it.each([
      ['', 'must not be empty or blank'],
      [' ', 'must not be empty or blank'],
      [':', 'workspace'],
      ['ws:', 'capability path must not be empty'],
      [':path', 'workspace'],
      ['a//b', 'empty segment'],
      ['/a', 'empty segment'],
      ['a/', 'empty segment'],
      ['a/./b', "segment '.' is invalid"],
      ['a/../b', "segment '..' is invalid"],
      ['Auth/Login', "segment 'Auth' is invalid"],
      ['auth/log in', "segment 'log in' is invalid"],
      ['auth/a,b', "segment 'a,b' is invalid"],
      ['a:foo/bar', 'workspace'],
      ['ws:section/nul/id', "segment 'nul' is a Windows device name"],
      ['core:a:b', "capability path must not contain ':'"],
    ])('rejects %j', (value, reasonPart) => {
      expect(() => parseSpecId(value)).toThrow(InvalidSpecIdError)
      try {
        parseSpecId(value)
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidSpecIdError)
        expect((err as InvalidSpecIdError).message).toContain(`Invalid spec ID '${value}'`)
        expect((err as InvalidSpecIdError).message).toContain(reasonPart)
      }
    })

    it.each(['auth\\login', 'ws:auth\\login', 'ws:section\\other\\id'])(
      'rejects backslash path %j with /-only hint on every OS',
      (value) => {
        expect(() => parseSpecId(value)).toThrow(InvalidSpecIdError)
        try {
          parseSpecId(value)
        } catch (err) {
          expect(err).toBeInstanceOf(InvalidSpecIdError)
          expect((err as InvalidSpecIdError).message).toContain(`Invalid spec ID '${value}'`)
          expect((err as InvalidSpecIdError).message).toContain(
            "contains a backslash; use '/' as the only path separator",
          )
        }
      },
    )
  })

  describe('workspaces option', () => {
    it('accepts workspaces as a string array', () => {
      expect(parseSpecId('core:change', { workspaces: ['default', 'core'] }).specId).toBe(
        'core:change',
      )
    })

    it('accepts workspaces as a Set', () => {
      expect(parseSpecId('core:change', { workspaces: new Set(['core']) }).workspace).toBe('core')
    })

    it('accepts workspaces as Map.keys()', () => {
      const map = new Map([['billing', true]])
      expect(parseSpecId('billing:pay', { workspaces: map.keys() }).specId).toBe('billing:pay')
    })

    it('accepts ProjectWorkspace-like objects', () => {
      expect(
        parseSpecId('core:change', {
          workspaces: [{ name: 'core' }, { name: 'default' }],
        }).specId,
      ).toBe('core:change')
    })

    it('throws WorkspaceNotFoundError when the resolved workspace is missing', () => {
      expect(() => parseSpecId('auth/login', { workspaces: ['core'] })).toThrow(
        WorkspaceNotFoundError,
      )
      try {
        parseSpecId('auth/login', { workspaces: ['core'] })
      } catch (err) {
        expect(err).toBeInstanceOf(WorkspaceNotFoundError)
        expect((err as Error).message).toContain("Workspace 'default' not found")
        expect((err as Error).message).toContain("in spec ID 'auth/login'")
        expect((err as Error).message).toContain('known workspaces: core')
      }
    })
  })
})

describe('parseSpecId unknown workspace', () => {
  it('rejects an unknown workspace with a message quoting the ID and listing known workspaces', () => {
    const err = (() => {
      try {
        parseSpecId('nope:auth/login', { workspaces: ['default', 'core'] })
      } catch (e) {
        return e
      }
      return undefined
    })()

    expect(err).toBeInstanceOf(WorkspaceNotFoundError)
    expect((err as Error).message).toContain("Workspace 'nope' not found")
    expect((err as Error).message).toContain("in spec ID 'nope:auth/login'")
    expect((err as Error).message).toContain('known workspaces: default, core')
  })

  it('accepts any well-formed workspace when no workspace set is given', () => {
    expect(parseSpecId('nope:auth/login')).toEqual({
      workspace: 'nope',
      capPath: 'auth/login',
      specId: 'nope:auth/login',
    })
  })

  it('keeps instanceof across the domain and application import paths', () => {
    let fromDomain: unknown
    try {
      parseSpecId('nope:x', { workspaces: ['core'] })
    } catch (e) {
      fromDomain = e
    }
    expect(fromDomain).toBeInstanceOf(WorkspaceNotFoundError)
    expect(fromDomain).toBeInstanceOf(ApplicationWorkspaceNotFoundError)
    expect(ApplicationWorkspaceNotFoundError).toBe(WorkspaceNotFoundError)
  })
})

describe('isFullyQualifiedSpecId', () => {
  it('returns true for a valid qualified ID', () => {
    expect(isFullyQualifiedSpecId('core:change')).toBe(true)
    expect(isFullyQualifiedSpecId('default:_global/architecture')).toBe(true)
  })

  it('returns false for bare, blank, or malformed values', () => {
    expect(isFullyQualifiedSpecId('auth/login')).toBe(false)
    expect(isFullyQualifiedSpecId('')).toBe(false)
    expect(isFullyQualifiedSpecId('core:')).toBe(false)
    expect(isFullyQualifiedSpecId('Core:foo')).toBe(false)
    expect(isFullyQualifiedSpecId('a:foo')).toBe(false)
  })
})
