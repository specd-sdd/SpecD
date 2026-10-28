import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAX_FILE_BYTES,
  resolveEffectiveGraphConfig,
} from '../../../src/application/use-cases/_shared/resolve-effective-graph-config.js'
import {
  DEFAULT_GRAPH_IGNORE_PATHS,
  DEFAULT_GRAPH_TEST_PATHS,
  type ProjectWorkspace,
} from '@specd/core'
import { type ProjectGraphConfig } from '../../../src/domain/value-objects/index-options.js'

function makeWorkspace(name: string): ProjectWorkspace {
  return {
    name,
    prefix: null,
    codeRoot: `/repo/packages/${name}`,
    isExternal: false,
    ownership: 'owned',
    specRepo: {
      specsPath: `/repo/packages/${name}/specs`,
      loadAll: () => [],
      load: () => undefined,
      find: () => [],
    } as unknown as ProjectWorkspace['specRepo'],
  }
}

describe('resolveEffectiveGraphConfig', () => {
  const ws1 = makeWorkspace('ws1')
  const ws2 = makeWorkspace('ws2')
  const workspaces = [ws1, ws2]

  it('resolves default limits (262144) and empty exemptions when config is empty', () => {
    const effective = resolveEffectiveGraphConfig('/repo', workspaces, {})

    expect(effective.rootMaxFileBytes).toBe(DEFAULT_MAX_FILE_BYTES)
    expect(effective.rootLargeFilePaths).toEqual([])

    const ws1Config = effective.workspaces.get('ws1')
    expect(ws1Config?.maxFileBytes).toBe(DEFAULT_MAX_FILE_BYTES)
    expect(ws1Config?.projectLargeFilePaths).toEqual([])
    expect(ws1Config?.workspaceLargeFilePaths).toEqual([])

    const ws2Config = effective.workspaces.get('ws2')
    expect(ws2Config?.maxFileBytes).toBe(DEFAULT_MAX_FILE_BYTES)
    expect(ws2Config?.projectLargeFilePaths).toEqual([])
    expect(ws2Config?.workspaceLargeFilePaths).toEqual([])
  })

  it('applies project-level maxFileBytes and largeFilePaths to root and workspaces', () => {
    const graphConfig: ProjectGraphConfig = {
      maxFileBytes: 500_000,
      largeFilePaths: ['generated/**', 'vendor/**'],
    }
    const effective = resolveEffectiveGraphConfig('/repo', workspaces, graphConfig)

    expect(effective.rootMaxFileBytes).toBe(500_000)
    expect(effective.rootLargeFilePaths).toEqual(['generated/**', 'vendor/**'])

    const ws1Config = effective.workspaces.get('ws1')
    expect(ws1Config?.maxFileBytes).toBe(500_000)
    expect(ws1Config?.projectLargeFilePaths).toEqual(['generated/**', 'vendor/**'])
    expect(ws1Config?.workspaceLargeFilePaths).toEqual([])
  })

  it('allows workspace to override maxFileBytes and supply workspace-level largeFilePaths', () => {
    const graphConfig: ProjectGraphConfig = {
      maxFileBytes: 500_000,
      largeFilePaths: ['project-exemption.ts'],
      workspaces: new Map([
        [
          'ws1',
          {
            maxFileBytes: 1_000_000,
            largeFilePaths: ['ws1-exemption.ts'],
          },
        ],
      ]),
    }
    const effective = resolveEffectiveGraphConfig('/repo', workspaces, graphConfig)

    expect(effective.rootMaxFileBytes).toBe(500_000)

    const ws1Config = effective.workspaces.get('ws1')
    expect(ws1Config?.maxFileBytes).toBe(1_000_000)
    expect(ws1Config?.projectLargeFilePaths).toEqual(['project-exemption.ts'])
    expect(ws1Config?.workspaceLargeFilePaths).toEqual(['ws1-exemption.ts'])

    // ws2 has no override, inherits project maxFileBytes
    const ws2Config = effective.workspaces.get('ws2')
    expect(ws2Config?.maxFileBytes).toBe(500_000)
    expect(ws2Config?.projectLargeFilePaths).toEqual(['project-exemption.ts'])
    expect(ws2Config?.workspaceLargeFilePaths).toEqual([])
  })

  it('preserves limit 0 as no limit without falling back to default', () => {
    const graphConfig: ProjectGraphConfig = {
      maxFileBytes: 0,
      workspaces: new Map([
        [
          'ws1',
          {
            maxFileBytes: 0,
          },
        ],
      ]),
    }
    const effective = resolveEffectiveGraphConfig('/repo', workspaces, graphConfig)

    expect(effective.rootMaxFileBytes).toBe(0)
    expect(effective.workspaces.get('ws1')?.maxFileBytes).toBe(0)
    expect(effective.workspaces.get('ws2')?.maxFileBytes).toBe(0)
  })

  it('copies arrays to prevent mutation of original inputs', () => {
    const rootPaths = ['root/**']
    const wsPaths = ['ws/**']
    const graphConfig: ProjectGraphConfig = {
      largeFilePaths: rootPaths,
      workspaces: new Map([
        [
          'ws1',
          {
            largeFilePaths: wsPaths,
          },
        ],
      ]),
    }
    const effective = resolveEffectiveGraphConfig('/repo', workspaces, graphConfig)

    expect(effective.rootLargeFilePaths).not.toBe(rootPaths)
    expect(effective.rootLargeFilePaths).toEqual(rootPaths)

    const ws1Config = effective.workspaces.get('ws1')
    expect(ws1Config?.workspaceLargeFilePaths).not.toBe(wsPaths)
    expect(ws1Config?.workspaceLargeFilePaths).toEqual(wsPaths)
  })

  describe('project-relative path semantics', () => {
    it('Given a code root below the project root, then pathBase is the project-relative directory', () => {
      const effective = resolveEffectiveGraphConfig('/repo', workspaces, {})
      expect(effective.workspaces.get('ws1')?.pathBase).toBe('packages/ws1')
    })

    it('Given a code root outside the project, then pathBase starts with ../', () => {
      const outside = { ...makeWorkspace('shared'), codeRoot: '/shared' }
      const effective = resolveEffectiveGraphConfig('/repo', [outside], {})
      expect(effective.workspaces.get('shared')?.pathBase).toBe('../shared')
    })

    it('Given global and workspace excludes, then the layers stay separate and spec roots join the global layer', () => {
      const graphConfig: ProjectGraphConfig = {
        excludePaths: ['dist/'],
        workspaces: new Map([['ws1', { excludePaths: ['!packages/ws1/keep/'] }]]),
      }
      const effective = resolveEffectiveGraphConfig('/repo', workspaces, graphConfig)
      const ws1Config = effective.workspaces.get('ws1')
      expect(ws1Config?.globalExcludePaths).toEqual([
        'dist/',
        'packages/ws1/specs/',
        'packages/ws2/specs/',
      ])
      expect(ws1Config?.workspaceExcludePaths).toEqual(['!packages/ws1/keep/'])
      expect(effective.workspaces.get('ws2')?.workspaceExcludePaths).toEqual([])
    })

    it('Given no category lists, then project lists fall back to built-in defaults', () => {
      const effective = resolveEffectiveGraphConfig('/repo', workspaces, {})
      const ws1Config = effective.workspaces.get('ws1')
      expect(ws1Config?.projectTestPaths.length).toBeGreaterThan(0)
      expect(ws1Config?.projectIgnorePaths).toEqual([...DEFAULT_GRAPH_IGNORE_PATHS])
      expect(ws1Config?.projectTestPaths).toEqual([...DEFAULT_GRAPH_TEST_PATHS])
      expect(ws1Config?.workspaceTestPaths).toEqual([])
      expect(ws1Config?.workspaceIgnorePaths).toEqual([])
    })

    it('Given workspace category lists, then they are kept apart from the project lists', () => {
      const graphConfig: ProjectGraphConfig = {
        testPaths: ['**/t/**'],
        ignorePaths: ['gen/**'],
        workspaces: new Map([
          ['ws1', { testPaths: ['packages/ws1/spec/**'], ignorePaths: ['packages/ws1/out/**'] }],
        ]),
      }
      const ws1Config = resolveEffectiveGraphConfig(
        '/repo',
        workspaces,
        graphConfig,
      ).workspaces.get('ws1')
      expect(ws1Config?.projectTestPaths).toEqual(['**/t/**'])
      expect(ws1Config?.workspaceTestPaths).toEqual(['packages/ws1/spec/**'])
      expect(ws1Config?.projectIgnorePaths).toEqual(['gen/**'])
      expect(ws1Config?.workspaceIgnorePaths).toEqual(['packages/ws1/out/**'])
    })
  })
})

describe('--exclude-path overrides', () => {
  it('Given an extra exclude from the CLI, then it lands in the global layer of every workspace and a workspace negation cannot re-include it', async () => {
    const { buildProjectGraphConfig } =
      await import('../../../src/application/services/build-project-graph-config.js')
    const { createDiscoveryEvaluator } =
      await import('../../../src/application/use-cases/discover-files.js')
    const workspace = makeWorkspace('backend')
    const config = {
      workspaces: [{ name: 'backend', graph: { excludePaths: ['!packages/backend/tmp/'] } }],
    } as never
    const graphConfig = buildProjectGraphConfig(config, { excludePaths: ['packages/backend/tmp/'] })
    const effective = resolveEffectiveGraphConfig('/repo', [workspace], graphConfig)
    const backend = effective.workspaces.get('backend')!
    expect(backend.globalExcludePaths).toContain('packages/backend/tmp/')
    expect(effective.rootExcludePaths).toContain('packages/backend/tmp/')
    const evaluator = createDiscoveryEvaluator(workspace.codeRoot, {
      vcsRoot: null,
      respectGitignore: false,
      pathBase: backend.pathBase,
      excludePaths: backend.globalExcludePaths,
      workspaceExcludePaths: backend.workspaceExcludePaths,
    })
    expect(evaluator.evaluateEntry('tmp', true)).toMatchObject({
      kind: 'excluded',
      stage: 'global-exclude',
    })
  })
})
