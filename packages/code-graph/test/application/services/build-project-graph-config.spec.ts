import { describe, expect, it } from 'vitest'
import { type SpecdConfig } from '@specd/core'
import { DEFAULT_EXCLUDE_PATHS } from '../../../src/application/use-cases/discover-files.js'
import { buildProjectGraphConfig } from '../../../src/application/services/build-project-graph-config.js'

function makeMockConfig(overrides: Partial<SpecdConfig> = {}): SpecdConfig {
  return {
    projectRoot: '/project',
    configPath: '/project/.specd/config',
    schemaRef: '@specd/schema-std',
    workspaces: [
      {
        name: 'default',
        specsPath: '/project/specs',
        specsAdapter: { adapter: 'fs', config: { path: '/project/specs' } },
        schemasPath: null,
        schemasAdapter: null,
        codeRoot: '/project',
        ownership: 'owned' as const,
        isExternal: false,
      },
    ],
    storage: {
      changesPath: '/project/.specd/changes',
      changesAdapter: { adapter: 'fs', config: { path: '/project/.specd/changes' } },
      draftsPath: '/project/.specd/drafts',
      draftsAdapter: { adapter: 'fs', config: { path: '/project/.specd/drafts' } },
      discardedPath: '/project/.specd/discarded',
      discardedAdapter: { adapter: 'fs', config: { path: '/project/.specd/discarded' } },
      archivePath: '/project/.specd/archive',
      archiveAdapter: { adapter: 'fs', config: { path: '/project/.specd/archive' } },
    },
    approvals: { spec: false, signoff: false },
    ...overrides,
  }
}

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
