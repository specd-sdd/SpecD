import { describe, expect, it, vi } from 'vitest'
import type { SpecdConfig } from '@specd/core'
import { ResolveBundle } from '../src/application/use-cases/resolve-bundle.js'
import type { SkillRepository } from '../src/application/ports/skill-repository.js'
import type { SkillBundle } from '../src/domain/skill-bundle.js'
import type { SkillTemplateContext } from '../src/domain/template-context.js'

function makeMockBundle(name: string): SkillBundle {
  return {
    name,
    description: 'test description',
    files: [{ filename: 'shared.md', content: 'body', shared: true }],
    install: async (_target) => {},
    uninstall: async (_target) => {},
  }
}

function makeMockConfig(projectRoot: string = '/tmp/project'): SpecdConfig {
  return {
    projectRoot,
    configPath: projectRoot + '/.specd/config',
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

    expect(repository.getBundle).toHaveBeenCalledWith('test-skill', {
      variables: {
        configPath: '.specd/config',
        schemaRef: '@specd/schema-std',
        sharedFolder: '.specd/config/skills/shared',
      },
      capabilities: [],
    })
  })

  it('given extra variables and capabilities, when execute is called, then merges them with built-ins', async () => {
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
      context: {
        variables: { custom: 'value' },
        capabilities: ['frontmatter'],
      },
    })

    expect(repository.getBundle).toHaveBeenCalledWith('test-skill', {
      variables: {
        configPath: '.specd/config',
        schemaRef: '@specd/schema-std',
        custom: 'value',
        sharedFolder: '.specd/config/skills/shared',
      },
      capabilities: ['frontmatter'],
    })
  })

  it('given nested variables, when execute is called, then preserves nested structure in context.variables', async () => {
    const repository: SkillRepository = {
      list: vi.fn(),
      get: vi.fn(),
      getBundle: vi.fn((name: string, context?: SkillTemplateContext) => {
        expect(context?.variables?.['frontmatter']).toEqual({
          name: 'specd',
          metadata: { owner: 'specd' },
        })
        return makeMockBundle(name)
      }),
      listSharedFiles: vi.fn(),
    }

    const useCase = new ResolveBundle(repository)
    await useCase.execute({
      name: 'test-skill',
      context: {
        variables: {
          frontmatter: {
            name: 'specd',
            metadata: { owner: 'specd' },
          },
        },
      },
    })
  })

  it('given shared bundle file metadata, when execute is called, then metadata is preserved', async () => {
    const repository: SkillRepository = {
      list: vi.fn(),
      get: vi.fn(),
      getBundle: vi.fn((name: string) => makeMockBundle(name)),
      listSharedFiles: vi.fn(),
    }

    const useCase = new ResolveBundle(repository)
    const output = await useCase.execute({
      name: 'test-skill',
      context: { variables: { custom: 'value' } },
    })

    expect(output.bundle.files[0]?.shared).toBe(true)
    expect(output.bundle.files[0]?.filename).toBe('shared.md')
  })
})
