import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { IndexCodeGraph } from '../../../src/application/use-cases/index-code-graph.js'
import { ResolveSymbolReference } from '../../../src/application/use-cases/resolve-symbol-reference.js'
import { analyzeFileImpact } from '../../../src/domain/services/analyze-file-impact.js'
import { NodeResolutionManifestSource } from '../../../src/infrastructure/fs/node-resolution-manifest-source.js'
import { NodeWorkspaceAccessibilitySource } from '../../../src/infrastructure/fs/node-workspace-accessibility-source.js'
import { emptyRepositoryRootSource } from '../../../src/application/ports/repository-root-source.js'
import { AdapterRegistry } from '../../../src/infrastructure/tree-sitter/adapter-registry.js'
import { TypeScriptLanguageAdapter } from '../../../src/infrastructure/tree-sitter/typescript-language-adapter.js'
import { PythonLanguageAdapter } from '../../../src/infrastructure/tree-sitter/python-language-adapter.js'
import { GoLanguageAdapter } from '../../../src/infrastructure/tree-sitter/go-language-adapter.js'
import { PhpLanguageAdapter } from '../../../src/infrastructure/tree-sitter/php-language-adapter.js'
import {
  type IndexOptions,
  type ProjectWorkspace,
} from '../../../src/domain/value-objects/index-options.js'
import { type ResolutionHealth } from '../../../src/domain/value-objects/symbol-reference.js'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'
import { makeMockSpecRepository } from '../../helpers/make-mock-spec-repository.js'

/**
 * Writes files under a root directory, ensuring parent directories exist.
 * @param root - Base directory.
 * @param files - Map of relative path to file content.
 */
function writeFiles(root: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    const target = join(root, relative)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
}

describe('Package resolution end-to-end integration', () => {
  let tempDir: string
  let graphDir: string
  let appDir: string

  beforeEach(() => {
    tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'specd-pkg-res-e2e-')))
    graphDir = join(tempDir, 'graph')
    appDir = join(tempDir, 'app')
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  /**
   * Builds index options for graph and app workspaces.
   * @returns Configured IndexOptions.
   */
  function makeOptions(): IndexOptions {
    const workspace = (name: string, codeRoot: string): ProjectWorkspace => ({
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
      workspaces: [workspace('graph', graphDir), workspace('app', appDir)],
      graphConfig: { includePaths: [], testPaths: ['test/**'], workspaces: new Map() },
    }
  }

  /**
   * Helper to create an indexer with TypeScript adapter.
   * @param store - In-memory graph store.
   * @returns IndexCodeGraph instance.
   */
  function makeIndexer(store: InMemoryGraphStore): IndexCodeGraph {
    const registry = new AdapterRegistry()
    registry.register(new TypeScriptLanguageAdapter())
    return new IndexCodeGraph(
      store,
      registry,
      new NodeResolutionManifestSource(),
      emptyRepositoryRootSource,
      new NodeWorkspaceAccessibilitySource(),
    )
  }

  describe('TypeScript package import forms', () => {
    it('Given side-effect, dynamic, and require package imports, when indexed, then file-level IMPORTS relations are created', async () => {
      writeFiles(graphDir, {
        'package.json': JSON.stringify({
          name: '@fixture/graph',
          exports: { '.': './dist/index.js' },
        }),
        'src/index.ts': 'export const graphValue = 42\n',
      })
      writeFiles(appDir, {
        'package.json': JSON.stringify({ name: '@fixture/app' }),
        'src/side-effect.ts': "import '@fixture/graph'\n",
        'src/dynamic.ts':
          "export async function load() { const g = await import('@fixture/graph'); return g; }\n",
        'src/required.ts': "const g = require('@fixture/graph')\nexport const x = g.graphValue\n",
      })

      const store = new InMemoryGraphStore(tempDir)
      await store.open()
      const indexer = makeIndexer(store)
      const result = await indexer.execute(makeOptions())

      expect(result.errors).toEqual([])

      const relations = store.allRelationsForTest().filter((r) => r.type === 'IMPORTS')
      expect(
        relations.some(
          (r) => r.source === 'app:src/side-effect.ts' && r.target === 'graph:src/index.ts',
        ),
      ).toBe(true)
      expect(
        relations.some(
          (r) => r.source === 'app:src/dynamic.ts' && r.target === 'graph:src/index.ts',
        ),
      ).toBe(true)
      expect(
        relations.some(
          (r) => r.source === 'app:src/required.ts' && r.target === 'graph:src/index.ts',
        ),
      ).toBe(true)
      await store.close()
    })

    it('Given a package re-export, when indexed, then a file dependency exists on the entry file', async () => {
      writeFiles(graphDir, {
        'package.json': JSON.stringify({
          name: '@fixture/graph',
          exports: { '.': './dist/index.js' },
        }),
        'src/index.ts': 'export const graphValue = 42\n',
      })
      writeFiles(appDir, {
        'package.json': JSON.stringify({ name: '@fixture/app' }),
        'src/re-export.ts': "export { graphValue } from '@fixture/graph'\n",
      })

      const store = new InMemoryGraphStore(tempDir)
      await store.open()
      const indexer = makeIndexer(store)
      const result = await indexer.execute(makeOptions())

      expect(result.errors).toEqual([])
      const relations = store.allRelationsForTest().filter((r) => r.type === 'IMPORTS')
      expect(
        relations.some(
          (r) => r.source === 'app:src/re-export.ts' && r.target === 'graph:src/index.ts',
        ),
      ).toBe(true)
      await store.close()
    })

    it('Given a default import with zero default exports, when indexed, then file dependency exists but no local binding is bound', async () => {
      writeFiles(graphDir, {
        'package.json': JSON.stringify({
          name: '@fixture/graph',
          exports: { '.': './dist/index.js' },
        }),
        'src/index.ts': 'export const notDefault = 1\n',
      })
      writeFiles(appDir, {
        'package.json': JSON.stringify({ name: '@fixture/app' }),
        'src/use.ts': "import DefaultItem from '@fixture/graph'\nexport const v = DefaultItem\n",
      })

      const store = new InMemoryGraphStore(tempDir)
      await store.open()
      const indexer = makeIndexer(store)
      const result = await indexer.execute(makeOptions())

      expect(result.errors).toEqual([])
      // File dependency exists
      const relations = store.allRelationsForTest().filter((r) => r.type === 'IMPORTS')
      expect(
        relations.some((r) => r.source === 'app:src/use.ts' && r.target === 'graph:src/index.ts'),
      ).toBe(true)

      // But local binding DefaultItem has no targetId
      const facts = await store.getAllReferenceFacts()
      const defaultBinding = facts.localBindings.find((b) => b.localName === 'DefaultItem')
      expect(defaultBinding?.targetId).toBeUndefined()
      await store.close()
    })

    it('Given incremental run where package.json exports is edited, then importers are re-resolved', async () => {
      writeFiles(graphDir, {
        'package.json': JSON.stringify({
          name: '@fixture/graph',
          exports: { '.': './dist/v1.js' },
        }),
        'src/v1.ts': 'export const exportedSymbol = 1\n',
        'src/v2.ts': 'export const exportedSymbol = 2\n',
      })
      writeFiles(appDir, {
        'package.json': JSON.stringify({ name: '@fixture/app' }),
        'src/use.ts':
          "import { exportedSymbol } from '@fixture/graph'\nexport const myVal = exportedSymbol\n",
      })

      const store = new InMemoryGraphStore(tempDir)
      await store.open()
      const indexer = makeIndexer(store)

      // Initial run: imports resolve to src/v1.ts
      await indexer.execute(makeOptions())
      let relations = store.allRelationsForTest().filter((r) => r.type === 'IMPORTS')
      expect(
        relations.some((r) => r.source === 'app:src/use.ts' && r.target === 'graph:src/v1.ts'),
      ).toBe(true)

      // Edit package.json exports to point to v2
      writeFiles(graphDir, {
        'package.json': JSON.stringify({
          name: '@fixture/graph',
          exports: { '.': './dist/v2.js' },
        }),
      })

      // Incremental run
      await indexer.execute(makeOptions())
      relations = store.allRelationsForTest().filter((r) => r.type === 'IMPORTS')
      expect(
        relations.some((r) => r.source === 'app:src/use.ts' && r.target === 'graph:src/v2.ts'),
      ).toBe(true)
      expect(
        relations.some((r) => r.source === 'app:src/use.ts' && r.target === 'graph:src/v1.ts'),
      ).toBe(false)
      await store.close()
    })
  })

  describe('Cross-workspace package resolution and impact across four languages', () => {
    it('Resolver follows import:package steps with ordered paths, positive anchored-file filter, and cross-workspace impact for the four languages', async () => {
      // 1. TypeScript workspaces
      const tsPkgDir = join(tempDir, 'ts-pkg')
      const tsAppDir = join(tempDir, 'ts-app')
      writeFiles(tsPkgDir, {
        'package.json': JSON.stringify({
          name: '@fixture/ts-pkg',
          exports: { '.': './dist/index.js' },
        }),
        'src/index.ts': 'export const tsValue = 100\n',
      })
      writeFiles(tsAppDir, {
        'package.json': JSON.stringify({ name: '@fixture/ts-app' }),
        'src/main.ts': "import { tsValue } from '@fixture/ts-pkg'\nexport const res = tsValue\n",
        'src/other.ts': 'export const unrelated = 1\n',
      })

      // 2. Python workspaces
      const pyPkgDir = join(tempDir, 'py-pkg')
      const pyAppDir = join(tempDir, 'py-app')
      writeFiles(pyPkgDir, {
        'pyproject.toml': '[project]\nname = "py-pkg"\n',
        'src/py_pkg/__init__.py': 'from .models import PyModel\n',
        'src/py_pkg/models.py': 'class PyModel:\n    pass\n',
      })
      writeFiles(pyAppDir, {
        'pyproject.toml': '[project]\nname = "py-app"\n',
        'src/py_app/main.py': 'from py_pkg.models import PyModel\n',
        'src/py_app/other.py': 'x = 1\n',
      })

      // 3. Go workspaces
      const goPkgDir = join(tempDir, 'go-pkg')
      const goAppDir = join(tempDir, 'go-app')
      writeFiles(goPkgDir, {
        'go.mod': 'module "example.com/gopkg"\n',
        'pkg/math.go': 'package math\n\nfunc Add(a, b int) int {\n    return a + b\n}\n',
      })
      writeFiles(goAppDir, {
        'go.mod': 'module "example.com/goapp"\n',
        'main.go':
          'package main\n\nimport "example.com/gopkg/pkg"\n\nfunc Run() int {\n    return math.Add(1, 2)\n}\n',
        'other.go': 'package main\n\nfunc Other() {}\n',
      })

      // 4. PHP workspaces
      const phpPkgDir = join(tempDir, 'php-pkg')
      const phpAppDir = join(tempDir, 'php-app')
      writeFiles(phpPkgDir, {
        'composer.json': JSON.stringify({
          name: 'fixture/php-pkg',
          autoload: { 'psr-4': { 'Fixture\\PhpPkg\\': 'src/' } },
        }),
        'src/Greeter.php': '<?php\nnamespace Fixture\\PhpPkg;\nclass Greeter {}\n',
      })
      writeFiles(phpAppDir, {
        'composer.json': JSON.stringify({
          name: 'fixture/php-app',
          autoload: { 'psr-4': { 'Fixture\\PhpApp\\': 'src/' } },
        }),
        'src/Main.php':
          '<?php\nnamespace Fixture\\PhpApp;\nuse Fixture\\PhpPkg\\Greeter;\nclass Main { public function run(Greeter $g) {} }\n',
        'src/Other.php': '<?php\nnamespace Fixture\\PhpApp;\nclass Other {}\n',
      })

      const store = new InMemoryGraphStore(tempDir)
      await store.open()

      const registry = new AdapterRegistry()
      registry.register(new TypeScriptLanguageAdapter())
      registry.register(new PythonLanguageAdapter())
      registry.register(new GoLanguageAdapter())
      registry.register(new PhpLanguageAdapter())

      const workspace = (name: string, codeRoot: string): ProjectWorkspace => ({
        name,
        prefix: null,
        codeRoot,
        specRepo: makeMockSpecRepository(),
        ownership: 'owned',
        isExternal: false,
      })

      const options: IndexOptions = {
        projectRoot: tempDir,
        vcsRoot: tempDir,
        workspaces: [
          workspace('ts-pkg', tsPkgDir),
          workspace('ts-app', tsAppDir),
          workspace('py-pkg', pyPkgDir),
          workspace('py-app', pyAppDir),
          workspace('go-pkg', goPkgDir),
          workspace('go-app', goAppDir),
          workspace('php-pkg', phpPkgDir),
          workspace('php-app', phpAppDir),
        ],
        graphConfig: { includePaths: [], testPaths: ['test/**'], workspaces: new Map() },
      }

      const indexer = new IndexCodeGraph(
        store,
        registry,
        new NodeResolutionManifestSource(),
        emptyRepositoryRootSource,
        new NodeWorkspaceAccessibilitySource(),
      )
      const result = await indexer.execute(options)
      expect(result.errors).toEqual([])

      const facts = await store.getAllReferenceFacts()
      // import:package steps exist
      const pkgSteps = facts.steps.filter((s) => s.kind === 'import:package')
      expect(pkgSteps.length).toBeGreaterThan(0)

      // Exact local binding targets across languages
      const tsBinding = facts.localBindings.find(
        (b) => b.filePath === 'ts-app:src/main.ts' && b.localName === 'tsValue',
      )
      expect(tsBinding).toBeDefined()
      expect(tsBinding?.targetId).toContain('ts-pkg')

      const pyBinding = facts.localBindings.find(
        (b) => b.filePath === 'py-app:src/py_app/main.py' && b.localName === 'PyModel',
      )
      expect(pyBinding).toBeDefined()
      expect(pyBinding?.targetId).toContain('py-pkg')

      // All 4 languages have IMPORTS relations in persisted graph
      const allImports = store.allRelationsForTest().filter((r) => r.type === 'IMPORTS')
      expect(
        allImports.some(
          (r) => r.source === 'ts-app:src/main.ts' && r.target === 'ts-pkg:src/index.ts',
        ),
      ).toBe(true)
      expect(
        allImports.some(
          (r) =>
            r.source === 'py-app:src/py_app/main.py' && r.target === 'py-pkg:src/py_pkg/models.py',
        ),
      ).toBe(true)
      expect(
        allImports.some((r) => r.source === 'go-app:main.go' && r.target === 'go-pkg:pkg/math.go'),
      ).toBe(true)
      expect(
        allImports.some(
          (r) => r.source === 'php-app:src/Main.php' && r.target === 'php-pkg:src/Greeter.php',
        ),
      ).toBe(true)

      const freshHealth: ResolutionHealth = { fresh: true, complete: true, reasonCodes: [] }
      const resolver = new ResolveSymbolReference(
        store,
        async () => freshHealth,
        undefined,
        registry,
      )

      // TypeScript resolution and impact
      const tsResolved = await resolver.execute({
        workspace: 'ts-app',
        requested: 'tsValue',
        filePath: 'ts-app:src/main.ts',
      })
      expect(tsResolved.status).toBe('resolved')
      expect(tsResolved.target?.id).toContain('ts-pkg')

      const tsUnrelated = await resolver.execute({
        workspace: 'ts-app',
        requested: 'tsValue',
        filePath: 'ts-app:src/other.ts',
      })
      expect(tsUnrelated.status).not.toBe('resolved')

      const tsImpact = await analyzeFileImpact(store, 'ts-pkg:src/index.ts', 'upstream')
      expect(tsImpact.affectedFiles).toContain('ts-app:src/main.ts')

      // Python resolution and impact
      const pyResolved = await resolver.execute({
        workspace: 'py-app',
        requested: 'PyModel',
        filePath: 'py-app:src/py_app/main.py',
      })
      expect(pyResolved.status).toBe('resolved')
      expect(pyResolved.target?.id).toContain('py-pkg')

      const pyUnrelated = await resolver.execute({
        workspace: 'py-app',
        requested: 'PyModel',
        filePath: 'py-app:src/py_app/other.py',
      })
      expect(pyUnrelated.status).not.toBe('resolved')

      const pyImpact = await analyzeFileImpact(store, 'py-pkg:src/py_pkg/models.py', 'upstream')
      expect(pyImpact.affectedFiles).toContain('py-app:src/py_app/main.py')

      // Go impact and cross-workspace import relation
      const goRelations = store.allRelationsForTest().filter((r) => r.type === 'IMPORTS')
      expect(
        goRelations.some((r) => r.source === 'go-app:main.go' && r.target === 'go-pkg:pkg/math.go'),
      ).toBe(true)

      const goImpact = await analyzeFileImpact(store, 'go-pkg:pkg/math.go', 'upstream')
      expect(goImpact.affectedFiles).toContain('go-app:main.go')

      // PHP impact and cross-workspace import relation
      const phpRelations = store.allRelationsForTest().filter((r) => r.type === 'IMPORTS')
      expect(
        phpRelations.some(
          (r) => r.source === 'php-app:src/Main.php' && r.target === 'php-pkg:src/Greeter.php',
        ),
      ).toBe(true)

      const phpImpact = await analyzeFileImpact(store, 'php-pkg:src/Greeter.php', 'upstream')
      expect(phpImpact.affectedFiles).toContain('php-app:src/Main.php')

      await store.close()
    })

    it('Scenario: A test importer resolves to a test helper', async () => {
      // GIVEN a helper symbol declared in a test file
      const appRoot = join(tempDir, 'php-test-app')
      writeFiles(appRoot, {
        'composer.json': JSON.stringify({
          name: 'fixture/php-test-app',
          autoload: { 'psr-4': { 'App\\': 'src/' } },
          'autoload-dev': { 'psr-4': { 'App\\Tests\\': 'tests/' } },
        }),
        'tests/Helpers/TestHelper.php':
          '<?php\nnamespace App\\Tests\\Helpers;\nclass TestHelper {}\n',
        'tests/Unit/MyTest.php':
          '<?php\nnamespace App\\Tests\\Unit;\nuse App\\Tests\\Helpers\\TestHelper;\nclass MyTest extends TestHelper { public function test(): void {} }\n',
        'src/Service.php':
          '<?php\nnamespace App;\nuse App\\Tests\\Helpers\\TestHelper;\nclass Service extends TestHelper { public function run(): void {} }\n',
      })

      const store = new InMemoryGraphStore(tempDir)
      await store.open()

      const registry = new AdapterRegistry()
      registry.register(new PhpLanguageAdapter())

      const workspace: ProjectWorkspace = {
        name: 'app',
        prefix: null,
        codeRoot: appRoot,
        specRepo: makeMockSpecRepository(),
        ownership: 'owned',
        isExternal: false,
      }

      const options: IndexOptions = {
        projectRoot: tempDir,
        vcsRoot: tempDir,
        workspaces: [workspace],
        graphConfig: { includePaths: [], testPaths: ['tests/**'], workspaces: new Map() },
      }

      const indexer = new IndexCodeGraph(
        store,
        registry,
        new NodeResolutionManifestSource(),
        emptyRepositoryRootSource,
        new NodeWorkspaceAccessibilitySource(),
      )
      const result = await indexer.execute(options)
      expect(result.errors).toEqual([])

      const relations = store.allRelationsForTest().filter((r) => r.type === 'IMPORTS')
      // Test file imports test helper
      expect(
        relations.some(
          (r) =>
            r.source === 'app:tests/Unit/MyTest.php' &&
            r.target === 'app:tests/Helpers/TestHelper.php',
        ),
      ).toBe(true)

      // Production file does not import test helper
      expect(
        relations.some(
          (r) =>
            r.source === 'app:src/Service.php' && r.target === 'app:tests/Helpers/TestHelper.php',
        ),
      ).toBe(false)

      const allRelations = store.allRelationsForTest()
      const extendsRelations = allRelations.filter((r) => r.type === 'EXTENDS')
      const testHelperSymbols = await store.findSymbols({
        filePath: 'app:tests/Helpers/TestHelper.php',
      })
      const helperClass = testHelperSymbols.find((s) => s.name === 'TestHelper')
      expect(helperClass).toBeDefined()

      // Symbol-level EXTENDS relation from test class to test helper symbol
      expect(
        extendsRelations.some((r) => r.source.includes('MyTest') && r.target === helperClass!.id),
      ).toBe(true)

      // Production class does NOT have EXTENDS relation to test helper symbol
      expect(
        extendsRelations.some((r) => r.source.includes('Service') && r.target === helperClass!.id),
      ).toBe(false)

      // WHEN graph impact on the helper is computed
      // THEN it lists the importing test as a dependent
      const impact = await analyzeFileImpact(
        store,
        'app:tests/Helpers/TestHelper.php',
        'upstream',
        3,
        undefined,
        { includeTests: true },
      )
      expect(impact.affectedFiles).toContain('app:tests/Unit/MyTest.php')
      expect(impact.affectedFiles).not.toContain('app:src/Service.php')

      await store.close()
    })
  })
})
