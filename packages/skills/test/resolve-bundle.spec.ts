import { describe, expect, it, vi } from 'vitest'
import type { SpecdConfig } from '@specd/core'
import { ResolveBundle } from '../src/application/use-cases/resolve-bundle.js'
import type { SkillRepository } from '../src/application/ports/skill-repository.js'
import type { SkillBundle } from '../src/domain/skill-bundle.js'

function makeMockBundle(name: string): SkillBundle {
  return {
    name,
    description: 'test description',
    files: [],
    install: async () => {},
    uninstall: async () => {},
  }
}

function makeMockConfig(projectRoot: string = '/tmp/project'): SpecdConfig {
  return {
    projectRoot,
    configPath: projectRoot + '/specd.yaml',
    schemaRef: '@specd/schema-std',
    workspaces: [
      {
        name: 'default',
        specsPath: projectRoot + '/specs',
        specsAdapter: { adapter: 'fs', config: {} },
        schemasPath: null,
        schemasAdapter: null,
        codeRoot: projectRoot,
        ownership: 'owned',
        isExternal: false,
      },
    ],
    storage: {
      changesPath: projectRoot + '/.specd/changes',
      changesAdapter: { adapter: 'fs', config: {} },
      draftsPath: projectRoot + '/.specd/drafts',
      draftsAdapter: { adapter: 'fs', config: {} },
      discardedPath: projectRoot + '/.specd/discarded',
      discardedAdapter: { adapter: 'fs', config: {} },
      archivePath: projectRoot + '/specs',
      archiveAdapter: { adapter: 'fs', config: {} },
    },
    approvals: { spec: false, signoff: false },
    plugins: { agents: [] },
  }
}

describe('ResolveBundle', () => {
  it('given a config, when execute is called, then injects built-in variables', async () => {
    const repository: SkillRepository = {
      list: vi.fn(),
      get: vi.fn(),
      getBundle: vi.fn((name: string) => makeMockBundle(name)),
      listSharedFiles: vi.fn(),
    }

    const mockConfig = makeMockConfig()

    const useCase = new ResolveBundle(repository)
    await useCase.execute({
      name: 'test-skill',
      config: mockConfig,
    })

    expect(repository.getBundle).toHaveBeenCalledWith(
      'test-skill',
      {
        projectRoot: '/tmp/project',
        configPath: '/tmp/project/specd.yaml',
        schemaRef: '@specd/schema-std',
      },
      mockConfig,
    )
  })

  it('given extra variables, when execute is called, then merges them with built-ins', async () => {
    const repository: SkillRepository = {
      list: vi.fn(),
      get: vi.fn(),
      getBundle: vi.fn((name: string) => makeMockBundle(name)),
      listSharedFiles: vi.fn(),
    }

    const mockConfig = makeMockConfig()

    const useCase = new ResolveBundle(repository)
    await useCase.execute({
      name: 'test-skill',
      config: mockConfig,
      variables: { custom: 'value' },
    })

    expect(repository.getBundle).toHaveBeenCalledWith(
      'test-skill',
      {
        projectRoot: '/tmp/project',
        configPath: '/tmp/project/specd.yaml',
        schemaRef: '@specd/schema-std',
        custom: 'value',
      },
      mockConfig,
    )
  })
})
