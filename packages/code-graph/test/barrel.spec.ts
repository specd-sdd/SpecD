import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BulkSessionStateError,
  CODE_GRAPH_VERSION,
  GraphSchemaIncompatibleError,
  InvalidGraphStoreConfigurationError,
  LanguageAdapter,
  RelationType,
  SpecNotFoundError,
  SymbolKind,
  SymbolSpace,
  createGetChangeSpecCoverage,
  createGetGraphHealth,
  createGetSpecCoverage,
  createIndexProjectGraph,
  createLogicalSymbol,
  createSqliteGraphStoreFactory,
  type CodeGraphCompositionOptions,
  type CodeGraphOptions,
  type CodeGraphProvider,
  type GraphStoreFactory,
  type GraphStoreFactoryOptions,
  type LogicalSymbol,
  type SQLiteGraphStoreOptions,
  type SqliteRuntimeDescriptor,
} from '../src/public.js'
import { InMemoryIndexSession } from '../src/index.js'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('@specd/code-graph barrel', () => {
  it('exports CODE_GRAPH_VERSION matching package.json', () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      version: string
    }
    expect(CODE_GRAPH_VERSION).toBe(packageJson.version)
    expect(CODE_GRAPH_VERSION).not.toBe('0.0.0')
  })

  it('keeps InMemoryIndexSession on the internal barrel only', async () => {
    const publicModule = await import('../src/public.js')
    expect('InMemoryIndexSession' in publicModule).toBe(false)
    expect(InMemoryIndexSession).toBeDefined()
  })

  it('keeps concrete store adapters on the internal barrel only', async () => {
    const publicModule = await import('../src/public.js')
    const internalModule = await import('../src/index.js')

    const adapters = [
      'SQLiteGraphStore',
      'AdapterRegistry',
      'TypeScriptLanguageAdapter',
      'PythonLanguageAdapter',
      'PhpLanguageAdapter',
      'GoLanguageAdapter',
    ]

    for (const name of adapters) {
      expect(name in publicModule).toBe(false)
      expect(name in internalModule).toBe(true)
    }

    expect('LadybugGraphStore' in publicModule).toBe(false)
    expect('LadybugGraphStore' in internalModule).toBe(false)
  })

  it('keeps ResolveSymbolReference on the internal barrel only', async () => {
    const publicModule = await import('../src/public.js')
    const internalModule = await import('../src/index.js')

    expect('ResolveSymbolReference' in publicModule).toBe(false)
    expect('ResolveSymbolReference' in internalModule).toBe(true)
  })

  it('exposes CodeGraphProvider as a type-only factory result', async () => {
    const publicModule = await import('../src/public.js')
    const provider: CodeGraphProvider | undefined = undefined

    expect(provider).toBeUndefined()
    expect('CodeGraphProvider' in publicModule).toBe(false)
  })

  it('exports logical-symbol public types and constructors', () => {
    const symbol: LogicalSymbol = createLogicalSymbol({
      workspace: 'code-graph',
      surface: 'src/public.ts',
      name: 'CODE_GRAPH_VERSION',
      space: SymbolSpace.Value,
      ownerId: undefined,
      memberForm: undefined,
    })

    expect(symbol.id).toContain('logical|')
  })

  it('exports graph-store composition surface', () => {
    expect(createSqliteGraphStoreFactory).toBeTypeOf('function')

    const factory: GraphStoreFactory = createSqliteGraphStoreFactory()
    expect(factory.create).toBeTypeOf('function')

    let options: GraphStoreFactoryOptions | undefined
    let compositionOptions: CodeGraphCompositionOptions | undefined
    let codeGraphOptions: CodeGraphOptions | undefined
    let runtimeDescriptor: SqliteRuntimeDescriptor | undefined
    let sqliteStoreOptions: SQLiteGraphStoreOptions | undefined

    expect(options).toBeUndefined()
    expect(compositionOptions).toBeUndefined()
    expect(codeGraphOptions).toBeUndefined()
    expect(runtimeDescriptor).toBeUndefined()
    expect(sqliteStoreOptions).toBeUndefined()
  })

  it('exports resolver selector result types from the public barrel', async () => {
    const publicModule = await import('../src/public.js')
    expect('ResolvedFileSelector' in publicModule).toBe(false)
    expect('ResolvedSymbolSelector' in publicModule).toBe(false)
    expect('ResolvedSymbolSelectorResult' in publicModule).toBe(false)
    expect('normalizeFileSelectorPath' in publicModule).toBe(true)

    let fileSelector: import('../src/public.js').ResolvedFileSelector | undefined
    let symbolSelector: import('../src/public.js').ResolvedSymbolSelector | undefined
    let symbolResult: import('../src/public.js').ResolvedSymbolSelectorResult | undefined

    expect(fileSelector).toBeUndefined()
    expect(symbolSelector).toBeUndefined()
    expect(symbolResult).toBeUndefined()
  })

  it('exports language adapter and model vocabulary types', () => {
    let adapter: LanguageAdapter | undefined
    expect(adapter).toBeUndefined()
    expect(SymbolKind).toBeDefined()
    expect(RelationType).toBeDefined()
    expect(typeof SymbolKind.Function).toBe('string')
  })

  it('exports host use-case factories from the public barrel', async () => {
    const publicModule = await import('../src/public.js')

    const factories = [
      'createGetGraphHealth',
      'createIndexProjectGraph',
      'createGetSpecCoverage',
      'createGetChangeSpecCoverage',
    ]
    for (const name of factories) {
      expect(name in publicModule).toBe(true)
    }

    expect(createGetGraphHealth).toBeTypeOf('function')
    expect(createIndexProjectGraph).toBeTypeOf('function')
    expect(createGetSpecCoverage).toBeTypeOf('function')
    expect(createGetChangeSpecCoverage).toBeTypeOf('function')
  })

  it('exports typed SQLite graph-store errors with stable codes', () => {
    expect(new BulkSessionStateError('msg').code).toBe('BULK_SESSION_STATE')
    expect(new InvalidGraphStoreConfigurationError('msg').code).toBe(
      'INVALID_GRAPH_STORE_CONFIGURATION',
    )
    expect(new GraphSchemaIncompatibleError('msg').code).toBe('GRAPH_SCHEMA_INCOMPATIBLE')
    expect(new SpecNotFoundError('ws:cap').code).toBe('SPEC_NOT_FOUND')
    expect(new SpecNotFoundError('ws:cap').specId).toBe('ws:cap')
  })
})
