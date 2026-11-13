import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { createBootstrapGraphConfig } from '../../../src/application/services/bootstrap-graph-config.js'
import { buildProjectGraphConfig } from '../../../src/application/services/build-project-graph-config.js'
import {
  DEFAULT_MAX_FILE_BYTES,
  resolveEffectiveGraphConfig,
} from '../../../src/application/use-cases/_shared/resolve-effective-graph-config.js'
import { type ProjectWorkspace } from '@specd/core'

describe('createBootstrapGraphConfig', () => {
  it('returns a synthetic default workspace rooted at the VCS root', () => {
    const config = createBootstrapGraphConfig({
      projectRoot: '/tmp/project',
      vcsRoot: '/tmp/project',
    })

    expect(config.workspaces).toHaveLength(1)
    expect(config.workspaces[0]?.name).toBe('default')
    expect(config.workspaces[0]?.codeRoot).toBe('/tmp/project')
    expect(config.projectRoot).toBe('/tmp/project')
    expect(config.configPath).toBe(join('/tmp/project', '.specd', 'config'))
  })

  it('has no graph block in bootstrap config and resolves to default 262144 through effective config', () => {
    const config = createBootstrapGraphConfig({
      projectRoot: '/tmp/project',
      vcsRoot: '/tmp/project',
    })

    expect(config.graph).toBeUndefined()

    const projectGraphConfig = buildProjectGraphConfig(config)
    expect(projectGraphConfig.maxFileBytes).toBeUndefined()
    expect(projectGraphConfig.largeFilePaths).toBeUndefined()

    const workspace: ProjectWorkspace = {
      name: 'default',
      prefix: null,
      codeRoot: '/tmp/project',
      isExternal: false,
      ownership: 'owned',
      specRepo: {
        specsPath: undefined,
        loadAll: () => [],
        load: () => undefined,
        find: () => [],
      } as unknown as ProjectWorkspace['specRepo'],
    }

    const effective = resolveEffectiveGraphConfig(
      config.projectRoot,
      [workspace],
      projectGraphConfig,
    )

    expect(effective.rootMaxFileBytes).toBe(DEFAULT_MAX_FILE_BYTES)
    expect(effective.workspaces.get('default')?.maxFileBytes).toBe(DEFAULT_MAX_FILE_BYTES)
    expect(effective.rootLargeFilePaths).toEqual([])
    expect(effective.workspaces.get('default')?.workspaceLargeFilePaths).toEqual([])
  })
})
