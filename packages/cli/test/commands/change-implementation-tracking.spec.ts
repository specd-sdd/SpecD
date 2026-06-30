import { afterEach, describe, expect, it, vi } from 'vitest'
import { enrichImplementationTracking } from '../../src/commands/change/_implementation-tracking.js'
import { makeMockConfig } from './helpers.js'

vi.mock('@specd/sdk', async () => {
  const actual = await vi.importActual<typeof import('@specd/sdk')>('@specd/sdk')
  return {
    ...actual,
    createCodeGraphProvider: vi.fn(),
    createVcsAdapter: vi.fn(),
  }
})

import { createCodeGraphProvider } from '@specd/sdk'
import { createVcsAdapter } from '@specd/sdk'

afterEach(() => vi.restoreAllMocks())

describe('enrichImplementationTracking', () => {
  it('reports not-indexed graph state without stale symbol checks', async () => {
    vi.mocked(createCodeGraphProvider).mockReturnValue({
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      getStatistics: vi.fn().mockResolvedValue({ lastIndexedAt: undefined }),
    } as never)

    const result = await enrichImplementationTracking(makeMockConfig(), {
      trackedFiles: [{ file: 'packages/core/src/change.ts', state: 'open' }],
      links: [],
    })

    expect(result.graphHint.status).toBe('not-indexed')
    expect(result.links).toEqual([])
  })

  it('marks missing symbol links as stale when the graph is fresh', async () => {
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('HEAD'),
    } as never)
    vi.mocked(createCodeGraphProvider).mockReturnValue({
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      getStatistics: vi.fn().mockResolvedValue({
        lastIndexedAt: '2026-05-21T00:00:00.000Z',
        lastIndexedRef: 'HEAD',
      }),
      findSymbols: vi.fn().mockResolvedValue([]),
    } as never)

    const config = makeMockConfig({
      projectRoot: '/project',
      workspaces: [
        {
          name: 'core',
          specsPath: '/project/specs/core',
          specsAdapter: { adapter: 'fs', config: { path: '/project/specs/core' } },
          schemasPath: null,
          schemasAdapter: null,
          codeRoot: '/project/packages/core',
          ownership: 'owned',
          isExternal: false,
        },
      ],
    })

    const result = await enrichImplementationTracking(config, {
      trackedFiles: [],
      links: [
        {
          specId: 'core:change',
          file: 'packages/core/src/change.ts',
          fileLinkExplicit: true,
          symbols: ['Change.transition'],
        },
      ],
    })

    expect(result.graphHint.status).toBe('fresh')
    expect(result.links[0]?.staleSymbols).toEqual(['Change.transition'])
  })

  it('clears stale when a composed symbol resolves uniquely by same-file fallback', async () => {
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('HEAD'),
    } as never)
    vi.mocked(createCodeGraphProvider).mockReturnValue({
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      getStatistics: vi.fn().mockResolvedValue({
        lastIndexedAt: '2026-05-21T00:00:00.000Z',
        lastIndexedRef: 'HEAD',
      }),
      findSymbols: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'core:src/change.ts:property:transition:1:1',
            name: 'transition',
            kind: 'property',
            filePath: 'core:src/change.ts',
            line: 1,
            column: 1,
            comment: undefined,
          },
        ]),
    } as never)

    const config = makeMockConfig({
      projectRoot: '/project',
      workspaces: [
        {
          name: 'core',
          specsPath: '/project/specs/core',
          specsAdapter: { adapter: 'fs', config: { path: '/project/specs/core' } },
          schemasPath: null,
          schemasAdapter: null,
          codeRoot: '/project/packages/core',
          ownership: 'owned',
          isExternal: false,
        },
      ],
    })

    const result = await enrichImplementationTracking(config, {
      trackedFiles: [],
      links: [
        {
          specId: 'core:change',
          file: 'packages/core/src/change.ts',
          fileLinkExplicit: true,
          symbols: ['Change.transition'],
        },
      ],
    })

    expect(result.links[0]?.staleSymbols).toEqual([])
  })

  it('keeps stale when same-file fallback only finds a wrong-kind symbol', async () => {
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('HEAD'),
    } as never)
    vi.mocked(createCodeGraphProvider).mockReturnValue({
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      getStatistics: vi.fn().mockResolvedValue({
        lastIndexedAt: '2026-05-21T00:00:00.000Z',
        lastIndexedRef: 'HEAD',
      }),
      findSymbols: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'core:src/change.ts:method:transition:1:1',
            name: 'transition',
            kind: 'method',
            filePath: 'core:src/change.ts',
            line: 1,
            column: 1,
            comment: undefined,
          },
        ]),
    } as never)

    const config = makeMockConfig({
      projectRoot: '/project',
      workspaces: [
        {
          name: 'core',
          specsPath: '/project/specs/core',
          specsAdapter: { adapter: 'fs', config: { path: '/project/specs/core' } },
          schemasPath: null,
          schemasAdapter: null,
          codeRoot: '/project/packages/core',
          ownership: 'owned',
          isExternal: false,
        },
      ],
    })

    const result = await enrichImplementationTracking(config, {
      trackedFiles: [],
      links: [
        {
          specId: 'core:change',
          file: 'packages/core/src/change.ts',
          fileLinkExplicit: true,
          symbols: ['Change.transition'],
        },
      ],
    })

    expect(result.links[0]?.staleSymbols).toEqual(['Change.transition'])
  })

  it('keeps stale when composed symbol fallback is ambiguous in the same file', async () => {
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('HEAD'),
    } as never)
    vi.mocked(createCodeGraphProvider).mockReturnValue({
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      getStatistics: vi.fn().mockResolvedValue({
        lastIndexedAt: '2026-05-21T00:00:00.000Z',
        lastIndexedRef: 'HEAD',
      }),
      findSymbols: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'core:src/change.ts:property:transition:1:1',
            name: 'transition',
            kind: 'property',
            filePath: 'core:src/change.ts',
            line: 1,
            column: 1,
            comment: undefined,
          },
          {
            id: 'core:src/change.ts:property:transition:2:1',
            name: 'transition',
            kind: 'property',
            filePath: 'core:src/change.ts',
            line: 2,
            column: 1,
            comment: undefined,
          },
        ]),
    } as never)

    const config = makeMockConfig({
      projectRoot: '/project',
      workspaces: [
        {
          name: 'core',
          specsPath: '/project/specs/core',
          specsAdapter: { adapter: 'fs', config: { path: '/project/specs/core' } },
          schemasPath: null,
          schemasAdapter: null,
          codeRoot: '/project/packages/core',
          ownership: 'owned',
          isExternal: false,
        },
      ],
    })

    const result = await enrichImplementationTracking(config, {
      trackedFiles: [],
      links: [
        {
          specId: 'core:change',
          file: 'packages/core/src/change.ts',
          fileLinkExplicit: true,
          symbols: ['Change.transition'],
        },
      ],
    })

    expect(result.links[0]?.staleSymbols).toEqual(['Change.transition'])
  })
})
