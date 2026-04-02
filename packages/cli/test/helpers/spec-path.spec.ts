import { describe, it, expect } from 'vitest'
import { parseSpecId } from '../../src/helpers/spec-path.js'
import { type SpecdConfig } from '@specd/core'

function makeConfig(workspaceNames: string[]): SpecdConfig {
  return {
    projectRoot: '/project',
    configPath: '/project/.specd/config',
    schemaRef: '@specd/schema-std',
    workspaces: workspaceNames.map((name) => ({
      name,
      specsPath: `/project/specs/${name}`,
      schemasPath: null,
      codeRoot: '/project',
      ownership: 'owned' as const,
      isExternal: false,
    })),
    storage: {
      changesPath: '/project/.specd/changes',
      draftsPath: '/project/.specd/drafts',
      discardedPath: '/project/.specd/discarded',
      archivePath: '/project/.specd/archive',
    },
    approvals: { spec: false, signoff: false },
  }
}

describe('parseSpecId', () => {
  describe('bare path shorthand (no colon)', () => {
    const config = makeConfig(['default'])

    it('routes bare path to default workspace', () => {
      const result = parseSpecId('auth/login', config)
      expect(result.workspace).toBe('default')
      expect(result.capabilityPath).toBe('auth/login')
    })

    it('returns fully-qualified specId for bare path', () => {
      const result = parseSpecId('auth/login', config)
      expect(result.specId).toBe('default:auth/login')
    })

    it('single-segment bare path routes to default workspace', () => {
      const result = parseSpecId('billing', config)
      expect(result.workspace).toBe('default')
      expect(result.capabilityPath).toBe('billing')
      expect(result.specId).toBe('default:billing')
    })
  })

  describe('colon syntax (workspace:path)', () => {
    const config = makeConfig(['default', 'billing-ws', 'auth-ws'])

    it('parses workspace:path with colon separator', () => {
      const result = parseSpecId('default:_global/architecture', config)
      expect(result.workspace).toBe('default')
      expect(result.capabilityPath).toBe('_global/architecture')
      expect(result.specId).toBe('default:_global/architecture')
    })

    it('parses non-default workspace with colon separator', () => {
      const result = parseSpecId('billing-ws:billing/invoices', config)
      expect(result.workspace).toBe('billing-ws')
      expect(result.capabilityPath).toBe('billing/invoices')
      expect(result.specId).toBe('billing-ws:billing/invoices')
    })

    it('throws InvalidSpecPathError when colon prefix is not a known workspace', () => {
      expect(() => parseSpecId('unknown:something/path', config)).toThrow(/unknown workspace/)
    })

    it('parses auth workspace with colon separator', () => {
      const result = parseSpecId('auth-ws:oauth/callback', config)
      expect(result.workspace).toBe('auth-ws')
      expect(result.capabilityPath).toBe('oauth/callback')
    })
  })

  describe('multiple workspaces — bare paths always default', () => {
    const config = makeConfig(['default', 'billing-ws', 'auth-ws'])

    it('bare path defaults to default workspace even if first segment matches a workspace', () => {
      const result = parseSpecId('auth/login', config)
      expect(result.workspace).toBe('default')
      expect(result.capabilityPath).toBe('auth/login')
      expect(result.specId).toBe('default:auth/login')
    })

    it('bare path with workspace-like prefix is treated as capability path', () => {
      const result = parseSpecId('billing-ws/billing/invoices', config)
      expect(result.workspace).toBe('default')
      expect(result.capabilityPath).toBe('billing-ws/billing/invoices')
      expect(result.specId).toBe('default:billing-ws/billing/invoices')
    })
  })
})
