import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { IndexCodeGraph } from '../../src/application/use-cases/index-code-graph.js'
import { emptyResolutionManifestSource } from '../../src/application/ports/resolution-manifest-source.js'
import { emptyRepositoryRootSource } from '../../src/application/ports/repository-root-source.js'
import { NodeWorkspaceAccessibilitySource } from '../../src/infrastructure/fs/node-workspace-accessibility-source.js'
import { AdapterRegistry } from '../../src/infrastructure/tree-sitter/adapter-registry.js'
import { GoLanguageAdapter } from '../../src/infrastructure/tree-sitter/go-language-adapter.js'
import { PythonLanguageAdapter } from '../../src/infrastructure/tree-sitter/python-language-adapter.js'
import { type LanguageAdapter } from '../../src/domain/value-objects/language-adapter.js'
import { type IndexOptions } from '../../src/domain/value-objects/index-options.js'
import { InMemoryGraphStore } from '../helpers/in-memory-graph-store.js'
import { makeMockSpecRepository } from '../helpers/make-mock-spec-repository.js'

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

describe('Go selectors and Python re-exports', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-qualified-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  /**
   * Indexes two workspaces with one adapter.
   * @param adapter - Adapter under test.
   * @param provider - Workspace that publishes the package.
   * @param consumer - Workspace that imports it.
   * @returns Persisted relations and reference facts.
   */
  async function index(adapter: LanguageAdapter, provider: string, consumer: string) {
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
    const indexer = new IndexCodeGraph(
      store,
      registry,
      emptyResolutionManifestSource,
      emptyRepositoryRootSource,
      new NodeWorkspaceAccessibilitySource(),
    )
    await indexer.execute({
      projectRoot: tempDir,
      vcsRoot: tempDir,
      workspaces: [workspace(provider), workspace(consumer)],
      graphConfig: { includePaths: [], testPaths: ['**/tests/**'], workspaces: new Map() },
    })
    return { relations: store.allRelationsForTest(), facts: await store.getAllReferenceFacts() }
  }

  it('given a Go package exporting User and NewUser, when app uses them, then CALLS, CONSTRUCTS and USES_TYPE are persisted', async () => {
    write(join(tempDir, 'auth'), {
      'go.mod': 'module github.com/acme/auth\n\ngo 1.22\n',
      'user.go': 'package auth\n\ntype User struct{}\n\nfunc NewUser() *User { return &User{} }\n',
    })
    write(join(tempDir, 'app'), {
      'go.mod': 'module example.com/app\n\ngo 1.22\n',
      'main.go':
        'package main\n\nimport "github.com/acme/auth"\n\nfunc main() {\n\tauth.NewUser()\n\t_ = auth.User{}\n\tvar current auth.User\n\t_ = current\n}\n',
    })

    const { relations } = await index(new GoLanguageAdapter(), 'auth', 'app')
    const crossing = relations.filter(
      (relation) =>
        relation.source.startsWith('app:main.go:') && relation.target.startsWith('auth:'),
    )
    const targetOf = (type: string): string | undefined =>
      crossing.find((relation) => relation.type === type)?.target

    expect(targetOf('CALLS')).toContain('NewUser')
    expect(targetOf('CONSTRUCTS')).toContain('User')
    expect(targetOf('USES_TYPE')).toContain('User')
    expect(crossing.filter((relation) => relation.type === 'USES_TYPE').length).toBeGreaterThan(0)
  })

  it('given a Python package that re-exports User, when app imports it, then the import resolves', async () => {
    write(join(tempDir, 'auth'), {
      'pyproject.toml': '[project]\nname = "acme-auth"\n',
      'src/acme_auth/__init__.py': 'from .models import User\n',
      'src/acme_auth/models.py': 'class User:\n    pass\n',
    })
    write(join(tempDir, 'app'), {
      'pyproject.toml': '[project]\nname = "acme-app"\n',
      'src/app/main.py': 'from acme_auth import User\n',
    })

    const { facts } = await index(new PythonLanguageAdapter(), 'auth', 'app')
    const binding = facts.localBindings.find(
      (item) => item.filePath === 'app:src/app/main.py' && item.localName === 'User',
    )

    expect(binding?.targetId).toContain('auth')
    expect(facts.steps.some((step) => step.kind === 'import:package')).toBe(true)
  })
})
