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

function createMockGraphProvider(overrides: Partial<CodeGraphProvider>): CodeGraphProvider {
  const provider = {
    open: vi.fn(),
    close: vi.fn(),
    recreate: vi.fn(),
    [Symbol.asyncDispose]: vi.fn(),
    index: vi.fn(),
    getSymbol: vi.fn(),
    findSymbols: vi.fn(),
    getFile: vi.fn(),
    getDocument: vi.fn(),
    getFilesByPaths: vi.fn(),
    getDocumentsByPaths: vi.fn(),
    getSymbolsByIds: vi.fn(),
    getSpecsByIds: vi.fn(),
    findFilesByProjectRelativePath: vi.fn(),
    findDocumentsByProjectRelativePath: vi.fn(),
    resolveFileSelector: vi.fn(),
    resolveSymbolSelector: vi.fn(),
    getSpec: vi.fn(),
    getSpecDependencies: vi.fn(),
    getSpecDependents: vi.fn(),
    getCoveredFiles: vi.fn(),
    getCoveringSpecsForFile: vi.fn(),
    getCoveredSymbols: vi.fn(),
    getCoveringSpecsForSymbol: vi.fn(),
    getStatistics: vi.fn(),
    getGraphHealth: vi.fn(),
    resolveSymbolReference: vi.fn(),
    resolveSymbolReferences: vi.fn(),
    getExactPublicBinding: vi.fn(),
    getUpstream: vi.fn(),
    getDownstream: vi.fn(),
    analyzeImpact: vi.fn(),
    analyzeResolvedSymbolImpact: vi.fn(),
    analyzePublicBindingImpact: vi.fn(),
    analyzeFileImpact: vi.fn(),
    analyzeFilesImpact: vi.fn(),
    analyzeSpecImpact: vi.fn(),
    clear: vi.fn(),
    detectChanges: vi.fn(),
    getHotspots: vi.fn(),
    searchSymbols: vi.fn(),
    searchReferenceSymbols: vi.fn(),
    search: vi.fn(),
    searchSpecs: vi.fn(),
    searchDocuments: vi.fn(),
  } satisfies CodeGraphProvider

  return Object.assign(provider, overrides)
}

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

    const mockProvider = createMockGraphProvider({
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
    })

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

    const mockProvider = createMockGraphProvider({
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
    })

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

    const mockProvider = createMockGraphProvider({
      resolveSymbolSelector: vi.fn().mockResolvedValue({
        status: 'resolved',
        kind: 'declaration',
        match: { symbolId: 'sym1', filePath: 'core:src/kernel.ts', matchKind: 'name' },
        target: {
          kind: 'declaration',
          declaration: {
            symbolId: 'sym1',
            location: { filePath: 'core:src/kernel.ts', line: 100, column: 0 },
            kind: SymbolKind.Function,
            form: 'definition',
          },
          logicalSymbol: undefined,
          path: [],
        },
      }),
      getSymbol: vi.fn().mockResolvedValue(mockSymbol),
      analyzeImpact: vi.fn().mockResolvedValue(mockRawSymbolImpact),
      analyzeResolvedSymbolImpact: vi.fn().mockImplementation(async (resolvedTarget) => ({
        ...mockRawSymbolImpact,
        target: 'sym1',
        affectedSpecs: [],
        affectedProcesses: [],
        omittedCounts: { tests: 0, ignored: 0 },
        resolvedTarget,
        semanticAffectedTargets: [],
        physicalEvidence: [],
        semanticCounts: {
          directLogicalTargets: 0,
          indirectLogicalTargets: 0,
          transitiveLogicalTargets: 0,
          physicalOnlyTargets: 0,
          physicalDeclarationOccurrences: 0,
        },
        coveringSpecs: [],
      })),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    })

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
      expect(mockProvider.analyzeResolvedSymbolImpact).toHaveBeenCalledTimes(1)
      expect(mockProvider.analyzeImpact).not.toHaveBeenCalled()
    }
  })

  it('runs symbol impact through analyzeResolvedSymbolImpact preserving logical target and evidence', async () => {
    const mockLogicalSymbol = {
      id: 'core:kernel:createKernel',
      logicalId: 'core:kernel:createKernel',
      name: 'createKernel',
      kind: SymbolKind.Function,
      space: 'value' as const,
      workspace: 'core',
      canonicalDeclarationId: 'core:src/kernel.ts:function:createKernel:10:0',
    }

    const mockResolvedTarget = {
      kind: 'logical-target' as const,
      logicalSymbol: mockLogicalSymbol,
      declarations: [
        {
          symbolId: 'core:src/kernel.ts:function:createKernel:10:0',
          location: {
            filePath: 'core:src/kernel.ts',
            line: 10,
            column: 0,
            endLine: 20,
            endColumn: 1,
          },
          kind: SymbolKind.Function,
          form: 'definition' as any,
          logicalId: 'core:kernel:createKernel',
        },
        {
          symbolId: 'core:src/kernel.ts:function:createKernel:22:0',
          location: {
            filePath: 'core:src/kernel.ts',
            line: 22,
            column: 0,
            endLine: 22,
            endColumn: 40,
          },
          kind: SymbolKind.Function,
          form: 'signature' as any,
          logicalId: 'core:kernel:createKernel',
        },
      ],
      path: [],
    }

    const mockResolvedImpact = {
      target: 'core:kernel:createKernel',
      resolvedTarget: mockResolvedTarget,
      semanticAffectedTargets: [
        {
          kind: 'logical-target' as const,
          logicalSymbol: mockLogicalSymbol,
          declarations: [
            {
              symbolId: 'core:src/kernel.ts:function:createKernel:10:0',
              location: {
                filePath: 'core:src/kernel.ts',
                line: 10,
                column: 0,
                endLine: 20,
                endColumn: 1,
              },
              kind: SymbolKind.Function,
              form: 'definition' as any,
              logicalId: 'core:kernel:createKernel',
            },
          ],
          depth: 1,
          evidence: [
            {
              relationType: 'CALLS' as any,
              sourceDeclarationId: 'cli:src/main.ts:function:start:5:0',
              targetDeclarationId: 'core:src/kernel.ts:function:createKernel:10:0',
              sourceLocation: { filePath: 'cli:src/main.ts', line: 6, column: 2 },
              targetLocation: { filePath: 'core:src/kernel.ts', line: 10, column: 0 },
              depth: 1,
            },
          ],
        },
      ],
      physicalEvidence: [
        {
          relationType: 'CALLS' as any,
          sourceDeclarationId: 'cli:src/main.ts:function:start:5:0',
          targetDeclarationId: 'core:src/kernel.ts:function:createKernel:10:0',
          sourceLocation: { filePath: 'cli:src/main.ts', line: 6, column: 2 },
          targetLocation: { filePath: 'core:src/kernel.ts', line: 10, column: 0 },
          depth: 1,
        },
      ],
      riskLevel: 'HIGH' as any,
      directDependents: 1,
      indirectDependents: 0,
      transitiveDependents: 0,
      affectedFiles: ['cli:src/main.ts'],
      affectedSymbols: [],
      affectedSpecs: [],
      affectedProcesses: [],
      semanticCounts: {
        directLogicalTargets: 1,
        indirectLogicalTargets: 0,
        transitiveLogicalTargets: 0,
        physicalOnlyTargets: 0,
        physicalDeclarationOccurrences: 1,
      },
      coveringSpecs: [
        {
          specId: 'core:kernel',
          minDepth: 0,
          evidence: [
            { kind: 'file' as const, target: 'core:src/kernel.ts', depth: 0 },
            {
              kind: 'symbol' as const,
              target: 'core:kernel:createKernel',
              depth: 0,
              declarations: ['core:src/kernel.ts:function:createKernel:10:0'],
            },
          ],
        },
      ],
      omittedCounts: { tests: 0, ignored: 0 },
    }

    const mockSymbol = {
      id: 'core:src/kernel.ts:function:createKernel:10:0',
      name: 'createKernel',
      kind: SymbolKind.Function,
      filePath: 'core:src/kernel.ts',
      projectRelativePath: 'packages/core/src/kernel.ts',
      line: 10,
    }

    const mockProvider = createMockGraphProvider({
      resolveSymbolSelector: vi.fn().mockResolvedValue({
        status: 'resolved',
        kind: 'logical-target',
        match: {
          symbolId: 'core:src/kernel.ts:function:createKernel:10:0',
          logicalId: 'core:kernel:createKernel',
        },
        target: mockResolvedTarget,
      }),
      getSymbol: vi.fn().mockResolvedValue(mockSymbol),
      resolveSymbolReference: vi.fn().mockResolvedValue({
        status: 'resolved',
        target: mockResolvedTarget,
        path: [],
      }),
      analyzeResolvedSymbolImpact: vi.fn().mockResolvedValue(mockResolvedImpact),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    })

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
      expect(result.targetKind).toBe('logical-target')
      expect(result.declarations).toHaveLength(2)
      expect(result.declarations[0]!.projectRelativePath).toBe('packages/core/src/kernel.ts')
      expect(result.declarations[1]!.location.projectRelativePath).toBe(
        'packages/core/src/kernel.ts',
      )
      expect(result.resolvedTarget.kind).toBe('logical-target')
      if (result.resolvedTarget.kind === 'logical-target') {
        expect(result.resolvedTarget.declarations).toHaveLength(2)
        expect(result.resolvedTarget.declarations[0]!.location.projectRelativePath).toBe(
          'packages/core/src/kernel.ts',
        )
      }
      expect(result.semanticCounts.directLogicalTargets).toBe(1)
      expect(result.semanticCounts.physicalDeclarationOccurrences).toBe(1)
      expect(result.physicalEvidence[0]!.sourceProjectRelativePath).toBe('packages/cli/src/main.ts')
      expect(result.physicalEvidence[0]!.targetProjectRelativePath).toBe(
        'packages/core/src/kernel.ts',
      )
      expect(result.physicalEvidence[0]!.sourceLocation?.projectRelativePath).toBe(
        'packages/cli/src/main.ts',
      )
      expect(
        result.semanticAffectedTargets[0]!.evidence[0]!.targetLocation?.projectRelativePath,
      ).toBe('packages/core/src/kernel.ts')
      expect(result.impact.target).toBe('core:kernel:createKernel')
      expect(result.symbol.name).toBe('createKernel')
      expect(result.coveringSpecs?.[0]?.evidence[0]).toMatchObject({
        kind: 'file',
        projectRelativePath: 'packages/core/src/kernel.ts',
      })
      expect(result.coveringSpecs?.[0]?.evidence[1]).not.toHaveProperty('projectRelativePath')
      expect(mockProvider.analyzeResolvedSymbolImpact).toHaveBeenCalledTimes(1)
      expect(mockProvider.analyzeImpact).not.toHaveBeenCalled()
      expect(mockProvider.getSymbol).not.toHaveBeenCalled()
    }
  })

  it('opens and closes transient provider when caller does not provide one', async () => {
    const mockProvider = createMockGraphProvider({
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
    })

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
    const mockProvider = createMockGraphProvider({
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
    })

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

    const mockProvider = createMockGraphProvider({
      getSpec: vi.fn().mockResolvedValue(mockSpec),
      analyzeSpecImpact: vi.fn().mockResolvedValue(mockRawSpecImpact),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    })

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

  it('given an ambiguous public binding, when export impact runs, then returns projected candidates and does not traverse', async () => {
    const target = { id: 'core:src/api.ts:createApi', name: 'createApi', space: 'value' }
    const resolution = {
      status: 'resolved',
      target,
      resolvedTarget: {
        kind: 'logical-target',
        logicalSymbol: target,
        declarations: [
          {
            logicalId: target.id,
            symbolId: 'core:src/api.ts:createApi',
            location: { filePath: 'core:src/api.ts', line: 1, column: 0 },
            kind: 'function',
          },
        ],
        path: [],
      },
      path: [],
      reasonCode: null,
      candidates: [],
    }
    const mockProvider = createMockGraphProvider({
      resolveSymbolReference: vi.fn().mockResolvedValue(resolution),
      getExactPublicBinding: vi.fn().mockResolvedValue(null),
      analyzePublicBindingImpact: vi.fn(),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    })
    const ctx: SdkHostContext = {
      kernel: {
        project: { getConfig: { execute: vi.fn().mockReturnValue(mockConfig) } },
      } as any,
      createGraphProvider: () => mockProvider,
    }

    const result = await runGraphImpact(ctx, {
      export: 'createApi',
      from: 'core:src/index.ts',
      provider: mockProvider,
    })

    expect(result.kind).toBe('export')
    if (result.kind === 'export' && result.status === 'ambiguous') {
      expect(result.candidates).toHaveLength(1)
      expect(result.candidates?.[0]?.declarations[0]?.projectRelativePath).toBe(
        'packages/core/src/api.ts',
      )
    } else {
      throw new Error('expected an ambiguous export outcome')
    }
    expect(mockProvider.analyzePublicBindingImpact).not.toHaveBeenCalled()
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
      resolvedTarget: {
        kind: 'logical-target',
        logicalSymbol: target,
        declarations: [
          {
            logicalId: target.id,
            symbolId: 'core:src/api.ts:createApi',
            location: { filePath: 'core:src/api.ts', line: 1, column: 0 },
            kind: 'function',
          },
        ],
        path: [],
      },
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
      coveringSpecs: [
        {
          specId: 'core:api',
          minDepth: 1,
          evidence: [
            { kind: 'file', target: 'core:src/client.ts', depth: 1 },
            {
              kind: 'symbol',
              target: target.id,
              depth: 0,
              declarations: ['core:src/api.ts:createApi'],
            },
          ],
        },
      ],
    }

    const mockProvider = createMockGraphProvider({
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
    })

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
      expect(result.binding.projectRelativeSurface).toBe('packages/core/src/index.ts')
      expect(result.resolution.resolvedTarget).toMatchObject({
        kind: 'logical-target',
        declarations: [{ projectRelativePath: 'packages/core/src/api.ts' }],
      })
      expect(result.bindingImpact.affectedFiles).toEqual(['packages/core/src/client.ts'])
      expect(result.bindingImpact.affectedSymbols[0]!.projectRelativePath).toBe(
        'packages/core/src/client.ts',
      )
      expect(result.canonicalImpact.affectedFiles).toEqual([
        'packages/core/src/client.ts',
        'packages/cli/src/cmd.ts',
      ])
      expect(result.riskLevel).toBe('MEDIUM')
      // Covering specs come from the canonical view and their file evidence is projected.
      expect(result.coveringSpecs).toEqual([
        expect.objectContaining({
          specId: 'core:api',
          evidence: expect.arrayContaining([
            expect.objectContaining({
              kind: 'file',
              target: 'core:src/client.ts',
              projectRelativePath: 'packages/core/src/client.ts',
            }),
          ]),
        }),
      ])
      expect(result.canonicalImpact.coveringSpecs).toEqual(result.coveringSpecs)
      expect(result.bindingImpact.coveringSpecs).toBeUndefined()
    } else {
      throw new Error('expected a resolved export outcome')
    }
  })

  it('forwards traversal direction, custom depth, and filter to provider methods', async () => {
    const mockProvider = createMockGraphProvider({
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
    })

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
    const mockProvider = createMockGraphProvider({
      resolveSymbolSelector: vi.fn().mockResolvedValue({
        status: 'missing',
      }),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    })

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
    const mockProvider = createMockGraphProvider({
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
    })

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

  describe('undecided selectors and Windows file selectors', () => {
    const contextFor = (provider: CodeGraphProvider): SdkHostContext => ({
      kernel: {
        project: { getConfig: { execute: vi.fn().mockReturnValue(mockConfig) } },
      } as any,
      createGraphProvider: () => provider,
    })
    const unresolvedResolution = (reasonCode: string): any => ({
      request: { workspace: 'core', requested: 'run' },
      status: 'unresolved',
      reasonCode,
      health: { fresh: false, complete: true, reasonCodes: [reasonCode] },
      resolvedTarget: null,
      target: null,
      candidates: [],
      path: [],
    })

    it('reports an unresolved symbol selector instead of not_found', async () => {
      const provider = createMockGraphProvider({
        resolveSymbolSelector: vi.fn().mockResolvedValue({
          status: 'unresolved',
          reasonCode: 'CONTENT_DIRTY',
          candidates: [],
        }),
        open: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      })

      const result = await runGraphImpact(contextFor(provider), { symbol: 'run', provider })

      expect(result).toEqual({
        kind: 'symbol',
        status: 'unresolved',
        symbol: 'run',
        reasonCode: 'CONTENT_DIRTY',
      })
      expect(provider.analyzeResolvedSymbolImpact).not.toHaveBeenCalled()
    })

    it('reports unresolved and ambiguous public exports with their own status', async () => {
      const unresolvedProvider = createMockGraphProvider({
        resolveFileSelector: vi.fn().mockResolvedValue([]),
        resolveSymbolReference: vi.fn().mockResolvedValue(unresolvedResolution('COVERAGE_PARTIAL')),
        open: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      })
      const unresolved = await runGraphImpact(contextFor(unresolvedProvider), {
        export: 'run',
        from: 'core:src/index.ts',
        provider: unresolvedProvider,
      })
      expect(unresolved).toMatchObject({ kind: 'export', status: 'unresolved' })

      const ambiguousProvider = createMockGraphProvider({
        resolveFileSelector: vi.fn().mockResolvedValue([]),
        resolveSymbolReference: vi.fn().mockResolvedValue({
          ...unresolvedResolution('AMBIGUOUS_LOGICAL_TARGET'),
          status: 'ambiguous',
          candidates: [],
        }),
        open: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      })
      const ambiguous = await runGraphImpact(contextFor(ambiguousProvider), {
        export: 'run',
        from: 'core:src/index.ts',
        provider: ambiguousProvider,
      })
      expect(ambiguous).toMatchObject({ kind: 'export', status: 'ambiguous' })
    })

    it('reports a missing public export as not_found', async () => {
      const provider = createMockGraphProvider({
        resolveFileSelector: vi.fn().mockResolvedValue([]),
        resolveSymbolReference: vi.fn().mockResolvedValue({
          ...unresolvedResolution('REFERENCE_ABSENT'),
          status: 'missing',
        }),
        open: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      })

      const result = await runGraphImpact(contextFor(provider), {
        export: 'gone',
        from: 'core:src/index.ts',
        provider,
      })

      expect(result).toMatchObject({ kind: 'export', status: 'not_found' })
    })

    it.each(['C:\\repo\\packages\\core\\src\\index.ts', 'C:/repo/packages/core/src/index.ts'])(
      'treats the Windows path %s as a file selector for --from',
      async (windowsPath) => {
        const resolveFileSelector = vi.fn().mockResolvedValue([
          {
            canonicalPath: 'core:src/index.ts',
            projectRelativePath: 'packages/core/src/index.ts',
            workspace: 'core',
            kind: 'file',
          },
        ])
        const resolveSymbolReference = vi
          .fn()
          .mockResolvedValue({ ...unresolvedResolution('REFERENCE_ABSENT'), status: 'missing' })
        const provider = createMockGraphProvider({
          resolveFileSelector,
          resolveSymbolReference,
          open: vi.fn().mockResolvedValue(undefined),
          close: vi.fn().mockResolvedValue(undefined),
        })

        await runGraphImpact(contextFor(provider), { export: 'run', from: windowsPath, provider })

        expect(resolveFileSelector).toHaveBeenCalledWith(windowsPath)
        expect(resolveSymbolReference).toHaveBeenCalledWith(
          expect.objectContaining({ publicSurface: 'core:src/index.ts', workspace: 'core' }),
        )
      },
    )

    it('keeps a workspace-qualified surface canonical without a file lookup', async () => {
      const resolveFileSelector = vi.fn()
      const provider = createMockGraphProvider({
        resolveFileSelector,
        resolveSymbolReference: vi
          .fn()
          .mockResolvedValue({ ...unresolvedResolution('REFERENCE_ABSENT'), status: 'missing' }),
        open: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      })

      await runGraphImpact(contextFor(provider), {
        export: 'run',
        from: 'core:src/index.ts',
        provider,
      })

      expect(resolveFileSelector).not.toHaveBeenCalled()
    })
  })

  it('throws GraphSpecNotFoundError when target spec does not exist', async () => {
    const mockProvider = createMockGraphProvider({
      getSpec: vi.fn().mockResolvedValue(undefined),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    })

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
    const mockProvider = createMockGraphProvider({
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    })

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
