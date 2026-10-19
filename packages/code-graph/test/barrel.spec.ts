import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  BulkSessionStateError,
  CODE_GRAPH_VERSION,
  GraphSchemaIncompatibleError,
  GraphStorageRecoveryRequiredError,
  GraphStoreRecreateRequiresClosedError,
  IMPACT_RESULT_TYPES,
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
  type ImpactResultFilter,
  type ImpactResultType,
  type LogicalSymbol,
  type SQLiteGraphStoreOptions,
  type SqliteRuntimeDescriptor,
  type RunIsolatedGraphIndexInput,
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
    expect(InMemoryIndexSession).toBeTypeOf('function')
    expect(new InMemoryIndexSession().getAllFilePaths().size).toBe(0)
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
      memberSemantics: undefined,
    })

    expect(symbol.id).toContain('logical|')
  })

  it('exports graph-store composition surface', () => {
    expect(createSqliteGraphStoreFactory).toBeTypeOf('function')

    const factory: GraphStoreFactory = createSqliteGraphStoreFactory()
    expect(factory.create).toBeTypeOf('function')

    // The option types must keep the members hosts rely on; a removed member fails typecheck.
    expectTypeOf<GraphStoreFactoryOptions>().toHaveProperty('storagePath')
    expectTypeOf<CodeGraphCompositionOptions>().toHaveProperty('graphStoreId')
    expectTypeOf<CodeGraphCompositionOptions>().toHaveProperty('onWarning')
    expectTypeOf<CodeGraphOptions>().toHaveProperty('storagePath')
    expectTypeOf<SqliteRuntimeDescriptor>().toBeObject()
    expectTypeOf<SQLiteGraphStoreOptions>().toBeObject()
  })

  it('exports resolver selector result types from the public barrel', async () => {
    const publicModule = await import('../src/public.js')
    expect('ResolvedFileSelector' in publicModule).toBe(false)
    expect('ResolvedSymbolSelector' in publicModule).toBe(false)
    expect('ResolvedSymbolSelectorResult' in publicModule).toBe(false)
    expect('normalizeFileSelectorPath' in publicModule).toBe(true)

    type PublicModule = typeof import('../src/public.js')
    expectTypeOf<import('../src/public.js').ResolvedFileSelector>().toHaveProperty('canonicalPath')
    expectTypeOf<import('../src/public.js').ResolvedSymbolSelector>().toHaveProperty('symbolId')
    expectTypeOf<import('../src/public.js').ResolvedSymbolSelectorResult['status']>().toEqualTypeOf<
      'resolved' | 'ambiguous' | 'missing' | 'unresolved'
    >()
    expectTypeOf<PublicModule['normalizeFileSelectorPath']>().toBeFunction()
  })

  it('exports language adapter and model vocabulary types', () => {
    expectTypeOf<LanguageAdapter>().toHaveProperty('analyzeFile')
    expectTypeOf<LanguageAdapter>().toHaveProperty('resolveImports')
    expect(Object.values(SymbolKind)).toEqual(
      expect.arrayContaining(['function', 'class', 'method', 'interface', 'property']),
    )
    expect(Object.values(RelationType)).toEqual(
      expect.arrayContaining(['CALLS', 'IMPORTS', 'EXTENDS', 'IMPLEMENTS', 'COVERS_SYMBOL']),
    )
  })

  it('exports the public impact filter vocabulary without SQLite internals', async () => {
    expect(IMPACT_RESULT_TYPES).toEqual(['files', 'symbols', 'specs'])

    const type: ImpactResultType = 'symbols'
    const filter: ImpactResultFilter = {
      types: [type],
      kinds: [SymbolKind.Function],
      workspaces: ['code-graph'],
      excludeWorkspaces: ['external'],
    }
    expect(IMPACT_RESULT_TYPES).toContain(filter.types?.[0])

    const publicModule = await import('../src/public.js')
    expect('IMPACT_RESULT_TYPES' in publicModule).toBe(true)
    expect('ImpactResultFilter' in publicModule).toBe(false)
    expect('ImpactResultType' in publicModule).toBe(false)
    expect('SQLiteGraphStore' in publicModule).toBe(false)
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
    expect(new GraphStorageRecoveryRequiredError('msg', 'CORRUPT').code).toBe(
      'GRAPH_STORAGE_RECOVERY_REQUIRED',
    )
    expect(new GraphStoreRecreateRequiresClosedError().code).toBe(
      'GRAPH_STORE_RECREATE_REQUIRES_CLOSED',
    )
    expect(new SpecNotFoundError('ws:cap').code).toBe('SPEC_NOT_FOUND')
    expect(new SpecNotFoundError('ws:cap').specId).toBe('ws:cap')
  })

  it('given the public barrel, when its runtime exports are listed, then they equal the enumerated Package exports allow-list', async () => {
    // Keep in sync with the "Package exports" requirement of code-graph:composition.
    const allowed = [
      'BindingScopeKind',
      'BindingSourceKind',
      'BulkSessionStateError',
      'CODE_GRAPH_VERSION',
      'CallForm',
      'DEFAULT_EXCLUDE_PATHS',
      'DEFAULT_HOTSPOT_KINDS',
      'DeclarationOccurrenceForm',
      'DuplicateSymbolIdError',
      'FILE_CATEGORIES',
      'FreshnessMode',
      'FreshnessState',
      'GetChangeSpecCoverage',
      'GetGraphHealth',
      'GetSpecCoverage',
      'GraphBusyError',
      'GraphDerivationMismatchError',
      'GraphIndexProgressHandlerError',
      'GraphIndexTaskContractError',
      'GraphIndexTaskExecutionError',
      'GraphIndexWorkerExitError',
      'GraphIndexWorkerProtocolError',
      'GraphIndexWorkerSignalError',
      'GraphIndexWorkerStartError',
      'GraphProviderStaleError',
      'GraphSchemaIncompatibleError',
      'GraphStorageRecoveryRequiredError',
      'GraphStoreRecreateRequiresClosedError',
      'IMPACT_RESULT_TYPES',
      'ImportDeclarationKind',
      'IndexCoverageStatus',
      'IndexProjectGraph',
      'IndexedInputKind',
      'IndexedResourceKind',
      'InvalidGraphSelectorError',
      'InvalidGraphStoreConfigurationError',
      'InvalidRelationTypeError',
      'InvalidSymbolKindError',
      'MemberAccessor',
      'MemberDispatch',
      'MemberKind',
      'RelationType',
      'SpecNotFoundError',
      'SpecdCodeGraphError',
      'StoreNotOpenError',
      'StoreOverloadError',
      'StoreWorkerError',
      'SymbolKind',
      'SymbolSpace',
      'analyzeFilesImpact',
      'analyzeImpact',
      'analyzePublicBindingImpact',
      'analyzeResolvedSymbolImpact',
      'buildProjectGraphConfig',
      'classifyFileCategory',
      'collectImpactSpecIds',
      'collectLogicalCoveringSpecs',
      'computeGraphFingerprint',
      'computeRootFingerprint',
      'computeWorkspaceFingerprint',
      'createBootstrapGraphConfig',
      'createCodeGraphProvider',
      'createGetChangeSpecCoverage',
      'createGetGraphHealth',
      'createGetSpecCoverage',
      'createIndexProjectGraph',
      'createLocalBinding',
      'createLogicalSymbol',
      'createPublicBinding',
      'createSqliteGraphStoreFactory',
      'detectFingerprintMismatch',
      'expandSearchQuery',
      'expandSearchToken',
      'expandSymbolName',
      'isGraphStale',
      'normalizeFileSelectorPath',
      'parseFingerprintMap',
      'parseLogicalSymbol',
      'runIsolatedGraphIndex',
      'serializeFingerprintMap',
    ]
    const publicModule = await import('../src/public.js')

    expect(Object.keys(publicModule).sort()).toEqual([...allowed].sort())
  })

  it('exposes only the curated isolated-worker surface', async () => {
    const publicModule = await import('../src/public.js')
    expect('runIsolatedGraphIndex' in publicModule).toBe(true)
    for (const name of [
      'acquireGraphIndexLockLeaseByStoragePath',
      'createGraphIndexLockHandoffEnv',
      'isGraphIndexLockHandoffForStoragePath',
      'NodeIsolatedGraphIndexRunner',
      'isChildMessage',
      'GRAPH_INDEX_PROTOCOL',
    ]) {
      expect(name in publicModule).toBe(false)
    }
    const input: RunIsolatedGraphIndexInput<{ readonly value: string }, never> = {
      storageRoot: join(tmpdir(), 'specd-graph'),
      taskModule: pathToFileURL(join(tmpdir(), 'specd-task.js')),
      taskInput: { value: 'ok' },
    }
    expect(input.taskInput.value).toBe('ok')
  })
})
