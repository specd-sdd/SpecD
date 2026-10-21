import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { IndexCodeGraph } from '../../../src/application/use-cases/index-code-graph.js'
import { emptyResolutionManifestSource } from '../../../src/application/ports/resolution-manifest-source.js'
import { AdapterRegistry } from '../../../src/infrastructure/tree-sitter/adapter-registry.js'
import { PythonLanguageAdapter } from '../../../src/infrastructure/tree-sitter/python-language-adapter.js'
import { GoLanguageAdapter } from '../../../src/infrastructure/tree-sitter/go-language-adapter.js'
import { PhpLanguageAdapter } from '../../../src/infrastructure/tree-sitter/php-language-adapter.js'
import { type LanguageAdapter } from '../../../src/domain/value-objects/language-adapter.js'
import { type IndexOptions } from '../../../src/domain/value-objects/index-options.js'
import { type Relation } from '../../../src/domain/value-objects/relation.js'
import { type IndexResult } from '../../../src/domain/value-objects/index-result.js'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'
import { makeMockSpecRepository } from '../../helpers/make-mock-spec-repository.js'

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

describe('IndexCodeGraph package imports by language', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-package-imports-languages-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  /**
   * Indexes two workspaces with one adapter.
   * @param adapter - Adapter under test.
   * @param provider - Workspace name of the package being imported.
   * @param consumer - Workspace name of the importing code.
   * @returns The store and the relations after indexing.
   */
  async function index(
    adapter: LanguageAdapter,
    provider: string,
    consumer: string,
  ): Promise<{ store: InMemoryGraphStore; relations: Relation[]; result: IndexResult }> {
    const workspace = (name: string): IndexOptions['workspaces'][number] => ({
      name,
      prefix: null,
      codeRoot: join(tempDir, name),
      specRepo: makeMockSpecRepository(),
      ownership: 'owned',
      isExternal: false,
    })
    const store = new InMemoryGraphStore(tempDir)
    await store.open()
    const registry = new AdapterRegistry()
    registry.register(adapter)
    const indexer = new IndexCodeGraph(store, registry, emptyResolutionManifestSource)
    const result = await indexer.execute({
      projectRoot: tempDir,
      vcsRoot: tempDir,
      workspaces: [workspace(provider), workspace(consumer)],
      graphConfig: { includePaths: [], testPaths: ['tests/**'], workspaces: new Map() },
    })
    return { store, relations: store.allRelationsForTest(), result }
  }

  it('Given a Python package in another workspace, when a name is imported from its module, then the binding, step and IMPORTS cross the workspace and a re-imported alias stays unresolved', async () => {
    write(join(tempDir, 'auth'), {
      'pyproject.toml': '[project]\nname = "acme-auth"\n',
      'src/acme_auth/__init__.py': 'from .models import User\n',
      'src/acme_auth/models.py': 'class User:\n    pass\n',
    })
    write(join(tempDir, 'app'), {
      'pyproject.toml': '[project]\nname = "acme-app"\n',
      'src/app/main.py':
        'from acme_auth.models import User\nfrom acme_auth import User as ViaInit\n\ndef f(user: User) -> None:\n    return None\n',
    })

    const { store, relations } = await index(new PythonLanguageAdapter(), 'auth', 'app')

    const facts = await store.getAllReferenceFacts()
    const bound = facts.localBindings.find(
      (binding) => binding.filePath === 'app:src/app/main.py' && binding.localName === 'User',
    )
    const viaInit = facts.localBindings.find(
      (binding) => binding.filePath === 'app:src/app/main.py' && binding.localName === 'ViaInit',
    )
    expect(bound?.targetId).toContain('auth')
    expect(viaInit?.targetId).toBeUndefined()
    expect(facts.steps.some((step) => step.kind === 'import:package')).toBe(true)
    expect(
      relations.some(
        (r) =>
          r.type === 'IMPORTS' &&
          r.source === 'app:src/app/main.py' &&
          r.target === 'auth:src/acme_auth/models.py',
      ),
    ).toBe(true)
  })

  it('Given a submodule import and a name that exists only elsewhere in the package, when indexed, then the submodule is a file dependency without a binding and the name stays unresolved', async () => {
    write(join(tempDir, 'auth'), {
      'pyproject.toml': '[project]\nname = "acme-auth"\n',
      'src/acme_auth/__init__.py': '',
      'src/acme_auth/models.py': 'class User:\n    pass\n',
      'src/acme_auth/util.py': 'class Helper:\n    pass\n',
    })
    write(join(tempDir, 'app'), {
      'pyproject.toml': '[project]\nname = "acme-app"\n',
      'src/app/main.py': 'from acme_auth import models\nfrom acme_auth import Helper\n',
    })

    const { store, relations } = await index(new PythonLanguageAdapter(), 'auth', 'app')

    const facts = await store.getAllReferenceFacts()
    const target = (name: string): string | undefined =>
      facts.localBindings.find(
        (binding) => binding.filePath === 'app:src/app/main.py' && binding.localName === name,
      )?.targetId
    expect(target('models')).toBeUndefined()
    expect(target('Helper')).toBeUndefined()
    const imports = relations
      .filter((r) => r.type === 'IMPORTS' && r.source === 'app:src/app/main.py')
      .map((r) => r.target)
    expect(imports).toContain('auth:src/acme_auth/models.py')
    expect(imports).not.toContain('auth:src/acme_auth/util.py')
  })

  it('Given a Go module in another workspace, when its package is imported, then only the file-level dependency on the non-test package files exists', async () => {
    write(join(tempDir, 'auth'), {
      'go.mod': 'module github.com/acme/auth\n\ngo 1.22\n',
      'models/user.go': 'package models\n\ntype User struct{}\n',
      'models/user_test.go': 'package models\n',
    })
    write(join(tempDir, 'app'), {
      'go.mod': 'module example.com/app\n\ngo 1.22\n',
      'main.go':
        'package main\n\nimport "github.com/acme/auth/models"\n\nfunc main() {\n\t_ = models.User{}\n}\n',
    })

    const { relations } = await index(new GoLanguageAdapter(), 'auth', 'app')

    const imports = relations
      .filter((r) => r.type === 'IMPORTS' && r.source === 'app:main.go')
      .map((r) => r.target)
    expect(imports).toEqual(['auth:models/user.go'])
    expect(
      relations.some(
        (r) =>
          r.source.startsWith('app:main.go:') &&
          r.target.startsWith('auth:') &&
          r.type !== 'IMPORTS',
      ),
    ).toBe(false)
  })

  it('Given a PHP class in another workspace, when it is imported by its qualified name, then the type use crosses the workspace and a same short name elsewhere is not used', async () => {
    write(join(tempDir, 'billing'), {
      'composer.json': JSON.stringify({
        name: 'acme/billing',
        autoload: { 'psr-4': { 'Acme\\Billing\\': 'src/' } },
      }),
      'src/Invoice.php': '<?php\nnamespace Acme\\Billing;\nclass Invoice {}\n',
    })
    write(join(tempDir, 'app'), {
      'composer.json': JSON.stringify({
        name: 'acme/app',
        autoload: { 'psr-4': { 'App\\': 'src/' } },
      }),
      'src/Invoice.php': '<?php\nnamespace App;\nclass Invoice {}\n',
      'src/Report.php':
        '<?php\nnamespace App;\nuse Acme\\Billing\\Invoice as BillingInvoice;\nclass Report {\n  public function make(BillingInvoice $invoice): void {}\n}\n',
    })

    const { relations } = await index(new PhpLanguageAdapter(), 'billing', 'app')

    expect(
      relations.some(
        (r) =>
          r.type === 'USES_TYPE' &&
          r.source.startsWith('app:src/Report.php:') &&
          r.target.startsWith('billing:src/Invoice.php:'),
      ),
    ).toBe(true)
    expect(
      relations.some(
        (r) =>
          r.type === 'USES_TYPE' &&
          r.source.startsWith('app:src/Report.php:') &&
          r.target.startsWith('app:src/Invoice.php:'),
      ),
    ).toBe(false)
  })

  it('Given a qualified name whose class is not registered under that name, when it is imported, then the PSR-4 class file becomes a file dependency and no step is produced', async () => {
    write(join(tempDir, 'billing'), {
      'composer.json': JSON.stringify({
        name: 'acme/billing',
        autoload: { 'psr-4': { 'Acme\\Billing\\': 'src/' } },
      }),
      // The declared namespace does not match the PSR-4 path, so the exact name is not registered.
      'src/Invoice.php': '<?php\nnamespace Elsewhere;\nclass Invoice {}\n',
    })
    write(join(tempDir, 'app'), {
      'composer.json': JSON.stringify({
        name: 'acme/app',
        autoload: { 'psr-4': { 'App\\': 'src/' } },
      }),
      'src/Report.php': '<?php\nnamespace App;\nuse Acme\\Billing\\Invoice;\nclass Report {}\n',
    })

    const { store, relations } = await index(new PhpLanguageAdapter(), 'billing', 'app')

    expect(
      relations.some(
        (r) =>
          r.type === 'IMPORTS' &&
          r.source === 'app:src/Report.php' &&
          r.target === 'billing:src/Invoice.php',
      ),
    ).toBe(true)
    const facts = await store.getAllReferenceFacts()
    expect(facts.steps.some((step) => step.kind === 'import:package')).toBe(false)
  })

  it('Given a qualified name no workspace maps, when it is imported, then it is an external import and nothing is persisted', async () => {
    write(join(tempDir, 'billing'), {
      'composer.json': JSON.stringify({
        name: 'acme/billing',
        autoload: { 'psr-4': { 'Acme\\Billing\\': 'src/' } },
      }),
      'src/Invoice.php': '<?php\nnamespace Acme\\Billing;\nclass Invoice {}\n',
    })
    write(join(tempDir, 'app'), {
      'composer.json': JSON.stringify({
        name: 'acme/app',
        autoload: { 'psr-4': { 'App\\': 'src/' } },
      }),
      'src/Report.php': '<?php\nnamespace App;\nuse Vendor\\Lib\\Foo;\nclass Report {}\n',
    })

    const { store, relations, result } = await index(new PhpLanguageAdapter(), 'billing', 'app')

    expect(result.importDiagnostics.externalPackageImports).toBeGreaterThanOrEqual(1)
    expect(result.importDiagnostics.byReason['package-unknown']).toBeUndefined()
    expect(relations.some((r) => r.type === 'IMPORTS' && r.source === 'app:src/Report.php')).toBe(
      false,
    )
    expect((await store.getAllReferenceFacts()).steps).toEqual([])
  })

  it('Given a name declared in the package __init__.py, when imported, then it resolves through the entry file', async () => {
    write(join(tempDir, 'auth'), {
      'pyproject.toml': '[project]\nname = "acme-auth"\n',
      'src/acme_auth/__init__.py': 'def make_client():\n    return 1\n',
    })
    write(join(tempDir, 'app'), {
      'pyproject.toml': '[project]\nname = "acme-app"\n',
      'src/app/main.py': 'from acme_auth import make_client\n\nmake_client()\n',
    })

    const { store, relations } = await index(new PythonLanguageAdapter(), 'auth', 'app')

    const facts = await store.getAllReferenceFacts()
    const bound = facts.localBindings.find(
      (binding) =>
        binding.filePath === 'app:src/app/main.py' && binding.localName === 'make_client',
    )
    expect(bound?.targetId).toContain('auth')
    expect(
      relations.some(
        (r) =>
          r.type === 'IMPORTS' &&
          r.source === 'app:src/app/main.py' &&
          r.target === 'auth:src/acme_auth/__init__.py',
      ),
    ).toBe(true)
  })

  it('Given a workspace without a Composer name, when it imports a class of its own PSR-4 map, then the indexed file is a dependency', async () => {
    write(join(tempDir, 'billing'), {
      'composer.json': JSON.stringify({ name: 'acme/billing' }),
      'src/Other.php': '<?php\nnamespace Acme\\Billing;\nclass Other {}\n',
    })
    write(join(tempDir, 'app'), {
      // No `name`, so the workspace has no package identity.
      'composer.json': JSON.stringify({ autoload: { 'psr-4': { 'App\\': 'src/' } } }),
      // The declared namespace does not match the PSR-4 path, so the exact name is not registered.
      'src/Models/User.php': '<?php\nnamespace Elsewhere;\nclass User {}\n',
      'src/Report.php': '<?php\nnamespace App;\nuse App\\Models\\User;\nclass Report {}\n',
    })

    const { relations } = await index(new PhpLanguageAdapter(), 'billing', 'app')

    expect(
      relations.some(
        (r) =>
          r.type === 'IMPORTS' &&
          r.source === 'app:src/Report.php' &&
          r.target === 'app:src/Models/User.php',
      ),
    ).toBe(true)
  })

  it('Given a qualified name declared only in a test file, when it is imported, then it stays unresolved and no relation targets the test file', async () => {
    write(join(tempDir, 'billing'), {
      'composer.json': JSON.stringify({ name: 'acme/billing' }),
      'tests/FakeInvoice.php': '<?php\nnamespace Acme\\Billing;\nclass FakeInvoice {}\n',
    })
    write(join(tempDir, 'app'), {
      'composer.json': JSON.stringify({ name: 'acme/app' }),
      'src/Report.php': '<?php\nnamespace App;\nuse Acme\\Billing\\FakeInvoice;\nclass Report {}\n',
    })

    const { relations } = await index(new PhpLanguageAdapter(), 'billing', 'app')

    expect(
      relations.some((r) => r.source.startsWith('app:') && r.target.startsWith('billing:')),
    ).toBe(false)
  })

  it('Given a Go import of a module no workspace declares, when indexed, then no relation exists and it is counted as external', async () => {
    write(join(tempDir, 'auth'), {
      'go.mod': 'module github.com/acme/auth\n\ngo 1.22\n',
      'models/user.go': 'package models\n\ntype User struct{}\n',
    })
    write(join(tempDir, 'app'), {
      'go.mod': 'module example.com/app\n\ngo 1.22\n',
      'main.go': 'package main\n\nimport "github.com/other/lib"\n\nfunc main() { _ = lib.X }\n',
    })

    const { relations, result } = await index(new GoLanguageAdapter(), 'auth', 'app')

    expect(relations.some((r) => r.source === 'app:main.go' && r.target.startsWith('auth:'))).toBe(
      false,
    )
    expect(result.importDiagnostics.externalPackageImports).toBeGreaterThanOrEqual(1)
  })
})
