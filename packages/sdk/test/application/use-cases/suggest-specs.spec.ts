import { describe, it, expect } from 'vitest'
import {
  SuggestSpecs,
  type SuggestSpecsDeps,
} from '../../../src/application/use-cases/suggest-specs.js'
import { InvalidInputError, WorkspaceNotFoundError } from '@specd/core'

describe('SuggestSpecs', () => {
  const mockAdapterRegistry = {
    getSupportedExtensions: () => ['.ts', '.js'],
    getAdapters: () => [],
    getReservedKeywords: () => new Set<string>(),
  } as any

  const mockFileObserver = {
    exists: async () => true,
    readText: async () => '',
  }

  const mockCodeGraphProvider = {
    open: async () => {},
    close: async () => {},
    store: {
      getAllFiles: async () => [
        {
          path: 'src/application/use-cases/create-change.ts',
          configRelativePath: 'packages/core/src/application/use-cases/create-change.ts',
          language: 'typescript',
          workspace: 'core',
          contentHash: 'h1',
          embedding: undefined,
        },
        {
          path: 'src/domain/ports/change-repository.ts',
          configRelativePath: 'packages/core/src/domain/ports/change-repository.ts',
          language: 'typescript',
          workspace: 'core',
          contentHash: 'h2',
          embedding: undefined,
        },
        {
          path: 'src/commands/specs/suggest.ts',
          configRelativePath: 'packages/cli/src/commands/specs/suggest.ts',
          language: 'typescript',
          workspace: 'cli',
          contentHash: 'h3',
          embedding: undefined,
        },
        {
          path: 'test/application/use-cases/create-change.spec.ts',
          configRelativePath: 'packages/core/test/application/use-cases/create-change.spec.ts',
          language: 'typescript',
          workspace: 'core',
          contentHash: 'h4',
          embedding: undefined,
        },
      ],
    },
    findSymbols: async () => [
      {
        id: 'sym:1',
        name: 'CreateChange',
        kind: 'class',
        filePath: 'src/application/use-cases/create-change.ts',
        line: 10,
        column: 0,
        endLine: 50,
        endColumn: 1,
        selectionRange: { startLine: 10, startColumn: 0, endLine: 50, endColumn: 1 },
        parentId: undefined,
        comment: undefined,
      },
      {
        id: 'sym:2',
        name: 'ChangeRepository',
        kind: 'interface',
        filePath: 'src/domain/ports/change-repository.ts',
        line: 5,
        column: 0,
        endLine: 20,
        endColumn: 1,
        selectionRange: { startLine: 5, startColumn: 0, endLine: 20, endColumn: 1 },
        parentId: undefined,
        comment: undefined,
      },
    ],
    getHotspots: async () => ({
      hotspots: [
        {
          name: 'CreateChange',
          kind: 'class',
          filePath: 'src/application/use-cases/create-change.ts',
          score: 18,
          directCallers: 5,
          crossWorkspaceCallers: 2,
          riskLevel: 'HIGH',
        },
      ],
    }),
  } as any

  const deps: SuggestSpecsDeps = {
    codeGraphProvider: mockCodeGraphProvider,
    adapterRegistry: mockAdapterRegistry,
    fileObserver: mockFileObserver,
    specRepositories: new Map([
      ['core', {} as any],
      ['cli', {} as any],
    ]),
  }

  it('runs brownfield discovery across codebase returning structured result', async () => {
    const useCase = new SuggestSpecs(deps)
    const result = await useCase.execute({ ignoreCurrentSpecs: true })

    expect(result.result).toBe('ok')
    expect(result.summary.totalFilesAnalyzed).toBe(3)
    expect(result.summary.totalSpecsSuggested).toBeGreaterThan(0)
    expect(result.suggestedSpecs.length).toBeGreaterThan(0)

    const createChangeSpec = result.suggestedSpecs.find((s) => s.id === 'core:create-change')
    expect(createChangeSpec).toBeDefined()
    expect(createChangeSpec?.category).toBe('APPLICATION_USE_CASE')
    expect(createChangeSpec?.confidence).toBeGreaterThanOrEqual(0.8)
    expect(createChangeSpec?.anchorSymbols.length).toBeGreaterThan(0)
  })

  it('filters candidate specifications by workspace', async () => {
    const useCase = new SuggestSpecs(deps)
    const result = await useCase.execute({
      ignoreCurrentSpecs: true,
      workspaceFilter: 'cli',
    })

    expect(result.result).toBe('ok')
    expect(result.targetWorkspace).toBe('cli')
    for (const spec of result.suggestedSpecs) {
      expect(spec.workspace).toBe('cli')
    }
  })

  it('throws WorkspaceNotFoundError when workspace does not exist', async () => {
    const useCase = new SuggestSpecs(deps)
    await expect(useCase.execute({ workspaceFilter: 'non-existent' })).rejects.toThrowError(
      WorkspaceNotFoundError,
    )
  })

  it('throws InvalidInputError on invalid parameters', async () => {
    const useCase = new SuggestSpecs(deps)
    await expect(useCase.execute({ minConfidence: 1.5 })).rejects.toThrowError(InvalidInputError)

    await expect(useCase.execute({ limit: 0 })).rejects.toThrowError(InvalidInputError)
  })

  it('respects limit and minConfidence options', async () => {
    const useCase = new SuggestSpecs(deps)
    const result = await useCase.execute({
      ignoreCurrentSpecs: true,
      limit: 1,
      minConfidence: 0.5,
    })

    expect(result.suggestedSpecs.length).toBeLessThanOrEqual(1)
  })

  it('suggests separate candidate specs for distinct structural symbols in a shared legacy file', async () => {
    const legacyFiles = [
      {
        path: 'src/domain/legacy-services.ts',
        configRelativePath: 'packages/core/src/domain/legacy-services.ts',
        language: 'typescript',
        workspace: 'core',
        contentHash: 'legacy-1',
      },
    ]

    const legacySymbols = [
      {
        id: 'sym:auth-login',
        name: 'UserLoginService',
        kind: 'class',
        filePath: 'src/domain/legacy-services.ts',
      },
      {
        id: 'sym:pwd-reset',
        name: 'PasswordResetService',
        kind: 'class',
        filePath: 'src/domain/legacy-services.ts',
      },
      {
        id: 'sym:user-register',
        name: 'UserRegistrationService',
        kind: 'class',
        filePath: 'src/domain/legacy-services.ts',
      },
    ]

    const customDeps: SuggestSpecsDeps = {
      codeGraphProvider: {
        open: async () => {},
        close: async () => {},
        store: { getAllFiles: async () => legacyFiles },
        findSymbols: async () => legacySymbols,
        getHotspots: async () => ({ hotspots: [] }),
      } as any,
      adapterRegistry: mockAdapterRegistry,
      fileObserver: mockFileObserver,
      specRepositories: new Map([
        [
          'core',
          {
            list: async () => [{ path: 'user-login', workspace: 'core' }],
            get: async () => ({ id: 'core:user-login', artifacts: [{ filename: 'spec.md' }] }),
            artifact: async () => ({
              content: '# UserLoginService\n\nHandles user login authentication.',
            }),
            readPersistedState: async () => ({
              implementation: [
                { file: 'src/domain/legacy-services.ts', symbols: ['UserLoginService'] },
              ],
            }),
          } as any,
        ],
      ]),
    }

    const useCase = new SuggestSpecs(customDeps)
    const result = await useCase.execute({ ignoreCurrentSpecs: false })

    expect(result.result).toBe('ok')
    // UserLoginService was claimed by existing spec core:user-login.
    // PasswordResetService and UserRegistrationService must be suggested as candidate specs from the same file!
    const suggestedIds = result.suggestedSpecs.map((s) => s.id)
    expect(suggestedIds).toContain('core:password-reset')
    expect(suggestedIds).toContain('core:user-registration')
    expect(suggestedIds).not.toContain('core:user-login')

    for (const spec of result.suggestedSpecs) {
      expect(spec.primaryFiles).toContain('src/domain/legacy-services.ts')
    }
  })

  it('guarantees candidate spec IDs have exactly one colon and no workspace name repetition', async () => {
    const pluginFiles = [
      {
        path: 'plugin-agent-standard:src/index.ts',
        configRelativePath: 'packages/plugin-agent-standard/src/index.ts',
        language: 'typescript',
        workspace: 'plugin-agent-standard',
        contentHash: 'p1',
      },
    ]

    const pluginSymbols = [
      {
        id: 'sym:standard-plugin',
        name: 'standardPlugin',
        kind: 'const',
        filePath: 'plugin-agent-standard:src/index.ts',
      },
      {
        id: 'sym:create-plugin',
        name: 'create',
        kind: 'function',
        filePath: 'plugin-agent-standard:src/index.ts',
      },
    ]

    const customDeps: SuggestSpecsDeps = {
      codeGraphProvider: {
        open: async () => {},
        close: async () => {},
        store: { getAllFiles: async () => pluginFiles },
        findSymbols: async () => pluginSymbols,
        getHotspots: async () => ({ hotspots: [] }),
      } as any,
      adapterRegistry: mockAdapterRegistry,
      fileObserver: mockFileObserver,
    }

    const useCase = new SuggestSpecs(customDeps)
    const result = await useCase.execute({ ignoreCurrentSpecs: true })

    expect(result.result).toBe('ok')
    expect(result.suggestedSpecs.length).toBeGreaterThan(0)

    for (const spec of result.suggestedSpecs) {
      // Must have exactly one colon separator
      const colonCount = (spec.id.match(/:/g) || []).length
      expect(colonCount).toBe(1)

      // Must not repeat the workspace name in the slug
      const [workspace, slug] = spec.id.split(':')
      expect(slug).toBeDefined()
      expect(slug?.startsWith(`${workspace}-`)).toBe(false)
      expect(slug?.startsWith(`${workspace}:`)).toBe(false)
    }
  })
})
