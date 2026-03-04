import { describe, it, expect } from 'vitest'
import { buildWorkspaceSchemasPaths } from '../../src/helpers/workspace-map.js'
import { type SpecdConfig } from '@specd/core'

function makeConfig(workspaces: Array<{ name: string; schemasPath: string | null }>): SpecdConfig {
  return {
    projectRoot: '/project',
    schemaRef: '@specd/schema-std',
    workspaces: workspaces.map((ws) => ({
      name: ws.name,
      specsPath: `/project/specs/${ws.name}`,
      schemasPath: ws.schemasPath,
      storagePath: `/project/.specd/${ws.name}`,
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

describe('buildWorkspaceSchemasPaths', () => {
  it('returns empty map when no workspace has a schemasPath', () => {
    const config = makeConfig([
      { name: 'default', schemasPath: null },
      { name: 'billing', schemasPath: null },
    ])
    expect(buildWorkspaceSchemasPaths(config).size).toBe(0)
  })

  it('includes workspace with schemasPath set', () => {
    const config = makeConfig([{ name: 'default', schemasPath: '/project/schemas' }])
    const map = buildWorkspaceSchemasPaths(config)
    expect(map.get('default')).toBe('/project/schemas')
  })

  it('omits workspaces with null schemasPath', () => {
    const config = makeConfig([
      { name: 'default', schemasPath: '/project/schemas' },
      { name: 'billing', schemasPath: null },
    ])
    const map = buildWorkspaceSchemasPaths(config)
    expect(map.size).toBe(1)
    expect(map.has('billing')).toBe(false)
  })

  it('maps all workspaces with schemasPath', () => {
    const config = makeConfig([
      { name: 'default', schemasPath: '/schemas/default' },
      { name: 'billing', schemasPath: '/schemas/billing' },
      { name: 'auth', schemasPath: null },
    ])
    const map = buildWorkspaceSchemasPaths(config)
    expect(map.size).toBe(2)
    expect(map.get('billing')).toBe('/schemas/billing')
  })
})
