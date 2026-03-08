import { describe, it, expect } from 'vitest'
import { resolveSpecPath } from '../../src/helpers/resolve-spec-path.js'
import { type SpecdConfig } from '@specd/core'

function makeConfig(
  workspaces: Array<{ name: string; specsPath: string; prefix?: string }>,
): SpecdConfig {
  return {
    projectRoot: '/project',
    schemaRef: '@specd/schema-std',
    workspaces: workspaces.map((ws) => ({
      name: ws.name,
      ...(ws.prefix !== undefined ? { prefix: ws.prefix } : {}),
      specsPath: ws.specsPath,
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

describe('resolveSpecPath', () => {
  it('given path under workspace with prefix, returns prefixed specId', () => {
    const config = makeConfig([{ name: 'core', specsPath: '/project/specs/core', prefix: 'core' }])

    const result = resolveSpecPath('/project/specs/core/change', config)

    expect(result).toEqual({
      workspace: 'core',
      specPath: 'core/change',
      specId: 'core:core/change',
    })
  })

  it('given path under workspace without prefix, returns bare specId', () => {
    const config = makeConfig([{ name: 'default', specsPath: '/project/specs' }])

    const result = resolveSpecPath('/project/specs/auth/login', config)

    expect(result).toEqual({
      workspace: 'default',
      specPath: 'auth/login',
      specId: 'default:auth/login',
    })
  })

  it('given path not under any workspace, returns null', () => {
    const config = makeConfig([{ name: 'default', specsPath: '/project/specs' }])

    const result = resolveSpecPath('/other/path/somewhere', config)

    expect(result).toBeNull()
  })

  it('given multiple workspaces, picks most specific (longest specsPath)', () => {
    const config = makeConfig([
      { name: 'default', specsPath: '/project/specs' },
      { name: 'core', specsPath: '/project/specs/core', prefix: 'core' },
    ])

    const result = resolveSpecPath('/project/specs/core/change', config)

    expect(result).toEqual({
      workspace: 'core',
      specPath: 'core/change',
      specId: 'core:core/change',
    })
  })

  it('given path equals specsPath exactly, returns root spec path', () => {
    const config = makeConfig([{ name: 'core', specsPath: '/project/specs/core', prefix: 'core' }])

    const result = resolveSpecPath('/project/specs/core', config)

    expect(result).toEqual({
      workspace: 'core',
      specPath: 'core',
      specId: 'core:core',
    })
  })

  it('given multi-segment prefix, prepends full prefix', () => {
    const config = makeConfig([
      { name: 'shared', specsPath: '/project/specs/shared', prefix: 'team_1/shared' },
    ])

    const result = resolveSpecPath('/project/specs/shared/auth/login', config)

    expect(result).toEqual({
      workspace: 'shared',
      specPath: 'team_1/shared/auth/login',
      specId: 'shared:team_1/shared/auth/login',
    })
  })

  it('given path that partially matches specsPath prefix but is not a child, returns null', () => {
    const config = makeConfig([{ name: 'default', specsPath: '/project/specs' }])

    // /project/specs-extra is NOT under /project/specs
    const result = resolveSpecPath('/project/specs-extra/something', config)

    expect(result).toBeNull()
  })
})
