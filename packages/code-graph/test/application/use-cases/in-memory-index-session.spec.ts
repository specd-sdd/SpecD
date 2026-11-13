import { describe, expect, it } from 'vitest'
import { InMemoryIndexSession } from '../../../src/application/use-cases/in-memory-index-session.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { type SymbolNode } from '../../../src/domain/value-objects/symbol-node.js'

function dummySymbol(id: string, name: string, filePath: string): SymbolNode {
  return {
    id,
    name,
    kind: SymbolKind.Class,
    filePath,
    projectRelativePath: filePath,
    line: 1,
    column: 0,
    endLine: 10,
    endColumn: 1,
    selectionRange: { startLine: 1, startColumn: 0, endLine: 1, endColumn: 0 },
    parentId: undefined,
    comment: undefined,
  }
}

describe('InMemoryIndexSession qualified names', () => {
  it('Hydrated files fill the qualified-name lookup', () => {
    const session = new InMemoryIndexSession()

    // Given a persisted file with namespace and symbol
    const sym1 = dummySymbol('sym-1', 'UserService', 'core:src/UserService.php')
    session.hydratePersistedFile(
      {
        path: 'core:src/UserService.php',
        projectRelativePath: 'packages/core/src/UserService.php',
        language: 'php',
        contentHash: 'hash1',
        workspace: 'core',
        category: 'source',
        namespace: 'App\\Services',
        namespaceSeparator: '\\',
      },
      [sym1],
    )

    // Then the qualified name lookup is populated
    expect(session.getQualifiedNames().get('App\\Services\\UserService')).toBe('sym-1')
    expect(session.findSymbolByQualifiedName('App\\Services\\UserService')).toBe('sym-1')

    // Given a hydrated test file
    const symTest = dummySymbol('sym-test', 'TestFixture', 'core:test/TestFixture.php')
    session.hydratePersistedFile(
      {
        path: 'core:test/TestFixture.php',
        projectRelativePath: 'packages/core/test/TestFixture.php',
        language: 'php',
        contentHash: 'hash2',
        workspace: 'core',
        category: 'test',
        namespace: 'App\\Tests',
        namespaceSeparator: '\\',
      },
      [symTest],
    )

    // Default lookup does not see test symbols
    expect(session.getQualifiedNames().get('App\\Tests\\TestFixture')).toBeUndefined()
    expect(session.findSymbolByQualifiedName('App\\Tests\\TestFixture')).toBeUndefined()

    // includeTests lookup sees test symbols
    expect(session.getQualifiedNames({ includeTests: true }).get('App\\Tests\\TestFixture')).toBe(
      'sym-test',
    )
    expect(
      session.findSymbolByQualifiedName('App\\Tests\\TestFixture', { includeTests: true }),
    ).toBe('sym-test')
  })

  it('Production importers never resolve to a test symbol', () => {
    const session = new InMemoryIndexSession()

    // Register a production file
    session.registerFile({
      filePath: 'core:src/model.ts',
      projectRelativePath: 'packages/core/src/model.ts',
      language: 'typescript',
      contentHash: 'hash-prod',
      workspace: 'core',
      category: 'source',
    })
    session.registerAnalysis({
      filePath: 'core:src/model.ts',
      analysis: {
        language: 'typescript',
        symbols: [dummySymbol('prod-1', 'User', 'core:src/model.ts')],
        imports: [],
        bindingFacts: [],
        callFacts: [],
        namespace: 'Core',
        namespaceSeparator: '.',
      },
    })

    // Register a test file
    session.registerFile({
      filePath: 'core:test/helper.ts',
      projectRelativePath: 'packages/core/test/helper.ts',
      language: 'typescript',
      contentHash: 'hash-test',
      workspace: 'core',
      category: 'test',
    })
    session.registerAnalysis({
      filePath: 'core:test/helper.ts',
      analysis: {
        language: 'typescript',
        symbols: [dummySymbol('test-helper', 'TestHelper', 'core:test/helper.ts')],
        imports: [],
        bindingFacts: [],
        callFacts: [],
        namespace: 'Core',
        namespaceSeparator: '.',
      },
    })

    // Production lookup sees production symbol
    expect(session.getQualifiedNames().get('Core.User')).toBe('prod-1')
    expect(session.findSymbolByQualifiedName('Core.User')).toBe('prod-1')

    // Production lookup never sees test helper
    expect(session.getQualifiedNames().get('Core.TestHelper')).toBeUndefined()
    expect(session.findSymbolByQualifiedName('Core.TestHelper')).toBeUndefined()
  })

  it('A test importer resolves to a test helper, and production wins duplicates', () => {
    const session = new InMemoryIndexSession()

    // Production symbol
    session.registerFile({
      filePath: 'core:src/foo.ts',
      projectRelativePath: 'packages/core/src/foo.ts',
      language: 'typescript',
      contentHash: 'hash-1',
      workspace: 'core',
      category: 'source',
    })
    session.registerAnalysis({
      filePath: 'core:src/foo.ts',
      analysis: {
        language: 'typescript',
        symbols: [dummySymbol('prod-foo', 'Foo', 'core:src/foo.ts')],
        imports: [],
        bindingFacts: [],
        callFacts: [],
        namespace: 'Core',
      },
    })

    // Test helper symbol and duplicate Foo symbol in test
    session.registerFile({
      filePath: 'core:test/foo.spec.ts',
      projectRelativePath: 'packages/core/test/foo.spec.ts',
      language: 'typescript',
      contentHash: 'hash-2',
      workspace: 'core',
      category: 'test',
    })
    session.registerAnalysis({
      filePath: 'core:test/foo.spec.ts',
      analysis: {
        language: 'typescript',
        symbols: [
          dummySymbol('test-helper', 'Helper', 'core:test/foo.spec.ts'),
          dummySymbol('test-foo', 'Foo', 'core:test/foo.spec.ts'),
        ],
        imports: [],
        bindingFacts: [],
        callFacts: [],
        namespace: 'Core',
      },
    })

    // includeTests: true resolves test helper
    expect(session.getQualifiedNames({ includeTests: true }).get('Core.Helper')).toBe('test-helper')
    expect(session.findSymbolByQualifiedName('Core.Helper', { includeTests: true })).toBe(
      'test-helper',
    )

    // Duplicate name: production wins
    expect(session.getQualifiedNames({ includeTests: true }).get('Core.Foo')).toBe('prod-foo')
    expect(session.findSymbolByQualifiedName('Core.Foo', { includeTests: true })).toBe('prod-foo')

    // Merged-map invalidation: registering a new test symbol invalidates and updates the merged map
    session.registerFile({
      filePath: 'core:test/bar.spec.ts',
      projectRelativePath: 'packages/core/test/bar.spec.ts',
      language: 'typescript',
      contentHash: 'hash-3',
      workspace: 'core',
      category: 'test',
    })
    session.registerAnalysis({
      filePath: 'core:test/bar.spec.ts',
      analysis: {
        language: 'typescript',
        symbols: [dummySymbol('test-bar', 'Bar', 'core:test/bar.spec.ts')],
        imports: [],
        bindingFacts: [],
        callFacts: [],
        namespace: 'Core',
      },
    })

    expect(session.getQualifiedNames({ includeTests: true }).get('Core.Bar')).toBe('test-bar')
  })
})
