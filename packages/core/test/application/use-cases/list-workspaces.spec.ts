import { describe, it, expect } from 'vitest'
import { ListWorkspaces } from '../../../src/application/use-cases/list-workspaces.js'
import { makeSpecRepository } from './helpers.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'

describe('ListWorkspaces', () => {
  it('returns rich project workspace entities', async () => {
    const config = {
      projectRoot: '/project',
      configPath: '/project/.specd',
      schemaRef: '@specd/schema-std',
      workspaces: [
        {
          name: 'default',
          codeRoot: '/project',
          isExternal: false,
          ownership: 'owned' as const,
          specsPath: '/project/specs',
          specsAdapter: { adapter: 'fs', config: {} },
          schemasPath: '/project/.specd/schemas',
          schemasAdapter: { adapter: 'fs', config: {} },
        },
        {
          name: 'core',
          codeRoot: '/project/packages/core',
          isExternal: false,
          ownership: 'shared' as const,
          specsPath: '/project/packages/core/specs',
          specsAdapter: { adapter: 'fs', config: {} },
          schemasPath: null,
          schemasAdapter: null,
        },
      ],
      storage: {
        changesPath: '/project/.specd/changes',
        changesAdapter: { adapter: 'fs', config: {} },
        draftsPath: '/project/.specd/drafts',
        draftsAdapter: { adapter: 'fs', config: {} },
        discardedPath: '/project/.specd/discarded',
        discardedAdapter: { adapter: 'fs', config: {} },
        archivePath: '/project/.specd/archive',
        archiveAdapter: { adapter: 'fs', config: {} },
      },
      approvals: { spec: false, signoff: false },
    }

    const defaultRepo = makeSpecRepository('owned')
    const coreRepo = makeSpecRepository('shared')
    const repos = new Map([
      ['default', defaultRepo],
      ['core', coreRepo],
    ])

    const useCase = new ListWorkspaces(config as unknown as SpecdConfig, repos)
    const result = await useCase.execute()

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      name: 'default',
      prefix: null,
      codeRoot: '/project',
      isExternal: false,
      ownership: 'owned',
      specRepo: defaultRepo,
    })
    expect(result[1]).toEqual({
      name: 'core',
      prefix: null,
      codeRoot: '/project/packages/core',
      isExternal: false,
      ownership: 'shared',
      specRepo: coreRepo,
    })
  })

  it('throws when a spec repository is missing for a configured workspace', async () => {
    const config = {
      workspaces: [{ name: 'default' }],
    }
    const repos = new Map()

    const useCase = new ListWorkspaces(config as unknown as SpecdConfig, repos)
    await expect(useCase.execute()).rejects.toThrow(
      'Spec repository not found for workspace "default"',
    )
  })
})
