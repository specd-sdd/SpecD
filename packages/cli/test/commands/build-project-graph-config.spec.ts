import { describe, expect, it } from 'vitest'
import { DEFAULT_EXCLUDE_PATHS } from '@specd/sdk'
import { makeMockConfig } from './helpers.js'
import { buildProjectGraphConfig } from '../../src/commands/graph/build-project-graph-config.js'

describe('buildProjectGraphConfig', () => {
  it('uses the same default exclusion semantics for workspaces without explicit graph config', () => {
    const config = makeMockConfig({
      workspaces: [
        {
          name: 'default',
          specsPath: '/project/specs',
          specsAdapter: { adapter: 'fs', config: { path: '/project/specs' } },
          schemasPath: null,
          schemasAdapter: null,
          codeRoot: '/project',
          ownership: 'owned',
          isExternal: false,
        },
        {
          name: 'core',
          specsPath: '/project/specs/core',
          specsAdapter: { adapter: 'fs', config: { path: '/project/specs/core' } },
          schemasPath: null,
          schemasAdapter: null,
          codeRoot: '/project/packages/core',
          ownership: 'owned',
          isExternal: false,
        },
      ],
    })

    const graphConfig = buildProjectGraphConfig(config)

    expect(graphConfig.excludePaths).toEqual(DEFAULT_EXCLUDE_PATHS)
    expect(graphConfig.workspaces?.get('default')?.excludePaths).toBeUndefined()
    expect(graphConfig.workspaces?.get('core')?.excludePaths).toBeUndefined()
  })

  it('applies global include/exclude settings and preserves workspace-local filters', () => {
    const config = makeMockConfig()

    const graphConfig = buildProjectGraphConfig(config, {
      excludePaths: ['foo', 'bar'],
      includePaths: ['docs/**'],
    })

    expect(graphConfig.includePaths).toEqual(['docs/**'])
    expect(graphConfig.excludePaths).toEqual([...DEFAULT_EXCLUDE_PATHS, 'foo', 'bar'])
    expect(graphConfig.workspaces?.get('default')?.excludePaths).toBeUndefined()
  })
})
