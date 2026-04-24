import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createCodeGraphProvider } from '../../../src/composition/create-code-graph-provider.js'
import {
  type IndexOptions,
  type DiscoveredSpec,
} from '../../../src/domain/value-objects/index-options.js'
import { createSpecNode } from '../../../src/domain/value-objects/spec-node.js'
import { type GraphStore } from '../../../src/domain/ports/graph-store.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'

/**
 * Creates a temporary workspace directory with TypeScript source files.
 * @param baseDir - Parent directory for the workspace.
 * @param name - Workspace directory name.
 * @param files - Map of relative path to file content.
 * @returns Absolute path to the workspace codeRoot.
 */
function createWorkspace(baseDir: string, name: string, files: Record<string, string>): string {
  const wsDir = join(baseDir, name)
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(wsDir, relPath)
    mkdirSync(join(fullPath, '..'), { recursive: true })
    writeFileSync(fullPath, content)
  }
  return wsDir
}

describe('Workspace indexing', () => {
  let tempDir: string
  let provider: ReturnType<typeof createCodeGraphProvider>

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ws-indexing-'))
  })

  afterEach(async () => {
    try {
      await provider?.close()
    } catch {
      /* ignore */
    }
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('indexes multiple workspaces with prefixed paths', async () => {
    const coreRoot = createWorkspace(tempDir, 'core', {
      'src/index.ts': 'export function coreMain() {}',
    })
    const cliRoot = createWorkspace(tempDir, 'cli', {
      'src/index.ts': 'export function cliMain() {}',
    })

    provider = createCodeGraphProvider({ storagePath: tempDir })
    await provider.open()

    const result = await provider.index({
      workspaces: [
        { name: 'core', codeRoot: coreRoot, specs: async () => [] },
        { name: 'cli', codeRoot: cliRoot, specs: async () => [] },
      ],
      projectRoot: tempDir,
    })

    expect(result.filesIndexed).toBe(2)
    expect(result.filesDiscovered).toBe(2)
    expect(result.errors).toHaveLength(0)

    // Both files discoverable by path with workspace prefix
    const coreFile = await provider.getFile('core:src/index.ts')
    const cliFile = await provider.getFile('cli:src/index.ts')
    expect(coreFile).toBeDefined()
    expect(coreFile!.workspace).toBe('core')
    expect(cliFile).toBeDefined()
    expect(cliFile!.workspace).toBe('cli')
  })

  it('symbol IDs include workspace-prefixed path', async () => {
    const coreRoot = createWorkspace(tempDir, 'core', {
      'src/utils.ts': 'export function hash() {}',
    })

    provider = createCodeGraphProvider({ storagePath: tempDir })
    await provider.open()

    await provider.index({
      workspaces: [{ name: 'core', codeRoot: coreRoot, specs: async () => [] }],
      projectRoot: tempDir,
    })

    const symbols = await provider.findSymbols({ name: 'hash' })
    expect(symbols).toHaveLength(1)
    expect(symbols[0]!.id).toBe('core:src/utils.ts:function:hash:1:7')
    expect(symbols[0]!.filePath).toBe('core:src/utils.ts')
  })

  it('produces per-workspace result breakdown', async () => {
    const coreRoot = createWorkspace(tempDir, 'core', {
      'src/a.ts': 'export const a = 1',
      'src/b.ts': 'export const b = 2',
      'src/c.ts': 'export const c = 3',
    })
    const cliRoot = createWorkspace(tempDir, 'cli', {
      'src/x.ts': 'export const x = 1',
    })

    provider = createCodeGraphProvider({ storagePath: tempDir })
    await provider.open()

    const result = await provider.index({
      workspaces: [
        { name: 'core', codeRoot: coreRoot, specs: async () => [] },
        { name: 'cli', codeRoot: cliRoot, specs: async () => [] },
      ],
      projectRoot: tempDir,
    })

    expect(result.workspaces).toHaveLength(2)

    const coreBreakdown = result.workspaces.find((w) => w.name === 'core')!
    const cliBreakdown = result.workspaces.find((w) => w.name === 'cli')!

    expect(coreBreakdown.filesDiscovered).toBe(3)
    expect(coreBreakdown.filesIndexed).toBe(3)
    expect(cliBreakdown.filesDiscovered).toBe(1)
    expect(cliBreakdown.filesIndexed).toBe(1)

    expect(result.filesDiscovered).toBe(
      coreBreakdown.filesDiscovered + cliBreakdown.filesDiscovered,
    )
  })

  it('incremental indexing skips unchanged files', async () => {
    const coreRoot = createWorkspace(tempDir, 'core', {
      'src/index.ts': 'export function main() {}',
    })

    provider = createCodeGraphProvider({ storagePath: tempDir })
    await provider.open()

    const opts: IndexOptions = {
      workspaces: [{ name: 'core', codeRoot: coreRoot, specs: async () => [] }],
      projectRoot: tempDir,
    }

    const first = await provider.index(opts)
    expect(first.filesIndexed).toBe(1)

    const second = await provider.index(opts)
    expect(second.filesSkipped).toBe(1)
    expect(second.filesIndexed).toBe(0)
  })

  it('deletion is scoped to indexed workspaces', async () => {
    const coreRoot = createWorkspace(tempDir, 'core', {
      'src/core.ts': 'export const core = 1',
    })
    const cliRoot = createWorkspace(tempDir, 'cli', {
      'src/cli.ts': 'export const cli = 1',
    })

    provider = createCodeGraphProvider({ storagePath: tempDir })
    await provider.open()

    // Index both workspaces
    await provider.index({
      workspaces: [
        { name: 'core', codeRoot: coreRoot, specs: async () => [] },
        { name: 'cli', codeRoot: cliRoot, specs: async () => [] },
      ],
      projectRoot: tempDir,
    })

    const statsBefore = await provider.getStatistics()
    expect(statsBefore.fileCount).toBe(2)

    // Index only core — cli files should NOT be deleted
    const result = await provider.index({
      workspaces: [{ name: 'core', codeRoot: coreRoot, specs: async () => [] }],
      projectRoot: tempDir,
    })

    expect(result.filesRemoved).toBe(0)

    const statsAfter = await provider.getStatistics()
    expect(statsAfter.fileCount).toBe(2)

    // cli file still exists
    const cliFile = await provider.getFile('cli:src/cli.ts')
    expect(cliFile).toBeDefined()
  })

  it('specs callback is used for spec discovery', async () => {
    const coreRoot = createWorkspace(tempDir, 'core', {
      'src/index.ts': 'export function main() {}',
    })

    const mockSpecs: DiscoveredSpec[] = [
      {
        spec: createSpecNode({
          specId: 'core:core/change',
          path: 'change',
          title: 'Change',
          contentHash: 'sha256:test123',
          dependsOn: [],
          workspace: 'core',
        }),
        contentHash: 'sha256:test123',
      },
    ]

    provider = createCodeGraphProvider({ storagePath: tempDir })
    await provider.open()

    const result = await provider.index({
      workspaces: [{ name: 'core', codeRoot: coreRoot, specs: async () => mockSpecs }],
      projectRoot: tempDir,
    })

    expect(result.specsIndexed).toBe(1)

    const spec = await provider.getSpec('core:core/change')
    expect(spec).toBeDefined()
    expect(spec!.workspace).toBe('core')
    expect(spec!.title).toBe('Change')
  })

  it('two workspaces with same spec name produce unique specIds', async () => {
    const coreRoot = createWorkspace(tempDir, 'core', {
      'src/index.ts': 'export const a = 1',
    })
    const cliRoot = createWorkspace(tempDir, 'cli', {
      'src/index.ts': 'export const b = 1',
    })

    const coreSpecs: DiscoveredSpec[] = [
      {
        spec: createSpecNode({
          specId: 'core:core/metadata',
          path: 'metadata',
          title: 'Metadata',
          contentHash: 'sha256:core',
          workspace: 'core',
        }),
        contentHash: 'sha256:core',
      },
    ]
    const cliSpecs: DiscoveredSpec[] = [
      {
        spec: createSpecNode({
          specId: 'cli:cli/metadata',
          path: 'metadata',
          title: 'Metadata',
          contentHash: 'sha256:cli',
          workspace: 'cli',
        }),
        contentHash: 'sha256:cli',
      },
    ]

    provider = createCodeGraphProvider({ storagePath: tempDir })
    await provider.open()

    const result = await provider.index({
      workspaces: [
        { name: 'core', codeRoot: coreRoot, specs: async () => coreSpecs },
        { name: 'cli', codeRoot: cliRoot, specs: async () => cliSpecs },
      ],
      projectRoot: tempDir,
    })

    expect(result.specsIndexed).toBe(2)
    expect(result.errors).toHaveLength(0)

    const coreSpec = await provider.getSpec('core:core/metadata')
    const cliSpec = await provider.getSpec('cli:cli/metadata')
    expect(coreSpec).toBeDefined()
    expect(cliSpec).toBeDefined()
    expect(coreSpec!.workspace).toBe('core')
    expect(cliSpec!.workspace).toBe('cli')
  })

  it('two workspaces with identical relative paths are stored separately', async () => {
    const coreRoot = createWorkspace(tempDir, 'core', {
      'src/index.ts': 'export function coreFunc() {}',
    })
    const cliRoot = createWorkspace(tempDir, 'cli', {
      'src/index.ts': 'export function cliFunc() {}',
    })

    provider = createCodeGraphProvider({ storagePath: tempDir })
    await provider.open()

    await provider.index({
      workspaces: [
        { name: 'core', codeRoot: coreRoot, specs: async () => [] },
        { name: 'cli', codeRoot: cliRoot, specs: async () => [] },
      ],
      projectRoot: tempDir,
    })

    const coreFile = await provider.getFile('core:src/index.ts')
    const cliFile = await provider.getFile('cli:src/index.ts')
    expect(coreFile).toBeDefined()
    expect(cliFile).toBeDefined()

    // Symbols should be in separate namespaces
    const coreSymbols = await provider.findSymbols({ name: 'coreFunc' })
    const cliSymbols = await provider.findSymbols({ name: 'cliFunc' })
    expect(coreSymbols).toHaveLength(1)
    expect(coreSymbols[0]!.filePath).toBe('core:src/index.ts')
    expect(cliSymbols).toHaveLength(1)
    expect(cliSymbols[0]!.filePath).toBe('cli:src/index.ts')
  })

  it('resolves cross-workspace monorepo imports', async () => {
    const coreRoot = createWorkspace(tempDir, 'core', {
      'src/greet.ts': 'export function greet(name: string): string { return name }',
      'package.json': JSON.stringify({ name: '@test/core' }),
    })
    const cliRoot = createWorkspace(tempDir, 'cli', {
      'src/main.ts': [
        "import { greet } from '@test/core'",
        'export function run() { return greet("world") }',
      ].join('\n'),
      'package.json': JSON.stringify({ name: '@test/cli' }),
    })

    // Create pnpm-workspace.yaml so the indexer can discover packages
    writeFileSync(join(tempDir, 'pnpm-workspace.yaml'), 'packages:\n  - core\n  - cli\n')

    provider = createCodeGraphProvider({ storagePath: tempDir })
    await provider.open()

    const result = await provider.index({
      workspaces: [
        { name: 'core', codeRoot: coreRoot, specs: async () => [] },
        { name: 'cli', codeRoot: cliRoot, specs: async () => [] },
      ],
      projectRoot: tempDir,
    })

    expect(result.errors).toHaveLength(0)

    // The import from @test/core should resolve across workspaces
    const greetSymbol = (await provider.findSymbols({ name: 'greet' })).find(
      (symbol) => symbol.filePath === 'core:src/greet.ts',
    )

    expect(greetSymbol).toBeDefined()

    const impact = await provider.analyzeImpact(greetSymbol!.id, 'upstream')
    expect(impact.directDependents).toBeGreaterThanOrEqual(1)
    expect(impact.affectedFiles).toContain('cli:src/main.ts')
  })

  it('persists hierarchy relations emitted during Pass 2 indexing', async () => {
    const coreRoot = createWorkspace(tempDir, 'core', {
      'src/base.ts': [
        'export interface Persistable {',
        '  save(): void',
        '}',
        '',
        'export class BaseService {',
        '  save(): void {}',
        '}',
      ].join('\n'),
      'src/user.ts': [
        "import { Persistable, BaseService } from './base.js'",
        '',
        'export class UserService extends BaseService implements Persistable {',
        '  save(): void {}',
        '}',
      ].join('\n'),
    })

    provider = createCodeGraphProvider({ storagePath: tempDir })
    await provider.open()

    const result = await provider.index({
      workspaces: [{ name: 'core', codeRoot: coreRoot, specs: async () => [] }],
      projectRoot: tempDir,
    })

    expect(result.errors).toHaveLength(0)

    const store = (provider as unknown as { store: GraphStore }).store
    const baseClass = (await provider.findSymbols({ name: 'BaseService' })).find(
      (symbol) => symbol.filePath === 'core:src/base.ts',
    )
    const contract = (await provider.findSymbols({ name: 'Persistable' })).find(
      (symbol) => symbol.filePath === 'core:src/base.ts',
    )
    const baseMethod = (await provider.findSymbols({ name: 'save' })).find(
      (symbol) => symbol.filePath === 'core:src/base.ts',
    )

    expect(baseClass).toBeDefined()
    expect(contract).toBeDefined()
    expect(baseMethod).toBeDefined()

    const extenders = await store.getExtenders(baseClass!.id)
    const implementors = await store.getImplementors(contract!.id)
    const overriders = await store.getOverriders(baseMethod!.id)
    const stats = await provider.getStatistics()

    expect(extenders).toHaveLength(1)
    expect(implementors).toHaveLength(1)
    expect(overriders).toHaveLength(1)
    expect(stats.relationCounts[RelationType.Extends]).toBe(1)
    expect(stats.relationCounts[RelationType.Implements]).toBe(1)
    expect(stats.relationCounts[RelationType.Overrides]).toBe(1)
  })

  it('PHP workspace: namespace import emits IMPORTS relation to the model file', async () => {
    const phpRoot = createWorkspace(tempDir, 'php-app', {
      'composer.json': JSON.stringify({
        name: 'acme/app',
        autoload: { 'psr-4': { 'App\\': 'src/' } },
      }),
      'app/Controllers/PostsController.php': [
        '<?php',
        'namespace App\\Controllers;',
        '',
        'use App\\Models\\User;',
        '',
        'class PostsController {}',
      ].join('\n'),
      'src/Models/User.php': ['<?php', 'namespace App\\Models;', '', 'class User {}'].join('\n'),
    })

    provider = createCodeGraphProvider({ storagePath: tempDir })
    await provider.open()

    await provider.index({
      workspaces: [{ name: 'php-app', codeRoot: phpRoot, specs: async () => [] }],
      projectRoot: tempDir,
    })

    // Access the store to query importees (IMPORTS relations FROM the controller)
    const store = (provider as unknown as { store: GraphStore }).store
    const importees = await store.getImportees('php-app:app/Controllers/PostsController.php')

    const expectedTarget = 'php-app:src/Models/User.php'
    const rel = importees.find((r) => r.target === expectedTarget)
    expect(rel).toBeDefined()
  })

  it('recomputes cross-file overrides when only the base file changes', async () => {
    const coreRoot = createWorkspace(tempDir, 'core', {
      'src/base.ts': ['export class BaseService {', '  save(): void {}', '}'].join('\n'),
      'src/user.ts': [
        "import { BaseService } from './base.js'",
        '',
        'export class UserService extends BaseService {',
        '  save(): void {}',
        '}',
      ].join('\n'),
    })

    provider = createCodeGraphProvider({ storagePath: tempDir })
    await provider.open()

    const options = {
      workspaces: [{ name: 'core', codeRoot: coreRoot, specs: async () => [] }],
      projectRoot: tempDir,
    }

    await provider.index(options)

    writeFileSync(
      join(coreRoot, 'src/base.ts'),
      ['export class BaseService {', '', '  save(): void {}', '}'].join('\n'),
    )

    const second = await provider.index(options)
    expect(second.errors).toHaveLength(0)

    const store = (provider as unknown as { store: GraphStore }).store
    const baseMethod = (await provider.findSymbols({ name: 'save' })).find(
      (symbol) => symbol.filePath === 'core:src/base.ts',
    )

    expect(baseMethod).toBeDefined()

    const overriders = await store.getOverriders(baseMethod!.id)
    expect(overriders).toHaveLength(1)
    expect(overriders[0]?.source).toContain('core:src/user.ts:method:save:')
  })

  it('PHP workspace: loaded model member call emits CALLS across files', async () => {
    const phpRoot = createWorkspace(tempDir, 'php-app', {
      'app/controllers/PostsController.php': [
        '<?php',
        'class PostsController {',
        '  public function index() {',
        "    $this->loadModel('Article');",
        '    $this->Article->save();',
        '  }',
        '}',
      ].join('\n'),
      'app/models/article.php': [
        '<?php',
        'class Article {',
        '  public function save(): void {}',
        '}',
      ].join('\n'),
    })

    provider = createCodeGraphProvider({ storagePath: tempDir })
    await provider.open()

    const result = await provider.index({
      workspaces: [{ name: 'php-app', codeRoot: phpRoot, specs: async () => [] }],
      projectRoot: tempDir,
    })

    expect(result.errors).toHaveLength(0)

    const store = (provider as unknown as { store: GraphStore }).store
    const saveSymbol = (await provider.findSymbols({ name: 'save' })).find(
      (symbol) => symbol.filePath === 'php-app:app/models/article.php',
    )

    expect(saveSymbol).toBeDefined()

    const callers = await store.getCallers(saveSymbol!.id)
    expect(callers).toContainEqual(
      expect.objectContaining({
        source: expect.stringContaining(
          'php-app:app/controllers/PostsController.php:method:index:',
        ),
        target: saveSymbol!.id,
        type: RelationType.Calls,
      }),
    )
  })

  it('PHP workspace: Cake uses property preserves IMPORTS and CALLS across indexing', async () => {
    const phpRoot = createWorkspace(tempDir, 'php-app', {
      'app/controllers/PostsController.php': [
        '<?php',
        'class PostsController {',
        "  var $uses = array('Article');",
        '  public function index() {',
        '    $this->Article->save();',
        '  }',
        '}',
      ].join('\n'),
      'app/models/article.php': [
        '<?php',
        'class Article {',
        '  public function save(): void {}',
        '}',
      ].join('\n'),
    })

    provider = createCodeGraphProvider({ storagePath: tempDir })
    await provider.open()

    const result = await provider.index({
      workspaces: [{ name: 'php-app', codeRoot: phpRoot, specs: async () => [] }],
      projectRoot: tempDir,
    })

    expect(result.errors).toHaveLength(0)

    const store = (provider as unknown as { store: GraphStore }).store
    const importees = await store.getImportees('php-app:app/controllers/PostsController.php')
    expect(importees).toContainEqual(
      expect.objectContaining({
        source: 'php-app:app/controllers/PostsController.php',
        target: 'php-app:app/models/article.php',
        type: RelationType.Imports,
      }),
    )

    const saveSymbol = (await provider.findSymbols({ name: 'save' })).find(
      (symbol) => symbol.filePath === 'php-app:app/models/article.php',
    )
    expect(saveSymbol).toBeDefined()

    const callers = await store.getCallers(saveSymbol!.id)
    expect(callers).toContainEqual(
      expect.objectContaining({
        source: expect.stringContaining(
          'php-app:app/controllers/PostsController.php:method:index:',
        ),
        target: saveSymbol!.id,
        type: RelationType.Calls,
      }),
    )
  })

  it('PHP workspace: Laravel class literal acquisition preserves IMPORTS and CALLS across indexing', async () => {
    const phpRoot = createWorkspace(tempDir, 'laravel', {
      'app/Http/Controllers/PostController.php': [
        '<?php',
        'class PostController {',
        '  public function index() {',
        '    $mailer = app(App\\Services\\Mailer::class);',
        '    $mailer->send();',
        '  }',
        '}',
      ].join('\n'),
      'app/App/Services/Mailer.php': [
        '<?php',
        'class Mailer {',
        '  public function send(): void {}',
        '}',
      ].join('\n'),
    })

    provider = createCodeGraphProvider({ storagePath: tempDir })
    await provider.open()

    const result = await provider.index({
      workspaces: [{ name: 'laravel', codeRoot: phpRoot, specs: async () => [] }],
      projectRoot: tempDir,
    })

    expect(result.errors).toHaveLength(0)

    const store = (provider as unknown as { store: GraphStore }).store
    const importees = await store.getImportees('laravel:app/Http/Controllers/PostController.php')
    expect(importees).toContainEqual(
      expect.objectContaining({
        source: 'laravel:app/Http/Controllers/PostController.php',
        target: 'laravel:app/App/Services/Mailer.php',
        type: RelationType.Imports,
      }),
    )

    const sendSymbol = (await provider.findSymbols({ name: 'send' })).find(
      (symbol) => symbol.filePath === 'laravel:app/App/Services/Mailer.php',
    )
    expect(sendSymbol).toBeDefined()

    const callers = await store.getCallers(sendSymbol!.id)
    expect(callers).toContainEqual(
      expect.objectContaining({
        source: expect.stringContaining(
          'laravel:app/Http/Controllers/PostController.php:method:index:',
        ),
        target: sendSymbol!.id,
        type: RelationType.Calls,
      }),
    )
  })

  it('resolves TypeScript scoped facts into USES_TYPE, CONSTRUCTS, and file-only IMPORTS', async () => {
    const root = createWorkspace(tempDir, 'core', {
      'src/main.ts': [
        "import './polyfill.js'",
        'export class TemplateExpander {}',
        'export interface GraphStore {}',
        'export interface HookRunner {}',
        'export class NodeHookRunner {',
        '  constructor(expander: TemplateExpander, store: GraphStore, hook: HookRunner) {}',
        '}',
        'export function create() {',
        '  return new TemplateExpander()',
        '}',
      ].join('\n'),
      'src/polyfill.ts': 'export const installed = true',
    })

    provider = createCodeGraphProvider({ storagePath: tempDir })
    await provider.open()

    const result = await provider.index({
      workspaces: [{ name: 'core', codeRoot: root, specs: async () => [] }],
      projectRoot: tempDir,
    })

    expect(result.errors).toHaveLength(0)

    const store = (provider as unknown as { store: GraphStore }).store
    const templateExpander = (await provider.findSymbols({ name: 'TemplateExpander' }))[0]
    const graphStore = (await provider.findSymbols({ name: 'GraphStore' }))[0]
    const hookRunner = (await provider.findSymbols({ name: 'HookRunner' }))[0]

    expect(templateExpander).toBeDefined()
    expect(graphStore).toBeDefined()
    expect(hookRunner).toBeDefined()

    const templateRelations = await store.getCallers(templateExpander!.id)
    expect(templateRelations.map((relation) => relation.type)).toContain(RelationType.Constructs)
    expect(templateRelations.map((relation) => relation.type)).toContain(RelationType.UsesType)

    const graphStoreRelations = await store.getCallers(graphStore!.id)
    const hookRunnerRelations = await store.getCallers(hookRunner!.id)
    expect(graphStoreRelations.map((relation) => relation.type)).toContain(RelationType.UsesType)
    expect(hookRunnerRelations.map((relation) => relation.type)).toContain(RelationType.UsesType)

    const importees = await store.getImportees('core:src/main.ts')
    expect(importees).toContainEqual(
      expect.objectContaining({
        source: 'core:src/main.ts',
        target: 'core:src/polyfill.ts',
        type: RelationType.Imports,
      }),
    )
  })
})
