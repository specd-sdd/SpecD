import { describe, expect, it, vi } from 'vitest'
import {
  SuggestSpecDependencies,
  createSuggestSpecDependencies,
  type SuggestSpecDepsProgressEvent,
  type SuggestSpecDependenciesDeps,
} from '../../../src/application/use-cases/suggest-spec-dependencies.js'
import { type SuggestImplementationLinks } from '../../../src/application/use-cases/suggest-implementation-links.js'
import {
  SpecdError,
  InvalidInputError,
  WorkspaceNotFoundError,
  SpecNotFoundError,
  type GetPersistedSpecDeps,
  type UpdatePersistedSpecDeps,
  type ValidateSpecs,
  type SpecRepository,
  type CreateChange,
} from '@specd/core'
import { type CodeGraphProvider } from '@specd/code-graph'
import {
  ImplementationSuggestionCachePort,
  type SetImplementationSuggestionInput,
} from '../../../src/application/ports/implementation-suggestion-cache-port.js'
import { type ImplementationSuggestionSpecEntry } from '../../../src/domain/value-objects/implementation-suggestion-cache.js'
import {
  SpecDepsSuggestionCachePort,
  type SetSpecDepsSuggestionInput,
} from '../../../src/application/ports/spec-deps-suggestion-cache-port.js'
import { type SpecDepsSuggestionSpecEntry } from '../../../src/domain/value-objects/spec-deps-suggestion-cache.js'

class InMemoryImplementationSuggestionCache extends ImplementationSuggestionCachePort {
  private data = new Map<string, ImplementationSuggestionSpecEntry>()

  async get(specId: string): Promise<ImplementationSuggestionSpecEntry | null> {
    return this.data.get(specId) ?? null
  }

  async set(specId: string, input: SetImplementationSuggestionInput): Promise<void> {
    this.data.set(specId, {
      specId,
      title: input.title ?? specId,
      specStamp: input.specContentHash
        ? { lastModified: '2026-08-16T12:00:00.000Z', hash: input.specContentHash, artifacts: [] }
        : { lastModified: '', hash: '', artifacts: [] },
      existing: input.existing ?? { files: [], symbols: [], dependsOn: [] },
      suggestions: input.suggestions,
    })
  }

  async setMany(entries: readonly ImplementationSuggestionSpecEntry[]): Promise<void> {
    for (const entry of entries) {
      this.data.set(entry.specId, entry)
    }
  }

  async getAll(): Promise<ReadonlyMap<string, ImplementationSuggestionSpecEntry>> {
    return this.data
  }

  async findSpecByFile(filePath: string): Promise<string | null> {
    const map = await this.getFileToSpecMap()
    if (map.has(filePath)) return map.get(filePath) ?? null
    const rawPath = filePath.replace(/^[^:]+:/, '')
    if (map.has(rawPath)) return map.get(rawPath) ?? null
    const shortRelPath = rawPath.replace(/^(?:packages|apps)\/[^/]+\//, '')
    if (map.has(shortRelPath)) return map.get(shortRelPath) ?? null
    return null
  }

  async getFileToSpecMap(): Promise<ReadonlyMap<string, string>> {
    const map = new Map<string, string>()
    const register = (fileKey: string, specId: string): void => {
      if (!fileKey) return
      const keys = new Set<string>([fileKey])
      const rawPath = fileKey.replace(/^[^:]+:/, '')
      keys.add(rawPath)
      keys.add(rawPath.replace(/^(?:packages|apps)\/[^/]+\//, ''))
      for (const k of keys) {
        if (!map.has(k)) map.set(k, specId)
      }
    }
    for (const [specId, entry] of this.data.entries()) {
      for (const f of entry.existing.files) register(f, specId)
    }
    for (const [specId, entry] of this.data.entries()) {
      for (const s of entry.suggestions) {
        if (s.confidence === 'HIGH') register(s.file, specId)
      }
    }
    return map
  }

  async flush(): Promise<void> {}

  async invalidate(): Promise<void> {
    this.data.clear()
  }
}

class InMemorySpecDepsSuggestionCache extends SpecDepsSuggestionCachePort {
  private data = new Map<string, SpecDepsSuggestionSpecEntry>()

  async get(specId: string): Promise<SpecDepsSuggestionSpecEntry | null> {
    return this.data.get(specId) ?? null
  }

  async set(specId: string, input: SetSpecDepsSuggestionInput): Promise<void> {
    this.data.set(specId, {
      specId,
      title: input.title ?? specId,
      specStamp: { lastModified: '2026-08-16T12:00:00.000Z', hash: 'hash123', artifacts: [] },
      existingDependsOn: input.existingDependsOn ?? [],
      suggestedDependsOn: input.suggestedDependsOn,
      ...(input.fileToSpecFingerprint
        ? { fileToSpecFingerprint: input.fileToSpecFingerprint }
        : {}),
    })
  }

  async setMany(entries: readonly SpecDepsSuggestionSpecEntry[]): Promise<void> {
    for (const entry of entries) {
      this.data.set(entry.specId, entry)
    }
  }

  async getAll(): Promise<ReadonlyMap<string, SpecDepsSuggestionSpecEntry>> {
    return this.data
  }

  async flush(): Promise<void> {}

  async invalidate(): Promise<void> {
    this.data.clear()
  }
}

function setupTest() {
  const suggestImplementationLinks = {
    execute: vi.fn().mockResolvedValue({
      result: 'ok',
      specs: [
        {
          specId: 'sdk:suggest-spec-dependencies',
          title: 'SuggestSpecDependencies',
          specStamp: {
            lastModified: '2026-01-01T00:00:00.000Z',
            hash: 'stub-sdk-hash',
            artifacts: [],
          },
          existing: {
            files: ['sdk:packages/sdk/src/application/use-cases/suggest-spec-dependencies.ts'],
            symbols: [],
            dependsOn: [],
          },
          suggestions: [],
        },
        {
          specId: 'code-graph:traversal',
          title: 'Traversal',
          specStamp: {
            lastModified: '2026-01-01T00:00:00.000Z',
            hash: 'stub-cg-hash',
            artifacts: [],
          },
          existing: {
            files: ['code-graph:packages/code-graph/src/domain/services/analyze-file-impact.ts'],
            symbols: [],
            dependsOn: [],
          },
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
      entries: [],
      totalSpecs: 0,
      passed: 0,
      failed: 0,
    }),
  }

  const analyzeFileImpact = vi.fn().mockImplementation(async (filePath: string) => {
    if (filePath.includes('suggest-spec-dependencies.ts')) {
      return {
        affectedFiles: [
          { filePath: 'packages/code-graph/src/domain/services/analyze-file-impact.ts' },
        ],
      }
    }
    return { affectedFiles: [] }
  })

  const codeGraphProvider = {
    analyzeFileImpact,
  } as unknown as CodeGraphProvider

  const useCase = new SuggestSpecDependencies({
    suggestImplementationLinks: suggestImplementationLinks as unknown as SuggestImplementationLinks,
    specRepositories,
    getPersistedDeps: getPersistedDeps as unknown as GetPersistedSpecDeps,
    updatePersistedDeps: updatePersistedDeps as unknown as UpdatePersistedSpecDeps,
    validateSpecs: validateSpecs as unknown as ValidateSpecs,
    codeGraphProvider,
    cache: new InMemoryImplementationSuggestionCache(),
    specDepsCache: new InMemorySpecDepsSuggestionCache(),
    projectDir: '/tmp/test-project',
  })

  return {
    useCase,
    suggestImplementationLinks,
    getPersistedDeps,
    updatePersistedDeps,
    validateSpecs,
    analyzeFileImpact,
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

  it('propagates dependency mutation failures', async () => {
    const { useCase, updatePersistedDeps } = setupTest()
    updatePersistedDeps.execute.mockRejectedValueOnce(new Error('lock write failed'))

    await expect(
      useCase.execute({ specId: 'sdk:suggest-spec-dependencies', apply: true }),
    ).rejects.toThrow('lock write failed')
  })

  it('handles invalid specs after applying dependencies and reports diagnostic', async () => {
    const { useCase, validateSpecs } = setupTest()
    validateSpecs.execute.mockResolvedValueOnce({
      entries: [
        {
          spec: 'sdk:suggest-spec-dependencies',
          passed: false,
          failures: [{ artifactId: 'specs', description: 'Missing requirement link' }],
          warnings: [],
        },
      ],
      totalSpecs: 1,
      passed: 0,
      failed: 1,
    })

    const result = await useCase.execute({
      specId: 'sdk:suggest-spec-dependencies',
      apply: true,
    })

    expect(result.postApplyValidation?.status).toBe('invalid-specs-detected')
    expect(result.postApplyValidation?.invalidSpecs).toHaveLength(1)
    expect(result.postApplyValidation?.suggestedAlignmentCommand).toContain(
      'sdk:suggest-spec-dependencies',
    )
  })

  it('passes formatted exploration content to CreateChange without writing files', async () => {
    const { useCase, validateSpecs } = setupTest()
    const createChange = {
      execute: vi.fn().mockResolvedValue({ change: {}, changePath: '/changes/alignment' }),
    }
    validateSpecs.execute.mockResolvedValueOnce({
      entries: [
        {
          spec: 'sdk:suggest-spec-dependencies',
          passed: false,
          failures: [{ artifactId: 'specs', description: 'Missing requirement link' }],
          warnings: [],
        },
      ],
      totalSpecs: 1,
      passed: 0,
      failed: 1,
    })
    const withCreate = new SuggestSpecDependencies({
      ...(useCase as unknown as { deps: SuggestSpecDependenciesDeps }).deps,
      createChange: createChange as unknown as CreateChange,
    })

    const result = await withCreate.execute({
      specId: 'sdk:suggest-spec-dependencies',
      apply: true,
      createAlignmentChange: true,
    })

    expect(createChange.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        specIds: ['sdk:suggest-spec-dependencies'],
        explorationContent: expect.stringContaining('[specs]: Missing requirement link'),
      }),
    )
    expect(result.postApplyValidation?.createdChange).toEqual(
      expect.objectContaining({ changePath: '/changes/alignment' }),
    )
  })

  it('fails before mutation when apply lacks ValidateSpecs', async () => {
    const { useCase, updatePersistedDeps } = setupTest()
    const { validateSpecs: _validateSpecs, ...deps } = (
      useCase as unknown as { deps: SuggestSpecDependenciesDeps }
    ).deps
    const withoutValidation = new SuggestSpecDependencies(deps)

    await expect(
      withoutValidation.execute({ specId: 'sdk:suggest-spec-dependencies', apply: true }),
    ).rejects.toBeInstanceOf(InvalidInputError)
    expect(updatePersistedDeps.execute).not.toHaveBeenCalled()
  })

  it('propagates validation failures instead of reporting all-valid', async () => {
    const { useCase, validateSpecs } = setupTest()
    validateSpecs.execute.mockRejectedValueOnce(new Error('validator unavailable'))

    await expect(
      useCase.execute({
        specId: 'sdk:suggest-spec-dependencies',
        apply: true,
      }),
    ).rejects.toThrow('validator unavailable')
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
    const { useCase, analyzeFileImpact } = setupTest()

    const firstRun = await useCase.execute({
      specId: 'sdk:suggest-spec-dependencies',
      rebuildCache: true,
    })

    expect(firstRun.result).toBe('ok')
    expect(firstRun.specs[0]?.suggestedDependsOn).toHaveLength(1)

    analyzeFileImpact.mockClear()

    const secondRun = await useCase.execute({
      specId: 'sdk:suggest-spec-dependencies',
    })

    expect(secondRun.result).toBe('ok')
    expect(secondRun.specs[0]?.suggestedDependsOn).toHaveLength(1)
    // Cached run must be served entirely from SpecDepsSuggestionCachePort.
    expect(analyzeFileImpact).not.toHaveBeenCalled()
  })

  it('recomputes cached suggestions when an imported file changes owner between runs', async () => {
    const implCache = new InMemoryImplementationSuggestionCache()
    const depsCache = new InMemorySpecDepsSuggestionCache()
    const { useCase, suggestImplementationLinks, specRepositories } = setupTest()

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
    } as unknown as CodeGraphProvider

    const localUseCase = new SuggestSpecDependencies({
      suggestImplementationLinks:
        suggestImplementationLinks as unknown as SuggestImplementationLinks,
      specRepositories,
      getPersistedDeps: {
        execute: vi.fn().mockResolvedValue({
          specId: 'sdk:suggest-spec-dependencies',
          dependsOn: [],
          initialized: true,
        }),
      } as unknown as GetPersistedSpecDeps,
      updatePersistedDeps: {
        execute: vi.fn().mockResolvedValue({ created: false }),
      } as unknown as UpdatePersistedSpecDeps,
      validateSpecs: {
        execute: vi.fn().mockResolvedValue({ issues: [] }),
      } as unknown as ValidateSpecs,
      codeGraphProvider,
      cache: implCache,
      specDepsCache: depsCache,
      projectDir: '/tmp/test-owner-change',
    })
    void useCase

    const firstRun = await localUseCase.execute({
      specId: 'sdk:suggest-spec-dependencies',
      rebuildCache: true,
    })

    expect(firstRun.result).toBe('ok')
    expect(firstRun.specs[0]?.suggestedDependsOn.map((d) => d.specId)).toEqual([
      'code-graph:traversal',
    ])

    // Ownership of the imported file moves from the traversal spec to a new
    // spec. Mutate the warm-up source so run 2 primes the shifted ownership;
    // the target's own stamp stays identical throughout.
    suggestImplementationLinks.execute.mockResolvedValue({
      result: 'ok',
      specs: [
        {
          specId: 'sdk:suggest-spec-dependencies',
          title: 'SuggestSpecDependencies',
          specStamp: {
            lastModified: '2026-01-01T00:00:00.000Z',
            hash: 'stub-sdk-hash',
            artifacts: [],
          },
          existing: {
            files: ['sdk:packages/sdk/src/application/use-cases/suggest-spec-dependencies.ts'],
            symbols: [],
            dependsOn: [],
          },
          suggestions: [],
        },
        {
          specId: 'code-graph:traversal',
          title: 'Traversal',
          specStamp: {
            lastModified: '2026-01-02T00:00:00.000Z',
            hash: 'stub-cg-hash-v2',
            artifacts: [],
          },
          existing: {
            files: ['code-graph:packages/code-graph/src/domain/services/other-file.ts'],
            symbols: [],
            dependsOn: [],
          },
          suggestions: [],
        },
        {
          specId: 'code-graph:new-owner',
          title: 'NewOwner',
          specStamp: {
            lastModified: '2026-01-03T00:00:00.000Z',
            hash: 'stub-new-owner-hash',
            artifacts: [],
          },
          existing: {
            files: ['code-graph:packages/code-graph/src/domain/services/analyze-file-impact.ts'],
            symbols: [],
            dependsOn: [],
          },
          suggestions: [],
        },
      ],
    })

    const secondRun = await localUseCase.execute({
      specId: 'sdk:suggest-spec-dependencies',
    })

    expect(secondRun.result).toBe('ok')
    const depIds = secondRun.specs[0]?.suggestedDependsOn.map((d) => d.specId) ?? []
    expect(depIds).toContain('code-graph:new-owner')
    expect(depIds).not.toContain('code-graph:traversal')
  })

  it('throws InvalidInputError when createAlignmentChange lacks a CreateChange dependency', async () => {
    const { useCase } = setupTest()

    // setupTest wires no createChange dependency, so requesting an alignment
    // change must propagate InvalidInputError instead of degrading to the
    // fail-open all-valid fallback.
    await expect(
      useCase.execute({
        specId: 'sdk:suggest-spec-dependencies',
        apply: true,
        createAlignmentChange: true,
      }),
    ).rejects.toBeInstanceOf(InvalidInputError)
  })

  it('throws WorkspaceNotFoundError when a resolved workspace yields no specs', async () => {
    const { suggestImplementationLinks } = setupTest()

    const emptyRepo = {
      list: vi.fn().mockResolvedValue([]),
    } as unknown as SpecRepository
    const repos = new Map<string, SpecRepository>([['empty', emptyRepo]])

    const useCase = new SuggestSpecDependencies({
      suggestImplementationLinks:
        suggestImplementationLinks as unknown as SuggestImplementationLinks,
      specRepositories: repos,
      getPersistedDeps: vi.fn() as unknown as GetPersistedSpecDeps,
      updatePersistedDeps: vi.fn() as unknown as UpdatePersistedSpecDeps,
      validateSpecs: vi.fn() as unknown as ValidateSpecs,
      cache: new InMemoryImplementationSuggestionCache(),
      specDepsCache: new InMemorySpecDepsSuggestionCache(),
      projectDir: '/tmp/test-empty-workspace',
    })

    await expect(useCase.execute({ workspace: 'empty' })).rejects.toBeInstanceOf(
      WorkspaceNotFoundError,
    )
  })

  it('throws InvalidInputError when all repositories are empty under all:true', async () => {
    const { suggestImplementationLinks } = setupTest()

    const emptyRepo = {
      list: vi.fn().mockResolvedValue([]),
    } as unknown as SpecRepository
    const repos = new Map<string, SpecRepository>([['sdk', emptyRepo]])

    const useCase = new SuggestSpecDependencies({
      suggestImplementationLinks:
        suggestImplementationLinks as unknown as SuggestImplementationLinks,
      specRepositories: repos,
      getPersistedDeps: vi.fn() as unknown as GetPersistedSpecDeps,
      updatePersistedDeps: vi.fn() as unknown as UpdatePersistedSpecDeps,
      validateSpecs: vi.fn() as unknown as ValidateSpecs,
      cache: new InMemoryImplementationSuggestionCache(),
      specDepsCache: new InMemorySpecDepsSuggestionCache(),
      projectDir: '/tmp/test-empty-all',
    })

    await expect(useCase.execute({ all: true })).rejects.toBeInstanceOf(InvalidInputError)
  })

  it('supports factory constructor overloads', () => {
    const { suggestImplementationLinks, specRepositories, getPersistedDeps, updatePersistedDeps } =
      setupTest()

    const instance = createSuggestSpecDependencies({
      suggestImplementationLinks:
        suggestImplementationLinks as unknown as SuggestImplementationLinks,
      specRepositories,
      getPersistedDeps: getPersistedDeps as unknown as GetPersistedSpecDeps,
      updatePersistedDeps: updatePersistedDeps as unknown as UpdatePersistedSpecDeps,
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
            specStamp: {
              lastModified: '2026-01-01T00:00:00.000Z',
              hash: 'stub-cli-hash',
              artifacts: [],
            },
            existing: {
              files: ['cli:packages/cli/src/commands/spec/deps.ts'],
              symbols: [],
              dependsOn: [],
            },
            suggestions: [],
          },
          {
            specId: 'sdk:suggest-spec-dependencies',
            title: 'SuggestSpecDependencies',
            specStamp: {
              lastModified: '2026-01-01T00:00:00.000Z',
              hash: 'stub-sdk-hash',
              artifacts: [],
            },
            existing: {
              files: ['sdk:packages/sdk/src/application/use-cases/suggest-spec-dependencies.ts'],
              symbols: [],
              dependsOn: [],
            },
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
      execute: vi
        .fn()
        .mockResolvedValue({ specId: 'cli:spec-deps', dependsOn: [], initialized: true }),
    }

    const analyzeFileImpact = vi
      .fn()
      .mockImplementation(async (filePath: string, _dir: string, depth: number) => {
        expect(depth).toBe(1)
        if (filePath.includes('commands/spec/deps.ts')) {
          return {
            affectedFiles: [{ filePath: 'packages/sdk/src/index.ts' }],
          }
        }
        if (filePath.includes('packages/sdk/src/index.ts')) {
          return {
            affectedFiles: [
              { filePath: 'packages/sdk/src/application/use-cases/suggest-spec-dependencies.ts' },
            ],
          }
        }
        return { affectedFiles: [] }
      })

    const codeGraphProvider = {
      analyzeFileImpact,
    } as unknown as CodeGraphProvider

    const useCase = new SuggestSpecDependencies({
      suggestImplementationLinks:
        suggestImplementationLinks as unknown as SuggestImplementationLinks,
      specRepositories,
      getPersistedDeps: getPersistedDeps as unknown as GetPersistedSpecDeps,
      updatePersistedDeps: vi.fn() as unknown as UpdatePersistedSpecDeps,
      validateSpecs: vi.fn() as unknown as ValidateSpecs,
      codeGraphProvider,
      cache: new InMemoryImplementationSuggestionCache(),
      specDepsCache: new InMemorySpecDepsSuggestionCache(),
      projectDir: '/tmp/test-project-barrel',
    })

    const result = await useCase.execute({ specId: 'cli:spec-deps', rebuildCache: true })

    expect(result.result).toBe('ok')
    expect(result.specs[0]?.suggestedDependsOn).toHaveLength(1)
    expect(result.specs[0]?.suggestedDependsOn[0]?.specId).toBe('sdk:suggest-spec-dependencies')
    expect(analyzeFileImpact).toHaveBeenCalledWith(
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

    await expect(useCase.execute({ workspace: 'non-existent-ws' })).rejects.toThrow(
      WorkspaceNotFoundError,
    )
    await expect(useCase.execute({ workspace: 'non-existent-ws' })).rejects.toBeInstanceOf(
      SpecdError,
    )
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
            specStamp: {
              lastModified: '2026-01-01T00:00:00.000Z',
              hash: 'stub-core-port-hash',
              artifacts: [],
            },
            existing: {
              files: ['core:packages/core/src/application/ports/spec-repository.ts'],
              symbols: [],
              dependsOn: [],
            },
            suggestions: [],
          },
          {
            specId: 'core:fs-spec-repository',
            title: 'FsSpecRepository',
            specStamp: {
              lastModified: '2026-01-01T00:00:00.000Z',
              hash: 'stub-core-fs-hash',
              artifacts: [],
            },
            existing: {
              files: ['core:packages/core/src/infrastructure/fs/spec-repository.ts'],
              symbols: [],
              dependsOn: [],
            },
            suggestions: [],
          },
          {
            specId: 'core:spec-lock',
            title: 'SpecLock',
            specStamp: {
              lastModified: '2026-01-01T00:00:00.000Z',
              hash: 'stub-core-lock-hash',
              artifacts: [],
            },
            existing: {
              files: ['core:packages/core/src/application/use-cases/spec-lock.ts'],
              symbols: [],
              dependsOn: [],
            },
            suggestions: [],
          },
        ],
      }),
    }

    const list = vi.fn().mockResolvedValue([
      { workspace: 'core', path: 'spec-repository-port', title: 'SpecRepository Port' },
      { workspace: 'core', path: 'fs-spec-repository', title: 'FsSpecRepository' },
      { workspace: 'core', path: 'spec-lock', title: 'SpecLock' },
    ])

    const repo = { list } as unknown as SpecRepository
    const specRepositories = new Map<string, SpecRepository>([['core', repo]])

    const codeGraphProvider = {
      analyzeFileImportImpact: vi.fn().mockImplementation(async (filePath: string) => {
        // Downstream (outbound) impact of the target port file: it references the
        // spec-lock use case directly plus an application barrel. The barrel hop
        // seeds the inverted fs-adapter candidate without adding it to the
        // target's direct outbound set.
        if (filePath.endsWith('application/ports/spec-repository.ts')) {
          return {
            affectedFiles: [
              { filePath: 'packages/core/src/application/use-cases/spec-lock.ts' },
              { filePath: 'packages/core/src/application/ports.ts' },
            ],
          }
        }
        // Barrel expansion: the application barrel re-exports the fs adapter.
        if (filePath.endsWith('application/ports.ts')) {
          return {
            affectedFiles: [{ filePath: 'packages/core/src/infrastructure/fs/spec-repository.ts' }],
          }
        }
        // Inverse check for the fs adapter: its code references the target port file
        // while the target never imports it back -> inverted -> pruned in Pass 2.5.
        if (filePath.includes('infrastructure/fs/spec-repository.ts')) {
          return {
            affectedFiles: [{ filePath: 'packages/core/src/application/ports/spec-repository.ts' }],
          }
        }
        // Inverse check for spec-lock: no reference to the target port -> kept.
        return { affectedFiles: [] }
      }),
      analyzeFileImpact: vi.fn().mockResolvedValue({ affectedFiles: [] }),
    } as unknown as CodeGraphProvider

    const getPersistedDeps = {
      execute: vi.fn().mockResolvedValue({
        specId: 'core:spec-repository-port',
        dependsOn: [],
        initialized: true,
      }),
    }

    const useCase = new SuggestSpecDependencies({
      suggestImplementationLinks:
        suggestImplementationLinks as unknown as SuggestImplementationLinks,
      specRepositories,
      getPersistedDeps: getPersistedDeps as unknown as GetPersistedSpecDeps,
      updatePersistedDeps: vi.fn() as unknown as UpdatePersistedSpecDeps,
      validateSpecs: vi.fn() as unknown as ValidateSpecs,
      codeGraphProvider,
      cache: new InMemoryImplementationSuggestionCache(),
      specDepsCache: new InMemorySpecDepsSuggestionCache(),
      projectDir: '/tmp/test-directional-validation',
    })

    const result = await useCase.execute({
      specId: 'core:spec-repository-port',
      rebuildCache: true,
    })

    expect(result.result).toBe('ok')
    // Pass 2.5 must keep only the non-inverted candidate.
    expect(result.specs[0]?.suggestedDependsOn).toHaveLength(1)
    expect(result.specs[0]?.suggestedDependsOn[0]?.specId).toBe('core:spec-lock')
    expect(
      result.specs[0]?.suggestedDependsOn.some((d) => d.specId === 'core:fs-spec-repository'),
    ).toBe(false)
  })

  it('prunes redundant candidate recommendation when another candidate recommendation directly depends on it (transitive reduction)', async () => {
    const suggestImplementationLinks = {
      execute: vi.fn().mockResolvedValue({
        result: 'ok',
        specs: [
          {
            specId: 'core:fs-spec-repository',
            title: 'FsSpecRepository',
            specStamp: {
              lastModified: '2026-01-01T00:00:00.000Z',
              hash: 'stub-core-fs-hash',
              artifacts: [],
            },
            existing: {
              files: ['core:packages/core/src/infrastructure/fs/spec-repository.ts'],
              symbols: [],
              dependsOn: [],
            },
            suggestions: [],
          },
          {
            specId: 'core:spec-repository-port',
            title: 'SpecRepository Port',
            specStamp: {
              lastModified: '2026-01-01T00:00:00.000Z',
              hash: 'stub-core-port-hash',
              artifacts: [],
            },
            existing: {
              files: ['core:packages/core/src/application/ports/spec-repository.ts'],
              symbols: [],
              dependsOn: [],
            },
            suggestions: [],
          },
          {
            specId: 'core:repository-port',
            title: 'Repository Base',
            specStamp: {
              lastModified: '2026-01-01T00:00:00.000Z',
              hash: 'stub-core-base-hash',
              artifacts: [],
            },
            existing: {
              files: ['core:packages/core/src/application/ports/repository.ts'],
              symbols: [],
              dependsOn: [],
            },
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
    } as unknown as CodeGraphProvider

    const getPersistedDeps = {
      execute: vi.fn().mockImplementation(async ({ specId }: { specId: string }) => {
        if (specId === 'core:spec-repository-port') {
          return { specId, dependsOn: ['core:repository-port'], initialized: true }
        }
        return { specId, dependsOn: [], initialized: true }
      }),
    }

    const useCase = new SuggestSpecDependencies({
      suggestImplementationLinks:
        suggestImplementationLinks as unknown as SuggestImplementationLinks,
      specRepositories,
      getPersistedDeps: getPersistedDeps as unknown as GetPersistedSpecDeps,
      updatePersistedDeps: vi.fn() as unknown as UpdatePersistedSpecDeps,
      validateSpecs: vi.fn() as unknown as ValidateSpecs,
      codeGraphProvider,
      cache: new InMemoryImplementationSuggestionCache(),
      specDepsCache: new InMemorySpecDepsSuggestionCache(),
      projectDir: '/tmp/test-transitive-reduction',
    })

    const result = await useCase.execute({ specId: 'core:fs-spec-repository', rebuildCache: true })

    expect(result.result).toBe('ok')
    expect(result.specs[0]?.suggestedDependsOn).toHaveLength(1)
    expect(result.specs[0]?.suggestedDependsOn[0]?.specId).toBe('core:spec-repository-port')
  })

  it('emits onProgress events during execution', async () => {
    const { useCase } = setupTest()
    const events: SuggestSpecDepsProgressEvent[] = []

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
