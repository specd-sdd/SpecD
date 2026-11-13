import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import v8 from 'node:v8'
import vm from 'node:vm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { IndexCodeGraph } from '../../../src/application/use-cases/index-code-graph.js'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'
import { AdapterRegistry } from '../../../src/infrastructure/tree-sitter/adapter-registry.js'
import { TypeScriptLanguageAdapter } from '../../../src/infrastructure/tree-sitter/typescript-language-adapter.js'
import { PythonLanguageAdapter } from '../../../src/infrastructure/tree-sitter/python-language-adapter.js'
import { GoLanguageAdapter } from '../../../src/infrastructure/tree-sitter/go-language-adapter.js'
import { PhpLanguageAdapter } from '../../../src/infrastructure/tree-sitter/php-language-adapter.js'
import { emptyResolutionManifestSource } from '../../../src/application/ports/resolution-manifest-source.js'
import { emptyRepositoryRootSource } from '../../../src/application/ports/repository-root-source.js'
import { NodeWorkspaceAccessibilitySource } from '../../../src/infrastructure/fs/node-workspace-accessibility-source.js'
import { makeMockSpecRepository } from '../../helpers/make-mock-spec-repository.js'
import { InMemoryIndexSession } from '../../../src/application/use-cases/in-memory-index-session.js'
import { type LanguageAdapter } from '../../../src/domain/value-objects/language-adapter.js'

/**
 * Wraps an adapter so that the size of the parser-resource scope is recorded before and after
 * every `analyzeFile` call, without changing what the adapter does.
 * @param adapter - Real adapter to observe.
 * @param before - Receives the scope size when analysis of a file starts.
 * @param after - Receives the scope size when analysis of a file returns.
 * @returns The observed adapter.
 */
function observeScope(
  adapter: LanguageAdapter,
  before: number[],
  after: number[],
): LanguageAdapter {
  return new Proxy(adapter, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver)
      if (property === 'analyzeFile') {
        return (...args: Parameters<LanguageAdapter['analyzeFile']>) => {
          before.push(args[2].session.parserResources.size)
          const draft = target.analyzeFile(...args)
          after.push(args[2].session.parserResources.size)
          return draft
        }
      }
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value
    },
  })
}

describe('Tree-sitter parser resource lifecycle regression integration test', () => {
  let tempDir: string
  let store: InMemoryGraphStore

  const originalGc = (globalThis as { gc?: unknown }).gc

  beforeEach(async () => {
    // Attempt to expose GC via v8/vm test helper so forced collections occur at file boundaries
    try {
      v8.setFlagsFromString('--expose-gc')
      const exposedGc = vm.runInNewContext('gc') as (() => void) | undefined
      if (typeof exposedGc === 'function') {
        ;(globalThis as { gc?: unknown }).gc = exposedGc
      }
    } catch {
      // Platform fallback
    }

    tempDir = mkdtempSync(join(tmpdir(), 'specd-lifecycle-regression-'))
    store = new InMemoryGraphStore(tempDir)
    await store.open()
  })

  afterEach(async () => {
    // Leave the global as the test found it so other suites are not affected
    if (originalGc === undefined) {
      delete (globalThis as { gc?: unknown }).gc
    } else {
      ;(globalThis as { gc?: unknown }).gc = originalGc
    }
    await store.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('indexes 200 files per built-in language under forced per-file GC without native crash or memory corruption', async () => {
    const wsDir = join(tempDir, 'workspace')
    mkdirSync(join(wsDir, 'src'), { recursive: true })

    const FILE_COUNT_PER_LANG = 200

    // Generate TypeScript files
    for (let i = 0; i < FILE_COUNT_PER_LANG; i++) {
      writeFileSync(
        join(wsDir, 'src', `ts_file_${i}.ts`),
        `export class Service${i} {
  run(): number { return ${i}; }
}
export const CONST_${i} = ${i};
`,
      )
    }

    // Generate Python files
    for (let i = 0; i < FILE_COUNT_PER_LANG; i++) {
      writeFileSync(
        join(wsDir, 'src', `py_file_${i}.py`),
        `class PyService${i}:
    def compute(self):
        return ${i}

VALUE_${i} = ${i}
`,
      )
    }

    // Generate Go files
    for (let i = 0; i < FILE_COUNT_PER_LANG; i++) {
      writeFileSync(
        join(wsDir, 'src', `go_file_${i}.go`),
        `package main

type GoService${i} struct {}

func (s *GoService${i}) GetValue() int {
    return ${i}
}
`,
      )
    }

    // Generate PHP files
    for (let i = 0; i < FILE_COUNT_PER_LANG; i++) {
      writeFileSync(
        join(wsDir, 'src', `php_file_${i}.php`),
        `<?php
namespace App;

class PhpService${i} {
    public function execute(): int {
        return ${i};
    }
}
`,
      )
    }

    const startSizes: number[] = []
    const endSizes: number[] = []
    const registry = new AdapterRegistry()
    registry.register(observeScope(new TypeScriptLanguageAdapter(), startSizes, endSizes))
    registry.register(observeScope(new PythonLanguageAdapter(), startSizes, endSizes))
    registry.register(observeScope(new GoLanguageAdapter(), startSizes, endSizes))
    registry.register(observeScope(new PhpLanguageAdapter(), startSizes, endSizes))

    const indexer = new IndexCodeGraph(
      store,
      registry,
      emptyResolutionManifestSource,
      emptyRepositoryRootSource,
      new NodeWorkspaceAccessibilitySource(),
    )

    const totalExpectedFiles = FILE_COUNT_PER_LANG * 4

    const result = await indexer.execute({
      projectRoot: tempDir,
      vcsRoot: null,
      workspaces: [
        {
          name: 'workspace',
          prefix: null,
          codeRoot: wsDir,
          isExternal: false,
          ownership: 'owned' as const,
          specRepo: makeMockSpecRepository(),
        },
      ],
      graphConfig: {},
    })

    expect(result.filesIndexed).toBe(totalExpectedFiles)
    expect(result.errors).toHaveLength(0)
    expect(result.filesSkippedForSize).toBe(0)

    // Verify symbols were indexed correctly across all languages
    const tsSymbols = await store.findSymbols({ name: 'Service0' })
    expect(tsSymbols).toHaveLength(1)

    const pySymbols = await store.findSymbols({ name: 'PyService0' })
    expect(pySymbols).toHaveLength(1)

    const goSymbols = await store.findSymbols({ name: 'GoService0' })
    expect(goSymbols).toHaveLength(1)

    const phpSymbols = await store.findSymbols({ name: 'PhpService0' })
    expect(phpSymbols).toHaveLength(1)

    // Retention is bounded: every file starts with an empty scope and holds one resource at most
    expect(startSizes).toHaveLength(totalExpectedFiles)
    expect(startSizes.every((size) => size === 0)).toBe(true)
    expect(endSizes.every((size) => size === 1)).toBe(true)

    // The graph equals what a fresh analysis of the same file produces, so releasing parser
    // resources at the file boundary changes no extracted fact
    const baselines: ReadonlyArray<readonly [LanguageAdapter, string, string]> = [
      [new TypeScriptLanguageAdapter(), 'typescript', 'ts_file_0.ts'],
      [new PythonLanguageAdapter(), 'python', 'py_file_0.py'],
      [new GoLanguageAdapter(), 'go', 'go_file_0.go'],
      [new PhpLanguageAdapter(), 'php', 'php_file_0.php'],
    ]
    for (const [adapter, language, fileName] of baselines) {
      const filePath = `workspace:src/${fileName}`
      const session = new InMemoryIndexSession()
      session.registerFile({
        filePath,
        projectRelativePath: `workspace/src/${fileName}`,
        language,
        contentHash: 'baseline',
        workspace: 'workspace',
      })
      const baseline = adapter.analyzeFile(
        filePath,
        readFileSync(join(wsDir, 'src', fileName), 'utf-8'),
        { session, workspaceName: 'workspace' },
      )
      const indexed = await store.findSymbols({ filePath })
      expect(indexed.map((s) => s.name).sort()).toEqual(baseline.symbols.map((s) => s.name).sort())
      expect(indexed.length).toBeGreaterThan(0)
    }
  }, 120_000)
})
