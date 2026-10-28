import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { IndexCodeGraph } from '../../../src/application/use-cases/index-code-graph.js'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'
import { type GraphStore } from '../../../src/domain/ports/graph-store.js'
import { AdapterRegistry } from '../../../src/infrastructure/tree-sitter/adapter-registry.js'
import { emptyResolutionManifestSource } from '../../../src/application/ports/resolution-manifest-source.js'
import { emptyRepositoryRootSource } from '../../../src/application/ports/repository-root-source.js'
import { NodeWorkspaceAccessibilitySource } from '../../../src/infrastructure/fs/node-workspace-accessibility-source.js'
import { makeMockSpecRepository } from '../../helpers/make-mock-spec-repository.js'
import { TypeScriptLanguageAdapter } from '../../../src/infrastructure/tree-sitter/typescript-language-adapter.js'
import { IndexCoverageStatus } from '../../../src/domain/value-objects/index-session.js'

function createWorkspace(
  baseDir: string,
  name: string,
  files: Record<string, string | Buffer>,
): string {
  const wsDir = join(baseDir, name)
  mkdirSync(wsDir, { recursive: true })
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(wsDir, relPath)
    mkdirSync(join(fullPath, '..'), { recursive: true })
    writeFileSync(fullPath, content)
  }
  return wsDir
}

/**
 * Builds bytes that are neither UTF-8, UTF-16 nor single-byte text, so that the indexer records
 * the file as undecodable content instead of storing it as a document.
 * @param length - Number of bytes.
 * @returns The blob.
 */
function undecodableBlob(length: number): Buffer {
  return Buffer.from(Array.from({ length }, (_, i) => (i % 7 === 0 ? 0 : 0x80 + (i % 64))))
}

describe('IndexCodeGraph - file size limits', () => {
  let tempDir: string
  let store: GraphStore
  let registry: AdapterRegistry

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-size-limit-'))
    store = new InMemoryGraphStore(tempDir)
    await store.open()
    registry = new AdapterRegistry()
    registry.register(new TypeScriptLanguageAdapter())
  })

  afterEach(async () => {
    await store.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('skips oversized files, creates coverage with reason file-too-large, and records result fields', async () => {
    const wsDir = createWorkspace(tempDir, 'ws', {
      'src/small.ts': 'export const x = 1;',
      // 300 KiB file (exceeds default 256 KiB = 262144 bytes)
      'src/large.ts': 'export const y = 2;'.padEnd(300 * 1024, ' '),
    })

    const indexer = new IndexCodeGraph(
      store,
      registry,
      emptyResolutionManifestSource,
      emptyRepositoryRootSource,
      new NodeWorkspaceAccessibilitySource(),
    )

    const result = await indexer.execute({
      projectRoot: tempDir,
      vcsRoot: null,
      workspaces: [
        {
          name: 'ws',
          prefix: null,
          codeRoot: wsDir,
          isExternal: false,
          ownership: 'owned' as const,
          specRepo: makeMockSpecRepository(),
        },
      ],
      graphConfig: {},
    })

    expect(result.filesIndexed).toBe(1)
    expect(result.filesSkippedForSize).toBe(1)
    expect(result.largestSkippedForSize).toHaveLength(1)
    expect(result.largestSkippedForSize[0]).toEqual({
      filePath: 'ws:src/large.ts',
      projectRelativePath: 'ws/src/large.ts',
      sizeBytes: 300 * 1024,
      limitBytes: 262144,
    })
    expect(result.sizeExemptAnalysed).toEqual([])

    // No symbols or nodes created for oversized file
    const symbols = await store.findSymbols({ name: 'y' })
    expect(symbols).toHaveLength(0)

    // Coverage record created
    const [coverage] = await store.findIndexCoverage(['ws:src/large.ts'])
    expect(coverage).toBeDefined()
    expect(coverage?.status).toBe(IndexCoverageStatus.Unsupported)
    expect(coverage?.reason).toBe('file-too-large')
  })

  it('respects exact limit boundaries (262144 indexed, 262145 skipped)', async () => {
    const wsDir = createWorkspace(tempDir, 'ws', {
      'src/at-limit.ts': 'export const atLimit = 1;'.padEnd(262144, ' '),
      'src/over-limit.ts': 'export const overLimit = 2;'.padEnd(262145, ' '),
    })

    const indexer = new IndexCodeGraph(
      store,
      registry,
      emptyResolutionManifestSource,
      emptyRepositoryRootSource,
      new NodeWorkspaceAccessibilitySource(),
    )

    const result = await indexer.execute({
      projectRoot: tempDir,
      vcsRoot: null,
      workspaces: [
        {
          name: 'ws',
          prefix: null,
          codeRoot: wsDir,
          isExternal: false,
          ownership: 'owned' as const,
          specRepo: makeMockSpecRepository(),
        },
      ],
      graphConfig: {},
    })

    expect(result.filesIndexed).toBe(1)
    expect(result.filesSkippedForSize).toBe(1)
    expect(result.largestSkippedForSize[0]?.filePath).toBe('ws:src/over-limit.ts')
  })

  it('indexes all files without skipping when maxFileBytes is 0', async () => {
    const wsDir = createWorkspace(tempDir, 'ws', {
      'src/huge.ts': 'export const huge = 1;'.padEnd(500 * 1024, ' '),
    })

    const indexer = new IndexCodeGraph(
      store,
      registry,
      emptyResolutionManifestSource,
      emptyRepositoryRootSource,
      new NodeWorkspaceAccessibilitySource(),
    )

    const result = await indexer.execute({
      projectRoot: tempDir,
      vcsRoot: null,
      workspaces: [
        {
          name: 'ws',
          prefix: null,
          codeRoot: wsDir,
          isExternal: false,
          ownership: 'owned' as const,
          specRepo: makeMockSpecRepository(),
        },
      ],
      graphConfig: {
        maxFileBytes: 0,
      },
    })

    expect(result.filesIndexed).toBe(1)
    expect(result.filesSkippedForSize).toBe(0)
    expect(result.largestSkippedForSize).toEqual([])
  })

  it('applies workspace-level maxFileBytes override', async () => {
    const wsDir = createWorkspace(tempDir, 'ws', {
      'src/medium.ts': 'export const m = 1;'.padEnd(400 * 1024, ' '),
    })

    const indexer = new IndexCodeGraph(
      store,
      registry,
      emptyResolutionManifestSource,
      emptyRepositoryRootSource,
      new NodeWorkspaceAccessibilitySource(),
    )

    const result = await indexer.execute({
      projectRoot: tempDir,
      vcsRoot: null,
      workspaces: [
        {
          name: 'ws',
          prefix: null,
          codeRoot: wsDir,
          isExternal: false,
          ownership: 'owned' as const,
          specRepo: makeMockSpecRepository(),
        },
      ],
      graphConfig: {
        maxFileBytes: 262144,
        workspaces: new Map([
          [
            'ws',
            {
              maxFileBytes: 600 * 1024, // 600 KiB limit for ws
            },
          ],
        ]),
      },
    })

    expect(result.filesIndexed).toBe(1)
    expect(result.filesSkippedForSize).toBe(0)
  })

  it('indexes oversized file when exempt and populates sizeExemptAnalysed', async () => {
    const wsDir = createWorkspace(tempDir, 'ws', {
      'src/exempt-big.ts': 'export const big = 1;'.padEnd(400 * 1024, ' '),
    })

    const indexer = new IndexCodeGraph(
      store,
      registry,
      emptyResolutionManifestSource,
      emptyRepositoryRootSource,
      new NodeWorkspaceAccessibilitySource(),
    )

    const result = await indexer.execute({
      projectRoot: tempDir,
      vcsRoot: null,
      workspaces: [
        {
          name: 'ws',
          prefix: null,
          codeRoot: wsDir,
          isExternal: false,
          ownership: 'owned' as const,
          specRepo: makeMockSpecRepository(),
        },
      ],
      graphConfig: {
        largeFilePaths: ['ws/src/exempt-big.ts'],
      },
    })

    expect(result.filesIndexed).toBe(1)
    expect(result.filesSkippedForSize).toBe(0)
    expect(result.sizeExemptAnalysed).toHaveLength(1)
    expect(result.sizeExemptAnalysed[0]).toEqual({
      filePath: 'ws:src/exempt-big.ts',
      projectRelativePath: 'ws/src/exempt-big.ts',
      sizeBytes: 400 * 1024,
    })
  })

  it('does not cause deletion churn in second incremental run for skipped files', async () => {
    const wsDir = createWorkspace(tempDir, 'ws', {
      'src/ok.ts': 'export const ok = 1;',
      'src/too-big.ts': 'export const big = 2;'.padEnd(300 * 1024, ' '),
    })

    const indexer = new IndexCodeGraph(
      store,
      registry,
      emptyResolutionManifestSource,
      emptyRepositoryRootSource,
      new NodeWorkspaceAccessibilitySource(),
    )

    const options = {
      projectRoot: tempDir,
      vcsRoot: null,
      workspaces: [
        {
          name: 'ws',
          prefix: null,
          codeRoot: wsDir,
          isExternal: false,
          ownership: 'owned' as const,
          specRepo: makeMockSpecRepository(),
        },
      ],
      graphConfig: {},
    }

    const run1 = await indexer.execute(options)
    expect(run1.filesIndexed).toBe(1)
    expect(run1.filesSkippedForSize).toBe(1)

    const run2 = await indexer.execute(options)
    expect(run2.filesRemoved).toBe(0)
    expect(run2.filesSkippedForSize).toBe(1)
  })

  it('orders largestSkippedForSize by size descending and caps at 25', async () => {
    const files: Record<string, string> = {}
    for (let i = 1; i <= 30; i++) {
      // Each file has (262145 + i * 10) bytes
      files[`src/file-${i}.ts`] = 'x'.padEnd(262145 + i * 10, ' ')
    }
    const wsDir = createWorkspace(tempDir, 'ws', files)

    const indexer = new IndexCodeGraph(
      store,
      registry,
      emptyResolutionManifestSource,
      emptyRepositoryRootSource,
      new NodeWorkspaceAccessibilitySource(),
    )

    const result = await indexer.execute({
      projectRoot: tempDir,
      vcsRoot: null,
      workspaces: [
        {
          name: 'ws',
          prefix: null,
          codeRoot: wsDir,
          isExternal: false,
          ownership: 'owned' as const,
          specRepo: makeMockSpecRepository(),
        },
      ],
      graphConfig: {},
    })

    expect(result.filesSkippedForSize).toBe(30)
    expect(result.largestSkippedForSize).toHaveLength(25)
    // Check descending order
    for (let i = 0; i < result.largestSkippedForSize.length - 1; i++) {
      expect(result.largestSkippedForSize[i]!.sizeBytes).toBeGreaterThanOrEqual(
        result.largestSkippedForSize[i + 1]!.sizeBytes,
      )
    }
    // Largest should be file-30
    expect(result.largestSkippedForSize[0]?.filePath).toBe('ws:src/file-30.ts')
  })

  describe('scope of the limit and of the exemption', () => {
    const run = async (
      wsDir: string,
      graphConfig: Parameters<IndexCodeGraph['execute']>[0]['graphConfig'],
    ): Promise<Awaited<ReturnType<IndexCodeGraph['execute']>>> => {
      const indexer = new IndexCodeGraph(
        store,
        registry,
        emptyResolutionManifestSource,
        emptyRepositoryRootSource,
        new NodeWorkspaceAccessibilitySource(),
      )
      return indexer.execute({
        projectRoot: tempDir,
        vcsRoot: null,
        workspaces: [
          {
            name: 'ws',
            prefix: null,
            codeRoot: wsDir,
            isExternal: false,
            ownership: 'owned' as const,
            specRepo: makeMockSpecRepository(),
          },
        ],
        graphConfig,
      })
    }

    it('skips an oversized textual document and creates no document node', async () => {
      // Given a small and an oversized textual file without a language adapter
      const wsDir = createWorkspace(tempDir, 'ws', {
        'notes/small.txt': 'a few words',
        'notes/huge.txt': 'word '.repeat(80 * 1024),
      })

      // When the project is indexed with the default limit
      const result = await run(wsDir, {})

      // Then only the small document is stored and the large one is a size skip
      const documents = await store.getAllDocuments()
      expect(documents.map((d) => d.path)).toEqual(['ws:notes/small.txt'])
      expect(result.filesSkippedForSize).toBe(1)
      expect(result.largestSkippedForSize[0]?.filePath).toBe('ws:notes/huge.txt')
      const [coverage] = await store.findIndexCoverage(['ws:notes/huge.txt'])
      expect(coverage?.status).toBe(IndexCoverageStatus.Unsupported)
      expect(coverage?.reason).toBe('file-too-large')
    })

    it('applies the limit to test and ignored files regardless of category', async () => {
      // Given oversized files that match testPaths and ignorePaths
      const big = 'export const v = 1;'.padEnd(300 * 1024, ' ')
      const wsDir = createWorkspace(tempDir, 'ws', {
        'src/app.ts': 'export const a = 1;',
        'src/app.spec.ts': big,
        'fixtures/data.ts': big,
      })

      // When the project is indexed
      const result = await run(wsDir, {
        testPaths: ['**/*.spec.ts'],
        ignorePaths: ['fixtures/**'],
      })

      // Then both categories are skipped for size
      expect(result.filesSkippedForSize).toBe(2)
      expect(result.largestSkippedForSize.map((f) => f.filePath).sort()).toEqual([
        'ws:fixtures/data.ts',
        'ws:src/app.spec.ts',
      ])
      expect(result.filesIndexed).toBe(1)
    })

    it('does not let an exemption bring back a file that discovery excludes', async () => {
      // Given an oversized file inside an excluded directory that is also listed as exempt
      const wsDir = createWorkspace(tempDir, 'ws', {
        'src/app.ts': 'export const a = 1;',
        'vendor/lib.ts': 'export const l = 1;'.padEnd(300 * 1024, ' '),
      })

      // When the project is indexed
      const result = await run(wsDir, {
        excludePaths: ['vendor/'],
        largeFilePaths: ['ws/vendor/lib.ts'],
      })

      // Then the file is neither indexed nor reported as a size skip or exempt file
      expect(result.filesIndexed).toBe(1)
      expect(result.filesSkippedForSize).toBe(0)
      expect(result.sizeExemptAnalysed).toEqual([])
      expect(await store.findSymbols({ name: 'l' })).toHaveLength(0)
    })

    it('does not let an exemption bring back a file filtered as binary', async () => {
      // Given an oversized file with a binary extension that is listed as exempt
      const wsDir = createWorkspace(tempDir, 'ws', {
        'src/app.ts': 'export const a = 1;',
        'assets/logo.png': Buffer.alloc(300 * 1024, 1),
      })

      // When the project is indexed
      const result = await run(wsDir, { largeFilePaths: ['ws/assets/logo.png'] })

      // Then the binary filter still applies
      expect(result.filesSkippedForSize).toBe(0)
      expect(result.sizeExemptAnalysed).toEqual([])
      expect(await store.getAllDocuments()).toHaveLength(0)
    })

    it('exempts a workspace-relative pattern but not the same path in another workspace', async () => {
      // Given two files of the same size and a workspace-level exemption for one path
      const wsDir = createWorkspace(tempDir, 'ws', {
        'gen/schema.ts': 'export const s = 1;'.padEnd(300 * 1024, ' '),
        'src/other.ts': 'export const o = 1;'.padEnd(300 * 1024, ' '),
      })

      // When the workspace declares its own exemption relative to the project root
      const result = await run(wsDir, {
        workspaces: new Map([['ws', { largeFilePaths: ['ws/gen/**'] }]]),
      })

      // Then only the matching file is analysed
      expect(result.sizeExemptAnalysed.map((f) => f.filePath)).toEqual(['ws:gen/schema.ts'])
      expect(result.largestSkippedForSize.map((f) => f.filePath)).toEqual(['ws:src/other.ts'])
    })

    it('combines project-level and workspace-level exemptions in one workspace', async () => {
      // Given three oversized files, one matched by each level and one by neither
      const big = (name: string): string => `export const ${name} = 1;`.padEnd(300 * 1024, ' ')
      const wsDir = createWorkspace(tempDir, 'ws', {
        'src/by-project.ts': big('p'),
        'gen/by-workspace.ts': big('w'),
        'src/neither.ts': big('n'),
      })

      // When the project and the workspace each declare an exemption
      const result = await run(wsDir, {
        largeFilePaths: ['ws/src/by-project.ts'],
        workspaces: new Map([['ws', { largeFilePaths: ['ws/gen/**'] }]]),
      })

      // Then both matched files are analysed and the other one is skipped
      expect(result.sizeExemptAnalysed.map((f) => f.filePath).sort()).toEqual([
        'ws:gen/by-workspace.ts',
        'ws:src/by-project.ts',
      ])
      expect(result.largestSkippedForSize.map((f) => f.filePath)).toEqual(['ws:src/neither.ts'])
    })

    it('gates project-global root files with the project limit', async () => {
      // Given a project-global document above the limit and another below it
      const wsDir = createWorkspace(tempDir, 'ws', { 'src/app.ts': 'export const a = 1;' })
      mkdirSync(join(tempDir, 'docs'), { recursive: true })
      writeFileSync(join(tempDir, 'docs', 'small.md'), '# small')
      writeFileSync(join(tempDir, 'docs', 'huge.md'), 'word '.repeat(80 * 1024))

      // When the project-global documents are included in the graph
      const result = await run(wsDir, { includePaths: ['docs/**'] })

      // Then only the large root document is a size skip
      expect(result.largestSkippedForSize.map((f) => f.filePath)).toEqual(['root:docs/huge.md'])
      const documents = await store.getAllDocuments()
      expect(documents.map((d) => d.path)).toEqual(['root:docs/small.md'])
    })

    it('drops a previously indexed file when a forced run finds it over a lowered limit', async () => {
      // Given a file indexed under a generous limit
      const wsDir = createWorkspace(tempDir, 'ws', {
        'src/app.ts': 'export const keep = 1;',
        'src/grow.ts': 'export const grown = 1;'.padEnd(5000, ' '),
      })
      await run(wsDir, { maxFileBytes: 100_000 })
      expect(await store.findSymbols({ name: 'grown' })).toHaveLength(1)

      // When a forced run applies a limit below its size
      const indexer = new IndexCodeGraph(
        store,
        registry,
        emptyResolutionManifestSource,
        emptyRepositoryRootSource,
        new NodeWorkspaceAccessibilitySource(),
      )
      const result = await indexer.execute({
        projectRoot: tempDir,
        vcsRoot: null,
        workspaces: [
          {
            name: 'ws',
            prefix: null,
            codeRoot: wsDir,
            isExternal: false,
            ownership: 'owned' as const,
            specRepo: makeMockSpecRepository(),
          },
        ],
        graphConfig: { maxFileBytes: 1000 },
        force: true,
      })

      // Then the file is gone from the graph and recorded as a size skip
      expect(await store.findSymbols({ name: 'grown' })).toHaveLength(0)
      expect(await store.findSymbols({ name: 'keep' })).toHaveLength(1)
      expect(result.largestSkippedForSize.map((f) => f.filePath)).toEqual(['ws:src/grow.ts'])
      const [coverage] = await store.findIndexCoverage(['ws:src/grow.ts'])
      expect(coverage?.reason).toBe('file-too-large')
    })

    it('counts a coverage-only size skip as removed only when it had graph nodes', async () => {
      // Given a code file and an undecodable blob, both within the limit (the blob has only a
      // coverage row with a content hash), indexed with limit 1000
      const wsDir = createWorkspace(tempDir, 'ws', {
        'src/code.ts': 'export const c = 1;'.padEnd(500, ' '),
        'data/blob.dat': undecodableBlob(500),
      })
      const first = await run(wsDir, { maxFileBytes: 1000 })
      expect(first.filesSkippedForSize).toBe(0)

      // When both grow past the same limit (so the fingerprint is unchanged)
      writeFileSync(join(wsDir, 'src/code.ts'), 'export const c = 1;'.padEnd(2000, ' '))
      writeFileSync(join(wsDir, 'data/blob.dat'), undecodableBlob(1500))
      const second = await run(wsDir, { maxFileBytes: 1000 })

      // Then only the file that had graph nodes is counted as removed
      expect(second.filesSkippedForSize).toBe(2)
      expect(second.filesRemoved).toBe(1)
      expect(await store.findSymbols({ name: 'c' })).toHaveLength(0)
    })

    // File modes are not enforced on Windows or for the superuser, where the test would prove nothing.
    it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
      'neither reads nor hashes an oversized file, in a first and an incremental run',
      async () => {
        // Given an oversized file that the process cannot read
        const wsDir = createWorkspace(tempDir, 'ws', {
          'src/app.ts': 'export const a = 1;',
          'src/locked.ts': 'export const k = 1;'.padEnd(300 * 1024, ' '),
        })
        chmodSync(join(wsDir, 'src/locked.ts'), 0o000)

        try {
          // When it is indexed twice (the second run follows the incremental path)
          const first = await run(wsDir, {})
          const second = await run(wsDir, {})

          // Then no read error is reported, because the file is never opened
          expect(first.errors).toEqual([])
          expect(second.errors).toEqual([])
          expect(first.filesSkippedForSize).toBe(1)
          expect(second.filesSkippedForSize).toBe(1)
        } finally {
          chmodSync(join(wsDir, 'src/locked.ts'), 0o644)
        }
      },
    )
  })
})
