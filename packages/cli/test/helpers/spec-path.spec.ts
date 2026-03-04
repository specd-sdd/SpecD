import { describe, it, expect } from 'vitest'
import { parseSpecId } from '../../src/helpers/spec-path.js'
import { type SpecdConfig } from '@specd/core'

function makeConfig(workspaceNames: string[]): SpecdConfig {
  return {
    projectRoot: '/project',
    schemaRef: '@specd/schema-std',
    workspaces: workspaceNames.map((name) => ({
      name,
      specsPath: `/project/specs/${name}`,
      schemasPath: null,
      storagePath: `/project/.specd/${name}`,
      ownership: [],
      contextIncludeSpecs: false,
    })),
    storage: {
      changesPath: '/project/.specd/changes',
      draftsPath: '/project/.specd/drafts',
      discardedPath: '/project/.specd/discarded',
      archivePath: '/project/.specd/archive',
    },
    context: [],
    approvals: { spec: false, signoff: false },
    hooks: {},
  } as unknown as SpecdConfig
}

describe('parseSpecId', () => {
  describe('single workspace ("default")', () => {
    const config = makeConfig(['default'])

    it('routes plain path to default workspace', () => {
      const result = parseSpecId('auth/login', config)
      expect(result.workspace).toBe('default')
      expect(result.capabilityPath).toBe('auth/login')
    })

    it('does not treat "default" as workspace prefix when it is the only workspace', () => {
      const result = parseSpecId('default/auth/login', config)
      expect(result.workspace).toBe('default')
      expect(result.capabilityPath).toBe('auth/login')
    })

    it('single-segment path routes to default workspace', () => {
      const result = parseSpecId('billing', config)
      expect(result.workspace).toBe('default')
      expect(result.capabilityPath).toBe('billing')
    })
  })

  describe('colon syntax (workspace:path)', () => {
    const config = makeConfig(['default', 'billing-ws', 'auth-ws'])

    it('parses workspace:path with colon separator', () => {
      const result = parseSpecId('default:_global/architecture', config)
      expect(result.workspace).toBe('default')
      expect(result.capabilityPath).toBe('_global/architecture')
    })

    it('parses non-default workspace with colon separator', () => {
      const result = parseSpecId('billing-ws:billing/invoices', config)
      expect(result.workspace).toBe('billing-ws')
      expect(result.capabilityPath).toBe('billing/invoices')
    })

    it('throws InvalidSpecPathError when colon prefix is not a known workspace', () => {
      expect(() => parseSpecId('unknown:something/path', config)).toThrow(/unknown workspace/)
    })

    it('colon syntax takes precedence over slash syntax', () => {
      const result = parseSpecId('auth-ws:oauth/callback', config)
      expect(result.workspace).toBe('auth-ws')
      expect(result.capabilityPath).toBe('oauth/callback')
    })
  })

  describe('multiple workspaces', () => {
    const config = makeConfig(['default', 'billing-ws', 'auth-ws'])

    it('first segment matching a workspace name is used as workspace', () => {
      const result = parseSpecId('billing-ws/billing/invoices', config)
      expect(result.workspace).toBe('billing-ws')
      expect(result.capabilityPath).toBe('billing/invoices')
    })

    it('path with non-workspace first segment defaults to default workspace', () => {
      const result = parseSpecId('auth/login', config)
      expect(result.workspace).toBe('default')
      expect(result.capabilityPath).toBe('auth/login')
    })

    it('auth-ws prefix is stripped when it matches workspace', () => {
      const result = parseSpecId('auth-ws/oauth/callback', config)
      expect(result.workspace).toBe('auth-ws')
      expect(result.capabilityPath).toBe('oauth/callback')
    })

    it('specId matches original input when workspace prefix present', () => {
      const result = parseSpecId('billing-ws/billing/invoices', config)
      expect(result.specId).toBe('billing-ws/billing/invoices')
    })

    it('specId matches original input when defaulting to default workspace', () => {
      const result = parseSpecId('auth/login', config)
      expect(result.specId).toBe('auth/login')
    })
  })
})
