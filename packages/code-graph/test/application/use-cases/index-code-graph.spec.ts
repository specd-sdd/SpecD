import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { IndexCodeGraph } from '../../../src/application/use-cases/index-code-graph.js'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'
import { type GraphStore } from '../../../src/domain/ports/graph-store.js'
import { type IndexOptions } from '../../../src/domain/value-objects/index-options.js'
import { AdapterRegistry } from '../../../src/infrastructure/tree-sitter/adapter-registry.js'
import { TypeScriptLanguageAdapter } from '../../../src/infrastructure/tree-sitter/typescript-language-adapter.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'
import { type Relation } from '../../../src/domain/value-objects/relation.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { makeMockSpecRepository } from '../../helpers/make-mock-spec-repository.js'

/**
 * Creates a workspace directory with test files.
 */
function createWorkspaceDir(baseDir: string, name: string, files: Record<string, string>): string {
  const wsDir = join(baseDir, name)
  mkdirSync(wsDir, { recursive: true })
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(wsDir, relPath)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, content)
  }
  return wsDir
}

describe('IndexCodeGraph cross-file overrides', () => {
  let tempDir: string
  let store: GraphStore
  let registry: AdapterRegistry

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-index-code-graph-'))
    store = new InMemoryGraphStore(tempDir)
    await store.open()
    registry = new AdapterRegistry()
    registry.register(new TypeScriptLanguageAdapter())
  })

  afterEach(async () => {
    await store.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('exhaustively links all supermethod overload signatures in cross-file override relations', async () => {
    const wsDir = createWorkspaceDir(tempDir, 'ws', {
      'src/base.ts': `
export class BaseService {
  execute(input: string): string;
  execute(input: number): number;
  execute(input: string | number): string | number {
    return input;
  }
}
`,
      'src/derived.ts': `
import { BaseService } from './base';

export class DerivedService extends BaseService {
  execute(input: string | number): string | number {
    return input;
  }
}
`,
    })

    const indexer = new IndexCodeGraph(store, registry)
    const options: IndexOptions = {
      projectRoot: tempDir,
      vcsRoot: tempDir,
      workspaces: [
        {
          name: 'ws',
          prefix: null,
          codeRoot: wsDir,
          specRepo: makeMockSpecRepository(),
          ownership: 'owned',
          isExternal: false,
        },
      ],
      graphConfig: { includePaths: [], workspaces: new Map() },
    }

    const result = await indexer.execute(options)
    expect(result.filesIndexed).toBe(2)

    const derivedSymbols = await store.findSymbols({ name: 'execute' })
    const baseMethods = derivedSymbols.filter((s) => s.filePath.includes('src/base.ts'))
    const childMethods = derivedSymbols.filter((s) => s.filePath.includes('src/derived.ts'))

    expect(baseMethods.length).toBeGreaterThanOrEqual(2)
    expect(childMethods).toHaveLength(1)

    const childMethodId = childMethods[0]!.id
    const overrideTargets = await store.getOverriddenTargets(childMethodId)

    // Verify that every overload signature in base is targeted by an OVERRIDES relation
    expect(overrideTargets.length).toBe(baseMethods.length)
    const targetedBaseIds = overrideTargets.map((rel) => rel.target)
    for (const baseMethod of baseMethods) {
      expect(targetedBaseIds).toContain(baseMethod.id)
    }
  })

  it('persists property symbols with container parentId and DEFINES relations upon commit', async () => {
    const wsDir = createWorkspaceDir(tempDir, 'ws', {
      'src/models.ts': `
export interface UserProfile {
  id: string;
  email: string;
}

export class Account {
  title: string = 'admin';
}

export enum UserRole {
  Admin = 'admin',
  User = 'user',
}
`,
    })

    const indexer = new IndexCodeGraph(store, registry)
    const options: IndexOptions = {
      projectRoot: tempDir,
      vcsRoot: tempDir,
      workspaces: [
        {
          name: 'ws',
          prefix: null,
          codeRoot: wsDir,
          specRepo: makeMockSpecRepository(),
          ownership: 'owned',
          isExternal: false,
        },
      ],
      graphConfig: { includePaths: [], workspaces: new Map() },
    }

    const result = await indexer.execute(options)
    expect(result.filesIndexed).toBe(1)

    // Verify symbols with kind: 'property' are stored
    const properties = await store.findSymbols({ kind: SymbolKind.Property })

    expect(properties.length).toBeGreaterThanOrEqual(4)
    const propertyNames = properties.map((p) => p.name)
    expect(propertyNames).toContain('id')
    expect(propertyNames).toContain('email')
    expect(propertyNames).toContain('title')
    expect(propertyNames).toContain('Admin')
    expect(propertyNames).toContain('User')

    // Verify each property has a container parentId
    for (const prop of properties) {
      expect(prop.parentId).toBeDefined()
      expect(typeof prop.parentId).toBe('string')
    }

    // Verify DEFINES relations connect the file to the property symbols
    const stats = await store.getStatistics()
    expect(stats.relationCounts[RelationType.Defines]).toBeGreaterThanOrEqual(properties.length)

    const fileDefinesRelations = (
      store as unknown as { relations: readonly Relation[] }
    ).relations.filter((r) => r.type === RelationType.Defines && r.source === 'ws:src/models.ts')
    const definedTargetIds = fileDefinesRelations.map((r) => r.target)
    for (const prop of properties) {
      expect(definedTargetIds).toContain(prop.id)
    }
  })
})
