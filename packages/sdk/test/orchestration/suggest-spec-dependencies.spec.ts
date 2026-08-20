import { describe, expect, it, vi } from 'vitest'
import {
  SuggestSpecDependencies,
  createSuggestSpecDependencies,
} from '../../src/orchestration/suggest-spec-dependencies.js'
import {
  SpecdError,
  InvalidInputError,
  WorkspaceNotFoundError,
  SpecNotFoundError,
  type SpecRepository,
} from '@specd/core'

function setupTest() {
  const suggestImplementationLinks = {
    execute: vi.fn().mockResolvedValue({
      result: 'ok',
      specs: [
        {
          specId: 'sdk:suggest-spec-dependencies',
          title: 'SuggestSpecDependencies',
          existing: { files: ['sdk:packages/sdk/src/orchestration/suggest-spec-dependencies.ts'], symbols: [], dependsOn: [] },
          suggestions: [],
        },
        {
          specId: 'code-graph:traversal',
          title: 'Traversal',
          existing: { files: ['code-graph:packages/code-graph/src/domain/services/analyze-file-impact.ts'], symbols: [], dependsOn: [] },
          suggestions: [],
        },
      ],
    }),
  }

  const list = vi.fn().mockResolvedValue([
    {
      workspace: 'sdk',
      path: 'suggest-spec-dependencies',
      title: 'SuggestSpecDependencies',
    },
  ])

  const repo = {
    list,
  } as unknown as SpecRepository

  const specRepositories = new Map<string, SpecRepository>([['sdk', repo]])

  const getPersistedDeps = {
    execute: vi.fn().mockResolvedValue({
      specId: 'sdk:suggest-spec-dependencies',
      dependsOn: [],
      initialized: true,
    }),
  }

  const updatePersistedDeps = {
    execute: vi.fn().mockResolvedValue({
      specId: 'sdk:suggest-spec-dependencies',
      dependsOn: ['code-graph:traversal'],
      created: false,
    }),
  }

  const validateSpecs = {
    execute: vi.fn().mockResolvedValue({
      issues: [],
    }),
  }

  const codeGraphProvider = {
    analyzeFileImpact: vi.fn().mockImplementation(async (filePath: string) => {
      if (filePath.includes('suggest-spec-dependencies.ts')) {
        return {
          affectedFiles: [
            { filePath: 'packages/code-graph/src/domain/services/analyze-file-impact.ts' },
          ],
        }
      }
      return { affectedFiles: [] }
    }),
  } as any

  const useCase = new SuggestSpecDependencies({
    suggestImplementationLinks: suggestImplementationLinks as any,
    specRepositories,
    getPersistedDeps: getPersistedDeps as any,
    updatePersistedDeps: updatePersistedDeps as any,
    validateSpecs: validateSpecs as any,
    codeGraphProvider,
    projectDir: '/tmp/test-project',
  })

  return {
    useCase,
    suggestImplementationLinks,
    getPersistedDeps,
    updatePersistedDeps,
    validateSpecs,
    codeGraphProvider,
    specRepositories,
  }
}

describe('SuggestSpecDependencies', () => {
  it('performs cache warm-up and traces import graph dependencies', async () => {
    const { useCase, suggestImplementationLinks } = setupTest()

    const result = await useCase.execute({
      specId: 'sdk:suggest-spec-dependencies',
    })

    expect(suggestImplementationLinks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        all: true,
        apply: false,
      }),
    )

    expect(result.result).toBe('ok')
    expect(result.specs).toHaveLength(1)
    expect(result.specs[0]?.specId).toBe('sdk:suggest-spec-dependencies')
    expect(result.specs[0]?.suggestedDependsOn).toHaveLength(1)
    expect(result.specs[0]?.suggestedDependsOn[0]?.specId).toBe('code-graph:traversal')
  })

  it('applies suggested dependencies when apply: true is passed', async () => {
    const { useCase, updatePersistedDeps, validateSpecs } = setupTest()

    const result = await useCase.execute({
      specId: 'sdk:suggest-spec-dependencies',
      apply: true,
    })

    expect(updatePersistedDeps.execute).toHaveBeenCalledWith({
      specId: 'sdk:suggest-spec-dependencies',
      add: ['code-graph:traversal'],
    })

    expect(validateSpecs.execute).toHaveBeenCalled()
    expect(result.appliedMutations?.updatedSpecsCount).toBe(1)
    expect(result.postApplyValidation?.status).toBe('all-valid')
  })

  it('handles invalid specs after applying dependencies and reports diagnostic', async () => {
    const { useCase, validateSpecs } = setupTest()
    validateSpecs.execute.mockResolvedValueOnce({
      issues: [
        {
          specId: 'sdk:suggest-spec-dependencies',
          failures: [{ artifactId: 'specs', description: 'Missing requirement link' }],
        },
      ],
    })

    const result = await useCase.execute({
      specId: 'sdk:suggest-spec-dependencies',
      apply: true,
    })

    expect(result.postApplyValidation?.status).toBe('invalid-specs-detected')
    expect(result.postApplyValidation?.invalidSpecs).toHaveLength(1)
    expect(result.postApplyValidation?.suggestedAlignmentCommand).toContain('sdk:suggest-spec-dependencies')
  })

  it('marks existing dependencies with alreadyIncluded: true and status: already-configured', async () => {
    const { useCase, getPersistedDeps } = setupTest()

    getPersistedDeps.execute.mockResolvedValueOnce({
      specId: 'sdk:suggest-spec-dependencies',
      dependsOn: ['code-graph:traversal'],
      initialized: true,
    })

    const result = await useCase.execute({
      specId: 'sdk:suggest-spec-dependencies',
    })

    expect(result.specs[0]?.suggestedDependsOn).toHaveLength(1)
    expect(result.specs[0]?.suggestedDependsOn[0]?.alreadyIncluded).toBe(true)
    expect(result.specs[0]?.suggestedDependsOn[0]?.status).toBe('already-configured')
  })

  it('persists and utilizes SpecDepsSuggestionCachePort on subsequent execution', async () => {
    const { useCase } = setupTest()

    const firstRun = await useCase.execute({
      specId: 'sdk:suggest-spec-dependencies',
      rebuildCache: true,
    })

    expect(firstRun.result).toBe('ok')
    expect(firstRun.specs[0]?.suggestedDependsOn).toHaveLength(1)

    const secondRun = await useCase.execute({
      specId: 'sdk:suggest-spec-dependencies',
    })

    expect(secondRun.result).toBe('ok')
    expect(secondRun.specs[0]?.suggestedDependsOn).toHaveLength(1)
  })

  it('supports factory constructor overloads', () => {
    const { suggestImplementationLinks, specRepositories, getPersistedDeps, updatePersistedDeps } = setupTest()

    const instance = createSuggestSpecDependencies({
      suggestImplementationLinks: suggestImplementationLinks as any,
      specRepositories,
      getPersistedDeps: getPersistedDeps as any,
      updatePersistedDeps: updatePersistedDeps as any,
    })

    expect(instance).toBeInstanceOf(SuggestSpecDependencies)
  })

  it('expands 1 additional hop conditionally when encountering a barrel re-export file', async () => {
    const suggestImplementationLinks = {
      execute: vi.fn().mockResolvedValue({
        result: 'ok',
        specs: [
          {
            specId: 'cli:spec-deps',
            title: 'SpecDeps',
            existing: { files: ['cli:packages/cli/src/commands/spec/deps.ts'], symbols: [], dependsOn: [] },
            suggestions: [],
          },
          {
            specId: 'sdk:suggest-spec-dependencies',
            title: 'SuggestSpecDependencies',
            existing: { files: ['sdk:packages/sdk/src/orchestration/suggest-spec-dependencies.ts'], symbols: [], dependsOn: [] },
            suggestions: [],
          },
        ],
      }),
    }

    const repo = {
      list: vi.fn().mockResolvedValue([{ workspace: 'cli', path: 'spec-deps', title: 'SpecDeps' }]),
    } as unknown as SpecRepository

    const specRepositories = new Map<string, SpecRepository>([['cli', repo]])

    const getPersistedDeps = {
      execute: vi.fn().mockResolvedValue({ specId: 'cli:spec-deps', dependsOn: [], initialized: true }),
    }

    const codeGraphProvider = {
      analyzeFileImpact: vi.fn().mockImplementation(async (filePath: string, _dir: string, depth: number) => {
        expect(depth).toBe(1)
        if (filePath.includes('commands/spec/deps.ts')) {
          return {
            affectedFiles: [{ filePath: 'packages/sdk/src/index.ts' }],
          }
        }
        if (filePath.includes('packages/sdk/src/index.ts')) {
          return {
            affectedFiles: [{ filePath: 'packages/sdk/src/orchestration/suggest-spec-dependencies.ts' }],
          }
        }
        return { affectedFiles: [] }
      }),
    } as any

    const useCase = new SuggestSpecDependencies({
      suggestImplementationLinks: suggestImplementationLinks as any,
      specRepositories,
      getPersistedDeps: getPersistedDeps as any,
      updatePersistedDeps: vi.fn() as any,
      validateSpecs: vi.fn() as any,
      codeGraphProvider,
      projectDir: '/tmp/test-project-barrel',
    })

    const result = await useCase.execute({ specId: 'cli:spec-deps', rebuildCache: true })

    expect(result.result).toBe('ok')
    expect(result.specs[0]?.suggestedDependsOn).toHaveLength(1)
    expect(result.specs[0]?.suggestedDependsOn[0]?.specId).toBe('sdk:suggest-spec-dependencies')
    expect(codeGraphProvider.analyzeFileImpact).toHaveBeenCalledWith(
      expect.stringContaining('index.ts'),
      'downstream',
      1,
    )
  })

  it('throws InvalidInputError when no targeting criteria is specified', async () => {
    const { useCase } = setupTest()

    await expect(useCase.execute({})).rejects.toThrow(InvalidInputError)
    await expect(useCase.execute({})).rejects.toBeInstanceOf(SpecdError)
  })

  it('throws WorkspaceNotFoundError when requested workspace does not exist', async () => {
    const { useCase } = setupTest()

    await expect(useCase.execute({ workspace: 'non-existent-ws' })).rejects.toThrow(WorkspaceNotFoundError)
    await expect(useCase.execute({ workspace: 'non-existent-ws' })).rejects.toBeInstanceOf(SpecdError)
  })

  it('throws SpecNotFoundError when target spec ID does not exist', async () => {
    const { useCase } = setupTest()

    await expect(
      useCase.execute({
        specId: 'sdk:non-existent-spec',
      }),
    ).rejects.toThrow(SpecNotFoundError)
    await expect(
      useCase.execute({
        specId: 'sdk:non-existent-spec',
      }),
    ).rejects.toBeInstanceOf(SpecdError)
  })

  it('prunes inverted dependency suggestions when candidate imports target but target does not import candidate (directional validation)', async () => {
    const suggestImplementationLinks = {
      execute: vi.fn().mockResolvedValue({
        result: 'ok',
        specs: [
          {
            specId: 'core:spec-repository-port',
            title: 'SpecRepository Port',
            existing: { files: ['core:packages/core/src/application/ports/spec-repository.ts'], symbols: [], dependsOn: [] },
            suggestions: [],
          },
          {
            specId: 'core:fs-spec-repository',
            title: 'FsSpecRepository',
            existing: { files: ['core:packages/core/src/infrastructure/fs/spec-repository.ts'], symbols: [], dependsOn: [] },
            suggestions: [],
          },
        ],
      }),
    }

    const list = vi.fn().mockResolvedValue([
      { workspace: 'core', path: 'spec-repository-port', title: 'SpecRepository Port' },
      { workspace: 'core', path: 'fs-spec-repository', title: 'FsSpecRepository' },
    ])

    const repo = { list } as unknown as SpecRepository
    const specRepositories = new Map<string, SpecRepository>([['core', repo]])

    const codeGraphProvider = {
      analyzeFileImportImpact: vi.fn().mockImplementation(async (filePath: string) => {
        // When checking what ports/spec-repository.ts imports: it imports nothing from fs
        if (filePath.includes('ports/spec-repository.ts')) {
          return { affectedFiles: [] }
        }
        // When checking what fs/spec-repository.ts imports: it imports ports/spec-repository.ts
        if (filePath.includes('fs/spec-repository.ts')) {
          return { affectedFiles: [{ filePath: 'packages/core/src/application/ports/spec-repository.ts' }] }
        }
        return { affectedFiles: [] }
      }),
      analyzeFileImpact: vi.fn().mockImplementation(async (filePath: string) => {
        // If an accidental hub/barrel was queried returning fs
        if (filePath.includes('ports/spec-repository.ts')) {
          return { affectedFiles: [{ filePath: 'packages/core/src/infrastructure/fs/spec-repository.ts' }] }
        }
        return { affectedFiles: [] }
      }),
    } as any

    const getPersistedDeps = {
      execute: vi.fn().mockResolvedValue({
        specId: 'core:spec-repository-port',
        dependsOn: [],
        initialized: true,
      }),
    }

    const useCase = new SuggestSpecDependencies({
      suggestImplementationLinks: suggestImplementationLinks as any,
      specRepositories,
      getPersistedDeps: getPersistedDeps as any,
      updatePersistedDeps: vi.fn() as any,
      validateSpecs: vi.fn() as any,
      codeGraphProvider,
      projectDir: '/tmp/test-directional-validation',
    })

    const result = await useCase.execute({ specId: 'core:spec-repository-port', rebuildCache: true })

    expect(result.result).toBe('ok')
    expect(result.specs[0]?.suggestedDependsOn).toHaveLength(0)
  })

  it('prunes redundant candidate recommendation when another candidate recommendation directly depends on it (transitive reduction)', async () => {
    const suggestImplementationLinks = {
      execute: vi.fn().mockResolvedValue({
        result: 'ok',
        specs: [
          {
            specId: 'core:fs-spec-repository',
            title: 'FsSpecRepository',
            existing: { files: ['core:packages/core/src/infrastructure/fs/spec-repository.ts'], symbols: [], dependsOn: [] },
            suggestions: [],
          },
          {
            specId: 'core:spec-repository-port',
            title: 'SpecRepository Port',
            existing: { files: ['core:packages/core/src/application/ports/spec-repository.ts'], symbols: [], dependsOn: [] },
            suggestions: [],
          },
          {
            specId: 'core:repository-port',
            title: 'Repository Base',
            existing: { files: ['core:packages/core/src/application/ports/repository.ts'], symbols: [], dependsOn: [] },
            suggestions: [],
          },
        ],
      }),
    }

    const list = vi.fn().mockResolvedValue([
      { workspace: 'core', path: 'fs-spec-repository', title: 'FsSpecRepository' },
      { workspace: 'core', path: 'spec-repository-port', title: 'SpecRepository Port' },
      { workspace: 'core', path: 'repository-port', title: 'Repository Base' },
    ])

    const repo = { list } as unknown as SpecRepository
    const specRepositories = new Map<string, SpecRepository>([['core', repo]])

    const codeGraphProvider = {
      analyzeFileImportImpact: vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath.includes('fs/spec-repository.ts')) {
          return {
            affectedFiles: [
              { filePath: 'packages/core/src/application/ports/spec-repository.ts' },
              { filePath: 'packages/core/src/application/ports/repository.ts' },
            ],
          }
        }
        return { affectedFiles: [] }
      }),
    } as any

    const getPersistedDeps = {
      execute: vi.fn().mockImplementation(async ({ specId }: { specId: string }) => {
        if (specId === 'core:spec-repository-port') {
          return { specId, dependsOn: ['core:repository-port'], initialized: true }
        }
        return { specId, dependsOn: [], initialized: true }
      }),
    }

    const useCase = new SuggestSpecDependencies({
      suggestImplementationLinks: suggestImplementationLinks as any,
      specRepositories,
      getPersistedDeps: getPersistedDeps as any,
      updatePersistedDeps: vi.fn() as any,
      validateSpecs: vi.fn() as any,
      codeGraphProvider,
      projectDir: '/tmp/test-transitive-reduction',
    })

    const result = await useCase.execute({ specId: 'core:fs-spec-repository', rebuildCache: true })

    expect(result.result).toBe('ok')
    expect(result.specs[0]?.suggestedDependsOn).toHaveLength(1)
    expect(result.specs[0]?.suggestedDependsOn[0]?.specId).toBe('core:spec-repository-port')
  })

  it('emits onProgress events during execution', async () => {
    const { useCase } = setupTest()
    const events: any[] = []

    await useCase.execute({
      specId: 'sdk:suggest-spec-dependencies',
      onProgress: (evt) => events.push(evt),
    })

    expect(events.length).toBeGreaterThan(0)
    expect(events.some((e) => e.type === 'warmup-start')).toBe(true)
    expect(events.some((e) => e.type === 'warmup-done')).toBe(true)
    expect(events.some((e) => e.type === 'start')).toBe(true)
    expect(events.some((e) => e.type === 'spec-start')).toBe(true)
    expect(events.some((e) => e.type === 'spec-done')).toBe(true)
    expect(events.some((e) => e.type === 'done')).toBe(true)
  })
})
