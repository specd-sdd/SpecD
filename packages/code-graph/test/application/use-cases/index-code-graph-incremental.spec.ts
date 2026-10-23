import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { IndexCodeGraph } from '../../../src/application/use-cases/index-code-graph.js'
import { emptyResolutionManifestSource } from '../../../src/application/ports/resolution-manifest-source.js'
import { emptyRepositoryRootSource } from '../../../src/application/ports/repository-root-source.js'
import { NodeWorkspaceAccessibilitySource } from '../../../src/infrastructure/fs/node-workspace-accessibility-source.js'
import { AdapterRegistry } from '../../../src/infrastructure/tree-sitter/adapter-registry.js'
import { PhpLanguageAdapter } from '../../../src/infrastructure/tree-sitter/php-language-adapter.js'
import { PythonLanguageAdapter } from '../../../src/infrastructure/tree-sitter/python-language-adapter.js'
import { GoLanguageAdapter } from '../../../src/infrastructure/tree-sitter/go-language-adapter.js'
import { TypeScriptLanguageAdapter } from '../../../src/infrastructure/tree-sitter/typescript-language-adapter.js'
import { type LanguageAdapter } from '../../../src/domain/value-objects/language-adapter.js'
import {
  type IndexOptions,
  type ProjectWorkspace,
} from '../../../src/domain/value-objects/index-options.js'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'
import { makeMockSpecRepository } from '../../helpers/make-mock-spec-repository.js'

/**
 * Writes files under a directory, creating parent directories as needed.
 * @param root - Directory to write into.
 * @param files - Map of relative path to file content.
 */
function writeFiles(root: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    const target = join(root, relative)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
}

/**
 * Captures the normalized semantic state of a graph store for equivalence checks.
 * @param store - The store to inspect.
 * @returns Serialized semantic snapshot.
 */
async function semanticState(store: InMemoryGraphStore): Promise<unknown> {
  const files = await store.getAllFiles()
  const symbols = await store.findSymbols({ filePaths: files.map((file) => file.path) })
  const facts = await store.getAllReferenceFacts()
  return {
    files: files.map((file) => file.path).sort(),
    symbols: symbols.map((symbol) => symbol.id).sort(),
    relations: store
      .allRelationsForTest()
      .map((relation) => `${relation.type}|${relation.source}|${relation.target}`)
      .sort(),
    logicalSymbols: facts.logicalSymbols.map((symbol) => symbol.id).sort(),
    declarations: facts.declarations
      .map((entry) => `${entry.logicalSymbolId}|${entry.declaration.symbolId}`)
      .sort(),
    publicBindings: facts.publicBindings.map((binding) => binding.id).sort(),
    localBindings: facts.localBindings.map((b) => `${b.id}|${b.targetId ?? ''}`).sort(),
    steps: facts.steps.map((s) => `${s.fromId}|${s.toId}|${s.kind}`).sort(),
  }
}

describe('IndexCodeGraph incremental equivalence', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'specd-incremental-')))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  /**
   * Helper to build options for a workspace.
   * @param codeRoot - Code root directory.
   * @param name - Workspace name.
   * @returns Configured IndexOptions.
   */
  function makeOptions(codeRoot: string, name = 'main'): IndexOptions {
    const workspace: ProjectWorkspace = {
      name,
      prefix: null,
      codeRoot,
      specRepo: makeMockSpecRepository(),
      ownership: 'owned',
      isExternal: false,
    }
    return {
      projectRoot: tempDir,
      vcsRoot: tempDir,
      workspaces: [workspace],
      graphConfig: {
        includePaths: ['docs/**'],
        testPaths: ['test/**'],
        workspaces: new Map(),
      },
    }
  }

  /**
   * Runs indexing over a workspace directory using the specified adapter.
   * @param store - Target graph store.
   * @param adapter - Language adapter to register.
   * @param codeRoot - Code root path.
   * @returns Index result.
   */
  async function indexWorkspace(
    store: InMemoryGraphStore,
    adapter: LanguageAdapter,
    codeRoot: string,
  ) {
    const registry = new AdapterRegistry()
    registry.register(adapter)
    const indexer = new IndexCodeGraph(
      store,
      registry,
      emptyResolutionManifestSource,
      emptyRepositoryRootSource,
      new NodeWorkspaceAccessibilitySource(),
    )
    return indexer.execute(makeOptions(codeRoot))
  }

  describe('Scenario: Name-addressed imports match a clean rebuild', () => {
    it('Given a PHP project with namespace-addressed classes, incremental equals clean rebuild', async () => {
      const phpDir = join(tempDir, 'php-project')
      const files: Record<string, string> = {
        'composer.json': JSON.stringify({
          name: 'fixture/php-app',
          autoload: { 'psr-4': { 'App\\': 'src/' } },
        }),
        'src/Service.php': `<?php
namespace App;

class Service {
    public function execute(): int {
        return 42;
    }
}
`,
        'src/Consumer.php': `<?php
namespace App;

use App\\Service;

class Consumer {
    public function run(): int {
        $svc = new Service();
        return $svc->execute();
    }
}
`,
      }
      writeFiles(phpDir, files)

      // Initial index
      const incrementalStore = new InMemoryGraphStore(phpDir)
      await incrementalStore.open()
      const phpAdapter = new PhpLanguageAdapter()
      await indexWorkspace(incrementalStore, phpAdapter, phpDir)

      // Edit only Consumer.php (shift lines without changing structure)
      const consumerPath = join(phpDir, 'src/Consumer.php')
      const original = readFileSync(consumerPath, 'utf-8')
      writeFileSync(consumerPath, `// Modified comment\n\n${original}`)

      // Incremental run on mutated source
      await indexWorkspace(incrementalStore, phpAdapter, phpDir)

      // Clean full rebuild on the same mutated source
      const cleanStore = new InMemoryGraphStore(phpDir)
      await cleanStore.open()
      await indexWorkspace(cleanStore, phpAdapter, phpDir)

      expect(await semanticState(incrementalStore)).toEqual(await semanticState(cleanStore))
      await incrementalStore.close()
      await cleanStore.close()
    })

    it('Given a Python project with module imports, incremental equals clean rebuild', async () => {
      const pyDir = join(tempDir, 'py-project')
      const files: Record<string, string> = {
        'pyproject.toml': '[project]\nname = "py-app"\nversion = "0.1.0"\n',
        'pkg/__init__.py': '',
        'pkg/math.py': 'def calculate():\n    return 100\n',
        'pkg/main.py': 'from .math import calculate\n\ndef run():\n    return calculate()\n',
      }
      writeFiles(pyDir, files)

      const incrementalStore = new InMemoryGraphStore(pyDir)
      await incrementalStore.open()
      const pyAdapter = new PythonLanguageAdapter()
      await indexWorkspace(incrementalStore, pyAdapter, pyDir)

      // Mutate pkg/main.py
      const mainPath = join(pyDir, 'pkg/main.py')
      const original = readFileSync(mainPath, 'utf-8')
      writeFileSync(mainPath, `# updated comment\n\n${original}`)

      await indexWorkspace(incrementalStore, pyAdapter, pyDir)

      const cleanStore = new InMemoryGraphStore(pyDir)
      await cleanStore.open()
      await indexWorkspace(cleanStore, pyAdapter, pyDir)

      expect(await semanticState(incrementalStore)).toEqual(await semanticState(cleanStore))
      await incrementalStore.close()
      await cleanStore.close()
    })

    it('Given a Go project with package-addressed symbols, incremental equals clean rebuild', async () => {
      const goDir = join(tempDir, 'go-project')
      const files: Record<string, string> = {
        'go.mod': 'module example.com/goapp\n\ngo 1.22\n',
        'service.go': 'package main\n\nfunc ProvideValue() int {\n    return 42\n}\n',
        'main.go': 'package main\n\nfunc RunApp() int {\n    return ProvideValue()\n}\n',
      }
      writeFiles(goDir, files)

      const incrementalStore = new InMemoryGraphStore(goDir)
      await incrementalStore.open()
      const goAdapter = new GoLanguageAdapter()
      await indexWorkspace(incrementalStore, goAdapter, goDir)

      // Mutate main.go
      const mainPath = join(goDir, 'main.go')
      const original = readFileSync(mainPath, 'utf-8')
      writeFileSync(mainPath, `// edited comment\n\n${original}`)

      await indexWorkspace(incrementalStore, goAdapter, goDir)

      const cleanStore = new InMemoryGraphStore(goDir)
      await cleanStore.open()
      await indexWorkspace(cleanStore, goAdapter, goDir)

      expect(await semanticState(incrementalStore)).toEqual(await semanticState(cleanStore))
      await incrementalStore.close()
      await cleanStore.close()
    })
  })

  describe('Scenario: Added files still re-extract files with possibly unresolved imports', () => {
    it('Given a non-code file addition, when incrementally indexed, then addition-fallback does not re-extract existing code files', async () => {
      const projectDir = join(tempDir, 'mixed-project')
      const files: Record<string, string> = {
        'package.json': JSON.stringify({ name: 'mixed-app' }),
        'src/index.ts': 'export const version = "1.0.0"\n',
      }
      writeFiles(projectDir, files)

      const store = new InMemoryGraphStore(projectDir)
      await store.open()
      const tsAdapter = new TypeScriptLanguageAdapter()

      // Initial run indexes package.json and src/index.ts
      const initialResult = await indexWorkspace(store, tsAdapter, projectDir)
      expect(initialResult.filesIndexed).toBe(2)

      // Add ONLY a non-code file (markdown document)
      writeFiles(projectDir, {
        'docs/readme.md': '# Project Documentation\n\nThis is a documentation file.\n',
      })

      // Incremental run
      const incrementalResult = await indexWorkspace(store, tsAdapter, projectDir)

      // The new markdown document is indexed
      expect(incrementalResult.documentsIndexed).toBe(1)
      // BUT existing code file src/index.ts was NOT re-extracted because no code files were added!
      expect(incrementalResult.filesIndexed).toBe(1) // Only the 1 newly discovered document file
      await store.close()
    })
  })
})
