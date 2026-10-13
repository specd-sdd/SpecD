import { describe, expect, it, vi } from 'vitest'
import {
  type CodeGraphProvider,
  RiskLevel,
  SpecNotFoundError as GraphSpecNotFoundError,
  SymbolKind,
} from '@specd/code-graph'
import { type SpecdConfig } from '@specd/core'
import { type SdkHostContext } from '../../src/composition/host-context.js'
import { GraphSelectorError, runGraphImpact } from '../../src/orchestration/run-graph-impact.js'

describe('runGraphImpact', () => {
  const mockConfig = {
    projectRoot: '/repo',
    workspaces: [
      { name: 'core', codeRoot: '/repo/packages/core' },
      { name: 'cli', codeRoot: '/repo/packages/cli' },
    ],
  } as unknown as SpecdConfig

  it('runs single file impact and projects paths onto projectRelativePath without displayPath', async () => {
    const mockRawFileImpact = {
      riskLevel: 'HIGH',
      directDependents: 2,
      indirectDependents: 1,
      transitiveDependents: 0,
      affectedFiles: ['core:src/user.ts', 'cli:src/cli.ts'],
      affectedSymbols: [
        {
          name: 'login',
          filePath: 'core:src/user.ts',
          line: 25,
          depth: 1,
        },
      ],
      symbols: [],
      coveringSpecs: [],
      omittedCounts: { tests: 0, ignored: 0 },
    }

    const mockProvider = {
      resolveFileSelector: vi.fn().mockResolvedValue([
        {
          kind: 'file',
          canonicalPath: 'core:src/auth.ts',
          workspace: 'core',
          projectRelativePath: 'packages/core/src/auth.ts',
        },
      ]),
      analyzeFileImpact: vi.fn().mockResolvedValue(mockRawFileImpact),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as CodeGraphProvider

    const ctx: SdkHostContext = {
      kernel: {
        project: {
          getConfig: {
            execute: vi.fn().mockReturnValue(mockConfig),
          },
        },
      } as any,
      createGraphProvider: () => mockProvider,
    }

    const result = await runGraphImpact(ctx, { files: ['src/auth.ts'], provider: mockProvider })

    expect(result.kind).toBe('file')
    if (result.kind === 'file') {
      expect(result.canonicalPath).toBe('core:src/auth.ts')
      expect(result.projectRelativePath).toBe('packages/core/src/auth.ts')
      expect((result as any).displayPath).toBeUndefined()
      expect(result.affectedFiles).toEqual(['packages/core/src/user.ts', 'packages/cli/src/cli.ts'])
      expect(result.affectedSymbols[0]!.filePath).toBe('packages/core/src/user.ts')
      expect(result.riskLevel).toBe('HIGH')
    }
  })

  it('runs multi-file impact and surfaces projectRelativeTargets without displayTargets', async () => {
    const mockRawFilesImpact = {
      riskLevel: 'MEDIUM',
      directDependents: 3,
      indirectDependents: 1,
      transitiveDependents: 0,
      affectedFiles: ['core:src/common.ts'],
      coveringSpecs: [],
      symbols: [
        {
          riskLevel: 'LOW',
          directDependents: 1,
          indirectDependents: 0,
          transitiveDependents: 0,
          affectedFiles: ['core:src/common.ts'],
          symbols: [],
        },
        {
          riskLevel: 'MEDIUM',
          directDependents: 2,
          indirectDependents: 1,
          transitiveDependents: 0,
          affectedFiles: ['core:src/common.ts'],
          symbols: [],
        },
      ],
      omittedCounts: { tests: 0, ignored: 0 },
    }

    const mockProvider = {
      resolveFileSelector: vi.fn().mockImplementation(async (raw: string) => [
        {
          kind: 'file',
          canonicalPath: `core:${raw}`,
          workspace: 'core',
          projectRelativePath: `packages/core/${raw}`,
        },
      ]),
      analyzeFilesImpact: vi.fn().mockResolvedValue(mockRawFilesImpact),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as CodeGraphProvider

    const ctx: SdkHostContext = {
      kernel: {
        project: {
          getConfig: {
            execute: vi.fn().mockReturnValue(mockConfig),
          },
        },
      } as any,
      createGraphProvider: () => mockProvider,
    }

    const result = await runGraphImpact(ctx, {
      files: ['src/a.ts', 'src/b.ts'],
      provider: mockProvider,
    })

    expect(result.kind).toBe('files')
    if (result.kind === 'files') {
      expect(result.targets).toEqual(['core:src/a.ts', 'core:src/b.ts'])
      expect(result.projectRelativeTargets).toEqual([
        'packages/core/src/a.ts',
        'packages/core/src/b.ts',
      ])
      expect((result as any).displayTargets).toBeUndefined()
      expect(result.perFile[0]!.projectRelativePath).toBe('packages/core/src/a.ts')
      expect((result.perFile[0] as any).displayPath).toBeUndefined()
    }
  })

  it('runs symbol impact and surfaces projectRelativePath', async () => {
    const mockSymbol = {
      id: 'sym1',
      name: 'createKernel',
      kind: SymbolKind.Function,
      filePath: 'core:src/kernel.ts',
      projectRelativePath: 'packages/core/src/kernel.ts',
      line: 100,
    }

    const mockRawSymbolImpact = {
      riskLevel: 'CRITICAL',
      directDependents: 10,
      indirectDependents: 5,
      transitiveDependents: 2,
      affectedFiles: ['cli:src/main.ts'],
      affectedSymbols: [],
    }

    const mockProvider = {
      resolveSymbolSelector: vi.fn().mockResolvedValue({
        status: 'exact',
        match: { symbolId: 'sym1' },
      }),
      getSymbol: vi.fn().mockResolvedValue(mockSymbol),
      analyzeImpact: vi.fn().mockResolvedValue(mockRawSymbolImpact),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as CodeGraphProvider

    const ctx: SdkHostContext = {
      kernel: {
        project: {
          getConfig: {
            execute: vi.fn().mockReturnValue(mockConfig),
          },
        },
      } as any,
      createGraphProvider: () => mockProvider,
    }

    const result = await runGraphImpact(ctx, {
      symbol: 'createKernel',
      provider: mockProvider,
    })

    expect(result.kind).toBe('symbol')
    if (result.kind === 'symbol' && result.status === 'resolved') {
      expect(result.projectRelativePath).toBe('packages/core/src/kernel.ts')
      expect((result as any).displayPath).toBeUndefined()
      expect(result.impact.affectedFiles).toEqual(['packages/cli/src/main.ts'])
    }
  })

  it('opens and closes transient provider when caller does not provide one', async () => {
    const mockProvider = {
      resolveFileSelector: vi.fn().mockResolvedValue([
        {
          kind: 'file',
          canonicalPath: 'core:src/auth.ts',
          workspace: 'core',
          projectRelativePath: 'packages/core/src/auth.ts',
        },
      ]),
      analyzeFileImpact: vi.fn().mockResolvedValue({
        riskLevel: 'LOW',
        directDependents: 0,
        indirectDependents: 0,
        transitiveDependents: 0,
        affectedFiles: [],
        affectedSymbols: [],
        symbols: [],
        coveringSpecs: [],
        omittedCounts: { tests: 0, ignored: 0 },
      }),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      isOpen: vi.fn().mockReturnValue(true),
    } as unknown as CodeGraphProvider

    const ctx: SdkHostContext = {
      kernel: {
        project: {
          getConfig: {
            execute: vi.fn().mockReturnValue(mockConfig),
          },
        },
      } as any,
      createGraphProvider: () => mockProvider,
    }

    await runGraphImpact(ctx, { files: ['src/auth.ts'] })

    expect(mockProvider.open).toHaveBeenCalledTimes(1)
    expect(mockProvider.close).toHaveBeenCalledTimes(1)
  })

  it('does not close caller-owned open provider', async () => {
    const mockProvider = {
      resolveFileSelector: vi.fn().mockResolvedValue([
        {
          kind: 'file',
          canonicalPath: 'core:src/auth.ts',
          workspace: 'core',
          projectRelativePath: 'packages/core/src/auth.ts',
        },
      ]),
      analyzeFileImpact: vi.fn().mockResolvedValue({
        riskLevel: 'LOW',
        directDependents: 0,
        indirectDependents: 0,
        transitiveDependents: 0,
        affectedFiles: [],
        affectedSymbols: [],
        symbols: [],
        coveringSpecs: [],
        omittedCounts: { tests: 0, ignored: 0 },
      }),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      isOpen: vi.fn().mockReturnValue(true),
    } as unknown as CodeGraphProvider

    const ctx: SdkHostContext = {
      kernel: {
        project: {
          getConfig: {
            execute: vi.fn().mockReturnValue(mockConfig),
          },
        },
      } as any,
      createGraphProvider: () => mockProvider,
    }

    await runGraphImpact(ctx, { files: ['src/auth.ts'], provider: mockProvider })

    expect(mockProvider.close).not.toHaveBeenCalled()
  })

  it('runs spec impact and surfaces projectRelativePath for affected files and symbols', async () => {
    const mockSpec = {
      specId: 'core:auth',
      path: 'specs/core/auth/spec.md',
      workspace: 'core',
    }

    const mockRawSpecImpact = {
      target: 'core:auth',
      riskLevel: 'HIGH',
      directDependents: 4,
      indirectDependents: 1,
      transitiveDependents: 0,
      affectedFiles: ['core:src/auth.ts'],
      affectedSymbols: [
        {
          name: 'authenticate',
          filePath: 'core:src/auth.ts',
          line: 12,
          depth: 1,
        },
      ],
      omittedCounts: { tests: 0, ignored: 0 },
    }

    const mockProvider = {
      getSpec: vi.fn().mockResolvedValue(mockSpec),
      analyzeSpecImpact: vi.fn().mockResolvedValue(mockRawSpecImpact),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as CodeGraphProvider

    const ctx: SdkHostContext = {
      kernel: {
        project: {
          getConfig: {
            execute: vi.fn().mockReturnValue(mockConfig),
          },
        },
      } as any,
      createGraphProvider: () => mockProvider,
    }

    const result = await runGraphImpact(ctx, { spec: 'core:auth', provider: mockProvider })

    expect(result.kind).toBe('spec')
    if (result.kind === 'spec') {
      expect(result.spec).toBe('core:auth')
      expect(result.impact.affectedFiles).toEqual(['packages/core/src/auth.ts'])
      expect(result.impact.affectedSymbols[0]!.projectRelativePath).toBe(
        'packages/core/src/auth.ts',
      )
      expect(result.riskLevel).toBe('HIGH')
    }
  })

  it('runs public export route impact and surfaces projectRelativeSurface and projectRelativePath', async () => {
    const binding = {
      id: 'core:src/index.ts::createApi',
      surface: 'core:src/index.ts',
      exportedName: 'createApi',
      space: 'value',
    }
    const target = {
      id: 'core:src/api.ts:createApi',
      name: 'createApi',
      space: 'value',
    }
    const resolution = {
      status: 'resolved',
      target,
      path: [],
      reasonCode: null,
      candidates: [],
    }
    const exactBinding = {
      binding,
      declarations: [{ symbolId: 'core:src/api.ts:createApi', filePath: 'core:src/api.ts' }],
    }
    const rawBindingImpact = {
      target: binding.id,
      directDependents: 1,
      indirectDependents: 0,
      transitiveDependents: 0,
      riskLevel: 'LOW',
      affectedFiles: ['core:src/client.ts'],
      affectedSymbols: [
        {
          id: 'sym1',
          name: 'callApi',
          filePath: 'core:src/client.ts',
          line: 5,
          depth: 1,
        },
      ],
      omittedCounts: { tests: 0, ignored: 0 },
    }
    const rawCanonicalImpact = {
      target: target.id,
      directDependents: 2,
      indirectDependents: 1,
      transitiveDependents: 0,
      riskLevel: 'MEDIUM',
      affectedFiles: ['core:src/client.ts', 'cli:src/cmd.ts'],
      affectedSymbols: [],
      omittedCounts: { tests: 0, ignored: 0 },
    }

    const mockProvider = {
      resolveFileSelector: vi.fn().mockResolvedValue([
        {
          kind: 'file',
          canonicalPath: 'core:src/index.ts',
          workspace: 'core',
          projectRelativePath: 'packages/core/src/index.ts',
        },
      ]),
      resolveSymbolReference: vi.fn().mockResolvedValue(resolution),
      getExactPublicBinding: vi.fn().mockResolvedValue(exactBinding),
      analyzePublicBindingImpact: vi.fn().mockResolvedValue({
        binding,
        target,
        path: [],
        bindingImpact: rawBindingImpact,
        canonicalImpact: rawCanonicalImpact,
      }),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as CodeGraphProvider

    const ctx: SdkHostContext = {
      kernel: {
        project: {
          getConfig: {
            execute: vi.fn().mockReturnValue(mockConfig),
          },
        },
      } as any,
      createGraphProvider: () => mockProvider,
    }

    const result = await runGraphImpact(ctx, {
      export: 'createApi',
      from: 'src/index.ts',
      provider: mockProvider,
    })

    expect(result.kind).toBe('export')
    if (result.kind === 'export' && result.status === 'resolved') {
      expect(result.export).toBe('createApi')
      expect(result.from).toBe('src/index.ts')
      expect(result.projectRelativeSurface).toBe('packages/core/src/index.ts')
      expect(result.bindingImpact.affectedFiles).toEqual(['packages/core/src/client.ts'])
      expect(result.bindingImpact.affectedSymbols[0]!.projectRelativePath).toBe(
        'packages/core/src/client.ts',
      )
      expect(result.canonicalImpact.affectedFiles).toEqual([
        'packages/core/src/client.ts',
        'packages/cli/src/cmd.ts',
      ])
      expect(result.riskLevel).toBe('MEDIUM')
    }
  })

  it('forwards traversal direction, custom depth, and filter to provider methods', async () => {
    const mockProvider = {
      resolveFileSelector: vi.fn().mockResolvedValue([
        {
          kind: 'file',
          canonicalPath: 'core:src/auth.ts',
          workspace: 'core',
          projectRelativePath: 'packages/core/src/auth.ts',
        },
      ]),
      analyzeFileImpact: vi.fn().mockResolvedValue({
        riskLevel: 'LOW',
        directDependents: 0,
        indirectDependents: 0,
        transitiveDependents: 0,
        affectedFiles: [],
        affectedSymbols: [],
        symbols: [],
        coveringSpecs: [],
        omittedCounts: { tests: 0, ignored: 0 },
      }),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as CodeGraphProvider

    const ctx: SdkHostContext = {
      kernel: {
        project: {
          getConfig: {
            execute: vi.fn().mockReturnValue(mockConfig),
          },
        },
      } as any,
      createGraphProvider: () => mockProvider,
    }

    const filter = {
      types: ['files' as const],
      workspaces: ['core'],
      includeTests: true,
    }

    await runGraphImpact(ctx, {
      files: ['src/auth.ts'],
      direction: 'dependencies',
      depth: 5,
      filter,
      provider: mockProvider,
    })

    expect(mockProvider.analyzeFileImpact).toHaveBeenCalledWith(
      'core:src/auth.ts',
      'downstream',
      5,
      filter,
    )
  })

  it('returns symbol not_found outcome when symbol does not exist', async () => {
    const mockProvider = {
      resolveSymbolSelector: vi.fn().mockResolvedValue({
        status: 'missing',
      }),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as CodeGraphProvider

    const ctx: SdkHostContext = {
      kernel: {
        project: {
          getConfig: {
            execute: vi.fn().mockReturnValue(mockConfig),
          },
        },
      } as any,
      createGraphProvider: () => mockProvider,
    }

    const result = await runGraphImpact(ctx, {
      symbol: 'nonExistent',
      provider: mockProvider,
    })

    expect(result).toEqual({
      kind: 'symbol',
      status: 'not_found',
      symbol: 'nonExistent',
    })
  })

  it('returns symbol ambiguous outcome with candidate list', async () => {
    const mockProvider = {
      resolveSymbolSelector: vi.fn().mockResolvedValue({
        status: 'ambiguous',
        totalCandidates: 2,
        candidates: [
          { symbolId: 'core:src/auth.ts:function:login:10:0' },
          { symbolId: 'cli:src/auth.ts:function:login:20:0' },
        ],
      }),
      getSymbolsByIds: vi.fn().mockResolvedValue([
        {
          id: 'core:src/auth.ts:function:login:10:0',
          name: 'login',
          kind: SymbolKind.Function,
          filePath: 'core:src/auth.ts',
          projectRelativePath: 'packages/core/src/auth.ts',
          line: 10,
          column: 0,
        },
        {
          id: 'cli:src/auth.ts:function:login:20:0',
          name: 'login',
          kind: SymbolKind.Function,
          filePath: 'cli:src/auth.ts',
          projectRelativePath: 'packages/cli/src/auth.ts',
          line: 20,
          column: 0,
        },
      ]),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as CodeGraphProvider

    const ctx: SdkHostContext = {
      kernel: {
        project: {
          getConfig: {
            execute: vi.fn().mockReturnValue(mockConfig),
          },
        },
      } as any,
      createGraphProvider: () => mockProvider,
    }

    const result = await runGraphImpact(ctx, {
      symbol: 'login',
      provider: mockProvider,
    })

    expect(result.kind).toBe('symbol')
    if (result.kind === 'symbol' && result.status === 'ambiguous') {
      expect(result.symbol).toBe('login')
      expect(result.totalCandidates).toBe(2)
      expect(result.candidates).toHaveLength(2)
      expect(result.candidates[0]!.projectRelativePath).toBe('packages/core/src/auth.ts')
      expect(result.candidates[1]!.projectRelativePath).toBe('packages/cli/src/auth.ts')
    }
  })

  it('throws GraphSpecNotFoundError when target spec does not exist', async () => {
    const mockProvider = {
      getSpec: vi.fn().mockResolvedValue(undefined),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as CodeGraphProvider

    const ctx: SdkHostContext = {
      kernel: {
        project: {
          getConfig: {
            execute: vi.fn().mockReturnValue(mockConfig),
          },
        },
      } as any,
      createGraphProvider: () => mockProvider,
    }

    await expect(
      runGraphImpact(ctx, {
        spec: 'core:unknown',
        provider: mockProvider,
      }),
    ).rejects.toThrow(GraphSpecNotFoundError)
  })

  it('throws GraphSelectorError on empty file selector or invalid export combination', async () => {
    const mockProvider = {
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as CodeGraphProvider

    const ctx: SdkHostContext = {
      kernel: {
        project: {
          getConfig: {
            execute: vi.fn().mockReturnValue(mockConfig),
          },
        },
      } as any,
      createGraphProvider: () => mockProvider,
    }

    await expect(
      runGraphImpact(ctx, {
        files: ['   '],
        provider: mockProvider,
      }),
    ).rejects.toThrow(GraphSelectorError)

    await expect(
      runGraphImpact(ctx, {
        export: 'createKernel',
        provider: mockProvider,
      }),
    ).rejects.toThrow(GraphSelectorError)

    await expect(
      runGraphImpact(ctx, {
        provider: mockProvider,
      }),
    ).rejects.toThrow(GraphSelectorError)
  })
})
