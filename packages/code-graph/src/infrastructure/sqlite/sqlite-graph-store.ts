/* eslint-disable jsdoc/require-jsdoc, @typescript-eslint/require-await */
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  GraphStore,
  type IndexWriteSession,
  type IndexWriteSessionMetadata,
  type LocalBindingLookup,
  type LogicalDeclaration,
  type LogicalSymbolLookup,
  type PublicBindingLookup,
  type ReferenceFactsWrite,
  type StorageGenerationSnapshot,
} from '../../domain/ports/graph-store.js'
import { StoreNotOpenError } from '../../domain/errors/store-not-open-error.js'
import { expandSearchQuery } from '../../domain/services/expand-search-query.js'
import { expandSymbolName } from '../../domain/services/expand-symbol-name.js'
import { matchesExclude } from '../../domain/services/matches-exclude.js'
import { createDocumentNode, type DocumentNode } from '../../domain/value-objects/document-node.js'
import { createFileNode, type FileNode } from '../../domain/value-objects/file-node.js'
import { type GraphStatistics } from '../../domain/value-objects/graph-statistics.js'
import { createRelation, type Relation } from '../../domain/value-objects/relation.js'
import {
  RelationType,
  type RelationType as RelationTypeValue,
} from '../../domain/value-objects/relation-type.js'
import { type SearchOptions } from '../../domain/value-objects/search-options.js'
import { createSpecNode, type SpecNode } from '../../domain/value-objects/spec-node.js'
import { createSymbolNode, type SymbolNode } from '../../domain/value-objects/symbol-node.js'
import { type SymbolQuery } from '../../domain/value-objects/symbol-query.js'
import {
  type LocalBinding,
  type LogicalSymbol,
  type PublicBinding,
  type ResolutionStep,
} from '../../domain/value-objects/symbol-reference.js'
import { type IndexCoverage } from '../../domain/value-objects/index-session.js'
import {
  type SourceContentCandidatePage,
  type SourceContentCandidateQuery,
} from '../../domain/value-objects/source-search.js'
import {
  type FreshnessLatches,
  type IndexedInputObservation,
  type IndexedResourceKey,
  type MarkIndexedInputStaleInput,
  type UpdateIndexedInputObservationInput,
} from '../../domain/value-objects/indexed-input-freshness.js'
import { SQLITE_SCHEMA_DDL, SQLITE_SCHEMA_VERSION } from './schema.js'
import {
  ensureStorageGeneration,
  readStorageGeneration,
  rotateStorageGeneration,
} from '../storage-generation.js'

type SqliteBindValue = unknown

interface SqliteStatement {
  run(...params: SqliteBindValue[]): unknown
  get(...params: SqliteBindValue[]): unknown
  all(...params: SqliteBindValue[]): unknown[]
}

interface SqliteDatabase {
  readonly open: boolean
  close(): void
  exec(sql: string): void
  pragma(pragma: string): unknown
  prepare(sql: string): SqliteStatement
  transaction<TArgs extends unknown[]>(fn: (...args: TArgs) => void): (...args: TArgs) => void
}

interface SqliteDatabaseModule {
  readonly default: new (path: string, options?: { readonly?: boolean | undefined }) => unknown
}
const SYMBOL_DEPENDENCY_RELATION_TYPES = [
  RelationType.Calls,
  RelationType.Constructs,
  RelationType.UsesType,
] as const

interface RelationRow {
  readonly source: string
  readonly target: string
  readonly type: string
  readonly metadata_json: string | null
}

interface LogicalSymbolRow {
  readonly id: string
  readonly workspace: string
  readonly surface: string
  readonly name: string
  readonly space: LogicalSymbol['space']
  readonly owner_id: string | null
  readonly member_form: LogicalSymbol['memberForm'] | null
}

interface LogicalDeclarationRow {
  readonly logical_symbol_id: string
  readonly symbol_id: string
  readonly file_path: string
  readonly line: number
  readonly column_number: number
  readonly end_line: number | null
  readonly end_column: number | null
  readonly kind: LogicalDeclaration['declaration']['kind']
}

interface PublicBindingRow {
  readonly id: string
  readonly surface: string
  readonly exported_name: string
  readonly space: PublicBinding['space']
  readonly target_id: string | null
}

interface LocalBindingRow {
  readonly id: string
  readonly file_path: string
  readonly scope_id: string
  readonly local_name: string
  readonly space: LocalBinding['space']
  readonly target_id: string | null
}

interface ResolutionStepRow {
  readonly from_id: string
  readonly to_id: string
  readonly kind: string
}

interface IndexCoverageRow {
  readonly file_path: string
  readonly content_hash: string | null
  readonly status: string
  readonly reason: string | null
  readonly capabilities_json: string
}

interface IndexedInputObservationRow {
  readonly workspace: string
  readonly resource_kind: IndexedInputObservation['resourceKind']
  readonly resource_id: string
  readonly input_kind: IndexedInputObservation['inputKind']
  readonly input_locator: string
  readonly indexed_content_hash: string
  readonly last_observed_mtime: number | null
  readonly last_observed_size: number | null
  readonly last_observed_revision: string | null
  readonly generation: string
  readonly stale: number
}

interface ExpandedIdentitySearchQuery {
  readonly normalizedQuery: string
  readonly rawTokens: readonly string[]
  readonly expandedTokens: readonly string[]
  readonly ftsQuery: string
}

interface IdentityRankingSqlOptions {
  readonly canonicalExpr: string
  readonly canonicalComponentsExpr: string
  readonly alternateExpr?: string
  readonly alternateComponentsExpr?: string
  readonly normalizedQuery: string
  readonly rawTokens: readonly string[]
  readonly expandedTokens: readonly string[]
}

interface IdentityRankingSql {
  readonly selectSql: string
  readonly params: string[]
}

interface IdentityCandidatePredicateSql {
  readonly sql: string
  readonly params: string[]
}

/**
 * SQLite-backed GraphStore implementation.
 */
export class SQLiteGraphStore extends GraphStore {
  private static readonly SQLITE_BUSY_TIMEOUT_MS = 5000
  private db: SqliteDatabase | undefined
  private _lastIndexedAt: string | undefined
  private _lastIndexedRef: string | null = null
  private _graphFingerprint: string | null = null
  private readonly preparedStatements = new Map<string, SqliteStatement>()

  private readonly graphDir: string
  private readonly tmpDir: string
  private readonly dbPath: string
  private readonly loadDatabaseModule: () => Promise<SqliteDatabaseModule>
  private bulkSessionActive = false

  /**
   * Creates a new SQLite-backed graph store under the provided storage root.
   *
   * @param storagePath - Root path owning `graph/` and `tmp/` directories.
   * @param options - Optional runtime overrides for database-module loading.
   * @param options.loadDatabaseModule - Lazy loader for the SQLite runtime module.
   */
  constructor(
    storagePath: string,
    options?: {
      readonly loadDatabaseModule?: (() => Promise<SqliteDatabaseModule>) | undefined
    },
  ) {
    super(storagePath)
    this.graphDir = join(storagePath, 'graph')
    this.tmpDir = join(storagePath, 'tmp')
    this.dbPath = join(this.graphDir, 'code-graph.sqlite')
    this.loadDatabaseModule =
      options?.loadDatabaseModule ??
      (async () => (await import('better-sqlite3')) as unknown as SqliteDatabaseModule)
  }

  async open(): Promise<void> {
    if (this.db !== undefined) return
    mkdirSync(this.graphDir, { recursive: true })
    mkdirSync(this.tmpDir, { recursive: true })

    ensureStorageGeneration(this.storagePath)
    const DatabaseModule = (await this.loadDatabaseModule()).default
    const db = new DatabaseModule(this.dbPath) as SqliteDatabase
    try {
      this.assertExistingSchemaCompatible(db)
      this.configureDatabase(db)
      this.db = db
      this.ensureSchemaVersion()
    } catch (error) {
      if (db.open) db.close()
      this.db = undefined
      throw error
    }
    this.loadMetadata()
  }

  async close(): Promise<void> {
    if (this.db === undefined) return
    this.db.close()
    this.db = undefined
    this.preparedStatements.clear()
  }

  async upsertFile(file: FileNode, symbols: SymbolNode[], relations: Relation[]): Promise<void> {
    const db = this.ensureOpen()
    const tx = db.transaction(() => {
      this.deleteFileLocalState(db, file.path)
      this.insertFile(db, file)
      this.insertSymbols(db, symbols)
      this.insertRelations(db, relations)
      this.refreshFileContentFtsEntry(db, file)
      this.touchIndexTimestamp(db)
    })
    tx()
  }

  async removeFile(filePath: string): Promise<void> {
    const db = this.ensureOpen()
    db.transaction(() => {
      this.deleteFileLocalState(db, filePath)
      this.touchIndexTimestamp(db)
    })()
  }

  async upsertDocument(_document: DocumentNode): Promise<void> {
    const db = this.ensureOpen()
    db.transaction(() => {
      this.insertDocument(db, _document)
      this.touchIndexTimestamp(db)
    })()
  }

  async removeDocument(documentPath: string): Promise<void> {
    const db = this.ensureOpen()
    db.transaction(() => {
      db.prepare('DELETE FROM documents WHERE path = ?').run(documentPath)
      this.touchIndexTimestamp(db)
    })()
  }

  async upsertSpec(spec: SpecNode, relations: Relation[]): Promise<void> {
    const db = this.ensureOpen()
    db.transaction(() => {
      this.deleteSpecLocalState(db, spec.specId)
      this.insertSpec(db, spec)
      this.insertRelations(db, relations)
    })()
  }

  async removeSpec(specId: string): Promise<void> {
    const db = this.ensureOpen()
    db.transaction(() => {
      this.deleteSpecLocalState(db, specId)
    })()
  }

  async removeSpecs(specIds: readonly string[]): Promise<void> {
    if (specIds.length === 0) return
    const db = this.ensureOpen()
    db.transaction(() => {
      for (const specId of specIds) {
        this.deleteSpecLocalState(db, specId)
      }
    })()
  }

  async addRelations(relations: Relation[]): Promise<void> {
    const db = this.ensureOpen()
    db.transaction(() => {
      this.insertRelations(db, relations)
    })()
  }

  /**
   * Begins one SQLite transaction-backed indexing generation.
   * @param metadata - Metadata committed with the indexed generation.
   * @returns A bounded chunk writer whose commit is atomic.
   * @throws When another bulk session is already active.
   */
  override beginBulkIndexSession(metadata: IndexWriteSessionMetadata = {}): IndexWriteSession {
    this.ensureOpen()
    if (this.bulkSessionActive) throw new Error('A bulk index session is already active')
    this.bulkSessionActive = true

    const files: FileNode[] = []
    const documents: DocumentNode[] = []
    const symbols: SymbolNode[] = []
    const specs: SpecNode[] = []
    const observations: IndexedInputObservation[] = []
    const relations = new Map<string, Relation>()
    const removedFiles = new Set<string>()
    const removedDocuments = new Set<string>()
    const removedSpecs = new Set<string>()
    let referenceFacts: ReferenceFactsWrite | undefined
    let finished = false
    const assertActive = (): void => {
      if (finished) throw new Error('Bulk index session is already finished')
    }
    const finish = (): void => {
      finished = true
      this.bulkSessionActive = false
    }

    return {
      writeFiles: (chunk) => {
        assertActive()
        files.push(...chunk)
        return Promise.resolve()
      },
      writeDocuments: (chunk) => {
        assertActive()
        documents.push(...chunk)
        return Promise.resolve()
      },
      writeSymbols: (chunk) => {
        assertActive()
        symbols.push(...chunk)
        return Promise.resolve()
      },
      writeSpecs: (chunk) => {
        assertActive()
        specs.push(...chunk)
        return Promise.resolve()
      },
      writeReferenceFacts: (chunk) => {
        assertActive()
        referenceFacts = mergeReferenceFactChunks(referenceFacts, chunk)
        return Promise.resolve()
      },
      writeObservations: (chunk) => {
        assertActive()
        observations.push(...chunk)
        return Promise.resolve()
      },
      writeRelations: (chunk) => {
        assertActive()
        for (const relation of chunk) {
          relations.set(sqliteRelationKey(relation), relation)
        }
        return Promise.resolve()
      },
      removeFiles: (paths) => {
        assertActive()
        for (const path of paths) removedFiles.add(path)
        return Promise.resolve()
      },
      removeDocuments: (paths) => {
        assertActive()
        for (const path of paths) removedDocuments.add(path)
        return Promise.resolve()
      },
      removeSpecs: (ids) => {
        assertActive()
        for (const id of ids) removedSpecs.add(id)
        return Promise.resolve()
      },
      commit: async () => {
        assertActive()
        const db = this.ensureOpen()
        const indexedAt = new Date().toISOString()
        try {
          db.transaction(() => {
            metadata.onProgress?.('cleanup')
            if (metadata.replaceCodeGraph === true) {
              db.prepare(`DELETE FROM relations WHERE type NOT IN (?, ?, ?)`).run(
                RelationType.DependsOn,
                RelationType.CoversFile,
                RelationType.CoversSymbol,
              )
              db.prepare('DELETE FROM symbols').run()
              db.prepare('DELETE FROM files').run()
              db.prepare('DELETE FROM documents').run()
            }
            for (const path of removedFiles) this.deleteFileLocalState(db, path)
            for (const path of removedDocuments) {
              db.prepare('DELETE FROM documents WHERE path = ?').run(path)
            }
            for (const id of removedSpecs) this.deleteSpecLocalState(db, id)

            metadata.onProgress?.('files')
            this.insertFiles(db, files)
            metadata.onProgress?.('documents')
            this.insertDocuments(db, documents)
            metadata.onProgress?.('symbols')
            this.insertSymbols(db, symbols)
            metadata.onProgress?.('specs')
            this.insertSpecs(db, specs)
            if (referenceFacts !== undefined) {
              metadata.onProgress?.('reference-facts')
              this.replaceReferenceFactsInTransaction(db, referenceFacts)
            }
            if (metadata.indexedWorkspaces !== undefined || observations.length > 0) {
              metadata.onProgress?.('observations')
              this.replaceIndexedInputObservations(
                db,
                observations,
                metadata.indexedWorkspaces ?? [],
                metadata.clearGraphStaleLatch === true,
              )
            }
            metadata.onProgress?.('relations')
            this.insertRelations(db, [...relations.values()])
            this.setMeta(db, 'lastIndexedAt', indexedAt)
            if (metadata.vcsRef !== undefined) {
              this.setMeta(db, 'lastIndexedRef', metadata.vcsRef)
            }
            if (metadata.graphFingerprint !== undefined) {
              this.setMeta(db, 'graphFingerprint', metadata.graphFingerprint)
            }
            if (metadata.rebuildSearchIndexes !== false) {
              metadata.onProgress?.('search-indexes')
              this.rebuildFtsIndexesInTransaction(db)
            }
          })()
          this._lastIndexedAt = indexedAt
          if (metadata.vcsRef !== undefined) this._lastIndexedRef = metadata.vcsRef
          if (metadata.graphFingerprint !== undefined) {
            this._graphFingerprint = metadata.graphFingerprint
          }
          finish()
        } catch (error) {
          finish()
          throw error
        }
      },
      rollback: () => {
        assertActive()
        finish()
        return Promise.resolve()
      },
    }
  }

  async bulkLoad(data: {
    files: FileNode[]
    documents?: DocumentNode[]
    symbols: SymbolNode[]
    specs: SpecNode[]
    relations: Relation[]
    onProgress?: (step: string) => void
    vcsRef?: string
    graphFingerprint?: string
    observations?: readonly IndexedInputObservation[]
    indexedWorkspaces?: readonly string[]
    clearGraphStaleLatch?: boolean
    rebuildSearchIndexes?: boolean
  }): Promise<void> {
    const db = this.ensureOpen()
    const tx = db.transaction(() => {
      data.onProgress?.('files')
      this.insertFiles(db, data.files)
      this.insertDocuments(db, data.documents ?? [])
      data.onProgress?.('documents')
      data.onProgress?.('symbols')
      this.insertSymbols(db, data.symbols)
      data.onProgress?.('specs')
      this.insertSpecs(db, data.specs)
      data.onProgress?.('relations')
      this.insertRelations(db, data.relations)
      this.touchIndexTimestamp(db)
      if (data.vcsRef !== undefined) {
        this.setMeta(db, 'lastIndexedRef', data.vcsRef)
        this._lastIndexedRef = data.vcsRef
      }
      if (data.graphFingerprint !== undefined) {
        this.setMeta(db, 'graphFingerprint', data.graphFingerprint)
        this._graphFingerprint = data.graphFingerprint
      }
      if (data.observations !== undefined) {
        this.replaceIndexedInputObservations(
          db,
          data.observations,
          data.indexedWorkspaces ?? [],
          data.clearGraphStaleLatch === true,
        )
      }
    })
    tx()
    if (data.rebuildSearchIndexes !== false) await this.rebuildFtsIndexes()
  }

  async getIndexedInputObservations(
    resources: readonly IndexedResourceKey[],
  ): Promise<readonly IndexedInputObservation[]> {
    if (resources.length === 0) return []
    const uniqueResources = [
      ...new Map(
        resources.map((resource) => [
          JSON.stringify([resource.workspace, resource.resourceKind, resource.resourceId]),
          resource,
        ]),
      ).values(),
    ]
    const rows: IndexedInputObservationRow[] = []
    for (let offset = 0; offset < uniqueResources.length; offset += 250) {
      const batch = uniqueResources.slice(offset, offset + 250)
      const clauses = batch.map(() => '(workspace = ? AND resource_kind = ? AND resource_id = ?)')
      const params = batch.flatMap((resource) => [
        resource.workspace,
        resource.resourceKind,
        resource.resourceId,
      ])
      rows.push(
        ...(this.statement(
          `SELECT * FROM indexed_input_observations WHERE ${clauses.join(' OR ')}`,
        ).all(...params) as IndexedInputObservationRow[]),
      )
    }
    return rows
      .map(toIndexedInputObservation)
      .sort((left, right) =>
        JSON.stringify([
          left.workspace,
          left.resourceKind,
          left.resourceId,
          left.inputKind,
          left.inputLocator,
        ]).localeCompare(
          JSON.stringify([
            right.workspace,
            right.resourceKind,
            right.resourceId,
            right.inputKind,
            right.inputLocator,
          ]),
        ),
      )
  }

  async markIndexedInputsStale(updates: readonly MarkIndexedInputStaleInput[]): Promise<void> {
    if (updates.length === 0) return
    const db = this.ensureOpen()
    const statement = db.prepare(
      `UPDATE indexed_input_observations SET stale = 1
       WHERE workspace = ? AND resource_kind = ? AND resource_id = ?
         AND input_kind = ? AND input_locator = ? AND indexed_content_hash = ?
         AND generation = ? AND COALESCE(last_observed_revision, '') = ?`,
    )
    db.transaction(() => {
      for (const update of updates) {
        statement.run(
          update.workspace,
          update.resourceKind,
          update.resourceId,
          update.inputKind,
          update.inputLocator,
          update.expectedIndexedContentHash,
          update.expectedGeneration,
          update.expectedRevision ?? '',
        )
      }
    })()
  }

  async updateIndexedInputObservations(
    updates: readonly UpdateIndexedInputObservationInput[],
  ): Promise<void> {
    if (updates.length === 0) return
    const db = this.ensureOpen()
    const statement = db.prepare(
      `UPDATE indexed_input_observations
       SET last_observed_mtime = ?, last_observed_size = ?
       WHERE workspace = ? AND resource_kind = ? AND resource_id = ?
         AND input_kind = ? AND input_locator = ? AND indexed_content_hash = ?
         AND generation = ? AND stale = 0 AND COALESCE(last_observed_revision, '') = ?`,
    )
    db.transaction(() => {
      for (const update of updates) {
        statement.run(
          update.lastObservedMtime,
          update.lastObservedSize,
          update.workspace,
          update.resourceKind,
          update.resourceId,
          update.inputKind,
          update.inputLocator,
          update.expectedIndexedContentHash,
          update.expectedGeneration,
          update.expectedRevision ?? '',
        )
      }
    })()
  }

  async getFreshnessLatches(workspaces: readonly string[]): Promise<FreshnessLatches> {
    const names = ['__graph__', ...new Set(workspaces)]
    const placeholders = names.map(() => '?').join(', ')
    const rows = this.statement(
      `SELECT workspace, known_stale FROM freshness_latches WHERE workspace IN (${placeholders})`,
    ).all(...names) as Array<{ workspace: string; known_stale: number }>
    const values = new Map(rows.map((row) => [row.workspace, row.known_stale === 1]))
    return {
      graph: values.get('__graph__') ?? false,
      workspaces: Object.fromEntries(
        workspaces.map((workspace) => [workspace, values.get(workspace) ?? false]),
      ),
    }
  }

  async markWorkspacesAndGraphStaleSinceLastIndex(workspaces: readonly string[]): Promise<void> {
    const db = this.ensureOpen()
    const statement = db.prepare(
      `INSERT INTO freshness_latches (workspace, known_stale) VALUES (?, 1)
       ON CONFLICT(workspace) DO UPDATE SET known_stale = 1`,
    )
    db.transaction(() => {
      statement.run('__graph__')
      for (const workspace of new Set(workspaces)) statement.run(workspace)
    })()
  }

  async replaceReferenceFacts(facts: ReferenceFactsWrite): Promise<void> {
    const db = this.ensureOpen()
    db.transaction(() => {
      db.prepare('DELETE FROM resolution_steps').run()
      db.prepare('DELETE FROM local_bindings').run()
      db.prepare('DELETE FROM public_bindings').run()
      db.prepare('DELETE FROM logical_declarations').run()
      db.prepare('DELETE FROM logical_symbols').run()
      db.prepare('DELETE FROM index_coverage').run()

      const logicalInsert = db.prepare(
        `INSERT INTO logical_symbols (id, workspace, surface, name, space, owner_id, member_form)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const symbol of facts.logicalSymbols) {
        logicalInsert.run(
          symbol.id,
          symbol.workspace,
          symbol.surface,
          symbol.name,
          symbol.space,
          symbol.ownerId ?? null,
          symbol.memberForm ?? null,
        )
      }

      const declarationInsert = db.prepare(
        `INSERT INTO logical_declarations (
          logical_symbol_id, symbol_id, file_path, line, column_number, end_line, end_column, kind
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const { logicalSymbolId, declaration } of facts.declarations) {
        declarationInsert.run(
          logicalSymbolId,
          declaration.symbolId,
          declaration.location.filePath,
          declaration.location.line,
          declaration.location.column,
          declaration.location.endLine ?? null,
          declaration.location.endColumn ?? null,
          declaration.kind,
        )
      }

      const publicInsert = db.prepare(
        'INSERT INTO public_bindings (id, surface, exported_name, space, target_id) VALUES (?, ?, ?, ?, ?)',
      )
      for (const binding of facts.publicBindings) {
        publicInsert.run(
          binding.id,
          binding.surface,
          binding.exportedName,
          binding.space,
          binding.targetId ?? null,
        )
      }

      const localInsert = db.prepare(
        'INSERT INTO local_bindings (id, file_path, scope_id, local_name, space, target_id) VALUES (?, ?, ?, ?, ?, ?)',
      )
      for (const binding of facts.localBindings) {
        localInsert.run(
          binding.id,
          binding.filePath,
          binding.scopeId,
          binding.localName,
          binding.space,
          binding.targetId ?? null,
        )
      }

      const stepInsert = db.prepare(
        'INSERT INTO resolution_steps (from_id, to_id, kind) VALUES (?, ?, ?)',
      )
      for (const step of facts.steps) stepInsert.run(step.fromId, step.toId, step.kind)

      const coverageInsert = db.prepare(
        'INSERT INTO index_coverage (file_path, content_hash, status, reason, capabilities_json) VALUES (?, ?, ?, ?, ?)',
      )
      for (const coverage of facts.coverage) {
        coverageInsert.run(
          coverage.filePath,
          coverage.contentHash ?? null,
          coverage.status,
          coverage.reason ?? null,
          JSON.stringify(coverage.capabilities),
        )
      }
    })()
    await this.rebuildFtsIndexes()
  }

  /**
   * Replaces semantic reference tables inside the caller-owned transaction.
   * @param db - Open SQLite transaction owner.
   * @param facts - Complete semantic-fact replacement snapshot.
   */
  private replaceReferenceFactsInTransaction(db: SqliteDatabase, facts: ReferenceFactsWrite): void {
    db.prepare('DELETE FROM resolution_steps').run()
    db.prepare('DELETE FROM local_bindings').run()
    db.prepare('DELETE FROM public_bindings').run()
    db.prepare('DELETE FROM logical_declarations').run()
    db.prepare('DELETE FROM logical_symbols').run()
    db.prepare('DELETE FROM index_coverage').run()

    executeBatchedInsert(
      db,
      'INSERT INTO logical_symbols (id, workspace, surface, name, space, owner_id, member_form)',
      facts.logicalSymbols.map((symbol) => [
        symbol.id,
        symbol.workspace,
        symbol.surface,
        symbol.name,
        symbol.space,
        symbol.ownerId ?? null,
        symbol.memberForm ?? null,
      ]),
    )

    executeBatchedInsert(
      db,
      `INSERT INTO logical_declarations (
        logical_symbol_id, symbol_id, file_path, line, column_number, end_line, end_column, kind
      )`,
      facts.declarations.map(({ logicalSymbolId, declaration }) => [
        logicalSymbolId,
        declaration.symbolId,
        declaration.location.filePath,
        declaration.location.line,
        declaration.location.column,
        declaration.location.endLine ?? null,
        declaration.location.endColumn ?? null,
        declaration.kind,
      ]),
    )

    executeBatchedInsert(
      db,
      'INSERT INTO public_bindings (id, surface, exported_name, space, target_id)',
      facts.publicBindings.map((binding) => [
        binding.id,
        binding.surface,
        binding.exportedName,
        binding.space,
        binding.targetId ?? null,
      ]),
    )

    executeBatchedInsert(
      db,
      'INSERT INTO local_bindings (id, file_path, scope_id, local_name, space, target_id)',
      facts.localBindings.map((binding) => [
        binding.id,
        binding.filePath,
        binding.scopeId,
        binding.localName,
        binding.space,
        binding.targetId ?? null,
      ]),
    )

    executeBatchedInsert(
      db,
      'INSERT INTO resolution_steps (from_id, to_id, kind)',
      facts.steps.map((step) => [step.fromId, step.toId, step.kind]),
    )

    executeBatchedInsert(
      db,
      'INSERT INTO index_coverage (file_path, content_hash, status, reason, capabilities_json)',
      facts.coverage.map((coverage) => [
        coverage.filePath,
        coverage.contentHash ?? null,
        coverage.status,
        coverage.reason ?? null,
        JSON.stringify(coverage.capabilities),
      ]),
    )
  }

  async findLogicalSymbols(lookups: readonly LogicalSymbolLookup[]): Promise<LogicalSymbol[]> {
    if (lookups.length === 0) return []
    const rows = this.statement(
      `SELECT id, workspace, surface, name, space, owner_id, member_form FROM logical_symbols
       WHERE workspace = ? AND name = ?
         AND (? IS NULL OR surface = ?)
         AND (? IS NULL OR space = ?)
         AND (? IS NULL OR owner_id = ?)
         AND (? IS NULL OR member_form = ?)`,
    )
    const results = new Map<string, LogicalSymbol>()
    for (const lookup of lookups) {
      for (const row of rows.all(
        lookup.workspace,
        lookup.name,
        lookup.surface ?? null,
        lookup.surface ?? null,
        lookup.space ?? null,
        lookup.space ?? null,
        lookup.ownerId ?? null,
        lookup.ownerId ?? null,
        lookup.memberForm ?? null,
        lookup.memberForm ?? null,
      ) as LogicalSymbolRow[]) {
        const symbol = this.mapLogicalSymbolRow(row)
        results.set(symbol.id, symbol)
      }
    }
    return [...results.values()].sort(compareLogicalSymbols)
  }

  async getAllReferenceFacts(): Promise<ReferenceFactsWrite> {
    const logicalSymbols = (
      this.statement(
        'SELECT id, workspace, surface, name, space, owner_id, member_form FROM logical_symbols',
      ).all() as LogicalSymbolRow[]
    )
      .map((row) => this.mapLogicalSymbolRow(row))
      .sort(compareLogicalSymbols)
    const declarations = (
      this.statement(
        'SELECT logical_symbol_id, symbol_id, file_path, line, column_number, end_line, end_column, kind FROM logical_declarations',
      ).all() as LogicalDeclarationRow[]
    )
      .map((row) => this.mapLogicalDeclarationRow(row))
      .sort(compareLogicalDeclarations)
    const publicBindings = (
      this.statement(
        'SELECT id, surface, exported_name, space, target_id FROM public_bindings',
      ).all() as PublicBindingRow[]
    )
      .map((row) => this.mapPublicBindingRow(row))
      .sort(comparePublicBindings)
    const localBindings = (
      this.statement(
        'SELECT id, file_path, scope_id, local_name, space, target_id FROM local_bindings',
      ).all() as LocalBindingRow[]
    )
      .map((row) => this.mapLocalBindingRow(row))
      .sort(compareLocalBindings)
    const steps = (
      this.statement(
        'SELECT from_id, to_id, kind FROM resolution_steps',
      ).all() as ResolutionStepRow[]
    )
      .map((row) => ({ fromId: row.from_id, toId: row.to_id, kind: row.kind }))
      .sort(compareResolutionSteps)
    return {
      logicalSymbols,
      declarations,
      publicBindings,
      localBindings,
      steps,
      coverage: await this.getAllIndexCoverage(),
    }
  }

  async findLogicalSymbolsByIds(ids: readonly string[]): Promise<LogicalSymbol[]> {
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(', ')
    const rows = this.statement(
      `SELECT id, workspace, surface, name, space, owner_id, member_form FROM logical_symbols WHERE id IN (${placeholders}) ORDER BY workspace, surface, name, space, owner_id, member_form, id`,
    ).all(...ids) as LogicalSymbolRow[]
    return rows.map((row) => this.mapLogicalSymbolRow(row))
  }

  async findDeclarations(logicalSymbolIds: readonly string[]): Promise<LogicalDeclaration[]> {
    if (logicalSymbolIds.length === 0) return []
    const placeholders = [...new Set(logicalSymbolIds)].map(() => '?').join(', ')
    const rows = this.statement(
      `SELECT logical_symbol_id, symbol_id, file_path, line, column_number, end_line, end_column, kind
       FROM logical_declarations WHERE logical_symbol_id IN (${placeholders})`,
    ).all(...new Set(logicalSymbolIds)) as LogicalDeclarationRow[]
    return rows.map((row) => this.mapLogicalDeclarationRow(row)).sort(compareLogicalDeclarations)
  }

  async findPublicBindings(lookups: readonly PublicBindingLookup[]): Promise<PublicBinding[]> {
    if (lookups.length === 0) return []
    const rows = this.statement(
      `SELECT id, surface, exported_name, space, target_id FROM public_bindings
       WHERE surface = ? AND exported_name = ? AND (? IS NULL OR space = ?)`,
    )
    const results = new Map<string, PublicBinding>()
    for (const lookup of lookups) {
      for (const row of rows.all(
        lookup.surface,
        lookup.exportedName,
        lookup.space ?? null,
        lookup.space ?? null,
      ) as PublicBindingRow[]) {
        const binding = this.mapPublicBindingRow(row)
        results.set(binding.id, binding)
      }
    }
    return [...results.values()].sort(comparePublicBindings)
  }

  async findPublicBindingsByExportedNames(
    exportedNames: readonly string[],
  ): Promise<PublicBinding[]> {
    const names = [...new Set(exportedNames)]
    if (names.length === 0) return []
    const placeholders = names.map(() => '?').join(', ')
    const rows = this.statement(
      `SELECT id, surface, exported_name, space, target_id FROM public_bindings
       WHERE exported_name IN (${placeholders})`,
    ).all(...names) as PublicBindingRow[]
    return rows.map((row) => this.mapPublicBindingRow(row)).sort(comparePublicBindings)
  }

  async findLocalBindings(lookups: readonly LocalBindingLookup[]): Promise<LocalBinding[]> {
    if (lookups.length === 0) return []
    const rows = this.statement(
      `SELECT id, file_path, scope_id, local_name, space, target_id FROM local_bindings
       WHERE file_path = ? AND local_name = ?
         AND (? IS NULL OR scope_id = ?)
         AND (? IS NULL OR space = ?)`,
    )
    const results = new Map<string, LocalBinding>()
    for (const lookup of lookups) {
      for (const row of rows.all(
        lookup.filePath,
        lookup.localName,
        lookup.scopeId ?? null,
        lookup.scopeId ?? null,
        lookup.space ?? null,
        lookup.space ?? null,
      ) as LocalBindingRow[]) {
        const binding = this.mapLocalBindingRow(row)
        results.set(binding.id, binding)
      }
    }
    return [...results.values()].sort(compareLocalBindings)
  }

  async findResolutionSteps(fromIds: readonly string[]): Promise<ResolutionStep[]> {
    if (fromIds.length === 0) return []
    const ids = [...new Set(fromIds)]
    const rows = this.statement(
      `SELECT from_id, to_id, kind FROM resolution_steps WHERE from_id IN (${ids.map(() => '?').join(', ')})`,
    ).all(...ids) as ResolutionStepRow[]
    return rows
      .map((row) => ({ fromId: row.from_id, toId: row.to_id, kind: row.kind }))
      .sort(compareResolutionSteps)
  }

  async findIndexCoverage(filePaths: readonly string[]): Promise<IndexCoverage[]> {
    if (filePaths.length === 0) return []
    const paths = [...new Set(filePaths)]
    const rows = this.statement(
      `SELECT file_path, content_hash, status, reason, capabilities_json FROM index_coverage
       WHERE file_path IN (${paths.map(() => '?').join(', ')})`,
    ).all(...paths) as IndexCoverageRow[]
    return rows
      .map((row) => ({
        filePath: row.file_path,
        contentHash: row.content_hash ?? undefined,
        status: row.status as IndexCoverage['status'],
        reason: row.reason ?? undefined,
        capabilities: JSON.parse(row.capabilities_json) as string[],
      }))
      .sort((left, right) => left.filePath.localeCompare(right.filePath))
  }

  async getAllIndexCoverage(): Promise<IndexCoverage[]> {
    const rows = this.statement(
      'SELECT file_path, content_hash, status, reason, capabilities_json FROM index_coverage ORDER BY file_path',
    ).all() as IndexCoverageRow[]
    return rows.map((row) => ({
      filePath: row.file_path,
      contentHash: row.content_hash ?? undefined,
      status: row.status as IndexCoverage['status'],
      reason: row.reason ?? undefined,
      capabilities: JSON.parse(row.capabilities_json) as string[],
    }))
  }

  async getFile(path: string): Promise<FileNode | undefined> {
    const row = this.statement(
      'SELECT path, config_relative_path, language, content_hash, workspace, embedding, content FROM files WHERE path = ?',
    ).get(path) as
      | {
          path: string
          config_relative_path: string
          language: string
          content_hash: string
          workspace: string
          embedding: Buffer | null
          content: string | null
        }
      | undefined
    return row === undefined ? undefined : this.mapFileRow(row)
  }

  async getDocument(path: string): Promise<DocumentNode | undefined> {
    const row = this.statement(
      'SELECT path, config_relative_path, content_hash, content, workspace FROM documents WHERE path = ?',
    ).get(path) as
      | {
          path: string
          config_relative_path: string
          content_hash: string
          content: string
          workspace: string
        }
      | undefined
    return row === undefined ? undefined : this.mapDocumentRow(row)
  }

  async findFilesByConfigRelativePath(configRelativePath: string): Promise<FileNode[]> {
    const rows = this.statement(
      'SELECT path, config_relative_path, language, content_hash, workspace, embedding, content FROM files WHERE config_relative_path = ?',
    ).all(configRelativePath) as Array<{
      path: string
      config_relative_path: string
      language: string
      content_hash: string
      workspace: string
      embedding: Buffer | null
      content: string | null
    }>
    return rows.map((row) => this.mapFileRow(row))
  }

  async findDocumentsByConfigRelativePath(configRelativePath: string): Promise<DocumentNode[]> {
    const rows = this.statement(
      'SELECT path, config_relative_path, content_hash, content, workspace FROM documents WHERE config_relative_path = ?',
    ).all(configRelativePath) as Array<{
      path: string
      config_relative_path: string
      content_hash: string
      content: string
      workspace: string
    }>
    return rows.map((row) => this.mapDocumentRow(row))
  }

  async getSymbol(id: string): Promise<SymbolNode | undefined> {
    const row = this.statement(
      'SELECT id, name, kind, file_path, parent_id, line, column_number, end_line, end_column, selection_start_line, selection_start_column, selection_end_line, selection_end_column, comment FROM symbols WHERE id = ?',
    ).get(id) as
      | {
          id: string
          name: string
          kind: string
          file_path: string
          parent_id: string | null
          line: number
          column_number: number
          end_line: number
          end_column: number
          selection_start_line: number
          selection_start_column: number
          selection_end_line: number
          selection_end_column: number
          comment: string | null
        }
      | undefined
    return row === undefined ? undefined : this.mapSymbolRow(row)
  }

  async getSpec(specId: string): Promise<SpecNode | undefined> {
    const row = this.statement(
      'SELECT spec_id, path, title, description, content_hash, content, depends_on_json, workspace FROM specs WHERE spec_id = ?',
    ).get(specId) as
      | {
          spec_id: string
          path: string
          title: string
          description: string
          content_hash: string
          content: string
          depends_on_json: string
          workspace: string
        }
      | undefined
    return row === undefined ? undefined : this.mapSpecRow(row)
  }

  async getCallers(symbolId: string): Promise<Relation[]> {
    return this.getRelationsByTargetTypes(SYMBOL_DEPENDENCY_RELATION_TYPES, symbolId)
  }

  async getCallees(symbolId: string): Promise<Relation[]> {
    return this.getRelationsBySourceTypes(SYMBOL_DEPENDENCY_RELATION_TYPES, symbolId)
  }

  async getImporters(filePath: string): Promise<Relation[]> {
    return this.getRelationsByTarget(RelationType.Imports, filePath)
  }

  async getImportees(filePath: string): Promise<Relation[]> {
    return this.getRelationsBySource(RelationType.Imports, filePath)
  }

  async findDirectlyAffectedFiles(filePaths: readonly string[]): Promise<string[]> {
    const paths = [...new Set(filePaths)]
    if (paths.length === 0) return []
    const placeholders = paths.map(() => '?').join(', ')
    const dependencyTypes = [
      ...SYMBOL_DEPENDENCY_RELATION_TYPES,
      RelationType.Extends,
      RelationType.Implements,
      RelationType.Overrides,
    ]
    const typePlaceholders = dependencyTypes.map(() => '?').join(', ')
    const rows = this.statement(
      `SELECT DISTINCT affected_path FROM (
         SELECT r.source AS affected_path
         FROM relations r
         WHERE r.type = ? AND r.target IN (${placeholders})
         UNION
         SELECT source_symbol.file_path AS affected_path
         FROM relations r
         JOIN symbols target_symbol ON target_symbol.id = r.target
         JOIN symbols source_symbol ON source_symbol.id = r.source
         WHERE target_symbol.file_path IN (${placeholders})
           AND r.type IN (${typePlaceholders})
       ) ORDER BY affected_path`,
    ).all(RelationType.Imports, ...paths, ...paths, ...dependencyTypes) as Array<{
      affected_path: string
    }>
    return rows.map((row) => row.affected_path)
  }

  async getExtenders(symbolId: string): Promise<Relation[]> {
    return this.getRelationsByTarget(RelationType.Extends, symbolId)
  }

  async getExtendedTargets(symbolId: string): Promise<Relation[]> {
    return this.getRelationsBySource(RelationType.Extends, symbolId)
  }

  async getImplementors(symbolId: string): Promise<Relation[]> {
    return this.getRelationsByTarget(RelationType.Implements, symbolId)
  }

  async getImplementedTargets(symbolId: string): Promise<Relation[]> {
    return this.getRelationsBySource(RelationType.Implements, symbolId)
  }

  async getOverriders(symbolId: string): Promise<Relation[]> {
    return this.getRelationsByTarget(RelationType.Overrides, symbolId)
  }

  async getOverriddenTargets(symbolId: string): Promise<Relation[]> {
    return this.getRelationsBySource(RelationType.Overrides, symbolId)
  }

  async getSpecDependencies(specId: string): Promise<Relation[]> {
    return this.getRelationsBySource(RelationType.DependsOn, specId)
  }

  async getSpecDependents(specId: string): Promise<Relation[]> {
    return this.getRelationsByTarget(RelationType.DependsOn, specId)
  }

  async getCoveredFiles(specId: string): Promise<Relation[]> {
    return this.getRelationsBySource(RelationType.CoversFile, specId)
  }

  async getCoveringSpecsForFile(filePath: string): Promise<Relation[]> {
    return this.getRelationsByTarget(RelationType.CoversFile, filePath)
  }

  async getCoveringSpecsForFiles(filePaths: readonly string[]): Promise<Relation[]> {
    return this.getRelationsByTargets(RelationType.CoversFile, filePaths)
  }

  async getCoveredSymbols(specId: string): Promise<Relation[]> {
    return this.getRelationsBySource(RelationType.CoversSymbol, specId)
  }

  async getCoveringSpecsForSymbol(symbolId: string): Promise<Relation[]> {
    return this.getRelationsByTarget(RelationType.CoversSymbol, symbolId)
  }

  async getCoveringSpecsForSymbols(symbolIds: readonly string[]): Promise<Relation[]> {
    return this.getRelationsByTargets(RelationType.CoversSymbol, symbolIds)
  }

  async getExportedSymbols(filePath: string): Promise<SymbolNode[]> {
    const rows = this.statement(
      `
        SELECT
          s.id,
          s.name,
          s.kind,
          s.file_path,
          s.parent_id,
          s.line,
          s.column_number,
          s.end_line,
          s.end_column,
          s.selection_start_line,
          s.selection_start_column,
          s.selection_end_line,
          s.selection_end_column,
          s.comment
        FROM symbols s
        INNER JOIN relations r
          ON r.target = s.id
        WHERE r.type = ? AND r.source = ?
      `,
    ).all(RelationType.Exports, filePath) as Array<{
      id: string
      name: string
      kind: string
      file_path: string
      parent_id: string | null
      line: number
      column_number: number
      end_line: number
      end_column: number
      selection_start_line: number
      selection_start_column: number
      selection_end_line: number
      selection_end_column: number
      comment: string | null
    }>
    return rows.map((row) => this.mapSymbolRow(row))
  }

  async findSymbols(query: SymbolQuery): Promise<SymbolNode[]> {
    const conditions: string[] = []
    const params: unknown[] = []
    const needsFilePathPatternFilter = query.filePath !== undefined && query.filePath.includes('*')
    const needsNamePatternFilter = query.name !== undefined && query.name.includes('*')
    const caseSensitive = query.caseSensitive === true

    if (query.kind !== undefined) {
      conditions.push('kind = ?')
      params.push(query.kind)
    }

    if (query.workspace !== undefined) {
      conditions.push('file_path LIKE ?')
      params.push(`${query.workspace}:%`)
    }

    if (query.filePath !== undefined && !needsFilePathPatternFilter) {
      conditions.push('file_path = ?')
      params.push(query.filePath)
    }

    if (query.filePaths !== undefined && query.filePaths.length > 0) {
      conditions.push(`file_path IN (${query.filePaths.map(() => '?').join(', ')})`)
      params.push(...query.filePaths)
    }

    if (query.parentSymbolId !== undefined) {
      conditions.push('parent_id = ?')
      params.push(query.parentSymbolId)
    }

    if (query.name !== undefined && !needsNamePatternFilter) {
      if (caseSensitive) {
        conditions.push('name = ?')
        params.push(query.name)
      } else {
        conditions.push('name = ? COLLATE NOCASE')
        params.push(query.name)
      }
    }

    if (query.comment !== undefined) {
      if (caseSensitive) {
        conditions.push("instr(COALESCE(comment, ''), ?) > 0")
        params.push(query.comment)
      } else {
        conditions.push("instr(lower(COALESCE(comment, '')), lower(?)) > 0")
        params.push(query.comment)
      }
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
    const rows = this.statement(
      `SELECT id, name, kind, file_path, parent_id, line, column_number, end_line, end_column, selection_start_line, selection_start_column, selection_end_line, selection_end_column, comment FROM symbols${where}`,
    ).all(...params) as Array<{
      id: string
      name: string
      kind: string
      file_path: string
      parent_id: string | null
      line: number
      column_number: number
      end_line: number
      end_column: number
      selection_start_line: number
      selection_start_column: number
      selection_end_line: number
      selection_end_column: number
      comment: string | null
    }>

    let results = rows.map((row) => this.mapSymbolRow(row))
    const ci = !caseSensitive

    if (needsFilePathPatternFilter && query.filePath !== undefined) {
      if (query.filePath.includes('*')) {
        const pattern = new RegExp(
          '^' + query.filePath.replaceAll('.', '\\.').replaceAll('*', '.*') + '$',
        )
        results = results.filter((symbol) => pattern.test(symbol.filePath))
      }
    }

    if (needsNamePatternFilter && query.name !== undefined) {
      if (query.name.includes('*')) {
        const pattern = new RegExp(
          '^' + query.name.replaceAll('.', '\\.').replaceAll('*', '.*') + '$',
          ci ? 'i' : '',
        )
        results = results.filter((symbol) => pattern.test(symbol.name))
      }
    }

    return results
  }

  async getStatistics(): Promise<GraphStatistics> {
    const db = this.ensureOpen()
    const fileCount = this.readCount(db, 'SELECT COUNT(*) AS count FROM files')
    const documentCount = this.readCount(db, 'SELECT COUNT(*) AS count FROM documents')
    const symbolCount = this.readCount(db, 'SELECT COUNT(*) AS count FROM symbols')
    const specCount = this.readCount(db, 'SELECT COUNT(*) AS count FROM specs')
    const languages = (
      db.prepare('SELECT DISTINCT language FROM files ORDER BY language').all() as Array<{
        language: string
      }>
    ).map((row) => row.language)

    const relationCounts = {} as Record<RelationTypeValue, number>
    for (const type of Object.values(RelationType)) {
      relationCounts[type] = this.readCount(
        db,
        'SELECT COUNT(DISTINCT source || char(31) || target || char(31) || type) AS count FROM relations WHERE type = ?',
        type,
      )
    }

    return {
      fileCount,
      documentCount,
      symbolCount,
      specCount,
      relationCounts,
      languages,
      lastIndexedAt: this._lastIndexedAt,
      lastIndexedRef: this._lastIndexedRef,
      graphFingerprint: this._graphFingerprint,
    }
  }

  async getAllFiles(): Promise<FileNode[]> {
    const rows = this.ensureOpen()
      .prepare(
        'SELECT path, config_relative_path, language, content_hash, workspace, embedding, content FROM files',
      )
      .all() as Array<{
      path: string
      config_relative_path: string
      language: string
      content_hash: string
      workspace: string
      embedding: Buffer | null
      content: string | null
    }>
    return rows.map((row) => this.mapFileRow(row))
  }

  async getAllDocuments(): Promise<DocumentNode[]> {
    const rows = this.ensureOpen()
      .prepare('SELECT path, config_relative_path, content_hash, content, workspace FROM documents')
      .all() as Array<{
      path: string
      config_relative_path: string
      content_hash: string
      content: string
      workspace: string
    }>
    return rows.map((row) => this.mapDocumentRow(row))
  }

  async getAllSpecs(): Promise<SpecNode[]> {
    const rows = this.ensureOpen()
      .prepare(
        'SELECT spec_id, path, title, description, content_hash, content, depends_on_json, workspace FROM specs',
      )
      .all() as Array<{
      spec_id: string
      path: string
      title: string
      description: string
      content_hash: string
      content: string
      depends_on_json: string
      workspace: string
    }>
    return rows.map((row) => this.mapSpecRow(row))
  }

  async searchSymbols(options: SearchOptions): Promise<
    Array<{
      symbol: SymbolNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }>
  > {
    const query = prepareExpandedSearchQuery(options.query)
    if (query.ftsQuery.length === 0) return []

    const ranking = buildIdentityRankingSql({
      canonicalExpr: 'lower(s.name)',
      canonicalComponentsExpr: buildIdentityComponentsExpr('lower(s.name)'),
      alternateExpr: 'lower(s.name)',
      alternateComponentsExpr: buildIdentityComponentsExpr('lower(s.name)'),
      normalizedQuery: query.normalizedQuery,
      rawTokens: query.rawTokens,
      expandedTokens: query.expandedTokens,
    })
    const identityCandidates = buildIdentityCandidatePredicateSql({
      canonicalExpr: 'lower(s.name)',
      canonicalComponentsExpr: buildIdentityComponentsExpr('lower(s.name)'),
      alternateExpr: 'lower(s.name)',
      alternateComponentsExpr: buildIdentityComponentsExpr('lower(s.name)'),
      expandedTokens: query.expandedTokens,
    })
    const rows = this.ensureOpen()
      .prepare(
        `
          WITH raw_candidates AS (
            SELECT
              s.id,
              (-bm25(symbol_fts)) AS text_score
            FROM symbol_fts
            INNER JOIN symbols s ON s.id = symbol_fts.id
            WHERE symbol_fts MATCH ?

            UNION ALL

            SELECT
              s.id,
              0.0 AS text_score
            FROM symbols s
            WHERE ${identityCandidates.sql}
          ),
          candidates AS (
            SELECT id, max(text_score) AS text_score
            FROM raw_candidates
            GROUP BY id
          )
          SELECT
            s.id,
            s.name,
            s.kind,
            s.file_path,
            s.parent_id,
            s.line,
            s.column_number,
            s.end_line,
            s.end_column,
            s.selection_start_line,
            s.selection_start_column,
            s.selection_end_line,
            s.selection_end_column,
            s.comment,
            f.content AS file_content,
            ${ranking.selectSql},
            c.text_score
          FROM candidates c
          INNER JOIN symbols s ON s.id = c.id
          LEFT JOIN files f ON s.file_path = f.path
          ORDER BY identity_tier DESC, identity_token_hits DESC, identity_match_strength DESC, text_score DESC
        `,
      )
      .all(query.ftsQuery, ...identityCandidates.params, ...ranking.params) as Array<{
      id: string
      name: string
      kind: string
      file_path: string
      parent_id: string | null
      line: number
      column_number: number
      end_line: number
      end_column: number
      selection_start_line: number
      selection_start_column: number
      selection_end_line: number
      selection_end_column: number
      comment: string | null
      file_content: string | null
      identity_tier: number
      identity_token_hits: number
      identity_match_strength: number
      text_score: number
    }>

    const filtered = rows.filter((row) => {
      if (options.kinds && options.kinds.length > 0 && !options.kinds.includes(row.kind as never)) {
        return false
      }
      if (options.filePattern !== undefined) {
        const pattern = new RegExp(
          '^' + options.filePattern.replaceAll('.', '\\.').replaceAll('*', '.*') + '$',
          'i',
        )
        if (!pattern.test(row.file_path)) return false
      }
      if (options.workspace !== undefined && !row.file_path.startsWith(options.workspace + ':')) {
        return false
      }
      if (options.excludeWorkspaces !== undefined) {
        const wsName = row.file_path.substring(0, row.file_path.indexOf(':'))
        if (options.excludeWorkspaces.includes(wsName)) return false
      }
      return !matchesExclude(row.file_path, options.excludePaths, options.excludeWorkspaces)
    })

    return filtered.slice(0, options.limit ?? 20).map((row) => {
      let snippet = ''
      let startLine = 1
      let endLine = 1

      if (row.file_content !== null) {
        const lines = row.file_content.split(/\r?\n/)
        const targetLine = row.line - 1 // 1-based to 0-based

        // Expand upwards for 2 non-blank lines
        let start = targetLine
        let nonBlankAbove = 0
        while (start > 0 && nonBlankAbove < 2) {
          start--
          if (lines[start]?.trim().length !== 0) nonBlankAbove++
        }

        // Expand downwards for 2 non-blank lines
        let end = targetLine
        let nonBlankBelow = 0
        while (end < lines.length - 1 && nonBlankBelow < 2) {
          end++
          if (lines[end]?.trim().length !== 0) nonBlankBelow++
        }

        // Trim external leading/trailing blank lines of the final range
        while (start < end && lines[start]?.trim().length === 0) start++
        while (end > start && lines[end]?.trim().length === 0) end--

        snippet = lines.slice(start, end + 1).join('\n')
        startLine = start + 1
        endLine = end + 1
      }

      return {
        symbol: this.mapSymbolRow(row),
        score: composeIdentitySearchScore(
          row.identity_tier,
          row.identity_token_hits,
          row.identity_match_strength,
          row.text_score,
        ),
        snippet,
        startLine,
        endLine,
      }
    })
  }

  async searchSpecs(
    options: SearchOptions,
  ): Promise<
    Array<{ spec: SpecNode; score: number; snippet: string; startLine: number; endLine: number }>
  > {
    const query = prepareExpandedSearchQuery(options.query)
    if (query.ftsQuery.length === 0) return []

    const ranking = buildIdentityRankingSql({
      canonicalExpr: 'lower(s.spec_id)',
      canonicalComponentsExpr: buildIdentityComponentsExpr('lower(s.spec_id)'),
      normalizedQuery: query.normalizedQuery,
      rawTokens: query.rawTokens,
      expandedTokens: query.expandedTokens,
    })
    const identityCandidates = buildIdentityCandidatePredicateSql({
      canonicalExpr: 'lower(s.spec_id)',
      canonicalComponentsExpr: buildIdentityComponentsExpr('lower(s.spec_id)'),
      expandedTokens: query.expandedTokens,
    })
    const rows = this.ensureOpen()
      .prepare(
        `
          WITH raw_candidates AS (
            SELECT
              s.spec_id,
              (-bm25(spec_fts)) AS text_score,
              snippet(spec_fts, 3, '', '', '...', 32) AS snippet
            FROM spec_fts
            INNER JOIN specs s ON s.spec_id = spec_fts.spec_id
            WHERE spec_fts MATCH ?

            UNION ALL

            SELECT
              s.spec_id,
              0.0 AS text_score,
              '' AS snippet
            FROM specs s
            WHERE ${identityCandidates.sql}
          ),
          candidates AS (
            SELECT spec_id, max(text_score) AS text_score, max(snippet) AS snippet
            FROM raw_candidates
            GROUP BY spec_id
          )
          SELECT
            s.spec_id,
            s.path,
            s.title,
            s.description,
            s.content_hash,
            s.content,
            s.depends_on_json,
            s.workspace,
            ${ranking.selectSql},
            c.text_score,
            c.snippet
          FROM candidates c
          INNER JOIN specs s ON s.spec_id = c.spec_id
          ORDER BY identity_tier DESC, identity_token_hits DESC, identity_match_strength DESC, text_score DESC
        `,
      )
      .all(query.ftsQuery, ...identityCandidates.params, ...ranking.params) as Array<{
      spec_id: string
      path: string
      title: string
      description: string
      content_hash: string
      content: string
      depends_on_json: string
      workspace: string
      identity_tier: number
      identity_token_hits: number
      identity_match_strength: number
      text_score: number
      snippet: string
    }>

    const filtered = rows.filter((row) => {
      if (options.workspace !== undefined && row.workspace !== options.workspace) return false
      if (options.excludeWorkspaces?.includes(row.workspace)) return false
      return !matchesExclude(row.path, options.excludePaths, options.excludeWorkspaces)
    })

    return filtered.slice(0, options.limit ?? 20).map((row) => {
      const { startLine, endLine } = this.calculateLineRange(row.content, row.snippet)
      return {
        spec: this.mapSpecRow(row),
        score: composeIdentitySearchScore(
          row.identity_tier,
          row.identity_token_hits,
          row.identity_match_strength,
          row.text_score,
        ),
        snippet: row.snippet,
        startLine,
        endLine,
      }
    })
  }

  async searchDocuments(options: SearchOptions): Promise<
    Array<{
      document: DocumentNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }>
  > {
    const query = prepareExpandedSearchQuery(options.query)
    if (query.ftsQuery.length === 0) return []

    const ranking = buildIdentityRankingSql({
      canonicalExpr: 'lower(d.path)',
      canonicalComponentsExpr: buildIdentityComponentsExpr('lower(d.path)'),
      alternateExpr: 'lower(d.config_relative_path)',
      alternateComponentsExpr: buildIdentityComponentsExpr('lower(d.config_relative_path)'),
      normalizedQuery: query.normalizedQuery,
      rawTokens: query.rawTokens,
      expandedTokens: query.expandedTokens,
    })
    const identityCandidates = buildIdentityCandidatePredicateSql({
      canonicalExpr: 'lower(d.path)',
      canonicalComponentsExpr: buildIdentityComponentsExpr('lower(d.path)'),
      alternateExpr: 'lower(d.config_relative_path)',
      alternateComponentsExpr: buildIdentityComponentsExpr('lower(d.config_relative_path)'),
      expandedTokens: query.expandedTokens,
    })
    const rows = this.ensureOpen()
      .prepare(
        `
          WITH raw_candidates AS (
            SELECT
              d.path,
              (-bm25(document_fts)) AS text_score,
              snippet(document_fts, 2, '', '', '...', 32) AS snippet
            FROM document_fts
            INNER JOIN documents d ON d.path = document_fts.path
            WHERE document_fts MATCH ?

            UNION ALL

            SELECT
              d.path,
              0.0 AS text_score,
              '' AS snippet
            FROM documents d
            WHERE ${identityCandidates.sql}
          ),
          candidates AS (
            SELECT path, max(text_score) AS text_score, max(snippet) AS snippet
            FROM raw_candidates
            GROUP BY path
          )
          SELECT
            d.path,
            d.config_relative_path,
            d.content_hash,
            d.content,
            d.workspace,
            ${ranking.selectSql},
            c.text_score,
            c.snippet
          FROM candidates c
          INNER JOIN documents d ON d.path = c.path
          ORDER BY identity_tier DESC, identity_token_hits DESC, identity_match_strength DESC, text_score DESC
        `,
      )
      .all(query.ftsQuery, ...identityCandidates.params, ...ranking.params) as Array<{
      path: string
      config_relative_path: string
      content_hash: string
      content: string
      workspace: string
      identity_tier: number
      identity_token_hits: number
      identity_match_strength: number
      text_score: number
      snippet: string
    }>

    const filtered = rows.filter((row) => {
      if (options.workspace !== undefined && row.workspace !== options.workspace) return false
      if (options.excludeWorkspaces?.includes(row.workspace)) return false
      return !matchesExclude(row.path, options.excludePaths, options.excludeWorkspaces)
    })

    return filtered.slice(0, options.limit ?? 20).map((row) => {
      const { startLine, endLine } = this.calculateLineRange(row.content, row.snippet)
      return {
        document: this.mapDocumentRow(row),
        score: composeIdentitySearchScore(
          row.identity_tier,
          row.identity_token_hits,
          row.identity_match_strength,
          row.text_score,
        ),
        snippet: row.snippet,
        startLine,
        endLine,
      }
    })
  }

  async searchSourceContentCandidates(
    query: SourceContentCandidateQuery,
  ): Promise<SourceContentCandidatePage> {
    const db = this.ensureOpen()
    const terms = [...new Set([query.normalizedQuery, ...query.rawTerms, ...query.expandedTerms])]
      .map((term) => term.trim().toLowerCase())
      .filter((term) => term.length > 0)
    if (terms.length === 0 || query.limit <= 0) return { candidates: [] }

    const parsedOffset = Number.parseInt(query.cursor ?? '0', 10)
    const offset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0
    const pageLimit = Math.min(query.limit, 512)
    const fetchLimit = pageLimit + 1
    const filters: string[] = []
    const filterParams: unknown[] = []
    if (query.workspace !== undefined) {
      filters.push('f.workspace = ?')
      filterParams.push(query.workspace)
    }
    if (query.filePattern !== undefined) {
      filters.push('lower(f.path) GLOB lower(?)')
      filterParams.push(query.filePattern)
    }
    if (query.excludeWorkspaces !== undefined && query.excludeWorkspaces.length > 0) {
      filters.push(`f.workspace NOT IN (${query.excludeWorkspaces.map(() => '?').join(', ')})`)
      filterParams.push(...query.excludeWorkspaces)
    }
    for (const pattern of query.excludePaths ?? []) {
      filters.push('lower(f.path) NOT GLOB lower(?)')
      filterParams.push(pattern)
    }
    const filterSql = filters.length === 0 ? '' : ` AND ${filters.join(' AND ')}`
    const longTerms = terms.filter((term) => term.length >= 3)
    const rows =
      longTerms.length > 0
        ? (db
            .prepare(
              `
                SELECT
                  f.path,
                  f.config_relative_path,
                  f.language,
                  f.content_hash,
                  f.workspace,
                  f.embedding,
                  f.content,
                  (-bm25(file_content_fts)) AS backend_score
                FROM file_content_fts
                INNER JOIN files f ON f.path = file_content_fts.path
                WHERE file_content_fts MATCH ?${filterSql}
                ORDER BY backend_score DESC, f.path ASC
                LIMIT ? OFFSET ?
              `,
            )
            .all(
              longTerms.map((term) => `"${term.replaceAll('"', '""')}"`).join(' OR '),
              ...filterParams,
              fetchLimit,
              offset,
            ) as Array<{
            path: string
            config_relative_path: string
            language: string
            content_hash: string
            workspace: string
            embedding: Buffer | null
            content: string | null
            backend_score: number
          }>)
        : (db
            .prepare(
              `
                SELECT
                  f.path,
                  f.config_relative_path,
                  f.language,
                  f.content_hash,
                  f.workspace,
                  f.embedding,
                  f.content,
                  1.0 AS backend_score
                FROM files f
                WHERE f.content IS NOT NULL
                  AND instr(lower(f.content), ?) > 0${filterSql}
                ORDER BY f.path ASC
                LIMIT ? OFFSET ?
              `,
            )
            .all(terms[0]!, ...filterParams, fetchLimit, offset) as Array<{
            path: string
            config_relative_path: string
            language: string
            content_hash: string
            workspace: string
            embedding: Buffer | null
            content: string | null
            backend_score: number
          }>)

    const hasNextPage = rows.length > pageLimit
    const pageRows = rows.slice(0, pageLimit)
    const nextOffset = offset + pageRows.length
    return {
      candidates: pageRows.map((row) => ({
        file: this.mapFileRow(row),
        backendScore: row.backend_score,
      })),
      ...(hasNextPage ? { nextCursor: String(nextOffset) } : {}),
    }
  }

  async rebuildFtsIndexes(): Promise<void> {
    const db = this.ensureOpen()
    db.transaction(() => this.rebuildFtsIndexesInTransaction(db))()
  }

  /**
   * Rebuilds every search index inside the caller-owned transaction.
   * @param db - Open SQLite transaction owner.
   */
  private rebuildFtsIndexesInTransaction(db: SqliteDatabase): void {
    db.prepare('DELETE FROM symbol_fts').run()
    db.prepare('DELETE FROM spec_fts').run()
    db.prepare('DELETE FROM document_fts').run()
    db.prepare('DELETE FROM file_content_fts').run()

    const symbolInsert = db.prepare(
      'INSERT INTO symbol_fts (id, search_text, comment) VALUES (?, ?, ?)',
    )
    const symbolRows = db
      .prepare(
        `
            SELECT
              s.id,
              s.name,
              s.comment,
              COALESCE(
                group_concat(DISTINCT (
                  l.workspace || ' ' || l.surface || ' ' || l.name || ' ' ||
                  COALESCE(l.owner_id, '') || ' ' || COALESCE(pb.exported_name, '') || ' ' ||
                  COALESCE(lb.local_name, '')
                )),
                ''
              ) AS reference_search
            FROM symbols s
            LEFT JOIN logical_declarations ld ON ld.symbol_id = s.id
            LEFT JOIN logical_symbols l ON l.id = ld.logical_symbol_id
            LEFT JOIN public_bindings pb ON pb.target_id = l.id
            LEFT JOIN local_bindings lb ON lb.target_id = l.id
            GROUP BY s.id, s.name, s.comment
          `,
      )
      .all() as Array<{
      id: string
      name: string
      comment: string | null
      reference_search: string
    }>
    for (const row of symbolRows) {
      symbolInsert.run(
        row.id,
        expandSymbolName(`${row.name} ${row.reference_search}`),
        row.comment ?? '',
      )
    }

    const specInsert = db.prepare(
      'INSERT INTO spec_fts (spec_id, title, description, content) VALUES (?, ?, ?, ?)',
    )
    const specRows = db
      .prepare('SELECT spec_id, title, description, content FROM specs')
      .all() as Array<{ spec_id: string; title: string; description: string; content: string }>
    for (const row of specRows) {
      specInsert.run(row.spec_id, row.title, row.description, row.content)
    }

    const documentInsert = db.prepare(
      'INSERT INTO document_fts (path, config_relative_path, content) VALUES (?, ?, ?)',
    )
    const documentRows = db
      .prepare('SELECT path, config_relative_path, content FROM documents')
      .all() as Array<{ path: string; config_relative_path: string; content: string }>
    for (const row of documentRows) {
      documentInsert.run(row.path, row.config_relative_path, row.content)
    }

    const fileContentInsert = db.prepare(
      'INSERT INTO file_content_fts (path, content) VALUES (?, ?)',
    )
    const fileRows = db
      .prepare('SELECT path, content FROM files WHERE content IS NOT NULL')
      .all() as Array<{ path: string; content: string }>
    for (const row of fileRows) {
      fileContentInsert.run(row.path, row.content)
    }
  }

  async getSymbolCallers(): Promise<Array<{ symbol: SymbolNode; callerFilePath: string }>> {
    const rows = this.ensureOpen()
      .prepare(
        `
          SELECT
            target.id,
            target.name,
            target.kind,
            target.file_path,
            target.parent_id,
            target.line,
            target.column_number,
            target.end_line,
            target.end_column,
            target.selection_start_line,
            target.selection_start_column,
            target.selection_end_line,
            target.selection_end_column,
            target.comment,
            caller.file_path AS caller_file_path
          FROM relations r
          INNER JOIN symbols target ON target.id = r.target
          INNER JOIN symbols caller ON caller.id = r.source
          WHERE r.type IN (?, ?, ?)
        `,
      )
      .all(...SYMBOL_DEPENDENCY_RELATION_TYPES) as Array<{
      id: string
      name: string
      kind: string
      file_path: string
      parent_id: string | null
      line: number
      column_number: number
      end_line: number
      end_column: number
      selection_start_line: number
      selection_start_column: number
      selection_end_line: number
      selection_end_column: number
      comment: string | null
      caller_file_path: string
    }>

    return rows.map((row) => ({
      symbol: this.mapSymbolRow(row),
      callerFilePath: row.caller_file_path,
    }))
  }

  async getFileImporterCounts(): Promise<Map<string, number>> {
    const rows = this.ensureOpen()
      .prepare(
        `
          SELECT target, COUNT(DISTINCT source) AS importer_count
          FROM relations
          WHERE type = ?
          GROUP BY target
        `,
      )
      .all(RelationType.Imports) as Array<{ target: string; importer_count: number }>

    return new Map(rows.map((row) => [row.target, row.importer_count]))
  }

  async clear(): Promise<void> {
    const db = this.ensureOpen()
    db.transaction(() => {
      db.prepare('DELETE FROM relations').run()
      db.prepare('DELETE FROM symbols').run()
      db.prepare('DELETE FROM specs').run()
      db.prepare('DELETE FROM documents').run()
      db.prepare('DELETE FROM files').run()
      db.prepare('DELETE FROM indexed_input_observations').run()
      db.prepare('DELETE FROM freshness_latches').run()
      db.prepare(
        "DELETE FROM meta WHERE key IN ('lastIndexedAt', 'lastIndexedRef', 'graphFingerprint')",
      ).run()
      db.prepare('DELETE FROM symbol_fts').run()
      db.prepare('DELETE FROM spec_fts').run()
      db.prepare('DELETE FROM document_fts').run()
    })()

    this._lastIndexedAt = undefined
    this._lastIndexedRef = null
    this._graphFingerprint = null
  }

  async recreate(): Promise<void> {
    const wasOpen = this.db !== undefined
    await this.close()
    rmSync(this.graphDir, { recursive: true, force: true })
    rotateStorageGeneration(this.storagePath)
    this._lastIndexedAt = undefined
    this._lastIndexedRef = null
    this._graphFingerprint = null
    if (wasOpen) {
      await this.open()
    }
  }

  async getStorageGeneration(): Promise<StorageGenerationSnapshot> {
    this.ensureOpen()
    return readStorageGeneration(this.storagePath)
  }

  private ensureOpen(): SqliteDatabase {
    if (this.db === undefined) {
      throw new StoreNotOpenError()
    }
    return this.db
  }

  private assertExistingSchemaCompatible(db: SqliteDatabase): void {
    const metaTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'")
      .get() as { name: string } | undefined
    if (metaTable === undefined) return
    const current = db.prepare('SELECT value FROM meta WHERE key = ?').get('schemaVersion') as
      | { value: string }
      | undefined
    if (current !== undefined && Number(current.value) !== SQLITE_SCHEMA_VERSION) {
      throw new Error(
        `SQLite graph storage schema ${current.value} is incompatible with expected ${SQLITE_SCHEMA_VERSION}; reindex to recreate derived storage`,
      )
    }
  }

  private ensureSchemaVersion(): void {
    const db = this.ensureOpen()
    const current = db.prepare('SELECT value FROM meta WHERE key = ?').get('schemaVersion') as
      | { value: string }
      | undefined
    if (current === undefined) {
      this.setMeta(db, 'schemaVersion', String(SQLITE_SCHEMA_VERSION))
      return
    }
    if (Number(current.value) !== SQLITE_SCHEMA_VERSION) {
      db.close()
      this.db = undefined
      this.preparedStatements.clear()
      throw new Error(
        `SQLite graph storage schema ${current.value} is incompatible with expected ${SQLITE_SCHEMA_VERSION}; reindex to recreate derived storage`,
      )
    }
  }

  private configureDatabase(db: SqliteDatabase): void {
    db.pragma('foreign_keys = ON')
    db.pragma('journal_mode = WAL')
    db.pragma(`busy_timeout = ${SQLiteGraphStore.SQLITE_BUSY_TIMEOUT_MS}`)
    db.pragma('synchronous = NORMAL')
    db.pragma('temp_store = MEMORY')
    db.exec(SQLITE_SCHEMA_DDL)
  }

  private loadMetadata(): void {
    const db = this.ensureOpen()
    const lastIndexedAt = db
      .prepare('SELECT value FROM meta WHERE key = ?')
      .get('lastIndexedAt') as { value: string } | undefined
    const lastIndexedRef = db
      .prepare('SELECT value FROM meta WHERE key = ?')
      .get('lastIndexedRef') as { value: string } | undefined
    const graphFingerprint = db
      .prepare('SELECT value FROM meta WHERE key = ?')
      .get('graphFingerprint') as { value: string } | undefined

    this._lastIndexedAt = lastIndexedAt?.value
    this._lastIndexedRef = lastIndexedRef?.value ?? null
    this._graphFingerprint = graphFingerprint?.value ?? null
  }

  private setMeta(db: SqliteDatabase, key: string, value: string): void {
    db.prepare(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run(key, value)
  }

  private touchIndexTimestamp(db: SqliteDatabase): void {
    this._lastIndexedAt = new Date().toISOString()
    this.setMeta(db, 'lastIndexedAt', this._lastIndexedAt)
  }

  private insertFile(db: SqliteDatabase, file: FileNode): void {
    db.prepare(
      `
        INSERT INTO files (path, config_relative_path, language, content_hash, workspace, embedding, content)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET
          config_relative_path = excluded.config_relative_path,
          language = excluded.language,
          content_hash = excluded.content_hash,
          workspace = excluded.workspace,
          embedding = excluded.embedding,
          content = excluded.content
      `,
    ).run(
      file.path,
      file.configRelativePath,
      file.language,
      file.contentHash,
      file.workspace,
      this.serializeEmbedding(file.embedding),
      file.content ?? null,
    )
  }

  private insertFiles(db: SqliteDatabase, files: readonly FileNode[]): void {
    executeBatchedInsert(
      db,
      'INSERT INTO files (path, config_relative_path, language, content_hash, workspace, embedding, content)',
      files.map((file) => [
        file.path,
        file.configRelativePath,
        file.language,
        file.contentHash,
        file.workspace,
        this.serializeEmbedding(file.embedding),
        file.content ?? null,
      ]),
      `ON CONFLICT(path) DO UPDATE SET
        config_relative_path = excluded.config_relative_path,
        language = excluded.language,
        content_hash = excluded.content_hash,
        workspace = excluded.workspace,
        embedding = excluded.embedding,
        content = excluded.content`,
    )
  }

  private replaceIndexedInputObservations(
    db: SqliteDatabase,
    observations: readonly IndexedInputObservation[],
    indexedWorkspaces: readonly string[],
    clearGraphLatch: boolean,
  ): void {
    const deleteWorkspace = db.prepare('DELETE FROM indexed_input_observations WHERE workspace = ?')
    const resetLatch = db.prepare(
      `INSERT INTO freshness_latches (workspace, known_stale) VALUES (?, 0)
       ON CONFLICT(workspace) DO UPDATE SET known_stale = 0`,
    )
    for (const workspace of new Set(indexedWorkspaces)) {
      deleteWorkspace.run(workspace)
      resetLatch.run(workspace)
    }
    if (clearGraphLatch) resetLatch.run('__graph__')

    executeBatchedInsert(
      db,
      `INSERT INTO indexed_input_observations (
        workspace, resource_kind, resource_id, input_kind, input_locator,
        indexed_content_hash, last_observed_mtime, last_observed_size,
        last_observed_revision, generation, stale
      )`,
      observations.map((observation) => [
        observation.workspace,
        observation.resourceKind,
        observation.resourceId,
        observation.inputKind,
        observation.inputLocator,
        observation.indexedContentHash,
        observation.lastObservedMtime ?? null,
        observation.lastObservedSize ?? null,
        observation.lastObservedRevision ?? null,
        observation.generation,
        observation.stale ? 1 : 0,
      ]),
    )
  }

  private insertDocument(db: SqliteDatabase, document: DocumentNode): void {
    db.prepare(
      `
        INSERT INTO documents (path, config_relative_path, content_hash, content, workspace)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET
          config_relative_path = excluded.config_relative_path,
          content_hash = excluded.content_hash,
          content = excluded.content,
          workspace = excluded.workspace
      `,
    ).run(
      document.path,
      document.configRelativePath,
      document.contentHash,
      document.content,
      document.workspace,
    )
  }

  private insertDocuments(db: SqliteDatabase, documents: readonly DocumentNode[]): void {
    executeBatchedInsert(
      db,
      'INSERT INTO documents (path, config_relative_path, content_hash, content, workspace)',
      documents.map((document) => [
        document.path,
        document.configRelativePath,
        document.contentHash,
        document.content,
        document.workspace,
      ]),
      `ON CONFLICT(path) DO UPDATE SET
        config_relative_path = excluded.config_relative_path,
        content_hash = excluded.content_hash,
        content = excluded.content,
        workspace = excluded.workspace`,
    )
  }

  private insertSymbols(db: SqliteDatabase, symbols: readonly SymbolNode[]): void {
    executeBatchedInsert(
      db,
      `INSERT INTO symbols (
        id, name, kind, file_path, parent_id, line, column_number, end_line, end_column,
        selection_start_line, selection_start_column, selection_end_line, selection_end_column,
        comment, search_text
      )`,
      symbols.map((symbol) => [
        symbol.id,
        symbol.name,
        symbol.kind,
        symbol.filePath,
        symbol.parentId ?? null,
        symbol.line,
        symbol.column,
        symbol.endLine,
        symbol.endColumn,
        symbol.selectionRange.startLine,
        symbol.selectionRange.startColumn,
        symbol.selectionRange.endLine,
        symbol.selectionRange.endColumn,
        symbol.comment ?? null,
        expandSymbolName(symbol.name),
      ]),
      `ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        kind = excluded.kind,
        file_path = excluded.file_path,
        parent_id = excluded.parent_id,
        line = excluded.line,
        column_number = excluded.column_number,
        end_line = excluded.end_line,
        end_column = excluded.end_column,
        selection_start_line = excluded.selection_start_line,
        selection_start_column = excluded.selection_start_column,
        selection_end_line = excluded.selection_end_line,
        selection_end_column = excluded.selection_end_column,
        comment = excluded.comment,
        search_text = excluded.search_text`,
    )
  }

  private insertSpec(db: SqliteDatabase, spec: SpecNode): void {
    db.prepare(
      `
        INSERT INTO specs (
          spec_id, path, title, description, content_hash, content, depends_on_json, workspace
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(spec_id) DO UPDATE SET
          path = excluded.path,
          title = excluded.title,
          description = excluded.description,
          content_hash = excluded.content_hash,
          content = excluded.content,
          depends_on_json = excluded.depends_on_json,
          workspace = excluded.workspace
      `,
    ).run(
      spec.specId,
      spec.path,
      spec.title,
      spec.description,
      spec.contentHash,
      spec.content,
      JSON.stringify(spec.dependsOn),
      spec.workspace,
    )
  }

  private insertSpecs(db: SqliteDatabase, specs: readonly SpecNode[]): void {
    executeBatchedInsert(
      db,
      `INSERT INTO specs (
        spec_id, path, title, description, content_hash, content, depends_on_json, workspace
      )`,
      specs.map((spec) => [
        spec.specId,
        spec.path,
        spec.title,
        spec.description,
        spec.contentHash,
        spec.content,
        JSON.stringify(spec.dependsOn),
        spec.workspace,
      ]),
      `ON CONFLICT(spec_id) DO UPDATE SET
        path = excluded.path,
        title = excluded.title,
        description = excluded.description,
        content_hash = excluded.content_hash,
        content = excluded.content,
        depends_on_json = excluded.depends_on_json,
        workspace = excluded.workspace`,
    )
  }

  private insertRelations(db: SqliteDatabase, relations: readonly Relation[]): void {
    if (relations.length === 0) return
    const endpointIds = this.loadRelationEndpointIds(db, relations)
    executeBatchedInsert(
      db,
      'INSERT INTO relations (source, target, type, metadata_json)',
      relations
        .filter((relation) => relationEndpointsExist(relation, endpointIds))
        .map((relation) => [
          relation.source,
          relation.target,
          relation.type,
          relation.metadata === undefined ? null : JSON.stringify(relation.metadata),
        ]),
      `ON CONFLICT(source, target, type) DO UPDATE SET
        metadata_json = excluded.metadata_json`,
    )
  }

  /**
   * Loads every relation endpoint family in bounded set-based queries.
   * @param db - Open SQLite transaction owner.
   * @param relations - Relations whose endpoints must be validated.
   * @returns Preloaded endpoint identifiers grouped by node family.
   */
  private loadRelationEndpointIds(
    db: SqliteDatabase,
    relations: readonly Relation[],
  ): RelationEndpointIds {
    const candidates = new Set(relations.flatMap((relation) => [relation.source, relation.target]))
    return {
      files: loadExistingIds(db, 'files', 'path', candidates),
      symbols: loadExistingIds(db, 'symbols', 'id', candidates),
      publicBindings: loadExistingIds(db, 'public_bindings', 'id', candidates),
      specs: loadExistingIds(db, 'specs', 'spec_id', candidates),
    }
  }

  private deleteFileLocalState(db: SqliteDatabase, filePath: string): void {
    const symbolIds = (
      db.prepare('SELECT id FROM symbols WHERE file_path = ?').all(filePath) as Array<{
        id: string
      }>
    ).map((row) => row.id)

    if (symbolIds.length > 0) {
      const placeholders = symbolIds.map(() => '?').join(', ')
      db.prepare(
        `DELETE FROM relations WHERE source IN (${placeholders}) OR target IN (${placeholders})`,
      ).run(...symbolIds, ...symbolIds)
      db.prepare(`DELETE FROM symbols WHERE id IN (${placeholders})`).run(...symbolIds)
    }

    db.prepare('DELETE FROM relations WHERE source = ? OR target = ?').run(filePath, filePath)
    db.prepare('DELETE FROM file_content_fts WHERE path = ?').run(filePath)
    db.prepare('DELETE FROM files WHERE path = ?').run(filePath)
  }

  /**
   * Refreshes one source-content FTS row after a standalone file upsert.
   * @param db - Open SQLite transaction owner.
   * @param file - Persisted file whose source index entry is refreshed.
   */
  private refreshFileContentFtsEntry(db: SqliteDatabase, file: FileNode): void {
    db.prepare('DELETE FROM file_content_fts WHERE path = ?').run(file.path)
    if (file.content !== undefined) {
      db.prepare('INSERT INTO file_content_fts (path, content) VALUES (?, ?)').run(
        file.path,
        file.content,
      )
    }
  }

  private deleteSpecLocalState(db: SqliteDatabase, specId: string): void {
    db.prepare('DELETE FROM relations WHERE source = ? OR target = ?').run(specId, specId)
    db.prepare('DELETE FROM specs WHERE spec_id = ?').run(specId)
  }

  private async getRelationsBySource(type: RelationTypeValue, source: string): Promise<Relation[]> {
    return this.readRelations(
      this.statement(
        'SELECT source, target, type, metadata_json FROM relations WHERE type = ? AND source = ?',
      ).all(type, source) as RelationRow[],
    )
  }

  private async getRelationsByTarget(type: RelationTypeValue, target: string): Promise<Relation[]> {
    return this.readRelations(
      this.statement(
        'SELECT source, target, type, metadata_json FROM relations WHERE type = ? AND target = ?',
      ).all(type, target) as RelationRow[],
    )
  }

  private async getRelationsByTargets(
    type: RelationTypeValue,
    targets: readonly string[],
  ): Promise<Relation[]> {
    const uniqueTargets = [...new Set(targets)].sort()
    if (uniqueTargets.length === 0) return []
    const placeholders = uniqueTargets.map(() => '?').join(', ')
    return this.readRelations(
      this.statement(
        `SELECT source, target, type, metadata_json FROM relations WHERE type = ? AND target IN (${placeholders}) ORDER BY source, type, target`,
      ).all(type, ...uniqueTargets) as RelationRow[],
    )
  }

  private async getRelationsBySourceTypes(
    types: readonly RelationTypeValue[],
    source: string,
  ): Promise<Relation[]> {
    const placeholders = types.map(() => '?').join(', ')
    return this.readRelations(
      this.statement(
        `SELECT source, target, type, metadata_json FROM relations WHERE type IN (${placeholders}) AND source = ?`,
      ).all(...types, source) as RelationRow[],
    )
  }

  private async getRelationsByTargetTypes(
    types: readonly RelationTypeValue[],
    target: string,
  ): Promise<Relation[]> {
    const placeholders = types.map(() => '?').join(', ')
    return this.readRelations(
      this.statement(
        `SELECT source, target, type, metadata_json FROM relations WHERE type IN (${placeholders}) AND target = ?`,
      ).all(...types, target) as RelationRow[],
    )
  }

  private readRelations(rows: readonly RelationRow[]): Relation[] {
    return rows.map((row) =>
      createRelation({
        source: row.source,
        target: row.target,
        type: row.type,
        ...(row.metadata_json !== null
          ? { metadata: JSON.parse(row.metadata_json) as Record<string, unknown> }
          : {}),
      }),
    )
  }

  private readCount(db: SqliteDatabase, sql: string, ...params: readonly unknown[]): number {
    const row = this.statement(sql).get(...(params as unknown[])) as { count: number }
    return Number(row.count)
  }

  /**
   * Reuses prepared statements across hot read paths while the database stays open.
   * @param sql - The SQL statement text.
   * @returns A cached prepared statement bound to the current database handle.
   */
  private statement(sql: string): SqliteStatement {
    const existing = this.preparedStatements.get(sql)
    if (existing !== undefined) {
      return existing
    }

    const prepared = this.ensureOpen().prepare(sql)
    this.preparedStatements.set(sql, prepared)
    return prepared
  }

  private calculateLineRange(
    content: string,
    snippet: string,
  ): { startLine: number; endLine: number } {
    // 1. Clean snippet of FTS artifacts if any (though we configured tags as empty)
    // We expect snippet to be a literal excerpt from content, potentially with '...'
    const cleanSnippet =
      snippet
        .split('...')
        .find((part) => part.trim().length > 0)
        ?.trim() ?? ''
    if (cleanSnippet.length === 0) return { startLine: 1, endLine: 1 }

    const index = content.indexOf(cleanSnippet)
    if (index === -1) return { startLine: 1, endLine: 1 }

    const linesBefore = content.substring(0, index).split(/\r?\n/).length
    const snippetLines = snippet.split(/\r?\n/).length

    return {
      startLine: linesBefore,
      endLine: linesBefore + snippetLines - 1,
    }
  }

  private mapFileRow(row: {
    path: string
    config_relative_path: string
    language: string
    content_hash: string
    workspace: string
    embedding: Buffer | null
    content: string | null
  }): FileNode {
    return createFileNode({
      path: row.path,
      configRelativePath: row.config_relative_path,
      language: row.language,
      contentHash: row.content_hash,
      workspace: row.workspace,
      ...(row.embedding !== null ? { embedding: this.deserializeEmbedding(row.embedding) } : {}),
      ...(row.content !== null ? { content: row.content } : {}),
    })
  }

  private mapDocumentRow(row: {
    path: string
    config_relative_path: string
    content_hash: string
    content: string
    workspace: string
  }): DocumentNode {
    return createDocumentNode({
      path: row.path,
      configRelativePath: row.config_relative_path,
      contentHash: row.content_hash,
      content: row.content,
      workspace: row.workspace,
    })
  }

  private mapSymbolRow(row: {
    id: string
    name: string
    kind: string
    file_path: string
    parent_id: string | null
    line: number
    column_number: number
    end_line: number
    end_column: number
    selection_start_line: number
    selection_start_column: number
    selection_end_line: number
    selection_end_column: number
    comment: string | null
  }): SymbolNode {
    return createSymbolNode({
      name: row.name,
      kind: row.kind,
      filePath: row.file_path,
      line: row.line,
      column: row.column_number,
      endLine: row.end_line,
      endColumn: row.end_column,
      selectionRange: {
        startLine: row.selection_start_line,
        startColumn: row.selection_start_column,
        endLine: row.selection_end_line,
        endColumn: row.selection_end_column,
      },
      parentId: row.parent_id ?? undefined,
      ...(row.comment !== null ? { comment: row.comment } : {}),
    })
  }

  private mapLogicalSymbolRow(row: LogicalSymbolRow): LogicalSymbol {
    return {
      id: row.id,
      workspace: row.workspace,
      surface: row.surface,
      name: row.name,
      space: row.space,
      ownerId: row.owner_id ?? undefined,
      memberForm: row.member_form ?? undefined,
    }
  }

  private mapLogicalDeclarationRow(row: LogicalDeclarationRow): LogicalDeclaration {
    return {
      logicalSymbolId: row.logical_symbol_id,
      declaration: {
        logicalId: row.logical_symbol_id,
        symbolId: row.symbol_id,
        location: {
          filePath: row.file_path,
          line: row.line,
          column: row.column_number,
          endLine: row.end_line ?? row.line,
          endColumn: row.end_column ?? row.column_number,
        },
        kind: row.kind,
      },
    }
  }

  private mapPublicBindingRow(row: PublicBindingRow): PublicBinding {
    return {
      id: row.id,
      surface: row.surface,
      exportedName: row.exported_name,
      space: row.space,
      targetId: row.target_id ?? undefined,
    }
  }

  private mapLocalBindingRow(row: LocalBindingRow): LocalBinding {
    return {
      id: row.id,
      filePath: row.file_path,
      scopeId: row.scope_id,
      localName: row.local_name,
      space: row.space,
      targetId: row.target_id ?? undefined,
    }
  }

  private mapSpecRow(row: {
    spec_id: string
    path: string
    title: string
    description: string
    content_hash: string
    content: string
    depends_on_json: string
    workspace: string
  }): SpecNode {
    return createSpecNode({
      specId: row.spec_id,
      path: row.path,
      title: row.title,
      description: row.description,
      contentHash: row.content_hash,
      content: row.content,
      dependsOn: JSON.parse(row.depends_on_json) as readonly string[],
      workspace: row.workspace,
    })
  }

  private serializeEmbedding(embedding: Float32Array | undefined): Buffer | null {
    if (embedding === undefined) return null
    return Buffer.from(embedding.buffer.slice(0))
  }

  private deserializeEmbedding(buffer: Buffer): Float32Array {
    const copy = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    return new Float32Array(copy)
  }
}

function toIndexedInputObservation(row: IndexedInputObservationRow): IndexedInputObservation {
  return {
    workspace: row.workspace,
    resourceKind: row.resource_kind,
    resourceId: row.resource_id,
    inputKind: row.input_kind,
    inputLocator: row.input_locator,
    indexedContentHash: row.indexed_content_hash,
    ...(row.last_observed_mtime !== null ? { lastObservedMtime: row.last_observed_mtime } : {}),
    ...(row.last_observed_size !== null ? { lastObservedSize: row.last_observed_size } : {}),
    ...(row.last_observed_revision !== null
      ? { lastObservedRevision: row.last_observed_revision }
      : {}),
    generation: row.generation,
    stale: row.stale === 1,
  }
}

function compareStrings(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < left.length; index += 1) {
    const comparison = left[index]!.localeCompare(right[index]!)
    if (comparison !== 0) return comparison
  }
  return 0
}

function compareLogicalSymbols(left: LogicalSymbol, right: LogicalSymbol): number {
  return compareStrings(
    [
      left.workspace,
      left.surface,
      left.ownerId ?? '',
      left.space,
      left.name,
      left.memberForm ?? '',
      left.id,
    ],
    [
      right.workspace,
      right.surface,
      right.ownerId ?? '',
      right.space,
      right.name,
      right.memberForm ?? '',
      right.id,
    ],
  )
}

function compareLogicalDeclarations(left: LogicalDeclaration, right: LogicalDeclaration): number {
  return compareStrings(
    [
      left.logicalSymbolId,
      left.declaration.location.filePath,
      String(left.declaration.location.line),
      String(left.declaration.location.column),
      left.declaration.symbolId,
    ],
    [
      right.logicalSymbolId,
      right.declaration.location.filePath,
      String(right.declaration.location.line),
      String(right.declaration.location.column),
      right.declaration.symbolId,
    ],
  )
}

function comparePublicBindings(left: PublicBinding, right: PublicBinding): number {
  return compareStrings(
    [left.surface, left.exportedName, left.space, left.targetId ?? '', left.id],
    [right.surface, right.exportedName, right.space, right.targetId ?? '', right.id],
  )
}

function compareLocalBindings(left: LocalBinding, right: LocalBinding): number {
  return compareStrings(
    [left.filePath, left.scopeId, left.localName, left.space, left.targetId ?? '', left.id],
    [right.filePath, right.scopeId, right.localName, right.space, right.targetId ?? '', right.id],
  )
}

function compareResolutionSteps(left: ResolutionStep, right: ResolutionStep): number {
  return compareStrings([left.fromId, left.toId, left.kind], [right.fromId, right.toId, right.kind])
}

function prepareExpandedSearchQuery(rawQuery: string): ExpandedIdentitySearchQuery {
  const query = expandSearchQuery(rawQuery)
  return {
    ...query,
    ftsQuery: sanitizeFtsQuery(query.expandedTokens),
  }
}

function buildIdentityRankingSql(options: IdentityRankingSqlOptions): IdentityRankingSql {
  const baseTierParams: string[] = []
  const baseTierClauses: string[] = [`WHEN ${options.canonicalExpr} = ? THEN 5`]
  baseTierParams.push(options.normalizedQuery)

  if (options.alternateExpr !== undefined) {
    baseTierClauses.push(`WHEN ${options.alternateExpr} = ? THEN 4`)
    baseTierParams.push(options.normalizedQuery)
  }

  if (options.rawTokens.length === 1 && options.normalizedQuery.length > 0) {
    const prefixChecks = [`${options.canonicalExpr} LIKE ? ESCAPE '\\'`]
    baseTierParams.push(toPrefixLikePattern(options.normalizedQuery))
    if (options.alternateExpr !== undefined) {
      prefixChecks.push(`${options.alternateExpr} LIKE ? ESCAPE '\\'`)
      baseTierParams.push(toPrefixLikePattern(options.normalizedQuery))
    }
    baseTierClauses.push(`WHEN ${prefixChecks.join(' OR ')} THEN 3`)
  }

  const baseTierSql = `CASE ${baseTierClauses.join(' ')} ELSE 1 END`

  const tierTokenHits = buildTokenHitsSql(options)
  const scoreTokenHits = buildTokenHitsSql(options)
  const matchStrength = buildMatchStrengthSql(options)

  return {
    selectSql: `
      max(${baseTierSql}, CASE WHEN ${tierTokenHits.sql} > 0 THEN 2 ELSE 1 END) AS identity_tier,
      ${scoreTokenHits.sql} AS identity_token_hits,
      ${matchStrength.sql} AS identity_match_strength
    `,
    params: [
      ...baseTierParams,
      ...tierTokenHits.params,
      ...scoreTokenHits.params,
      ...matchStrength.params,
    ],
  }
}

function buildIdentityCandidatePredicateSql(options: {
  canonicalExpr: string
  canonicalComponentsExpr: string
  alternateExpr?: string
  alternateComponentsExpr?: string
  expandedTokens: readonly string[]
}): IdentityCandidatePredicateSql {
  if (options.expandedTokens.length === 0) {
    return { sql: '0', params: [] }
  }

  const clauses: string[] = []
  const params: string[] = []
  for (const token of options.expandedTokens) {
    const predicate = buildIdentityCandidatePredicateForTokenSql(token, options)
    clauses.push(`(${predicate.sql})`)
    params.push(...predicate.params)
  }

  return {
    sql: clauses.join(' OR '),
    params,
  }
}

function buildIdentityCandidatePredicateForTokenSql(
  token: string,
  options: {
    canonicalExpr: string
    canonicalComponentsExpr: string
    alternateExpr?: string
    alternateComponentsExpr?: string
  },
): IdentityCandidatePredicateSql {
  const canonical = buildIdentityCandidatePredicateForIdentitySql(
    token,
    options.canonicalExpr,
    options.canonicalComponentsExpr,
  )
  if (options.alternateExpr === undefined || options.alternateComponentsExpr === undefined) {
    return canonical
  }

  const alternate = buildIdentityCandidatePredicateForIdentitySql(
    token,
    options.alternateExpr,
    options.alternateComponentsExpr,
  )
  return {
    sql: `${canonical.sql} OR ${alternate.sql}`,
    params: [...canonical.params, ...alternate.params],
  }
}

function buildIdentityCandidatePredicateForIdentitySql(
  token: string,
  identityExpr: string,
  componentExpr: string,
): IdentityCandidatePredicateSql {
  return {
    sql: `
      ${identityExpr} = ?
      OR ${identityExpr} LIKE ? ESCAPE '\\'
      OR ${identityExpr} LIKE ? ESCAPE '\\'
      OR instr(${componentExpr}, ?) > 0
      OR ${identityExpr} LIKE ? ESCAPE '\\'
    `,
    params: [
      token,
      toPrefixLikePattern(token),
      toSuffixLikePattern(token),
      toComponentNeedle(token),
      toSubstringLikePattern(token),
    ],
  }
}

function buildTokenHitsSql(options: IdentityRankingSqlOptions): { sql: string; params: string[] } {
  if (options.expandedTokens.length === 0) {
    return { sql: '0', params: [] }
  }

  const parts: string[] = []
  const params: string[] = []
  for (const token of options.expandedTokens) {
    const strength = buildTokenStrengthSql(token, options)
    parts.push(`CASE WHEN ${strength.sql} > 0 THEN 1 ELSE 0 END`)
    params.push(...strength.params)
  }

  return {
    sql: parts.join(' + '),
    params,
  }
}

function buildMatchStrengthSql(options: IdentityRankingSqlOptions): {
  sql: string
  params: string[]
} {
  if (options.expandedTokens.length === 0) {
    return { sql: '0', params: [] }
  }

  const parts: string[] = []
  const params: string[] = []
  for (const token of options.expandedTokens) {
    const strength = buildTokenStrengthSql(token, options)
    parts.push(strength.sql)
    params.push(...strength.params)
  }

  return {
    sql: parts.join(' + '),
    params,
  }
}

function buildTokenStrengthSql(
  token: string,
  options: IdentityRankingSqlOptions,
): { sql: string; params: string[] } {
  const canonical = buildTokenStrengthForIdentitySql(
    token,
    options.canonicalExpr,
    options.canonicalComponentsExpr,
  )
  if (options.alternateExpr === undefined || options.alternateComponentsExpr === undefined) {
    return canonical
  }

  const alternate = buildTokenStrengthForIdentitySql(
    token,
    options.alternateExpr,
    options.alternateComponentsExpr,
  )
  return {
    sql: `max(${canonical.sql}, ${alternate.sql})`,
    params: [...canonical.params, ...alternate.params],
  }
}

function buildTokenStrengthForIdentitySql(
  token: string,
  identityExpr: string,
  componentExpr: string,
): { sql: string; params: string[] } {
  return {
    sql: `
      CASE
        WHEN ${identityExpr} = ? THEN 40
        WHEN ${identityExpr} LIKE ? ESCAPE '\\' THEN 30
        WHEN ${identityExpr} LIKE ? ESCAPE '\\' THEN 20
        WHEN instr(${componentExpr}, ?) > 0 THEN 15
        WHEN ${identityExpr} LIKE ? ESCAPE '\\' THEN 10
        ELSE 0
      END
    `,
    params: [
      token,
      toPrefixLikePattern(token),
      toSuffixLikePattern(token),
      toComponentNeedle(token),
      toSubstringLikePattern(token),
    ],
  }
}

function buildIdentityComponentsExpr(identityExpr: string): string {
  return `(' ' || replace(replace(replace(replace(replace(${identityExpr}, ':', ' '), '/', ' '), '_', ' '), '.', ' '), '-', ' ') || ' ')`
}

function composeIdentitySearchScore(
  identityTier: number,
  tokenHits: number,
  matchStrength: number,
  textScore: number,
): number {
  return identityTier * 1_000_000 + tokenHits * 10_000 + matchStrength * 100 + textScore
}

/**
 * Normalizes raw string or token-array query input into non-empty tokens.
 * @param query - Raw query text or expanded token list.
 * @returns Lower-level FTS tokens with blanks removed.
 */
function normalizeSearchTokens(query: string | readonly string[]): readonly string[] {
  if (typeof query !== 'string') {
    const tokens: string[] = []
    for (const token of query) {
      if (token.trim().length > 0) {
        tokens.push(token)
      }
    }
    return tokens
  }

  const normalized = query.trim()
  if (normalized.length === 0) {
    return []
  }
  return normalized.split(/\s+/)
}

/**
 * Sanitizes query tokens for SQLite FTS `OR` matching.
 * @param query - Raw query text or expanded token list.
 * @returns Quoted FTS query string.
 */
function sanitizeFtsQuery(query: string | readonly string[]): string {
  const tokens = normalizeSearchTokens(query)
  if (tokens.length === 0) return ''
  return tokens.map((token) => '"' + token.replaceAll('"', '""') + '"').join(' OR ')
}

function toPrefixLikePattern(value: string): string {
  return `${escapeLikePattern(value)}%`
}

function toSuffixLikePattern(value: string): string {
  return `%${escapeLikePattern(value)}`
}

function toSubstringLikePattern(value: string): string {
  return `%${escapeLikePattern(value)}%`
}

function toComponentNeedle(value: string): string {
  return ` ${value} `
}

function escapeLikePattern(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
}

interface RelationEndpointIds {
  readonly files: ReadonlySet<string>
  readonly symbols: ReadonlySet<string>
  readonly publicBindings: ReadonlySet<string>
  readonly specs: ReadonlySet<string>
}

/**
 * Executes one logical insert as bounded multi-row SQLite statements.
 * @param db - Open SQLite transaction owner.
 * @param insertPrefix - INSERT clause including table and columns.
 * @param rows - Bind-value rows with a consistent width.
 * @param suffix - Optional conflict clause appended after VALUES.
 */
function executeBatchedInsert(
  db: SqliteDatabase,
  insertPrefix: string,
  rows: readonly (readonly SqliteBindValue[])[],
  suffix = '',
): void {
  if (rows.length === 0) return
  const width = rows[0]!.length
  const batchSize = Math.max(1, Math.floor(900 / width))
  const valueGroup = `(${Array.from({ length: width }, () => '?').join(', ')})`
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize)
    const values = Array.from({ length: batch.length }, () => valueGroup).join(', ')
    db.prepare(`${insertPrefix} VALUES ${values} ${suffix}`).run(...batch.flat())
  }
}

/**
 * Loads matching identifiers with a bounded number of SQL variables per query.
 * @param db - Open SQLite transaction owner.
 * @param table - Node table to query.
 * @param column - Identifier column in the table.
 * @param candidates - Potential identifiers to resolve.
 * @returns Existing identifiers from the requested table.
 */
function loadExistingIds(
  db: SqliteDatabase,
  table: 'files' | 'symbols' | 'public_bindings' | 'specs',
  column: 'path' | 'id' | 'spec_id',
  candidates: ReadonlySet<string>,
): Set<string> {
  const values = [...candidates]
  const result = new Set<string>()
  const chunkSize = 500
  for (let offset = 0; offset < values.length; offset += chunkSize) {
    const chunk = values.slice(offset, offset + chunkSize)
    const placeholders = chunk.map(() => '?').join(', ')
    const rows = db
      .prepare(`SELECT ${column} AS id FROM ${table} WHERE ${column} IN (${placeholders})`)
      .all(...chunk) as Array<{ id: string }>
    for (const row of rows) result.add(row.id)
  }
  return result
}

/**
 * Applies relation-family endpoint validation against preloaded identifier sets.
 * @param relation - Relation whose source and target are validated.
 * @param ids - Preloaded endpoint identifiers.
 * @returns Whether both endpoints exist for the relation family.
 */
function relationEndpointsExist(relation: Relation, ids: RelationEndpointIds): boolean {
  switch (relation.type) {
    case RelationType.Imports:
      return ids.files.has(relation.source) && ids.files.has(relation.target)
    case RelationType.Defines:
    case RelationType.Exports:
      return ids.files.has(relation.source) && ids.symbols.has(relation.target)
    case RelationType.Calls:
    case RelationType.Constructs:
    case RelationType.UsesType:
      return (
        ids.symbols.has(relation.source) &&
        (ids.symbols.has(relation.target) || ids.publicBindings.has(relation.target))
      )
    case RelationType.Extends:
    case RelationType.Implements:
    case RelationType.Overrides:
      return ids.symbols.has(relation.source) && ids.symbols.has(relation.target)
    case RelationType.DependsOn:
      return ids.specs.has(relation.source) && ids.specs.has(relation.target)
    case RelationType.CoversFile:
      return ids.specs.has(relation.source) && ids.files.has(relation.target)
    case RelationType.CoversSymbol:
      return ids.specs.has(relation.source) && ids.symbols.has(relation.target)
    default:
      return false
  }
}

/**
 * Appends semantic-fact chunks into one replacement snapshot.
 * @param current - Existing optional replacement snapshot.
 * @param next - Next semantic-fact chunk.
 * @returns Merged replacement snapshot.
 */
function mergeReferenceFactChunks(
  current: ReferenceFactsWrite | undefined,
  next: ReferenceFactsWrite,
): ReferenceFactsWrite {
  if (current === undefined) return next
  return {
    logicalSymbols: [...current.logicalSymbols, ...next.logicalSymbols],
    declarations: [...current.declarations, ...next.declarations],
    publicBindings: [...current.publicBindings, ...next.publicBindings],
    localBindings: [...current.localBindings, ...next.localBindings],
    steps: [...current.steps, ...next.steps],
    coverage: [...current.coverage, ...next.coverage],
  }
}

/**
 * Returns the persisted SQLite relation uniqueness key.
 * @param relation - Relation to identify.
 * @returns Stable uniqueness key.
 */
function sqliteRelationKey(relation: Relation): string {
  return JSON.stringify([relation.source, relation.target, relation.type])
}
