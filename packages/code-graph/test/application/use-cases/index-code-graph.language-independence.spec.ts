import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { IndexCodeGraph } from '../../../src/application/use-cases/index-code-graph.js'
import { emptyResolutionManifestSource } from '../../../src/application/ports/resolution-manifest-source.js'
import { ResolveSymbolReference } from '../../../src/application/use-cases/resolve-symbol-reference.js'
import { AdapterRegistry } from '../../../src/infrastructure/tree-sitter/adapter-registry.js'
import { type IndexOptions } from '../../../src/domain/value-objects/index-options.js'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'
import { makeMockSpecRepository } from '../../helpers/make-mock-spec-repository.js'
import { StubLanguageAdapter } from '../../helpers/stub-language-adapter.js'

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../src')

/**
 * Writes files under a directory.
 * @param root - Directory that receives the files.
 * @param files - Relative path to content.
 */
function write(root: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    const target = join(root, relative)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
}

describe('Language independence of package import resolution', () => {
  let tempDir: string
  let libDir: string
  let appDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-language-independence-'))
    libDir = join(tempDir, 'zlib')
    appDir = join(tempDir, 'zapp')
    write(libDir, { 'zig2.pkg': 'name=zlib\nentry=src/lib.z2\n', 'src/lib.z2': 'export Widget\n' })
    write(appDir, {
      'zig2.pkg': 'name=zapp\nentry=src/main.z2\n',
      'src/main.z2': 'import Widget from "zlib"\nimport Missing from "zlib"\nexport run\n',
    })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  /**
   * Builds the options for the two made-up-language workspaces.
   * @returns Index options.
   */
  function options(): IndexOptions {
    const workspace = (name: string, codeRoot: string): IndexOptions['workspaces'][number] => ({
      name,
      prefix: null,
      codeRoot,
      specRepo: makeMockSpecRepository(),
      ownership: 'owned',
      isExternal: false,
    })
    return {
      projectRoot: tempDir,
      vcsRoot: tempDir,
      workspaces: [workspace('zlib', libDir), workspace('zapp', appDir)],
      graphConfig: { includePaths: [], workspaces: new Map() },
    }
  }

  it('Given an adapter for a made-up language, when two workspaces are indexed with the unmodified indexer, then the import resolves', async () => {
    const store = new InMemoryGraphStore(tempDir)
    await store.open()
    const registry = new AdapterRegistry()
    registry.register(new StubLanguageAdapter())
    const indexer = new IndexCodeGraph(store, registry, emptyResolutionManifestSource)

    const result = await indexer.execute(options())

    const facts = await store.getAllReferenceFacts()
    const widget = facts.localBindings.find((binding) => binding.localName === 'Widget')
    const missing = facts.localBindings.find((binding) => binding.localName === 'Missing')
    expect(widget?.targetId).toContain('zlib')
    expect(missing?.targetId).toBeUndefined()
    expect(facts.steps.some((step) => step.kind === 'import:package')).toBe(true)
    expect(
      store
        .allRelationsForTest()
        .some(
          (relation) =>
            relation.type === 'IMPORTS' &&
            relation.source === 'zapp:src/main.z2' &&
            relation.target === 'zlib:src/lib.z2',
        ),
    ).toBe(true)
    expect(result.importDiagnostics.byReason['not-exported']).toBe(1)
  })

  it('Given a persisted import:package step, when the imported name is resolved from the importing file, then the cross-workspace target is found and a missing name is not guessed', async () => {
    const store = new InMemoryGraphStore(tempDir)
    await store.open()
    const registry = new AdapterRegistry()
    registry.register(new StubLanguageAdapter())
    await new IndexCodeGraph(store, registry, emptyResolutionManifestSource).execute(options())
    const resolver = new ResolveSymbolReference(
      store,
      async () => ({ fresh: true, complete: true, reasonCodes: [] }) as never,
      undefined,
      registry,
    )

    const resolved = await resolver.execute({
      workspace: 'zapp',
      requested: 'Widget',
      filePath: 'zapp:src/main.z2',
    })
    const missing = await resolver.execute({
      workspace: 'zapp',
      requested: 'Missing',
      filePath: 'zapp:src/main.z2',
    })

    expect(resolved.status).toBe('resolved')
    expect(resolved.target?.id).toContain('zlib')
    expect(missing.status).not.toBe('resolved')
    expect(missing.target ?? undefined).toBeUndefined()
  })

  it('Given the entry stops exporting the name, when indexed incrementally, then the edge disappears', async () => {
    const store = new InMemoryGraphStore(tempDir)
    await store.open()
    const registry = new AdapterRegistry()
    registry.register(new StubLanguageAdapter())
    const indexer = new IndexCodeGraph(store, registry, emptyResolutionManifestSource)
    await indexer.execute(options())

    write(libDir, { 'src/lib.z2': 'export Other\n' })
    await indexer.execute(options())

    const facts = await store.getAllReferenceFacts()
    expect(
      facts.localBindings.find((binding) => binding.localName === 'Widget')?.targetId,
    ).toBeUndefined()
    expect(facts.steps.some((step) => step.kind === 'import:package')).toBe(false)
  })

  it('Given the indexer sources, when scanned, then package import resolution mentions no language, extension, or manifest', () => {
    const scanned = [
      'application/use-cases/index-code-graph.ts',
      'application/services/package-import-resolver.ts',
    ].map((file) => ({ file, text: readFileSync(join(srcRoot, file), 'utf8') }))
    const forbidden = [
      /zig2/i,
      /\.z2\b/,
      /['"`](typescript|javascript|python|php|go)['"`]/,
      /\b(package\.json|go\.mod|pyproject\.toml|composer\.json)\b/,
    ]

    for (const { file, text } of scanned) {
      for (const pattern of forbidden) {
        expect({ file, pattern: String(pattern), found: pattern.test(text) }).toEqual({
          file,
          pattern: String(pattern),
          found: false,
        })
      }
    }
  })
})
