import { describe, expect, it, vi } from 'vitest'
import { type CodeGraphProvider, RiskLevel, SymbolKind } from '@specd/code-graph'
import { type SpecdConfig } from '@specd/core'
import { type SdkHostContext } from '../../src/composition/host-context.js'
import { runGraphHotspots } from '../../src/orchestration/run-graph-hotspots.js'

describe('runGraphHotspots', () => {
  const mockConfig = {
    projectRoot: '/repo',
    workspaces: [
      { name: 'core', codeRoot: '/repo/packages/core' },
      { name: 'cli', codeRoot: '/repo/packages/cli' },
    ],
  } as unknown as SpecdConfig

  const mockRawHotspotsResult = {
    totalSymbols: 10,
    entries: [
      {
        symbol: {
          id: 'sym1',
          name: 'createKernel',
          kind: SymbolKind.Function,
          filePath: 'core:src/kernel.ts',
          projectRelativePath: 'packages/core/src/kernel.ts',
          line: 42,
          column: 1,
        },
        score: 95,
        directCallers: 5,
        crossWorkspaceCallers: 2,
        fileImporters: 3,
        riskLevel: 'HIGH',
      },
    ],
    omittedCounts: { tests: 2, ignored: 0 },
  }

  it('projects symbol paths to projectRelativePath and derives workspace, omitting displayPath', async () => {
    const mockProvider = {
      getHotspots: vi.fn().mockResolvedValue(mockRawHotspotsResult),
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

    const result = await runGraphHotspots(ctx, { provider: mockProvider })

    expect(result.totalSymbols).toBe(10)
    expect(result.entries).toHaveLength(1)
    const entry = result.entries[0]!
    expect(entry.workspace).toBe('core')
    expect(entry.projectRelativePath).toBe('packages/core/src/kernel.ts')
    expect((entry as any).displayPath).toBeUndefined()
    expect(entry.score).toBe(95)
    expect(entry.riskLevel).toBe('HIGH')
    expect(result.omittedCounts).toEqual({ tests: 2, ignored: 0 })
  })

  it('opens and closes transient provider when caller does not provide one', async () => {
    const mockProvider = {
      getHotspots: vi.fn().mockResolvedValue(mockRawHotspotsResult),
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

    await runGraphHotspots(ctx)

    expect(mockProvider.open).toHaveBeenCalledTimes(1)
    expect(mockProvider.close).toHaveBeenCalledTimes(1)
  })

  it('does not close caller-owned open provider', async () => {
    const mockProvider = {
      getHotspots: vi.fn().mockResolvedValue(mockRawHotspotsResult),
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

    await runGraphHotspots(ctx, { provider: mockProvider })

    expect(mockProvider.close).not.toHaveBeenCalled()
  })

  it('forwards all hotspot options and filePath alias to provider.getHotspots', async () => {
    const mockProvider = {
      getHotspots: vi.fn().mockResolvedValue(mockRawHotspotsResult),
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

    await runGraphHotspots(ctx, {
      workspace: 'core',
      kinds: [SymbolKind.Function],
      filePath: 'src/kernel.ts',
      excludePaths: ['dist'],
      excludeWorkspaces: ['cli'],
      limit: 5,
      minScore: 50,
      minRisk: 'HIGH' as any,
      includeImporterOnly: true,
      categories: ['source'],
      includeTests: true,
      includeIgnored: false,
      provider: mockProvider,
    })

    expect(mockProvider.getHotspots).toHaveBeenCalledWith({
      workspace: 'core',
      kinds: [SymbolKind.Function],
      filePath: 'src/kernel.ts',
      excludePaths: ['dist'],
      excludeWorkspaces: ['cli'],
      limit: 5,
      minScore: 50,
      minRisk: 'HIGH',
      includeImporterOnly: true,
      categories: ['source'],
      includeTests: true,
      includeIgnored: false,
    })
  })

  it('falls back to toProjectRelativePath when symbol lacks projectRelativePath', async () => {
    const rawWithoutProjRel = {
      totalSymbols: 1,
      entries: [
        {
          symbol: {
            id: 'sym2',
            name: 'helper',
            kind: SymbolKind.Function,
            filePath: 'core:src/helper.ts',
            line: 1,
            column: 1,
          },
          score: 80,
          directCallers: 2,
          crossWorkspaceCallers: 0,
          fileImporters: 1,
          riskLevel: 'LOW',
        },
      ],
      omittedCounts: { tests: 0, ignored: 0 },
    }

    const mockProvider = {
      getHotspots: vi.fn().mockResolvedValue(rawWithoutProjRel),
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

    const result = await runGraphHotspots(ctx, { provider: mockProvider })

    expect(result.entries[0]!.projectRelativePath).toBe('packages/core/src/helper.ts')
  })
})
