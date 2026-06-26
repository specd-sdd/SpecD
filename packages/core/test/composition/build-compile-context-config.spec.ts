import { describe, it, expect } from 'vitest'
import { buildCompileContextConfig } from '../../src/composition/build-compile-context-config.js'
import { type SpecdConfig } from '../../src/application/specd-config.js'

function makeConfig(overrides: Partial<SpecdConfig> = {}): SpecdConfig {
  return {
    projectRoot: '/project',
    configPath: '/project/.specd/config',
    schemaRef: '@specd/schema-std',
    context: [{ instruction: 'Use specd.' }],
    contextIncludeSpecs: ['default:*'],
    contextExcludeSpecs: ['default:secrets'],
    contextMode: 'summary',
    llmOptimizedContext: true,
    workspaces: [
      {
        name: 'default',
        ownership: 'owned',
        isExternal: false,
        specsPath: '/project/specs',
        schemasPath: null,
        contextIncludeSpecs: ['core:*'],
      },
    ],
    storage: {
      changesPath: '/project/.specd/changes',
      draftsPath: '/project/.specd/drafts',
      discardedPath: '/project/.specd/discarded',
      archivePath: '/project/.specd/archive',
    },
    adapters: {
      specsAdapter: { adapter: 'fs', config: { path: '/project/specs' } },
      changesAdapter: { adapter: 'fs', config: { path: '/project/.specd/changes' } },
      draftsAdapter: { adapter: 'fs', config: { path: '/project/.specd/drafts' } },
      discardedAdapter: { adapter: 'fs', config: { path: '/project/.specd/discarded' } },
      archiveAdapter: { adapter: 'fs', config: { path: '/project/.specd/archive' } },
    },
    ...overrides,
  } as SpecdConfig
}

describe('buildCompileContextConfig', () => {
  it('maps yaml-stable project and workspace context fields', () => {
    const result = buildCompileContextConfig(makeConfig())

    expect(result.projectRoot).toBe('/project')
    expect(result.configPath).toBe('/project/.specd/config')
    expect(result.context).toEqual([{ instruction: 'Use specd.' }])
    expect(result.contextIncludeSpecs).toEqual(['default:*'])
    expect(result.contextExcludeSpecs).toEqual(['default:secrets'])
    expect(result.contextMode).toBe('summary')
    expect(result.llmOptimizedContext).toBe(true)
    expect(result.workspaces).toEqual({
      default: { contextIncludeSpecs: ['core:*'] },
    })
  })
})
