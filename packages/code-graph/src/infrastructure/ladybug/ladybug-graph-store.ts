import type { Database, Connection, QueryResult, LbugValue } from '@ladybugdb/core'
import {
  GraphStore,
  type IndexWriteSession,
  type IndexWriteSessionMetadata,
  type LogicalDeclaration,
  type LogicalSymbolLookup,
  type LocalBindingLookup,
  type PublicBindingLookup,
  type ReferenceFactsWrite,
  type StorageGenerationSnapshot,
} from '../../domain/ports/graph-store.js'
import { createDocumentNode, type DocumentNode } from '../../domain/value-objects/document-node.js'
import { type FileNode } from '../../domain/value-objects/file-node.js'
import { type SymbolNode } from '../../domain/value-objects/symbol-node.js'
import { type SpecNode } from '../../domain/value-objects/spec-node.js'
import { type Relation } from '../../domain/value-objects/relation.js'
import { type SymbolQuery } from '../../domain/value-objects/symbol-query.js'
import { type GraphStatistics } from '../../domain/value-objects/graph-statistics.js'
import { type RelationType, RelationType as RT } from '../../domain/value-objects/relation-type.js'
import { type SearchOptions } from '../../domain/value-objects/search-options.js'
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
import { StoreNotOpenError } from '../../domain/errors/store-not-open-error.js'
import { SCHEMA_DDL, SCHEMA_VERSION } from './schema.js'
import { expandSearchQuery } from '../../domain/services/expand-search-query.js'
import { expandSymbolName } from '../../domain/services/expand-symbol-name.js'
import { mkdirSync, existsSync, writeFileSync, unlinkSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  ensureStorageGeneration,
  readStorageGeneration,
  rotateStorageGeneration,
} from '../storage-generation.js'

/**
 * Runtime-loadable Ladybug module shape.
 */
interface LbugModule {
  readonly Database: new (path: string) => Database
  readonly Connection: new (db: Database) => Connection
}

const SYMBOL_DEPENDENCY_RELATION_TYPES = [RT.Calls, RT.Constructs, RT.UsesType] as const

// eslint-disable-next-line jsdoc/require-param, jsdoc/require-returns
/** Compares equally-shaped string keys lexicographically. */
function compareStrings(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < left.length; index += 1) {
    const comparison = left[index]!.localeCompare(right[index]!)
    if (comparison !== 0) return comparison
  }
  return 0
}

// eslint-disable-next-line jsdoc/require-param, jsdoc/require-returns
/** Orders logical symbols consistently with the SQLite backend. */
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

// eslint-disable-next-line jsdoc/require-param, jsdoc/require-returns
/** Orders declaration occurrences consistently with the SQLite backend. */
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

// eslint-disable-next-line jsdoc/require-param, jsdoc/require-returns
/** Orders public bindings consistently with the SQLite backend. */
function comparePublicBindings(left: PublicBinding, right: PublicBinding): number {
  return compareStrings(
    [left.surface, left.exportedName, left.space, left.targetId ?? '', left.id],
    [right.surface, right.exportedName, right.space, right.targetId ?? '', right.id],
  )
}

// eslint-disable-next-line jsdoc/require-param, jsdoc/require-returns
/** Orders local bindings consistently with the SQLite backend. */
function compareLocalBindings(left: LocalBinding, right: LocalBinding): number {
  return compareStrings(
    [left.filePath, left.scopeId, left.localName, left.space, left.targetId ?? '', left.id],
    [right.filePath, right.scopeId, right.localName, right.space, right.targetId ?? '', right.id],
  )
}

// eslint-disable-next-line jsdoc/require-param, jsdoc/require-returns
/** Orders resolution steps consistently with the SQLite backend. */
function compareResolutionSteps(left: ResolutionStep, right: ResolutionStep): number {
  return compareStrings([left.fromId, left.toId, left.kind], [right.fromId, right.toId, right.kind])
}

/**
 * Converts a `*` glob into an anchored, case-insensitive Ladybug regex.
 * @param pattern - Glob pattern to translate.
 * @returns Ladybug-compatible regular expression.
 */
function globToLadybugRegex(pattern: string): string {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')
  return `(?i)^${escaped}$`
}

/**
 * Expanded token set plus FTS-ready query string for identity-aware search.
 */
interface ExpandedIdentitySearchQuery {
  readonly normalizedQuery: string
  readonly rawTokens: readonly string[]
  readonly expandedTokens: readonly string[]
  readonly ftsQuery: string
}

/**
 * Inputs required to rank a candidate result by identity strength.
 */
interface IdentityRankingInput {
  readonly normalizedQuery: string
  readonly rawTokens: readonly string[]
  readonly expandedTokens: readonly string[]
  readonly canonicalIdentity: string
  readonly alternateIdentity?: string
  readonly nativeScore: number
}

/**
 * Computed identity-ranking factors for a search result candidate.
 */
interface IdentityRanking {
  readonly tier: number
  readonly tokenHits: number
  readonly matchStrength: number
  readonly nativeScore: number
}

/**
 * Unwraps a query result (or array of results) into an array of row records.
 * @param result - A single query result or an array of query results.
 * @returns The rows from the last result in the array, or from the single result.
 */
async function getAll(result: QueryResult | QueryResult[]): Promise<Record<string, LbugValue>[]> {
  if (Array.isArray(result)) {
    const last = result[result.length - 1]
    return last ? await last.getAll() : []
  }
  return await result.getAll()
}

/**
 * Executes a Cypher query on a connection and returns all result rows.
 * @param conn - The Ladybug database connection.
 * @param query - The Cypher query string to execute.
 * @returns An array of row records.
 */
async function exec(conn: Connection, query: string): Promise<Record<string, LbugValue>[]> {
  const result = await conn.query(query)
  return getAll(result)
}

/**
 * Executes a prepared Cypher query on a connection with parameters and returns all result rows.
 * @param conn - The Ladybug database connection.
 * @param query - The Cypher query string with `$param` placeholders.
 * @param params - Parameter values to bind.
 * @returns An array of row records.
 */
async function execPrepared(
  conn: Connection,
  query: string,
  params: Record<string, LbugValue>,
): Promise<Record<string, LbugValue>[]> {
  const stmt = await conn.prepare(query)
  const result = await conn.execute(stmt, params)
  return getAll(result)
}

/**
 * Executes a prepared Cypher query on a connection with parameters, discarding result rows.
 * @param conn - The Ladybug database connection.
 * @param query - The Cypher query string with `$param` placeholders.
 * @param params - Parameter values to bind.
 */
async function runPrepared(
  conn: Connection,
  query: string,
  params: Record<string, LbugValue>,
): Promise<void> {
  const stmt = await conn.prepare(query)
  await conn.execute(stmt, params)
}

/**
 * Escapes a value for CSV output (RFC 4180).
 * Wraps in double quotes and doubles any internal double quotes.
 * @param value - The string value to escape.
 * @returns The CSV-safe escaped string.
 */
function csvEscape(value: string): string {
  return '"' + value.replaceAll('"', '""') + '"'
}

/**
 * Returns the compound logical resource identity key.
 * @param resource - Logical resource identity.
 * @returns Stable compound resource key.
 */
function resourceKey(resource: IndexedResourceKey): string {
  return JSON.stringify([resource.workspace, resource.resourceKind, resource.resourceId])
}

/**
 * Returns the compound physical observation identity.
 * @param observation - Physical observation identity fields.
 * @returns Stable compound observation identifier.
 */
function observationId(
  observation: Pick<
    IndexedInputObservation,
    'workspace' | 'resourceKind' | 'resourceId' | 'inputKind' | 'inputLocator'
  >,
): string {
  return JSON.stringify([
    observation.workspace,
    observation.resourceKind,
    observation.resourceId,
    observation.inputKind,
    observation.inputLocator,
  ])
}

/**
 * Maps an observation to Ladybug parameter primitives.
 * @param observation - Observation to persist.
 * @returns Ladybug-compatible parameter values.
 */
function toLadybugObservationParams(
  observation: IndexedInputObservation,
): Record<string, LbugValue> {
  return {
    id: observationId(observation),
    workspace: observation.workspace,
    resourceKind: observation.resourceKind,
    resourceId: observation.resourceId,
    inputKind: observation.inputKind,
    inputLocator: observation.inputLocator,
    indexedContentHash: observation.indexedContentHash,
    lastObservedMtime: observation.lastObservedMtime ?? -1,
    lastObservedSize: observation.lastObservedSize ?? -1,
    lastObservedRevision: observation.lastObservedRevision ?? '',
    generation: observation.generation,
  }
}

/**
 * Maps one Ladybug result row to persisted freshness evidence.
 * @param row - Ladybug result row.
 * @returns Indexed input observation.
 */
function toLadybugObservation(row: Record<string, LbugValue>): IndexedInputObservation {
  const mtime = row['lastObservedMtime'] as number
  const size = row['lastObservedSize'] as number
  const revision = row['lastObservedRevision'] as string
  return {
    workspace: row['workspace'] as string,
    resourceKind: row['resourceKind'] as IndexedInputObservation['resourceKind'],
    resourceId: row['resourceId'] as string,
    inputKind: row['inputKind'] as IndexedInputObservation['inputKind'],
    inputLocator: row['inputLocator'] as string,
    indexedContentHash: row['indexedContentHash'] as string,
    ...(mtime >= 0 ? { lastObservedMtime: mtime } : {}),
    ...(size >= 0 ? { lastObservedSize: size } : {}),
    ...(revision.length > 0 ? { lastObservedRevision: revision } : {}),
    generation: row['generation'] as string,
    stale: row['stale'] === true,
  }
}

/**
 * Graph store implementation backed by the Ladybug embedded graph database.
 * Persists files, symbols, specs, and their relations as a labeled property graph.
 */
export class LadybugGraphStore extends GraphStore {
  private db: Database | undefined
  private conn: Connection | undefined
  private _isOpen = false
  private _lastIndexedAt: string | undefined
  private _lastIndexedRef: string | null = null
  private _graphFingerprint: string | null = null
  private bulkSessionActive = false
  private readonly loadLbugModule: () => Promise<LbugModule> = async () => import('@ladybugdb/core')

  /**
   * Asserts the store is open and the connection is available.
   * @throws {StoreNotOpenError} If the store has not been opened.
   */
  private ensureOpen(): void {
    if (!this._isOpen || !this.conn) {
      throw new StoreNotOpenError()
    }
  }

  /** Returns the backend-owned directory for persisted graph files. */
  private get graphDir(): string {
    return join(this.storagePath, 'graph')
  }

  /** Returns the full filesystem path to the Ladybug database file. */
  private get dbPath(): string {
    return join(this.graphDir, 'code-graph.lbug')
  }

  /** Returns the repository-local directory used for bulk-load CSV scratch files. */
  private get bulkLoadTmpDir(): string {
    return join(this.storagePath, 'tmp')
  }

  /**
   * Opens the database, initializes the schema, and loads metadata.
   */
  async open(): Promise<void> {
    if (this._isOpen) {
      return
    }
    if (!existsSync(this.graphDir)) {
      mkdirSync(this.graphDir, { recursive: true })
    }
    if (!existsSync(this.bulkLoadTmpDir)) {
      mkdirSync(this.bulkLoadTmpDir, { recursive: true })
    }

    await this.migrateSchemaIfNeeded()
    ensureStorageGeneration(this.storagePath)

    const lbug = await this.loadLbugModule()
    this.db = new lbug.Database(this.dbPath)
    await this.db.init()
    this.conn = new lbug.Connection(this.db)
    await this.conn.init()

    for (const statement of SCHEMA_DDL.split(';')) {
      const trimmed = statement.trim()
      if (trimmed) {
        await this.conn.query(trimmed)
      }
    }

    // Load FTS extension and create indexes (idempotent — skip if already exists)
    await this.conn.query('INSTALL fts')
    await this.conn.query('LOAD fts')
    await this.createFtsIndex('Symbol', 'symbol_fts', ['searchName', 'comment'])
    await this.createSemanticFtsIndexesIfPopulated()
    await this.createFtsIndex('Spec', 'spec_fts', ['specId', 'title', 'description', 'content'])
    await this.createFtsIndex('Document', 'document_fts', ['path', 'content'])

    const metaRows = await exec(
      this.conn,
      `MATCH (m:Meta {key: 'lastIndexedAt'}) RETURN m.value AS v`,
    )
    if (metaRows.length > 0 && metaRows[0]) {
      this._lastIndexedAt = metaRows[0]['v'] as string
    }

    const refRows = await exec(
      this.conn,
      `MATCH (m:Meta {key: 'lastIndexedRef'}) RETURN m.value AS v`,
    )
    if (refRows.length > 0 && refRows[0]) {
      this._lastIndexedRef = refRows[0]['v'] as string
    }

    const fpRows = await exec(
      this.conn,
      `MATCH (m:Meta {key: 'graphFingerprint'}) RETURN m.value AS v`,
    )
    if (fpRows.length > 0 && fpRows[0]) {
      this._graphFingerprint = fpRows[0]['v'] as string
    }

    const versionRows = await exec(
      this.conn,
      `MATCH (m:Meta {key: 'schemaVersion'}) RETURN m.value AS v`,
    )
    if (versionRows.length === 0) {
      await this.updateMeta(this.conn, 'schemaVersion', String(SCHEMA_VERSION))
    }

    this._isOpen = true
  }

  /**
   * Drops the database directory if the persisted schema version is outdated.
   */
  private async migrateSchemaIfNeeded(): Promise<void> {
    if (!existsSync(this.dbPath)) return

    try {
      const lbug = await this.loadLbugModule()
      const db = new lbug.Database(this.dbPath)
      await db.init()
      const conn = new lbug.Connection(db)
      await conn.init()

      const rows = await exec(conn, "MATCH (m:Meta {key: 'schemaVersion'}) RETURN m.value AS v")
      await conn.close()
      await db.close()

      if (rows.length > 0 && Number(rows[0]!['v']) < SCHEMA_VERSION) {
        rmSync(this.graphDir, { recursive: true, force: true })
        mkdirSync(this.graphDir, { recursive: true })
      }
    } catch {
      // If we can't read version (e.g. Meta table doesn't exist), force recreate
      rmSync(this.graphDir, { recursive: true, force: true })
      mkdirSync(this.graphDir, { recursive: true })
    }
  }

  /**
   * Creates an FTS index on a table, skipping if it already exists.
   * @param table - The node table name.
   * @param indexName - The index name.
   * @param columns - The columns to index.
   */
  private async createFtsIndex(table: string, indexName: string, columns: string[]): Promise<void> {
    try {
      const colList = columns.map((c) => `'${c}'`).join(', ')
      await this.conn!.query(
        `CALL CREATE_FTS_INDEX('${table}', '${indexName}', [${colList}], stemmer := 'porter')`,
      )
    } catch {
      // Index already exists — skip
    }
  }

  /**
   * Deletes a file node, its symbols, and adjacent relations without rebuilding FTS.
   * @param conn - The active Ladybug connection.
   * @param filePath - Path of the file to remove.
   */
  private async deleteFileLocalState(conn: Connection, filePath: string): Promise<void> {
    const symbolRows = await execPrepared(
      conn,
      `MATCH (s:Symbol {filePath: $filePath}) RETURN s.id AS id`,
      { filePath },
    )

    for (const row of symbolRows) {
      const symbolId = row['id'] as string
      await runPrepared(conn, `MATCH (s:Symbol {id: $id})-[r]->() DELETE r`, { id: symbolId })
      await runPrepared(conn, `MATCH ()-[r]->(s:Symbol {id: $id}) DELETE r`, { id: symbolId })
      await runPrepared(conn, `MATCH (s:Symbol {id: $id}) DELETE s`, { id: symbolId })
    }

    await runPrepared(conn, `MATCH (f:File {path: $path})-[r]->() DELETE r`, { path: filePath })
    await runPrepared(conn, `MATCH ()-[r]->(f:File {path: $path}) DELETE r`, { path: filePath })
    await runPrepared(conn, `MATCH (f:File {path: $path}) DELETE f`, { path: filePath })
  }

  /**
   * Deletes a spec node and adjacent relations without rebuilding FTS.
   * @param conn - The active Ladybug connection.
   * @param specId - Identifier of the spec to remove.
   */
  private async deleteSpecLocalState(conn: Connection, specId: string): Promise<void> {
    await runPrepared(conn, `MATCH (s:Spec {specId: $specId})-[r]->() DELETE r`, { specId })
    await runPrepared(conn, `MATCH ()-[r]->(s:Spec {specId: $specId}) DELETE r`, { specId })
    await runPrepared(conn, `MATCH (s:Spec {specId: $specId}) DELETE s`, { specId })
  }

  /**
   * Deletes a document node and adjacent relations without rebuilding FTS.
   * @param conn - The active Ladybug connection.
   * @param documentPath - Path of the document to remove.
   */
  private async deleteDocumentLocalState(conn: Connection, documentPath: string): Promise<void> {
    await runPrepared(conn, `MATCH (d:Document {path: $path})-[r]->() DELETE r`, {
      path: documentPath,
    })
    await runPrepared(conn, `MATCH ()-[r]->(d:Document {path: $path}) DELETE r`, {
      path: documentPath,
    })
    await runPrepared(conn, `MATCH (d:Document {path: $path}) DELETE d`, { path: documentPath })
  }

  /**
   * Drops and recreates all FTS indexes. Must be called after bulk data changes
   * because LadybugDB FTS indexes are not automatically updated on insert.
   */
  async rebuildFtsIndexes(): Promise<void> {
    this.ensureOpen()
    const conn = this.conn!

    // Drop existing indexes
    for (const [table, name] of [
      ['Symbol', 'symbol_fts'],
      ['LogicalSymbol', 'logical_symbol_fts'],
      ['PublicBinding', 'public_binding_fts'],
      ['Spec', 'spec_fts'],
      ['Document', 'document_fts'],
      ['File', 'file_content_fts'],
    ] as const) {
      try {
        await conn.query(`CALL DROP_FTS_INDEX('${table}', '${name}')`)
      } catch {
        // Index may not exist yet
      }
    }

    // Recreate
    await this.createFtsIndex('Symbol', 'symbol_fts', ['searchName', 'comment'])
    await this.createSemanticFtsIndexesIfPopulated()
    await this.createFtsIndex('Spec', 'spec_fts', ['specId', 'title', 'description', 'content'])
    await this.createFtsIndex('Document', 'document_fts', ['path', 'content'])
    const contentRows = await exec(
      conn,
      `MATCH (f:File) WHERE f.content <> '' RETURN count(f) AS contentFileCount`,
    )
    if (Number(contentRows[0]?.['contentFileCount'] ?? 0) > 0) {
      await this.createFtsIndex('File', 'file_content_fts', ['content'])
    }
  }

  /** Creates semantic indexes only when their node tables contain searchable data. */
  private async createSemanticFtsIndexesIfPopulated(): Promise<void> {
    const definitions = [
      {
        table: 'LogicalSymbol',
        index: 'logical_symbol_fts',
        fields: ['workspace', 'surface', 'name', 'space', 'ownerId', 'memberForm'],
      },
      {
        table: 'PublicBinding',
        index: 'public_binding_fts',
        fields: ['surface', 'exportedName', 'space'],
      },
    ] as const
    for (const definition of definitions) {
      const rows = await exec(
        this.conn!,
        `MATCH (n:${definition.table}) RETURN count(n) AS searchableCount`,
      )
      if (Number(rows[0]?.['searchableCount'] ?? 0) > 0) {
        await this.createFtsIndex(definition.table, definition.index, [...definition.fields])
      }
    }
  }

  /**
   * Closes the database connection and releases resources.
   */
  async close(): Promise<void> {
    this._isOpen = false
    const conn = this.conn
    const db = this.db
    this.conn = undefined
    this.db = undefined

    let firstError: unknown
    if (conn) {
      try {
        await conn.close()
      } catch (err) {
        firstError = err
      }
    }
    if (db) {
      try {
        await db.close()
      } catch (err) {
        firstError ??= err
      }
    }
    if (firstError) throw firstError as Error
  }

  /**
   * Inserts or replaces a file node along with its symbols and relations.
   * @param file - The file node to upsert.
   * @param symbols - Symbols defined in this file.
   * @param relations - Relations associated with this file.
   */
  async upsertFile(file: FileNode, symbols: SymbolNode[], relations: Relation[]): Promise<void> {
    this.ensureOpen()
    const conn = this.conn!

    await conn.query('BEGIN TRANSACTION')
    try {
      await this.deleteFileLocalState(conn, file.path)

      await runPrepared(
        conn,
        `CREATE (f:File {path: $path, configRelativePath: $configRelativePath, language: $language, contentHash: $contentHash, workspace: $workspace, content: $content})`,
        {
          path: file.path,
          configRelativePath: file.configRelativePath,
          language: file.language,
          contentHash: file.contentHash,
          workspace: file.workspace,
          content: file.content ?? '',
        },
      )

      for (const symbol of symbols) {
        await runPrepared(
          conn,
          `CREATE (s:Symbol {id: $id, name: $name, searchName: $searchName, kind: $kind, filePath: $filePath, line: $line, col: $col, endLine: $endLine, endCol: $endCol, selectionStartLine: $selectionStartLine, selectionStartCol: $selectionStartCol, selectionEndLine: $selectionEndLine, selectionEndCol: $selectionEndCol, comment: $comment})`,
          {
            id: symbol.id,
            name: symbol.name,
            searchName: expandSymbolName(symbol.name),
            kind: symbol.kind,
            filePath: file.path,
            line: symbol.line,
            col: symbol.column,
            endLine: symbol.endLine,
            endCol: symbol.endColumn,
            selectionStartLine: symbol.selectionRange.startLine,
            selectionStartCol: symbol.selectionRange.startColumn,
            selectionEndLine: symbol.selectionRange.endLine,
            selectionEndCol: symbol.selectionRange.endColumn,
            comment: symbol.comment ?? '',
          },
        )
      }

      for (const rel of relations) {
        await this.createRelation(conn, rel)
      }

      const now = new Date().toISOString()
      await this.updateMeta(conn, 'lastIndexedAt', now)
      await conn.query('COMMIT')
      this._lastIndexedAt = now
    } catch (err) {
      await conn.query('ROLLBACK').catch(() => {})
      throw err
    }
    await this.rebuildFtsIndexes()
  }

  /**
   * Removes a file node and all its associated symbols and relations from the graph.
   * @param filePath - Path of the file to remove.
   */
  async removeFile(filePath: string): Promise<void> {
    this.ensureOpen()
    const conn = this.conn!
    await conn.query('BEGIN TRANSACTION')
    try {
      await this.deleteFileLocalState(conn, filePath)
      await conn.query('COMMIT')
    } catch (error) {
      await conn.query('ROLLBACK').catch(() => {})
      throw error
    }
    await this.rebuildFtsIndexes()
  }

  /**
   * Inserts or updates a document node.
   * @param document - The document node to upsert.
   */
  async upsertDocument(document: DocumentNode): Promise<void> {
    this.ensureOpen()
    const conn = this.conn!

    await conn.query('BEGIN TRANSACTION')
    try {
      await this.deleteDocumentLocalState(conn, document.path)

      await runPrepared(
        conn,
        `CREATE (d:Document {path: $path, configRelativePath: $configRelativePath, contentHash: $contentHash, content: $content, workspace: $workspace})`,
        {
          path: document.path,
          configRelativePath: document.configRelativePath,
          contentHash: document.contentHash,
          content: document.content,
          workspace: document.workspace,
        },
      )

      const now = new Date().toISOString()
      await this.updateMeta(conn, 'lastIndexedAt', now)
      await conn.query('COMMIT')
      this._lastIndexedAt = now
    } catch (err) {
      await conn.query('ROLLBACK').catch(() => {})
      throw err
    }
    await this.rebuildFtsIndexes()
  }

  /**
   * Removes a document node by path.
   * @param documentPath - The path of the document to remove.
   */
  async removeDocument(documentPath: string): Promise<void> {
    this.ensureOpen()
    await this.deleteDocumentLocalState(this.conn!, documentPath)
    await this.rebuildFtsIndexes()
  }

  /**
   * Adds relations to the store without removing existing data.
   * Uses CSV bulk import when more than 50 relations, falls back to individual inserts for small batches.
   * @param relations - The relations to add.
   */
  async addRelations(relations: Relation[]): Promise<void> {
    this.ensureOpen()
    const conn = this.conn!

    if (relations.length <= 50) {
      for (const rel of relations) {
        await this.createRelation(conn, rel)
      }
      return
    }

    // Bulk: group by type, write CSV, COPY
    const byType = new Map<string, Relation[]>()
    for (const rel of relations) {
      const existing = byType.get(rel.type) ?? []
      existing.push(rel)
      byType.set(rel.type, existing)
    }

    if (!existsSync(this.bulkLoadTmpDir)) {
      mkdirSync(this.bulkLoadTmpDir, { recursive: true })
    }
    const prefix = join(this.bulkLoadTmpDir, `codegraph-rel-${Date.now()}-`)
    const csvFiles: string[] = []

    try {
      const batchSize = 500
      for (const [type, rels] of byType) {
        for (let i = 0; i < rels.length; i += batchSize) {
          const batch = rels.slice(i, i + batchSize)
          const csvPath = prefix + `${type.toLowerCase()}-${i}.csv`
          csvFiles.push(csvPath)
          const rows = ['from,to']
          for (const r of batch) {
            rows.push(`${csvEscape(r.source)},${csvEscape(r.target)}`)
          }
          writeFileSync(csvPath, rows.join('\n') + '\n')
          await conn.query(
            `COPY ${type} FROM "${csvPath}" (HEADER=true, PARALLEL=false, IGNORE_ERRORS=true)`,
          )
        }
      }
    } finally {
      for (const f of csvFiles) {
        try {
          unlinkSync(f)
        } catch {
          /* ignore */
        }
      }
    }
  }

  /**
   * Begins one Ladybug-native bulk transaction assembled from bounded chunks.
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
      writeObservations: (chunk) => {
        assertActive()
        observations.push(...chunk)
        return Promise.resolve()
      },
      writeReferenceFacts: (chunk) => {
        assertActive()
        referenceFacts =
          referenceFacts === undefined
            ? chunk
            : {
                logicalSymbols: [...referenceFacts.logicalSymbols, ...chunk.logicalSymbols],
                declarations: [...referenceFacts.declarations, ...chunk.declarations],
                publicBindings: [...referenceFacts.publicBindings, ...chunk.publicBindings],
                localBindings: [...referenceFacts.localBindings, ...chunk.localBindings],
                steps: [...referenceFacts.steps, ...chunk.steps],
                coverage: [...referenceFacts.coverage, ...chunk.coverage],
              }
        return Promise.resolve()
      },
      writeRelations: (chunk) => {
        assertActive()
        for (const relation of chunk) {
          relations.set(JSON.stringify([relation.source, relation.target, relation.type]), relation)
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
        try {
          if (metadata.replaceCodeGraph === true) {
            for (const file of await this.getAllFiles()) removedFiles.add(file.path)
            for (const document of await this.getAllDocuments()) {
              removedDocuments.add(document.path)
            }
          }
          await this.bulkLoad({
            files,
            documents,
            symbols,
            specs,
            relations: [...relations.values()],
            observations,
            ...(referenceFacts === undefined ? {} : { referenceFacts }),
            removeFilePaths: [...removedFiles],
            removeDocumentPaths: [...removedDocuments],
            removeSpecIds: [...removedSpecs],
            createRelationsInTransaction: true,
            ...(metadata.onProgress === undefined ? {} : { onProgress: metadata.onProgress }),
            ...(metadata.vcsRef === undefined ? {} : { vcsRef: metadata.vcsRef }),
            ...(metadata.graphFingerprint === undefined
              ? {}
              : { graphFingerprint: metadata.graphFingerprint }),
            ...(metadata.indexedWorkspaces === undefined
              ? {}
              : { indexedWorkspaces: metadata.indexedWorkspaces }),
            ...(metadata.clearGraphStaleLatch === undefined
              ? {}
              : { clearGraphStaleLatch: metadata.clearGraphStaleLatch }),
            ...(metadata.rebuildSearchIndexes === undefined
              ? {}
              : { rebuildSearchIndexes: metadata.rebuildSearchIndexes }),
          })
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

  /**
   * Bulk loads files, symbols, specs, and relations using CSV import.
   * Orders of magnitude faster than individual upserts for large datasets.
   * @param data - The data to load.
   * @param data.files - File nodes to load.
   * @param data.symbols - Symbol nodes to load.
   * @param data.specs - Spec nodes to load.
   * @param data.relations - Relations to load.
   * @param data.onProgress - Optional progress callback.
   * @param data.vcsRef - Optional VCS ref to persist as `lastIndexedRef`.
   * @param data.graphFingerprint - Optional fingerprint for derivation mismatch detection.
   * @param data.documents - Optional array of document nodes.
   * @param data.observations - Freshness observations replacing indexed workspace state.
   * @param data.indexedWorkspaces - Workspaces whose observation snapshots are replaced.
   * @param data.clearGraphStaleLatch - Whether to clear the aggregate stale latch.
   * @param data.rebuildSearchIndexes - Whether searchable content changed and FTS must rebuild.
   * @param data.referenceFacts - Optional semantic-fact replacement snapshot.
   * @param data.removeFilePaths - File identities removed before inserting the generation.
   * @param data.removeDocumentPaths - Document identities removed before insertion.
   * @param data.removeSpecIds - Spec identities removed before insertion.
   * @param data.createRelationsInTransaction - Whether relations use transactional creates. Defaults to true because current Ladybug bindings do not reliably persist relationship COPY imports across reopen cycles.
   */
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
    referenceFacts?: ReferenceFactsWrite
    removeFilePaths?: readonly string[]
    removeDocumentPaths?: readonly string[]
    removeSpecIds?: readonly string[]
    createRelationsInTransaction?: boolean
  }): Promise<void> {
    this.ensureOpen()
    const conn = this.conn!

    const report = data.onProgress ?? ((): void => {})
    if (!existsSync(this.bulkLoadTmpDir)) {
      mkdirSync(this.bulkLoadTmpDir, { recursive: true })
    }
    const prefix = join(this.bulkLoadTmpDir, `codegraph-${Date.now()}-`)
    const csvFiles: string[] = []
    await conn.query('BEGIN TRANSACTION')
    try {
      report('cleanup')
      for (const path of data.removeFilePaths ?? []) {
        await this.deleteFileLocalState(conn, path)
      }
      for (const path of data.removeDocumentPaths ?? []) {
        await this.deleteDocumentLocalState(conn, path)
      }
      for (const id of data.removeSpecIds ?? []) {
        await this.deleteSpecLocalState(conn, id)
      }
      // Write File nodes CSV — batched to avoid native module segfaults on large datasets
      report(`Loading ${data.files.length} files`)
      if (data.files.length > 0) {
        const batchSize = 500
        for (let i = 0; i < data.files.length; i += batchSize) {
          const batch = data.files.slice(i, i + batchSize)
          const fileCsv = prefix + `files-${i}.csv`
          csvFiles.push(fileCsv)
          const fileRows = ['path,configRelativePath,language,contentHash,workspace,content']
          for (const f of batch) {
            fileRows.push(
              `${csvEscape(f.path)},${csvEscape(f.configRelativePath)},${csvEscape(f.language)},${csvEscape(f.contentHash)},${csvEscape(f.workspace)},${csvEscape(f.content ?? '')}`,
            )
          }
          writeFileSync(fileCsv, fileRows.join('\n') + '\n')
          await conn.query(`COPY File FROM "${fileCsv}" (HEADER=true, PARALLEL=false)`)
        }
      }

      // Write Symbol nodes CSV — batched to avoid native module segfaults on large datasets
      report(`Loading ${data.symbols.length} symbols`)
      if (data.symbols.length > 0) {
        const batchSize = 500
        for (let i = 0; i < data.symbols.length; i += batchSize) {
          const batch = data.symbols.slice(i, i + batchSize)
          const symCsv = prefix + `symbols-${i}.csv`
          csvFiles.push(symCsv)
          const symRows = [
            'id,name,searchName,kind,filePath,parentId,line,col,endLine,endCol,selectionStartLine,selectionStartCol,selectionEndLine,selectionEndCol,comment',
          ]
          for (const s of batch) {
            symRows.push(
              `${csvEscape(s.id)},${csvEscape(s.name)},${csvEscape(expandSymbolName(s.name))},${csvEscape(s.kind)},${csvEscape(s.filePath)},${csvEscape(s.parentId ?? '')},${s.line},${s.column},${s.endLine},${s.endColumn},${s.selectionRange.startLine},${s.selectionRange.startColumn},${s.selectionRange.endLine},${s.selectionRange.endColumn},${csvEscape(s.comment ?? '')}`,
            )
          }
          writeFileSync(symCsv, symRows.join('\n') + '\n')
          await conn.query(`COPY Symbol FROM "${symCsv}" (HEADER=true, PARALLEL=false)`)
        }
      }

      // Write Spec nodes CSV — batched to avoid native module segfaults on large datasets
      report(`Loading ${data.specs.length} specs`)
      if (data.specs.length > 0) {
        const batchSize = 500
        for (let i = 0; i < data.specs.length; i += batchSize) {
          const batch = data.specs.slice(i, i + batchSize)
          const specCsv = prefix + `specs-${i}.csv`
          csvFiles.push(specCsv)
          const specRows = ['specId,path,title,description,contentHash,content,workspace']
          for (const sp of batch) {
            specRows.push(
              `${csvEscape(sp.specId)},${csvEscape(sp.path)},${csvEscape(sp.title)},${csvEscape(sp.description)},${csvEscape(sp.contentHash)},${csvEscape(sp.content)},${csvEscape(sp.workspace)}`,
            )
          }
          writeFileSync(specCsv, specRows.join('\n') + '\n')
          await conn.query(`COPY Spec FROM "${specCsv}" (HEADER=true, PARALLEL=false)`)
        }
      }

      report(`Loading ${data.documents?.length ?? 0} documents`)
      if ((data.documents?.length ?? 0) > 0) {
        const batchSize = 500
        for (let i = 0; i < data.documents!.length; i += batchSize) {
          const batch = data.documents!.slice(i, i + batchSize)
          const docCsv = prefix + `documents-${i}.csv`
          csvFiles.push(docCsv)
          const docRows = ['path,configRelativePath,contentHash,content,workspace']
          for (const doc of batch) {
            docRows.push(
              `${csvEscape(doc.path)},${csvEscape(doc.configRelativePath)},${csvEscape(doc.contentHash)},${csvEscape(doc.content)},${csvEscape(doc.workspace)}`,
            )
          }
          writeFileSync(docCsv, docRows.join('\n') + '\n')
          await conn.query(`COPY Document FROM "${docCsv}" (HEADER=true, PARALLEL=false)`)
        }
      }

      if (data.referenceFacts !== undefined) {
        report('reference-facts')
        await this.replaceReferenceFactsInTransaction(conn, data.referenceFacts)
      }

      // Write relations CSVs — one per type
      // IGNORE_ERRORS skips rows referencing non-existent nodes (dangling imports to external files)
      const relsByType = new Map<string, Relation[]>()
      if (data.createRelationsInTransaction !== false) {
        for (const relation of data.relations) await this.createRelation(conn, relation)
      }
      for (const rel of data.relations) {
        if (data.createRelationsInTransaction !== false) continue
        const existing = relsByType.get(rel.type) ?? []
        existing.push(rel)
        relsByType.set(rel.type, existing)
      }

      for (const [type, rels] of relsByType) {
        if (rels.length === 0) continue
        // Process in batches to avoid LadybugDB blocking on large COPY operations
        const batchSize = 500
        for (let i = 0; i < rels.length; i += batchSize) {
          const batch = rels.slice(i, i + batchSize)
          const relCsv = prefix + `rel-${type.toLowerCase()}-${i}.csv`
          csvFiles.push(relCsv)
          const relRows = ['from,to']
          for (const r of batch) {
            relRows.push(`${csvEscape(r.source)},${csvEscape(r.target)}`)
          }
          writeFileSync(relCsv, relRows.join('\n') + '\n')
          report(`Loading ${type} ${i + batch.length}/${rels.length}`)
          await conn.query(
            `COPY ${type} FROM "${relCsv}" (HEADER=true, PARALLEL=false, IGNORE_ERRORS=true)`,
          )
        }
      }

      const now = new Date().toISOString()
      await this.updateMeta(conn, 'lastIndexedAt', now)
      if (data.vcsRef !== undefined) {
        await this.updateMeta(conn, 'lastIndexedRef', data.vcsRef)
      }
      if (data.graphFingerprint !== undefined) {
        await this.updateMeta(conn, 'graphFingerprint', data.graphFingerprint)
      }
      if (data.observations !== undefined) {
        for (const workspace of new Set(data.indexedWorkspaces ?? [])) {
          await runPrepared(
            conn,
            'MATCH (o:IndexedInputObservation {workspace: $workspace}) DELETE o',
            { workspace },
          )
          await this.setFreshnessLatch(conn, workspace, false)
        }
        if (data.clearGraphStaleLatch === true) {
          await this.setFreshnessLatch(conn, '__graph__', false)
        }
        for (const observation of data.observations) {
          await runPrepared(
            conn,
            `CREATE (o:IndexedInputObservation {
              id: $id, workspace: $workspace, resourceKind: $resourceKind,
              resourceId: $resourceId, inputKind: $inputKind, inputLocator: $inputLocator,
              indexedContentHash: $indexedContentHash, lastObservedMtime: $lastObservedMtime,
              lastObservedSize: $lastObservedSize, lastObservedRevision: $lastObservedRevision,
              generation: $generation, stale: false
            })`,
            toLadybugObservationParams(observation),
          )
        }
      }
      await conn.query('COMMIT')
      this._lastIndexedAt = now
      if (data.vcsRef !== undefined) {
        this._lastIndexedRef = data.vcsRef
      }
      if (data.graphFingerprint !== undefined) {
        this._graphFingerprint = data.graphFingerprint
      }
    } catch (err) {
      await conn.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      // Clean up temp files
      for (const f of csvFiles) {
        try {
          unlinkSync(f)
        } catch {
          // ignore cleanup errors
        }
      }
    }
    if (data.rebuildSearchIndexes !== false) {
      report('search-indexes')
      await this.rebuildFtsIndexes()
    }
  }

  /**
   * Returns persisted observations for requested logical resources.
   * @param resources - Logical resource identities.
   * @returns Matching observations in deterministic order.
   */
  async getIndexedInputObservations(
    resources: readonly IndexedResourceKey[],
  ): Promise<readonly IndexedInputObservation[]> {
    if (resources.length === 0) return []
    this.ensureOpen()
    const keys = new Set(resources.map(resourceKey))
    const rows = await exec(
      this.conn!,
      `MATCH (o:IndexedInputObservation) RETURN
       o.workspace AS workspace, o.resourceKind AS resourceKind, o.resourceId AS resourceId,
       o.inputKind AS inputKind, o.inputLocator AS inputLocator,
       o.indexedContentHash AS indexedContentHash, o.lastObservedMtime AS lastObservedMtime,
       o.lastObservedSize AS lastObservedSize, o.lastObservedRevision AS lastObservedRevision,
       o.generation AS generation, o.stale AS stale`,
    )
    return rows
      .map(toLadybugObservation)
      .filter((observation) => keys.has(resourceKey(observation)))
      .sort((left, right) => observationId(left).localeCompare(observationId(right)))
  }

  /**
   * Applies guarded monotonic stale updates.
   * @param updates - Guarded stale updates.
   */
  async markIndexedInputsStale(updates: readonly MarkIndexedInputStaleInput[]): Promise<void> {
    this.ensureOpen()
    for (const update of updates) {
      await runPrepared(
        this.conn!,
        `MATCH (o:IndexedInputObservation {id: $id})
         WHERE o.indexedContentHash = $expectedHash AND o.generation = $generation
           AND o.lastObservedRevision = $expectedRevision
         SET o.stale = true`,
        {
          id: observationId(update),
          expectedHash: update.expectedIndexedContentHash,
          generation: update.expectedGeneration,
          expectedRevision: update.expectedRevision ?? '',
        },
      )
    }
  }

  /**
   * Refreshes equal-content filesystem observation stamps.
   * @param updates - Equal-content stamp refreshes.
   */
  async updateIndexedInputObservations(
    updates: readonly UpdateIndexedInputObservationInput[],
  ): Promise<void> {
    this.ensureOpen()
    for (const update of updates) {
      await runPrepared(
        this.conn!,
        `MATCH (o:IndexedInputObservation {id: $id})
         WHERE o.indexedContentHash = $expectedHash AND o.generation = $generation
           AND o.lastObservedRevision = $expectedRevision AND o.stale = false
         SET o.lastObservedMtime = $mtime, o.lastObservedSize = $size`,
        {
          id: observationId(update),
          expectedHash: update.expectedIndexedContentHash,
          generation: update.expectedGeneration,
          expectedRevision: update.expectedRevision ?? '',
          mtime: update.lastObservedMtime,
          size: update.lastObservedSize,
        },
      )
    }
  }

  /**
   * Returns aggregate and workspace stale latches.
   * @param workspaces - Workspace names to project.
   * @returns Aggregate and workspace latch values.
   */
  async getFreshnessLatches(workspaces: readonly string[]): Promise<FreshnessLatches> {
    this.ensureOpen()
    const rows = await exec(
      this.conn!,
      'MATCH (l:FreshnessLatch) RETURN l.workspace AS workspace, l.knownStale AS knownStale',
    )
    const values = new Map(
      rows.map((row) => [row['workspace'] as string, row['knownStale'] === true]),
    )
    return {
      graph: values.get('__graph__') ?? false,
      workspaces: Object.fromEntries(
        workspaces.map((workspace) => [workspace, values.get(workspace) ?? false]),
      ),
    }
  }

  /**
   * Monotonically sets aggregate and workspace stale latches.
   * @param workspaces - Workspace names proven stale.
   */
  async markWorkspacesAndGraphStaleSinceLastIndex(workspaces: readonly string[]): Promise<void> {
    this.ensureOpen()
    await this.setFreshnessLatch(this.conn!, '__graph__', true)
    for (const workspace of new Set(workspaces)) {
      await this.setFreshnessLatch(this.conn!, workspace, true)
    }
  }

  /**
   * Replaces semantic reference facts inside a caller-owned Ladybug transaction.
   * @param conn - Open Ladybug connection owning the transaction.
   * @param facts - Complete semantic-fact replacement snapshot.
   */
  private async replaceReferenceFactsInTransaction(
    conn: Connection,
    facts: ReferenceFactsWrite,
  ): Promise<void> {
    for (const table of [
      'ResolutionStep',
      'LocalBinding',
      'PublicBinding',
      'LogicalDeclaration',
      'LogicalSymbol',
      'IndexCoverage',
    ]) {
      await conn.query(`MATCH (n:${table}) DELETE n`)
    }
    for (const symbol of facts.logicalSymbols) {
      await runPrepared(
        conn,
        `CREATE (n:LogicalSymbol {id: $id, workspace: $workspace, surface: $surface, name: $name, space: $space, ownerId: $ownerId, memberForm: $memberForm})`,
        {
          id: symbol.id,
          workspace: symbol.workspace,
          surface: symbol.surface,
          name: symbol.name,
          space: symbol.space,
          ownerId: symbol.ownerId ?? '',
          memberForm: symbol.memberForm ?? '',
        },
      )
    }
    for (const { logicalSymbolId, declaration } of facts.declarations) {
      await runPrepared(
        conn,
        `CREATE (n:LogicalDeclaration {id: $id, logicalSymbolId: $logicalSymbolId, symbolId: $symbolId, filePath: $filePath, line: $line, columnNumber: $columnNumber, endLine: $endLine, endColumn: $endColumn, kind: $kind})`,
        {
          id: JSON.stringify([logicalSymbolId, declaration.symbolId]),
          logicalSymbolId,
          symbolId: declaration.symbolId,
          filePath: declaration.location.filePath,
          line: declaration.location.line,
          columnNumber: declaration.location.column,
          endLine: declaration.location.endLine ?? declaration.location.line,
          endColumn: declaration.location.endColumn ?? declaration.location.column,
          kind: declaration.kind,
        },
      )
    }
    for (const binding of facts.publicBindings) {
      await runPrepared(
        conn,
        `CREATE (n:PublicBinding {id: $id, surface: $surface, exportedName: $exportedName, space: $space, targetId: $targetId})`,
        {
          id: binding.id,
          surface: binding.surface,
          exportedName: binding.exportedName,
          space: binding.space,
          targetId: binding.targetId ?? '',
        },
      )
    }
    for (const binding of facts.localBindings) {
      await runPrepared(
        conn,
        `CREATE (n:LocalBinding {id: $id, filePath: $filePath, scopeId: $scopeId, localName: $localName, space: $space, targetId: $targetId})`,
        {
          id: binding.id,
          filePath: binding.filePath,
          scopeId: binding.scopeId,
          localName: binding.localName,
          space: binding.space,
          targetId: binding.targetId ?? '',
        },
      )
    }
    for (const step of facts.steps) {
      await runPrepared(
        conn,
        `CREATE (n:ResolutionStep {id: $id, fromId: $fromId, toId: $toId, kind: $kind})`,
        { id: JSON.stringify([step.fromId, step.toId, step.kind]), ...step },
      )
    }
    for (const coverage of facts.coverage) {
      await runPrepared(
        conn,
        `CREATE (n:IndexCoverage {filePath: $filePath, contentHash: $contentHash, status: $status, reason: $reason, capabilitiesJson: $capabilitiesJson})`,
        {
          filePath: coverage.filePath,
          contentHash: coverage.contentHash ?? '',
          status: coverage.status,
          reason: coverage.reason ?? '',
          capabilitiesJson: JSON.stringify(coverage.capabilities),
        },
      )
    }
  }

  /**
   * Replaces every persisted semantic reference fact as one Ladybug transaction.
   * @param facts - Complete derived semantic snapshot.
   * @returns A promise that resolves when the replacement commits.
   */
  async replaceReferenceFacts(facts: ReferenceFactsWrite): Promise<void> {
    this.ensureOpen()
    const conn = this.conn!
    await conn.query('BEGIN TRANSACTION')
    try {
      for (const table of [
        'ResolutionStep',
        'LocalBinding',
        'PublicBinding',
        'LogicalDeclaration',
        'LogicalSymbol',
        'IndexCoverage',
      ]) {
        await conn.query(`MATCH (n:${table}) DELETE n`)
      }

      for (const symbol of facts.logicalSymbols) {
        await runPrepared(
          conn,
          `CREATE (n:LogicalSymbol {id: $id, workspace: $workspace, surface: $surface, name: $name, space: $space, ownerId: $ownerId, memberForm: $memberForm})`,
          {
            id: symbol.id,
            workspace: symbol.workspace,
            surface: symbol.surface,
            name: symbol.name,
            space: symbol.space,
            ownerId: symbol.ownerId ?? '',
            memberForm: symbol.memberForm ?? '',
          },
        )
      }
      for (const { logicalSymbolId, declaration } of facts.declarations) {
        await runPrepared(
          conn,
          `CREATE (n:LogicalDeclaration {id: $id, logicalSymbolId: $logicalSymbolId, symbolId: $symbolId, filePath: $filePath, line: $line, columnNumber: $columnNumber, endLine: $endLine, endColumn: $endColumn, kind: $kind})`,
          {
            id: JSON.stringify([logicalSymbolId, declaration.symbolId]),
            logicalSymbolId,
            symbolId: declaration.symbolId,
            filePath: declaration.location.filePath,
            line: declaration.location.line,
            columnNumber: declaration.location.column,
            endLine: declaration.location.endLine ?? declaration.location.line,
            endColumn: declaration.location.endColumn ?? declaration.location.column,
            kind: declaration.kind,
          },
        )
      }
      for (const binding of facts.publicBindings) {
        await runPrepared(
          conn,
          `CREATE (n:PublicBinding {id: $id, surface: $surface, exportedName: $exportedName, space: $space, targetId: $targetId})`,
          {
            id: binding.id,
            surface: binding.surface,
            exportedName: binding.exportedName,
            space: binding.space,
            targetId: binding.targetId ?? '',
          },
        )
      }
      for (const binding of facts.localBindings) {
        await runPrepared(
          conn,
          `CREATE (n:LocalBinding {id: $id, filePath: $filePath, scopeId: $scopeId, localName: $localName, space: $space, targetId: $targetId})`,
          {
            id: binding.id,
            filePath: binding.filePath,
            scopeId: binding.scopeId,
            localName: binding.localName,
            space: binding.space,
            targetId: binding.targetId ?? '',
          },
        )
      }
      for (const step of facts.steps) {
        await runPrepared(
          conn,
          `CREATE (n:ResolutionStep {id: $id, fromId: $fromId, toId: $toId, kind: $kind})`,
          { id: JSON.stringify([step.fromId, step.toId, step.kind]), ...step },
        )
      }
      for (const coverage of facts.coverage) {
        await runPrepared(
          conn,
          `CREATE (n:IndexCoverage {filePath: $filePath, contentHash: $contentHash, status: $status, reason: $reason, capabilitiesJson: $capabilitiesJson})`,
          {
            filePath: coverage.filePath,
            contentHash: coverage.contentHash ?? '',
            status: coverage.status,
            reason: coverage.reason ?? '',
            capabilitiesJson: JSON.stringify(coverage.capabilities),
          },
        )
      }
      await conn.query('COMMIT')
    } catch (error) {
      await conn.query('ROLLBACK').catch(() => {})
      throw error
    }
  }

  /**
   * Finds logical symbols matching structured lookup keys.
   * @param lookups - Structured logical keys.
   * @returns Matched logical symbols in canonical order.
   */
  async findLogicalSymbols(lookups: readonly LogicalSymbolLookup[]): Promise<LogicalSymbol[]> {
    this.ensureOpen()
    const results = new Map<string, LogicalSymbol>()
    for (const lookup of lookups) {
      const rows = await execPrepared(
        this.conn!,
        `MATCH (n:LogicalSymbol {workspace: $workspace, name: $name})
         WHERE ($surface = '' OR n.surface = $surface) AND ($space = '' OR n.space = $space)
           AND ($ownerId = '' OR n.ownerId = $ownerId) AND ($memberForm = '' OR n.memberForm = $memberForm)
         RETURN n.id AS id, n.workspace AS workspace, n.surface AS surface, n.name AS name, n.space AS space, n.ownerId AS ownerId, n.memberForm AS memberForm`,
        {
          workspace: lookup.workspace,
          name: lookup.name,
          surface: lookup.surface ?? '',
          space: lookup.space ?? '',
          ownerId: lookup.ownerId ?? '',
          memberForm: lookup.memberForm ?? '',
        },
      )
      for (const row of rows) {
        const symbol: LogicalSymbol = {
          id: row['id'] as string,
          workspace: row['workspace'] as string,
          surface: row['surface'] as string,
          name: row['name'] as string,
          space: row['space'] as LogicalSymbol['space'],
          ownerId: (row['ownerId'] as string) || undefined,
          memberForm: ((row['memberForm'] as string) || undefined) as LogicalSymbol['memberForm'],
        }
        results.set(symbol.id, symbol)
      }
    }
    return [...results.values()].sort(compareLogicalSymbols)
  }

  /**
   * Returns the complete semantic snapshot used for incremental hydration.
   * @returns Deterministically ordered persisted reference facts.
   */
  async getAllReferenceFacts(): Promise<ReferenceFactsWrite> {
    this.ensureOpen()
    const [logicalRows, declarationRows, publicRows, localRows, stepRows, coverage] =
      await Promise.all([
        execPrepared(
          this.conn!,
          'MATCH (n:LogicalSymbol) RETURN n.id AS id, n.workspace AS workspace, n.surface AS surface, n.name AS name, n.space AS space, n.ownerId AS ownerId, n.memberForm AS memberForm',
          {},
        ),
        execPrepared(
          this.conn!,
          'MATCH (n:LogicalDeclaration) RETURN n.logicalSymbolId AS logicalSymbolId, n.symbolId AS symbolId, n.filePath AS filePath, n.line AS line, n.columnNumber AS columnNumber, n.endLine AS endLine, n.endColumn AS endColumn, n.kind AS kind',
          {},
        ),
        execPrepared(
          this.conn!,
          'MATCH (n:PublicBinding) RETURN n.id AS id, n.surface AS surface, n.exportedName AS exportedName, n.space AS space, n.targetId AS targetId',
          {},
        ),
        execPrepared(
          this.conn!,
          'MATCH (n:LocalBinding) RETURN n.id AS id, n.filePath AS filePath, n.scopeId AS scopeId, n.localName AS localName, n.space AS space, n.targetId AS targetId',
          {},
        ),
        execPrepared(
          this.conn!,
          'MATCH (n:ResolutionStep) RETURN n.fromId AS fromId, n.toId AS toId, n.kind AS kind',
          {},
        ),
        this.getAllIndexCoverage(),
      ])
    const logicalSymbols = logicalRows
      .map(
        (row): LogicalSymbol => ({
          id: row['id'] as string,
          workspace: row['workspace'] as string,
          surface: row['surface'] as string,
          name: row['name'] as string,
          space: row['space'] as LogicalSymbol['space'],
          ownerId: (row['ownerId'] as string) || undefined,
          memberForm: ((row['memberForm'] as string) || undefined) as LogicalSymbol['memberForm'],
        }),
      )
      .sort(compareLogicalSymbols)
    const declarations = declarationRows
      .map(
        (row): LogicalDeclaration => ({
          logicalSymbolId: row['logicalSymbolId'] as string,
          declaration: {
            logicalId: row['logicalSymbolId'] as string,
            symbolId: row['symbolId'] as string,
            location: {
              filePath: row['filePath'] as string,
              line: Number(row['line']),
              column: Number(row['columnNumber']),
              endLine: Number(row['endLine']),
              endColumn: Number(row['endColumn']),
            },
            kind: row['kind'] as LogicalDeclaration['declaration']['kind'],
          },
        }),
      )
      .sort(compareLogicalDeclarations)
    const publicBindings = publicRows
      .map(
        (row): PublicBinding => ({
          id: row['id'] as string,
          surface: row['surface'] as string,
          exportedName: row['exportedName'] as string,
          space: row['space'] as PublicBinding['space'],
          targetId: (row['targetId'] as string) || undefined,
        }),
      )
      .sort(comparePublicBindings)
    const localBindings = localRows
      .map(
        (row): LocalBinding => ({
          id: row['id'] as string,
          filePath: row['filePath'] as string,
          scopeId: row['scopeId'] as string,
          localName: row['localName'] as string,
          space: row['space'] as LocalBinding['space'],
          targetId: (row['targetId'] as string) || undefined,
        }),
      )
      .sort(compareLocalBindings)
    const steps = stepRows
      .map((row) => ({
        fromId: row['fromId'] as string,
        toId: row['toId'] as string,
        kind: row['kind'] as string,
      }))
      .sort(compareResolutionSteps)
    return { logicalSymbols, declarations, publicBindings, localBindings, steps, coverage }
  }

  /**
   * Finds logical symbols by canonical identifiers.
   * @param ids - Canonical logical-symbol identifiers.
   * @returns Matching logical symbols in deterministic order.
   */
  async findLogicalSymbolsByIds(ids: readonly string[]): Promise<LogicalSymbol[]> {
    this.ensureOpen()
    if (ids.length === 0) return []
    const rows = await execPrepared(
      this.conn!,
      `MATCH (n:LogicalSymbol) WHERE n.id IN $ids
       RETURN n.id AS id, n.workspace AS workspace, n.surface AS surface, n.name AS name, n.space AS space, n.ownerId AS ownerId, n.memberForm AS memberForm`,
      { ids: [...new Set(ids)] },
    )
    return rows
      .map(
        (row): LogicalSymbol => ({
          id: row['id'] as string,
          workspace: row['workspace'] as string,
          surface: row['surface'] as string,
          name: row['name'] as string,
          space: row['space'] as LogicalSymbol['space'],
          ownerId: (row['ownerId'] as string) || undefined,
          memberForm: ((row['memberForm'] as string) || undefined) as LogicalSymbol['memberForm'],
        }),
      )
      .sort(compareLogicalSymbols)
  }

  /**
   * Finds declaration occurrences for logical targets.
   * @param logicalSymbolIds - Logical target ids.
   * @returns Their declaration occurrences in canonical order.
   */
  async findDeclarations(logicalSymbolIds: readonly string[]): Promise<LogicalDeclaration[]> {
    this.ensureOpen()
    if (logicalSymbolIds.length === 0) return []
    const rows = await execPrepared(
      this.conn!,
      `MATCH (n:LogicalDeclaration) WHERE n.logicalSymbolId IN $ids
       RETURN n.logicalSymbolId AS logicalSymbolId, n.symbolId AS symbolId, n.filePath AS filePath, n.line AS line, n.columnNumber AS columnNumber, n.endLine AS endLine, n.endColumn AS endColumn, n.kind AS kind`,
      { ids: [...new Set(logicalSymbolIds)] },
    )
    return rows
      .map(
        (row): LogicalDeclaration => ({
          logicalSymbolId: row['logicalSymbolId'] as string,
          declaration: {
            logicalId: row['logicalSymbolId'] as string,
            symbolId: row['symbolId'] as string,
            location: {
              filePath: row['filePath'] as string,
              line: Number(row['line']),
              column: Number(row['columnNumber']),
              endLine: Number(row['endLine']),
              endColumn: Number(row['endColumn']),
            },
            kind: row['kind'] as LogicalDeclaration['declaration']['kind'],
          },
        }),
      )
      .sort(compareLogicalDeclarations)
  }

  /**
   * Finds public bindings matching public route keys.
   * @param lookups - Public route keys.
   * @returns Matched public bindings in canonical order.
   */
  async findPublicBindings(lookups: readonly PublicBindingLookup[]): Promise<PublicBinding[]> {
    this.ensureOpen()
    const results = new Map<string, PublicBinding>()
    for (const lookup of lookups) {
      const rows = await execPrepared(
        this.conn!,
        `MATCH (n:PublicBinding {surface: $surface, exportedName: $exportedName})
         WHERE ($space = '' OR n.space = $space)
         RETURN n.id AS id, n.surface AS surface, n.exportedName AS exportedName, n.space AS space, n.targetId AS targetId`,
        { surface: lookup.surface, exportedName: lookup.exportedName, space: lookup.space ?? '' },
      )
      for (const row of rows) {
        const binding: PublicBinding = {
          id: row['id'] as string,
          surface: row['surface'] as string,
          exportedName: row['exportedName'] as string,
          space: row['space'] as PublicBinding['space'],
          targetId: (row['targetId'] as string) || undefined,
        }
        results.set(binding.id, binding)
      }
    }
    return [...results.values()].sort(comparePublicBindings)
  }

  /**
   * Finds public bindings by exported spelling across all public surfaces.
   * @param exportedNames - Exported spellings.
   * @returns Matched public bindings in canonical order.
   */
  async findPublicBindingsByExportedNames(
    exportedNames: readonly string[],
  ): Promise<PublicBinding[]> {
    this.ensureOpen()
    const results = new Map<string, PublicBinding>()
    for (const exportedName of new Set(exportedNames)) {
      const rows = await execPrepared(
        this.conn!,
        `MATCH (n:PublicBinding {exportedName: $exportedName})
         RETURN n.id AS id, n.surface AS surface, n.exportedName AS exportedName, n.space AS space, n.targetId AS targetId`,
        { exportedName },
      )
      for (const row of rows) {
        const binding: PublicBinding = {
          id: row['id'] as string,
          surface: row['surface'] as string,
          exportedName: row['exportedName'] as string,
          space: row['space'] as PublicBinding['space'],
          targetId: (row['targetId'] as string) || undefined,
        }
        results.set(binding.id, binding)
      }
    }
    return [...results.values()].sort(comparePublicBindings)
  }

  /**
   * Finds local bindings matching lexical lookup keys.
   * @param lookups - Lexical binding keys.
   * @returns Matched local bindings in canonical order.
   */
  async findLocalBindings(lookups: readonly LocalBindingLookup[]): Promise<LocalBinding[]> {
    this.ensureOpen()
    const results = new Map<string, LocalBinding>()
    for (const lookup of lookups) {
      const rows = await execPrepared(
        this.conn!,
        `MATCH (n:LocalBinding {filePath: $filePath, localName: $localName})
         WHERE ($scopeId = '' OR n.scopeId = $scopeId) AND ($space = '' OR n.space = $space)
         RETURN n.id AS id, n.filePath AS filePath, n.scopeId AS scopeId, n.localName AS localName, n.space AS space, n.targetId AS targetId`,
        {
          filePath: lookup.filePath,
          localName: lookup.localName,
          scopeId: lookup.scopeId ?? '',
          space: lookup.space ?? '',
        },
      )
      for (const row of rows) {
        const binding: LocalBinding = {
          id: row['id'] as string,
          filePath: row['filePath'] as string,
          scopeId: row['scopeId'] as string,
          localName: row['localName'] as string,
          space: row['space'] as LocalBinding['space'],
          targetId: (row['targetId'] as string) || undefined,
        }
        results.set(binding.id, binding)
      }
    }
    return [...results.values()].sort(compareLocalBindings)
  }

  /**
   * Finds provenance steps by source identity.
   * @param fromIds - Provenance source ids.
   * @returns Matching resolution steps in canonical order.
   */
  async findResolutionSteps(fromIds: readonly string[]): Promise<ResolutionStep[]> {
    this.ensureOpen()
    if (fromIds.length === 0) return []
    const rows = await execPrepared(
      this.conn!,
      `MATCH (n:ResolutionStep) WHERE n.fromId IN $ids RETURN n.fromId AS fromId, n.toId AS toId, n.kind AS kind`,
      { ids: [...new Set(fromIds)] },
    )
    return rows
      .map((row) => ({
        fromId: row['fromId'] as string,
        toId: row['toId'] as string,
        kind: row['kind'] as string,
      }))
      .sort(compareResolutionSteps)
  }

  /**
   * Finds current index coverage evidence by source path.
   * @param filePaths - Indexed source paths.
   * @returns Matching coverage evidence in path order.
   */
  async findIndexCoverage(filePaths: readonly string[]): Promise<IndexCoverage[]> {
    this.ensureOpen()
    if (filePaths.length === 0) return []
    const rows = await execPrepared(
      this.conn!,
      `MATCH (n:IndexCoverage) WHERE n.filePath IN $paths
       RETURN n.filePath AS filePath, n.contentHash AS contentHash, n.status AS status, n.reason AS reason, n.capabilitiesJson AS capabilitiesJson`,
      { paths: [...new Set(filePaths)] },
    )
    return rows
      .map(
        (row): IndexCoverage => ({
          filePath: row['filePath'] as string,
          contentHash: (row['contentHash'] as string) || undefined,
          status: row['status'] as IndexCoverage['status'],
          reason: (row['reason'] as string) || undefined,
          capabilities: JSON.parse(row['capabilitiesJson'] as string) as string[],
        }),
      )
      .sort((left, right) => left.filePath.localeCompare(right.filePath))
  }

  /**
   * Returns all persisted coverage evidence in deterministic path order.
   * @returns Every coverage fact ordered by file path.
   */
  async getAllIndexCoverage(): Promise<IndexCoverage[]> {
    this.ensureOpen()
    const rows = await execPrepared(
      this.conn!,
      `MATCH (n:IndexCoverage)
       RETURN n.filePath AS filePath, n.contentHash AS contentHash, n.status AS status, n.reason AS reason, n.capabilitiesJson AS capabilitiesJson
       ORDER BY filePath`,
      {},
    )
    return rows.map(
      (row): IndexCoverage => ({
        filePath: row['filePath'] as string,
        contentHash: (row['contentHash'] as string) || undefined,
        status: row['status'] as IndexCoverage['status'],
        reason: (row['reason'] as string) || undefined,
        capabilities: JSON.parse(row['capabilitiesJson'] as string) as string[],
      }),
    )
  }

  /**
   * Inserts or replaces a spec node along with its dependency relations.
   * @param spec - The spec node to upsert.
   * @param relations - Dependency relations for this spec.
   */
  async upsertSpec(spec: SpecNode, relations: Relation[]): Promise<void> {
    this.ensureOpen()
    const conn = this.conn!

    await conn.query('BEGIN TRANSACTION')
    try {
      await this.deleteSpecLocalState(conn, spec.specId)

      await runPrepared(
        conn,
        `CREATE (s:Spec {specId: $specId, path: $path, title: $title, description: $description, contentHash: $contentHash, content: $content, workspace: $workspace})`,
        {
          specId: spec.specId,
          path: spec.path,
          title: spec.title,
          description: spec.description,
          contentHash: spec.contentHash,
          content: spec.content,
          workspace: spec.workspace,
        },
      )

      for (const rel of relations) {
        await this.createRelation(conn, rel)
      }

      await conn.query('COMMIT')
    } catch (err) {
      await conn.query('ROLLBACK').catch(() => {})
      throw err
    }
    await this.rebuildFtsIndexes()
  }

  /**
   * Removes a spec node and all its relations from the graph.
   * @param specId - Identifier of the spec to remove.
   */
  async removeSpec(specId: string): Promise<void> {
    this.ensureOpen()
    const conn = this.conn!
    await this.deleteSpecLocalState(conn, specId)
    await this.rebuildFtsIndexes()
  }

  /**
   * Removes multiple spec nodes by their IDs.
   * @param specIds - Array of spec IDs to remove.
   */
  async removeSpecs(specIds: readonly string[]): Promise<void> {
    if (specIds.length === 0) return
    this.ensureOpen()
    const conn = this.conn!
    for (const specId of specIds) {
      await this.deleteSpecLocalState(conn, specId)
    }
    await this.rebuildFtsIndexes()
  }

  /**
   * Retrieves a file node by its path.
   * @param path - The file path to look up.
   * @returns The file node, or undefined if not found.
   */
  async getFile(path: string): Promise<FileNode | undefined> {
    this.ensureOpen()
    const rows = await execPrepared(
      this.conn!,
      `MATCH (f:File {path: $path}) RETURN f.path AS path, f.configRelativePath AS configRelativePath, f.language AS language, f.contentHash AS contentHash, f.workspace AS workspace, f.content AS content`,
      { path },
    )
    if (rows.length === 0 || !rows[0]) return undefined
    return this.rowToFile(rows[0])
  }

  /**
   * Retrieves a document by its exact path.
   * @param path - The path of the document to retrieve.
   * @returns The document node, or undefined if not found.
   */
  async getDocument(path: string): Promise<DocumentNode | undefined> {
    this.ensureOpen()
    const rows = await execPrepared(
      this.conn!,
      `MATCH (d:Document {path: $path}) RETURN d.path AS path, d.configRelativePath AS configRelativePath, d.contentHash AS contentHash, d.content AS content, d.workspace AS workspace`,
      { path },
    )
    if (rows.length === 0 || !rows[0]) return undefined
    return this.rowToDocument(rows[0])
  }

  /**
   * Finds files by their config-relative path.
   * @param configRelativePath - The config-relative path to search for.
   * @returns Matching file nodes.
   */
  async findFilesByConfigRelativePath(configRelativePath: string): Promise<FileNode[]> {
    this.ensureOpen()
    const rows = await execPrepared(
      this.conn!,
      `MATCH (f:File {configRelativePath: $configRelativePath}) RETURN f.path AS path, f.configRelativePath AS configRelativePath, f.language AS language, f.contentHash AS contentHash, f.workspace AS workspace, f.content AS content`,
      { configRelativePath },
    )
    return rows.map((row) => this.rowToFile(row))
  }

  /**
   * Retrieves documents by their configRelativePath.
   * @param configRelativePath - The config relative path to match.
   * @returns An array of matching document nodes.
   */
  async findDocumentsByConfigRelativePath(configRelativePath: string): Promise<DocumentNode[]> {
    this.ensureOpen()
    const rows = await execPrepared(
      this.conn!,
      `MATCH (d:Document {configRelativePath: $configRelativePath}) RETURN d.path AS path, d.configRelativePath AS configRelativePath, d.contentHash AS contentHash, d.content AS content, d.workspace AS workspace`,
      { configRelativePath },
    )
    return rows.map((row) => this.rowToDocument(row))
  }

  /**
   * Retrieves a symbol node by its unique identifier.
   * @param id - The symbol identifier.
   * @returns The symbol node, or undefined if not found.
   */
  async getSymbol(id: string): Promise<SymbolNode | undefined> {
    this.ensureOpen()
    const rows = await execPrepared(
      this.conn!,
      `MATCH (s:Symbol {id: $id}) RETURN s.id AS id, s.name AS name, s.kind AS kind, s.filePath AS filePath, s.parentId AS parentId, s.line AS line, s.col AS col, s.endLine AS endLine, s.endCol AS endCol, s.selectionStartLine AS selectionStartLine, s.selectionStartCol AS selectionStartCol, s.selectionEndLine AS selectionEndLine, s.selectionEndCol AS selectionEndCol, s.comment AS comment`,
      { id },
    )
    if (rows.length === 0 || !rows[0]) return undefined
    return this.rowToSymbol(rows[0])
  }

  /**
   * Retrieves a spec node by its identifier, including its dependency list.
   * @param specId - The spec identifier.
   * @returns The spec node, or undefined if not found.
   */
  async getSpec(specId: string): Promise<SpecNode | undefined> {
    this.ensureOpen()
    const rows = await execPrepared(
      this.conn!,
      `MATCH (s:Spec {specId: $specId}) RETURN s.specId AS specId, s.path AS path, s.title AS title, s.description AS description, s.contentHash AS contentHash, s.content AS content, s.workspace AS workspace`,
      { specId },
    )
    if (rows.length === 0 || !rows[0]) return undefined
    const row = rows[0]

    const depRows = await execPrepared(
      this.conn!,
      `MATCH (s:Spec {specId: $specId})-[:DEPENDS_ON]->(t:Spec) RETURN t.specId AS target`,
      { specId },
    )

    return {
      specId: row['specId'] as string,
      path: row['path'] as string,
      title: row['title'] as string,
      description: (row['description'] as string) ?? '',
      contentHash: row['contentHash'] as string,
      content: (row['content'] as string) ?? '',
      dependsOn: depRows.map((r) => r['target'] as string),
      workspace: (row['workspace'] as string) ?? '',
    }
  }

  /**
   * Returns all CALLS relations where the given symbol is the target (i.e., its callers).
   * @param symbolId - The symbol identifier to find callers for.
   * @returns An array of caller relations.
   */
  async getCallers(symbolId: string): Promise<Relation[]> {
    const batches = await Promise.all(
      SYMBOL_DEPENDENCY_RELATION_TYPES.map((type) =>
        this.getIncomingSymbolRelations(type, symbolId),
      ),
    )
    return batches.flat()
  }

  /**
   * Returns all CALLS relations where the given symbol is the source (i.e., its callees).
   * @param symbolId - The symbol identifier to find callees for.
   * @returns An array of callee relations.
   */
  async getCallees(symbolId: string): Promise<Relation[]> {
    const batches = await Promise.all(
      SYMBOL_DEPENDENCY_RELATION_TYPES.map((type) =>
        this.getOutgoingSymbolRelations(type, symbolId),
      ),
    )
    return batches.flat()
  }

  /**
   * Returns all files that import the given file.
   * @param filePath - The file path to find importers for.
   * @returns An array of import relations.
   */
  async getImporters(filePath: string): Promise<Relation[]> {
    this.ensureOpen()
    const rows = await execPrepared(
      this.conn!,
      `MATCH (importer:File)-[:IMPORTS]->(f:File {path: $filePath}) RETURN importer.path AS source`,
      { filePath },
    )
    return rows.map((r) => ({
      source: r['source'] as string,
      target: filePath,
      type: RT.Imports as RelationType,
      metadata: undefined,
    }))
  }

  /**
   * Returns all files imported by the given file.
   * @param filePath - The file path to find importees for.
   * @returns An array of import relations.
   */
  async getImportees(filePath: string): Promise<Relation[]> {
    this.ensureOpen()
    const rows = await execPrepared(
      this.conn!,
      `MATCH (f:File {path: $filePath})-[:IMPORTS]->(imported:File) RETURN imported.path AS target`,
      { filePath },
    )
    return rows.map((r) => ({
      source: filePath,
      target: r['target'] as string,
      type: RT.Imports as RelationType,
      metadata: undefined,
    }))
  }

  /**
   * Finds direct importer and symbol-relation dependents in a bounded query set.
   * @param filePaths - Target file identities.
   * @returns Sorted dependent file identities.
   */
  async findDirectlyAffectedFiles(filePaths: readonly string[]): Promise<string[]> {
    this.ensureOpen()
    const paths = [...new Set(filePaths)]
    if (paths.length === 0) return []
    const relationTypes = ['CALLS', 'CONSTRUCTS', 'USES_TYPE', 'EXTENDS', 'IMPLEMENTS', 'OVERRIDES']
    const [importRows, ...symbolRowBatches] = await Promise.all([
      execPrepared(
        this.conn!,
        'MATCH (source:File)-[:IMPORTS]->(target:File) WHERE target.path IN $paths RETURN DISTINCT source.path AS filePath',
        { paths },
      ),
      ...relationTypes.map((relationType) =>
        execPrepared(
          this.conn!,
          `MATCH (source:Symbol)-[:${relationType}]->(target:Symbol) WHERE target.filePath IN $paths RETURN DISTINCT source.filePath AS filePath`,
          { paths },
        ),
      ),
    ])
    return [
      ...new Set(
        [...importRows, ...symbolRowBatches.flat()].map((row) => row['filePath'] as string),
      ),
    ].sort()
  }

  /**
   * Returns all incoming EXTENDS relations targeting the given type symbol.
   * @param symbolId - The type symbol identifier.
   * @returns Incoming EXTENDS relations.
   */
  async getExtenders(symbolId: string): Promise<Relation[]> {
    return this.getIncomingSymbolRelations(RT.Extends, symbolId)
  }

  /**
   * Returns all outgoing EXTENDS relations originating from the given type symbol.
   * @param symbolId - The type symbol identifier.
   * @returns Outgoing EXTENDS relations.
   */
  async getExtendedTargets(symbolId: string): Promise<Relation[]> {
    return this.getOutgoingSymbolRelations(RT.Extends, symbolId)
  }

  /**
   * Returns all incoming IMPLEMENTS relations targeting the given contract symbol.
   * @param symbolId - The contract symbol identifier.
   * @returns Incoming IMPLEMENTS relations.
   */
  async getImplementors(symbolId: string): Promise<Relation[]> {
    return this.getIncomingSymbolRelations(RT.Implements, symbolId)
  }

  /**
   * Returns all outgoing IMPLEMENTS relations originating from the given type symbol.
   * @param symbolId - The type symbol identifier.
   * @returns Outgoing IMPLEMENTS relations.
   */
  async getImplementedTargets(symbolId: string): Promise<Relation[]> {
    return this.getOutgoingSymbolRelations(RT.Implements, symbolId)
  }

  /**
   * Returns all incoming OVERRIDES relations targeting the given method symbol.
   * @param symbolId - The method symbol identifier.
   * @returns Incoming OVERRIDES relations.
   */
  async getOverriders(symbolId: string): Promise<Relation[]> {
    return this.getIncomingSymbolRelations(RT.Overrides, symbolId)
  }

  /**
   * Returns all outgoing OVERRIDES relations originating from the given method symbol.
   * @param symbolId - The method symbol identifier.
   * @returns Outgoing OVERRIDES relations.
   */
  async getOverriddenTargets(symbolId: string): Promise<Relation[]> {
    return this.getOutgoingSymbolRelations(RT.Overrides, symbolId)
  }

  /**
   * Returns all symbols exported by the given file.
   * @param filePath - The file path to find exports for.
   * @returns An array of exported symbol nodes.
   */
  async getExportedSymbols(filePath: string): Promise<SymbolNode[]> {
    this.ensureOpen()
    const rows = await execPrepared(
      this.conn!,
      `MATCH (f:File {path: $filePath})-[:EXPORTS]->(s:Symbol) RETURN s.id AS id, s.name AS name, s.kind AS kind, s.filePath AS filePath, s.parentId AS parentId, s.line AS line, s.col AS col, s.endLine AS endLine, s.endCol AS endCol, s.selectionStartLine AS selectionStartLine, s.selectionStartCol AS selectionStartCol, s.selectionEndLine AS selectionEndLine, s.selectionEndCol AS selectionEndCol, s.comment AS comment`,
      { filePath },
    )
    return rows.map((r) => this.rowToSymbol(r))
  }

  /**
   * Returns all specs that the given spec depends on.
   * @param specId - The spec identifier.
   * @returns An array of DEPENDS_ON relations.
   */
  async getSpecDependencies(specId: string): Promise<Relation[]> {
    this.ensureOpen()
    const rows = await execPrepared(
      this.conn!,
      `MATCH (s:Spec {specId: $specId})-[:DEPENDS_ON]->(t:Spec) RETURN t.specId AS target`,
      { specId },
    )
    return rows.map((r) => ({
      source: specId,
      target: r['target'] as string,
      type: RT.DependsOn as RelationType,
      metadata: undefined,
    }))
  }

  /**
   * Returns all specs that depend on the given spec.
   * @param specId - The spec identifier.
   * @returns An array of DEPENDS_ON relations.
   */
  async getSpecDependents(specId: string): Promise<Relation[]> {
    this.ensureOpen()
    const rows = await execPrepared(
      this.conn!,
      `MATCH (s:Spec)-[:DEPENDS_ON]->(t:Spec {specId: $specId}) RETURN s.specId AS source`,
      { specId },
    )
    return rows.map((r) => ({
      source: r['source'] as string,
      target: specId,
      type: RT.DependsOn as RelationType,
      metadata: undefined,
    }))
  }

  /**
   * Returns file coverage relations for a spec from the Ladybug backend.
   * @param specId - Spec identifier.
   * @returns File coverage relations.
   */
  async getCoveredFiles(specId: string): Promise<Relation[]> {
    this.ensureOpen()
    const rows = await execPrepared(
      this.conn!,
      `MATCH (s:Spec {specId: $specId})-[r:COVERS_FILE]->(f:File) RETURN f.path AS target, r.metadata_json AS metadata_json`,
      { specId },
    )
    return rows.map((r) => ({
      source: specId,
      target: r['target'] as string,
      type: RT.CoversFile as RelationType,
      metadata: r['metadata_json']
        ? (JSON.parse(r['metadata_json'] as string) as Record<string, unknown>)
        : undefined,
    }))
  }

  /**
   * Returns specs that cover a given file from the Ladybug backend.
   * @param filePath - Canonical file path.
   * @returns File coverage relations keyed by spec.
   */
  async getCoveringSpecsForFile(filePath: string): Promise<Relation[]> {
    this.ensureOpen()
    const rows = await execPrepared(
      this.conn!,
      `MATCH (s:Spec)-[r:COVERS_FILE]->(f:File {path: $filePath}) RETURN s.specId AS source, r.metadata_json AS metadata_json`,
      { filePath },
    )
    return rows.map((r) => ({
      source: r['source'] as string,
      target: filePath,
      type: RT.CoversFile as RelationType,
      metadata: r['metadata_json']
        ? (JSON.parse(r['metadata_json'] as string) as Record<string, unknown>)
        : undefined,
    }))
  }

  /**
   * Returns file coverage for many targets in one backend query.
   * @param filePaths - Canonical file paths.
   * @returns Deterministically ordered coverage relations.
   */
  async getCoveringSpecsForFiles(filePaths: readonly string[]): Promise<Relation[]> {
    this.ensureOpen()
    const targets = [...new Set(filePaths)].sort()
    if (targets.length === 0) return []
    const rows = await execPrepared(
      this.conn!,
      `MATCH (s:Spec)-[r:COVERS_FILE]->(f:File) WHERE f.path IN $targets RETURN s.specId AS source, f.path AS target, r.metadata_json AS metadata_json ORDER BY source, target`,
      { targets },
    )
    return rows.map((row) => ({
      source: row['source'] as string,
      target: row['target'] as string,
      type: RT.CoversFile as RelationType,
      metadata: row['metadata_json']
        ? (JSON.parse(row['metadata_json'] as string) as Record<string, unknown>)
        : undefined,
    }))
  }

  /**
   * Returns symbol coverage relations for a spec from the Ladybug backend.
   * @param specId - Spec identifier.
   * @returns Symbol coverage relations.
   */
  async getCoveredSymbols(specId: string): Promise<Relation[]> {
    this.ensureOpen()
    const rows = await execPrepared(
      this.conn!,
      `MATCH (s:Spec {specId: $specId})-[r:COVERS_SYMBOL]->(sym:Symbol) RETURN sym.id AS target, r.metadata_json AS metadata_json`,
      { specId },
    )
    return rows.map((r) => ({
      source: specId,
      target: r['target'] as string,
      type: RT.CoversSymbol as RelationType,
      metadata: r['metadata_json']
        ? (JSON.parse(r['metadata_json'] as string) as Record<string, unknown>)
        : undefined,
    }))
  }

  /**
   * Returns specs that cover a given symbol from the Ladybug backend.
   * @param symbolId - Canonical symbol identifier.
   * @returns Symbol coverage relations keyed by spec.
   */
  async getCoveringSpecsForSymbol(symbolId: string): Promise<Relation[]> {
    this.ensureOpen()
    const rows = await execPrepared(
      this.conn!,
      `MATCH (s:Spec)-[r:COVERS_SYMBOL]->(sym:Symbol {id: $symbolId}) RETURN s.specId AS source, r.metadata_json AS metadata_json`,
      { symbolId },
    )
    return rows.map((r) => ({
      source: r['source'] as string,
      target: symbolId,
      type: RT.CoversSymbol as RelationType,
      metadata: r['metadata_json']
        ? (JSON.parse(r['metadata_json'] as string) as Record<string, unknown>)
        : undefined,
    }))
  }

  /**
   * Returns symbol coverage for many targets in one backend query.
   * @param symbolIds - Symbol identifiers.
   * @returns Deterministically ordered coverage relations.
   */
  async getCoveringSpecsForSymbols(symbolIds: readonly string[]): Promise<Relation[]> {
    this.ensureOpen()
    const targets = [...new Set(symbolIds)].sort()
    if (targets.length === 0) return []
    const rows = await execPrepared(
      this.conn!,
      `MATCH (s:Spec)-[r:COVERS_SYMBOL]->(sym:Symbol) WHERE sym.id IN $targets RETURN s.specId AS source, sym.id AS target, r.metadata_json AS metadata_json ORDER BY source, target`,
      { targets },
    )
    return rows.map((row) => ({
      source: row['source'] as string,
      target: row['target'] as string,
      type: RT.CoversSymbol as RelationType,
      metadata: row['metadata_json']
        ? (JSON.parse(row['metadata_json'] as string) as Record<string, unknown>)
        : undefined,
    }))
  }

  /**
   * Searches for symbols matching the given query criteria (kind, name, file path).
   * @param query - The symbol query with optional filters.
   * @returns An array of matching symbol nodes.
   */
  async findSymbols(query: SymbolQuery): Promise<SymbolNode[]> {
    this.ensureOpen()

    const conditions: string[] = []
    const params: Record<string, LbugValue> = {}
    if (query.kind !== undefined) {
      conditions.push(`s.kind = $kind`)
      params.kind = query.kind
    }
    if (query.filePath !== undefined) {
      if (query.filePath.includes('*')) {
        const regex = query.filePath.replaceAll('.', '\\.').replaceAll('*', '.*')
        conditions.push(`s.filePath =~ $filePathRegex`)
        params.filePathRegex = regex
      } else {
        conditions.push(`s.filePath = $filePath`)
        params.filePath = query.filePath
      }
    }
    if (query.filePaths !== undefined && query.filePaths.length > 0) {
      conditions.push(`s.filePath IN $filePaths`)
      params.filePaths = [...query.filePaths]
    }
    if (query.parentSymbolId !== undefined) {
      conditions.push(`s.parentId = $parentId`)
      params.parentId = query.parentSymbolId
    }
    if (query.name !== undefined) {
      const ci = query.caseSensitive !== true
      if (query.name.includes('*')) {
        const regex = query.name.replaceAll('.', '\\.').replaceAll('*', '.*')
        if (ci) {
          conditions.push(`lower(s.name) =~ $nameRegex`)
          params.nameRegex = regex.toLowerCase()
        } else {
          conditions.push(`s.name =~ $nameRegex`)
          params.nameRegex = regex
        }
      } else if (ci) {
        conditions.push(`lower(s.name) = $nameLower`)
        params.nameLower = query.name.toLowerCase()
      } else {
        conditions.push(`s.name = $name`)
        params.name = query.name
      }
    }
    if (query.comment !== undefined) {
      const ci = query.caseSensitive !== true
      if (ci) {
        conditions.push(`lower(s.comment) CONTAINS $commentLower`)
        params.commentLower = query.comment.toLowerCase()
      } else {
        conditions.push(`s.comment CONTAINS $comment`)
        params.comment = query.comment
      }
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
    const rows = await execPrepared(
      this.conn!,
      `MATCH (s:Symbol)${where} RETURN s.id AS id, s.name AS name, s.kind AS kind, s.filePath AS filePath, s.parentId AS parentId, s.line AS line, s.col AS col, s.endLine AS endLine, s.endCol AS endCol, s.selectionStartLine AS selectionStartLine, s.selectionStartCol AS selectionStartCol, s.selectionEndLine AS selectionEndLine, s.selectionEndCol AS selectionEndCol, s.comment AS comment`,
      params,
    )
    return rows.map((r) => this.rowToSymbol(r))
  }

  /**
   * Computes aggregate statistics about the graph (file count, symbol count, etc.).
   * @returns The graph statistics.
   */
  async getStatistics(): Promise<GraphStatistics> {
    this.ensureOpen()
    const conn = this.conn!

    const fileRows = await exec(conn, 'MATCH (f:File) RETURN count(f) AS c')
    const documentRows = await exec(conn, 'MATCH (d:Document) RETURN count(d) AS c')
    const symbolRows = await exec(conn, 'MATCH (s:Symbol) RETURN count(s) AS c')
    const specRows = await exec(conn, 'MATCH (s:Spec) RETURN count(s) AS c')

    const fileCount = Number(fileRows[0]?.['c'] ?? 0)
    const documentCount = Number(documentRows[0]?.['c'] ?? 0)
    const symbolCount = Number(symbolRows[0]?.['c'] ?? 0)
    const specCount = Number(specRows[0]?.['c'] ?? 0)

    const relationCounts: Record<string, number> = {}
    for (const type of Object.values(RT)) {
      try {
        const rows = await exec(
          conn,
          `MATCH (a)-[r:${type}]->(b) RETURN a.id AS sourceId, a.path AS sourcePath, a.specId AS sourceSpecId, b.id AS targetId, b.path AS targetPath, b.specId AS targetSpecId`,
        )
        const distinctPairs = new Set(
          rows.map((row) => {
            const source =
              (row['sourceId'] as string | undefined) ??
              (row['sourcePath'] as string | undefined) ??
              (row['sourceSpecId'] as string | undefined) ??
              ''
            const target =
              (row['targetId'] as string | undefined) ??
              (row['targetPath'] as string | undefined) ??
              (row['targetSpecId'] as string | undefined) ??
              ''
            return `${source}\u001f${target}\u001f${type}`
          }),
        )
        relationCounts[type] = distinctPairs.size
      } catch {
        relationCounts[type] = 0
      }
    }

    const langRows = await exec(conn, 'MATCH (f:File) RETURN DISTINCT f.language AS lang')
    const languages = langRows.map((r) => r['lang'] as string)

    return {
      fileCount,
      documentCount,
      symbolCount,
      specCount,
      relationCounts: relationCounts as Record<RelationType, number>,
      languages,
      lastIndexedAt: this._lastIndexedAt,
      lastIndexedRef: this._lastIndexedRef,
      graphFingerprint: this._graphFingerprint,
    }
  }

  /**
   * Returns all file nodes in the graph.
   * @returns An array of all file nodes.
   */
  async getAllFiles(): Promise<FileNode[]> {
    this.ensureOpen()
    const rows = await exec(
      this.conn!,
      'MATCH (f:File) RETURN f.path AS path, f.configRelativePath AS configRelativePath, f.language AS language, f.contentHash AS contentHash, f.workspace AS workspace, f.content AS content',
    )
    return rows.map((r) => this.rowToFile(r))
  }

  /**
   * Retrieves all document nodes.
   * @returns An array of all document nodes in the graph.
   */
  async getAllDocuments(): Promise<DocumentNode[]> {
    this.ensureOpen()
    const rows = await exec(
      this.conn!,
      'MATCH (d:Document) RETURN d.path AS path, d.configRelativePath AS configRelativePath, d.contentHash AS contentHash, d.content AS content, d.workspace AS workspace',
    )
    return rows.map((row) => this.rowToDocument(row))
  }

  /**
   * Returns all spec nodes in the graph, each with its dependency list.
   * @returns An array of all spec nodes.
   */
  async getAllSpecs(): Promise<SpecNode[]> {
    this.ensureOpen()
    const rows = await exec(
      this.conn!,
      'MATCH (s:Spec) RETURN s.specId AS specId, s.path AS path, s.title AS title, s.description AS description, s.contentHash AS contentHash, s.content AS content, s.workspace AS workspace',
    )

    const specs: SpecNode[] = []
    for (const row of rows) {
      const specId = row['specId'] as string
      const depRows = await execPrepared(
        this.conn!,
        `MATCH (s:Spec {specId: $specId})-[:DEPENDS_ON]->(t:Spec) RETURN t.specId AS target`,
        { specId },
      )
      specs.push({
        specId,
        path: row['path'] as string,
        title: row['title'] as string,
        description: (row['description'] as string) ?? '',
        contentHash: row['contentHash'] as string,
        content: (row['content'] as string) ?? '',
        dependsOn: depRows.map((r) => r['target'] as string),
        workspace: (row['workspace'] as string) ?? '',
      })
    }

    return specs
  }

  /**
   * Full-text search across symbols using the `symbol_fts` index.
   * Filters (kind, filePattern, workspace, excludePaths, excludeWorkspaces) are applied
   * as WHERE clauses between the FTS CALL and RETURN — before LIMIT.
   * @param options - Search options including query, limit, and filters.
   * @returns Matching symbols with BM25 scores, ordered by relevance.
   */
  async searchSymbols(options: SearchOptions): Promise<
    Array<{
      symbol: SymbolNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }>
  > {
    this.ensureOpen()
    const top = options.limit ?? 20
    const query = prepareExpandedSearchQuery(options.query)
    if (query.ftsQuery.length === 0) return []

    const conditions: string[] = []
    const params: Record<string, LbugValue> = { query: query.ftsQuery }
    if (options.kinds && options.kinds.length > 0) {
      const kindConditions = options.kinds.map((kind, i) => {
        const key = `kind${i}`
        params[key] = kind
        return `node.kind = $${key}`
      })
      conditions.push(`(${kindConditions.join(' OR ')})`)
    }
    if (options.filePattern) {
      const regex = options.filePattern.replaceAll('.', '\\.').replaceAll('*', '.*')
      params.filePatternRegex = `(?i)${regex}`
      conditions.push(`node.filePath =~ $filePatternRegex`)
    }
    if (options.workspace) {
      params.wsPrefix = options.workspace + ':'
      conditions.push(`starts_with(node.filePath, $wsPrefix)`)
    }
    if (options.excludePaths && options.excludePaths.length > 0) {
      options.excludePaths.forEach((pattern, i) => {
        const regex = pattern.replaceAll('.', '\\.').replaceAll('*', '.*')
        const key = `excludePath${i}`
        params[key] = `(?i)${regex}`
        conditions.push(`NOT node.filePath =~ $${key}`)
      })
    }
    if (options.excludeWorkspaces && options.excludeWorkspaces.length > 0) {
      options.excludeWorkspaces.forEach((ws, i) => {
        const key = `excludeWs${i}`
        params[key] = ws + ':'
        conditions.push(`NOT starts_with(node.filePath, $${key})`)
      })
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
    const projection =
      'node.id AS id, node.name AS name, node.kind AS kind, node.filePath AS filePath, node.parentId AS parentId, node.line AS line, node.col AS col, node.endLine AS endLine, node.endCol AS endCol, node.selectionStartLine AS selectionStartLine, node.selectionStartCol AS selectionStartCol, node.selectionEndLine AS selectionEndLine, node.selectionEndCol AS selectionEndCol, node.comment AS comment'
    const rows = await execPrepared(
      this.conn!,
      `CALL QUERY_FTS_INDEX('Symbol', 'symbol_fts', $query, k := 1000)${where} RETURN ${projection}, score AS nativeScore LIMIT 1000`,
      params,
    )

    // FTS supplies exact and prefix candidates. A bounded structured-name lane
    // preserves suffix/substring discovery without loading every symbol into JS.
    const structuredParams: Record<string, LbugValue> = {
      ...params,
      normalizedName: query.normalizedQuery,
    }
    const structuredConditions = [...conditions, 'lower(node.name) CONTAINS $normalizedName']
    const structuredRows = await execPrepared(
      this.conn!,
      `MATCH (node:Symbol) WHERE ${structuredConditions.join(' AND ')} RETURN ${projection}, 0.0 AS nativeScore LIMIT 1000`,
      structuredParams,
    )

    const candidates = new Map<string, { symbol: SymbolNode; nativeScore: number }>()
    for (const r of [...rows, ...structuredRows]) {
      const symbol = this.rowToSymbol(r)
      candidates.set(symbol.id, {
        symbol,
        nativeScore: Number(r['nativeScore'] ?? 0),
      })
    }

    const results: Array<{
      symbol: SymbolNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }> = []
    for (const { symbol, nativeScore } of candidates.values()) {
      const score = composeIdentitySearchScore(
        rankIdentityMatch({
          normalizedQuery: query.normalizedQuery,
          rawTokens: query.rawTokens,
          expandedTokens: query.expandedTokens,
          canonicalIdentity: symbol.name,
          alternateIdentity: symbol.name,
          nativeScore,
        }),
      )
      let snippet = ''
      let startLine = 1
      let endLine = 1

      // Fetch file content for snippet
      const fileRows = await execPrepared(
        this.conn!,
        `MATCH (f:File {path: $path}) RETURN f.content AS content`,
        { path: symbol.filePath },
      )
      if (fileRows.length > 0 && fileRows[0]!['content']) {
        const content = fileRows[0]!['content'] as string
        const lines = content.split(/\r?\n/)
        const targetLine = symbol.line - 1 // 1-based to 0-based

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

      results.push({ symbol, score, snippet, startLine, endLine })
    }

    return results.sort((a, b) => b.score - a.score).slice(0, top)
  }

  /**
   * Full-text search across specs using the `spec_fts` index.
   * Filters (workspace, excludeWorkspaces) are applied as WHERE clauses before LIMIT.
   * @param options - Search options including query, limit, and filters.
   * @returns Matching specs with BM25 scores, ordered by relevance.
   */
  async searchSpecs(
    options: SearchOptions,
  ): Promise<
    Array<{ spec: SpecNode; score: number; snippet: string; startLine: number; endLine: number }>
  > {
    this.ensureOpen()
    const top = options.limit ?? 20
    const query = prepareExpandedSearchQuery(options.query)
    if (query.ftsQuery.length === 0) return []

    const conditions: string[] = []
    const params: Record<string, LbugValue> = { query: query.ftsQuery }
    if (options.workspace) {
      params.workspace = options.workspace
      conditions.push(`node.workspace = $workspace`)
    }
    if (options.excludeWorkspaces && options.excludeWorkspaces.length > 0) {
      options.excludeWorkspaces.forEach((ws, i) => {
        const key = `exclWs${i}`
        params[key] = ws
        conditions.push(`node.workspace <> $${key}`)
      })
    }
    if (options.excludePaths && options.excludePaths.length > 0) {
      options.excludePaths.forEach((pattern, i) => {
        const regex = pattern.replaceAll('.', '\\.').replaceAll('*', '.*')
        const key = `exclPath${i}`
        params[key] = `(?i)${regex}`
        conditions.push(`NOT node.path =~ $${key}`)
      })
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
    const rows = await execPrepared(
      this.conn!,
      `CALL QUERY_FTS_INDEX('Spec', 'spec_fts', $query, k := 1000)${where} RETURN node.specId AS specId, node.path AS path, node.title AS title, node.description AS description, node.contentHash AS contentHash, node.content AS content, node.workspace AS workspace, score AS nativeScore LIMIT 1000`,
      params,
    )

    const candidates = new Map<string, { spec: SpecNode; nativeScore: number }>()
    for (const row of rows) {
      const specId = row['specId'] as string
      const depRows = await execPrepared(
        this.conn!,
        `MATCH (s:Spec {specId: $specId})-[:DEPENDS_ON]->(t:Spec) RETURN t.specId AS target`,
        { specId },
      )
      candidates.set(specId, {
        nativeScore: Number(row['nativeScore'] ?? 0),
        spec: {
          specId,
          path: row['path'] as string,
          title: row['title'] as string,
          description: (row['description'] as string) ?? '',
          contentHash: row['contentHash'] as string,
          content: (row['content'] as string) ?? '',
          dependsOn: depRows.map((r) => r['target'] as string),
          workspace: (row['workspace'] as string) ?? '',
        },
      })
    }
    for (const spec of await this.getAllSpecs()) {
      if (
        !candidates.has(spec.specId) &&
        matchesExpandedIdentity(query.expandedTokens, spec.specId, spec.path)
      ) {
        candidates.set(spec.specId, { spec, nativeScore: 0 })
      }
    }

    const results: Array<{
      spec: SpecNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }> = []
    for (const { spec, nativeScore } of candidates.values()) {
      if (options.workspace && spec.workspace !== options.workspace) continue
      if (options.excludeWorkspaces?.includes(spec.workspace)) continue
      if (
        options.excludePaths?.some((pattern) =>
          new RegExp(pattern.replaceAll('.', '\\.').replaceAll('*', '.*'), 'i').test(spec.path),
        )
      )
        continue
      const content = spec.content
      const { snippet, startLine, endLine } = this.extractMatchSnippet(content, [
        ...query.rawTokens,
        ...query.expandedTokens,
      ])
      results.push({
        spec,
        score: composeIdentitySearchScore(
          rankIdentityMatch({
            normalizedQuery: query.normalizedQuery,
            rawTokens: query.rawTokens,
            expandedTokens: query.expandedTokens,
            canonicalIdentity: spec.specId,
            alternateIdentity: spec.path,
            nativeScore,
          }),
        ),
        snippet,
        startLine,
        endLine,
      })
    }
    return results.sort((a, b) => b.score - a.score).slice(0, top)
  }

  /**
   * Searches for documents using full-text search.
   * @param options - Search options including query and filters.
   * @returns An array of matching documents with their scores.
   */
  async searchDocuments(options: SearchOptions): Promise<
    Array<{
      document: DocumentNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }>
  > {
    this.ensureOpen()
    const top = options.limit ?? 20
    const query = prepareExpandedSearchQuery(options.query)
    if (query.ftsQuery.length === 0) return []

    const ftsRows = await execPrepared(
      this.conn!,
      `CALL QUERY_FTS_INDEX('Document', 'document_fts', $query, k := 1000) RETURN node.path AS path, score AS nativeScore LIMIT 1000`,
      { query: query.ftsQuery },
    )
    const nativeScores = new Map(
      ftsRows.map((row) => [row['path'] as string, Number(row['nativeScore'] ?? 0)]),
    )
    const documents = await this.getAllDocuments()
    const results: Array<{
      document: DocumentNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }> = []

    for (const document of documents) {
      const text =
        `${document.path} ${document.configRelativePath} ${document.content}`.toLowerCase()
      const nativeScore =
        nativeScores.get(document.path) ?? countContentTokenHits(text, query.expandedTokens)
      if (
        nativeScore === 0 &&
        !matchesExpandedIdentity(query.expandedTokens, document.path, document.configRelativePath)
      ) {
        continue
      }
      if (options.workspace && document.workspace !== options.workspace) continue
      if (options.excludeWorkspaces?.includes(document.workspace)) continue
      if (options.excludePaths && options.excludePaths.length > 0) {
        const excluded = options.excludePaths.some((pattern) => {
          const regex = new RegExp(pattern.replaceAll('.', '\\.').replaceAll('*', '.*'), 'i')
          return regex.test(document.path)
        })
        if (excluded) continue
      }

      const score = composeIdentitySearchScore(
        rankIdentityMatch({
          normalizedQuery: query.normalizedQuery,
          rawTokens: query.rawTokens,
          expandedTokens: query.expandedTokens,
          canonicalIdentity: document.path,
          alternateIdentity: document.configRelativePath,
          nativeScore,
        }),
      )

      const { snippet, startLine, endLine } = this.extractMatchSnippet(document.content, [
        ...query.rawTokens,
        ...query.expandedTokens,
      ])
      results.push({
        document,
        score,
        snippet,
        startLine,
        endLine,
      })
    }

    return results.sort((a, b) => b.score - a.score).slice(0, top)
  }

  /**
   * Returns a deterministic page of source-content candidates.
   * @param query - Expanded source query and filters.
   * @returns Filtered candidate page for Code Graph verification.
   */
  async searchSourceContentCandidates(
    query: SourceContentCandidateQuery,
  ): Promise<SourceContentCandidatePage> {
    this.ensureOpen()
    const terms = [
      ...new Set(
        [query.normalizedQuery, ...query.rawTerms, ...query.expandedTerms]
          .map((term) => term.toLowerCase())
          .filter((term) => term.length > 0),
      ),
    ]
    const requestedLimit = Number.isSafeInteger(query.limit) ? Math.max(0, query.limit) : 0
    if (terms.length === 0 || requestedLimit === 0) return { candidates: [] }

    const usesShortQueryFallback = terms.some((term) => term.length < 3)
    const pageLimit = usesShortQueryFallback ? Math.min(requestedLimit, 512) : requestedLimit
    const parsedOffset = Number.parseInt(query.cursor ?? '0', 10)
    const offset = Number.isSafeInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0
    const fetchLimit = pageLimit + 1
    const params: Record<string, LbugValue> = {}
    const conditions: string[] = []

    if (query.workspace !== undefined) {
      params.workspace = query.workspace
      conditions.push('node.workspace = $workspace')
    }
    if (query.filePattern !== undefined) {
      params.filePattern = globToLadybugRegex(query.filePattern)
      conditions.push('node.path =~ $filePattern')
    }
    query.excludePaths?.forEach((pattern, index) => {
      const key = `excludePath${index}`
      params[key] = globToLadybugRegex(pattern)
      conditions.push(`NOT node.path =~ $${key}`)
    })
    query.excludeWorkspaces?.forEach((workspace, index) => {
      const key = `excludeWorkspace${index}`
      params[key] = `${workspace}:`
      conditions.push(`NOT starts_with(node.path, $${key})`)
    })

    const termPredicates = terms.map((term, index) => {
      const key = `term${index}`
      params[key] = term
      return `lower(node.content) CONTAINS $${key}`
    })
    conditions.push(`(${termPredicates.join(' OR ')})`)
    const where = ` WHERE ${conditions.join(' AND ')}`
    const source = usesShortQueryFallback
      ? 'MATCH (node:File)'
      : `CALL QUERY_FTS_INDEX('File', 'file_content_fts', $ftsQuery, k := ${offset + fetchLimit})`
    const scoreExpression = usesShortQueryFallback ? '1' : 'score'
    if (!usesShortQueryFallback) {
      params.ftsQuery = sanitizeFtsQuery(terms)
    }

    const rows = await execPrepared(
      this.conn!,
      `${source}${where} RETURN node.path AS path, node.configRelativePath AS configRelativePath, node.language AS language, node.contentHash AS contentHash, node.workspace AS workspace, node.content AS content, ${scoreExpression} AS backendScore ORDER BY backendScore DESC, path ASC SKIP ${offset} LIMIT ${fetchLimit}`,
      params,
    )
    const hasNextPage = rows.length > pageLimit
    const candidates = rows.slice(0, pageLimit).map((row) => ({
      file: this.rowToFile(row),
      backendScore: Number(row['backendScore']),
    }))
    return {
      candidates,
      ...(hasNextPage ? { nextCursor: String(offset + candidates.length) } : {}),
    }
  }

  /**
   * Returns all (symbol, caller) pairs in the graph for batch hotspot scoring.
   * @returns An array of objects containing the target symbol and the caller's file path.
   */
  async getSymbolCallers(): Promise<Array<{ symbol: SymbolNode; callerFilePath: string }>> {
    this.ensureOpen()
    const rows = await exec(
      this.conn!,
      `MATCH (caller:Symbol)-[:CALLS|CONSTRUCTS|USES_TYPE]->(s:Symbol) RETURN s.id AS id, s.name AS name, s.kind AS kind, s.filePath AS filePath, s.parentId AS parentId, s.line AS line, s.col AS col, s.endLine AS endLine, s.endCol AS endCol, s.selectionStartLine AS selectionStartLine, s.selectionStartCol AS selectionStartCol, s.selectionEndLine AS selectionEndLine, s.selectionEndCol AS selectionEndCol, s.comment AS comment, caller.filePath AS callerFilePath`,
    )
    return rows.map((r) => ({
      symbol: this.rowToSymbol(r),
      callerFilePath: r['callerFilePath'] as string,
    }))
  }

  /**
   * Returns the number of files that import each file in the graph.
   * @returns A map from file path to importer count.
   */
  async getFileImporterCounts(): Promise<Map<string, number>> {
    this.ensureOpen()
    const rows = await exec(
      this.conn!,
      `MATCH (imp:File)-[:IMPORTS]->(f:File) RETURN f.path AS path, count(DISTINCT imp.path) AS importerCount`,
    )
    const result = new Map<string, number>()
    for (const row of rows) {
      result.set(row['path'] as string, Number(row['importerCount']))
    }
    return result
  }

  /**
   * Deletes all nodes and relations from the graph.
   */
  async clear(): Promise<void> {
    this.ensureOpen()
    const conn = this.conn!

    const relTypes = [
      'IMPORTS',
      'DEFINES',
      'CALLS',
      'CONSTRUCTS',
      'USES_TYPE',
      'EXPORTS',
      'DEPENDS_ON',
      'COVERS_FILE',
      'COVERS_SYMBOL',
      'EXTENDS',
      'IMPLEMENTS',
      'OVERRIDES',
    ]
    for (const type of relTypes) {
      try {
        await conn.query(`MATCH ()-[r:${type}]->() DELETE r`)
      } catch {
        // relation table may not exist yet
      }
    }

    await conn.query('MATCH (f:File) DELETE f')
    await conn.query('MATCH (d:Document) DELETE d')
    await conn.query('MATCH (s:Symbol) DELETE s')
    await conn.query('MATCH (s:Spec) DELETE s')
    await conn.query('MATCH (o:IndexedInputObservation) DELETE o')
    await conn.query('MATCH (l:FreshnessLatch) DELETE l')
    await conn.query('MATCH (m:Meta) DELETE m')
    await this.rebuildFtsIndexes()
    this._lastIndexedAt = undefined
    this._lastIndexedRef = null
    this._graphFingerprint = null
  }

  /**
   * Recreates the backend-owned persisted graph files from scratch.
   */
  async recreate(): Promise<void> {
    const wasOpen = this._isOpen
    if (this._isOpen) {
      await this.close()
    }

    rmSync(this.graphDir, { recursive: true, force: true })
    rotateStorageGeneration(this.storagePath)
    this._lastIndexedAt = undefined
    this._lastIndexedRef = null
    this._graphFingerprint = null

    if (wasOpen) {
      await this.open()
    }
  }

  /**
   * Returns the current storage-generation snapshot for stale-provider detection.
   * @returns The current storage-generation snapshot.
   */
  getStorageGeneration(): Promise<StorageGenerationSnapshot> {
    this.ensureOpen()
    return Promise.resolve(readStorageGeneration(this.storagePath))
  }

  /**
   * Creates a typed relation between two graph nodes.
   * @param conn - The database connection.
   * @param rel - The relation to create.
   */
  private async createRelation(conn: Connection, rel: Relation): Promise<void> {
    const metadataJson = JSON.stringify(rel.metadata ?? {})
    const params = { source: rel.source, target: rel.target, metadataJson }

    switch (rel.type) {
      case RT.Imports:
        await runPrepared(
          conn,
          `MATCH (a:File {path: $source}), (b:File {path: $target}) CREATE (a)-[:IMPORTS {metadata_json: $metadataJson}]->(b)`,
          params,
        )
        break
      case RT.Defines:
        await runPrepared(
          conn,
          `MATCH (a:File {path: $source}), (b:Symbol {id: $target}) CREATE (a)-[:DEFINES {metadata_json: $metadataJson}]->(b)`,
          params,
        )
        break
      case RT.Calls:
        await runPrepared(
          conn,
          `MATCH (a:Symbol {id: $source}), (b:Symbol {id: $target}) CREATE (a)-[:CALLS {metadata_json: $metadataJson}]->(b)`,
          params,
        )
        break
      case RT.Constructs:
        await runPrepared(
          conn,
          `MATCH (a:Symbol {id: $source}), (b:Symbol {id: $target}) CREATE (a)-[:CONSTRUCTS {metadata_json: $metadataJson}]->(b)`,
          params,
        )
        break
      case RT.UsesType:
        await runPrepared(
          conn,
          `MATCH (a:Symbol {id: $source}), (b:Symbol {id: $target}) CREATE (a)-[:USES_TYPE {metadata_json: $metadataJson}]->(b)`,
          params,
        )
        break
      case RT.Exports:
        await runPrepared(
          conn,
          `MATCH (a:File {path: $source}), (b:Symbol {id: $target}) CREATE (a)-[:EXPORTS {metadata_json: $metadataJson}]->(b)`,
          params,
        )
        break
      case RT.DependsOn:
        await runPrepared(
          conn,
          `MATCH (a:Spec {specId: $source}), (b:Spec {specId: $target}) CREATE (a)-[:DEPENDS_ON {metadata_json: $metadataJson}]->(b)`,
          params,
        )
        break
      case RT.CoversFile:
        await runPrepared(
          conn,
          `MATCH (a:Spec {specId: $source}), (b:File {path: $target}) CREATE (a)-[:COVERS_FILE {metadata_json: $metadataJson}]->(b)`,
          params,
        )
        break
      case RT.CoversSymbol:
        await runPrepared(
          conn,
          `MATCH (a:Spec {specId: $source}), (b:Symbol {id: $target}) CREATE (a)-[:COVERS_SYMBOL {metadata_json: $metadataJson}]->(b)`,
          params,
        )
        break
      case RT.Extends:
        await runPrepared(
          conn,
          `MATCH (a:Symbol {id: $source}), (b:Symbol {id: $target}) CREATE (a)-[:EXTENDS {metadata_json: $metadataJson}]->(b)`,
          params,
        )
        break
      case RT.Implements:
        await runPrepared(
          conn,
          `MATCH (a:Symbol {id: $source}), (b:Symbol {id: $target}) CREATE (a)-[:IMPLEMENTS {metadata_json: $metadataJson}]->(b)`,
          params,
        )
        break
      case RT.Overrides:
        await runPrepared(
          conn,
          `MATCH (a:Symbol {id: $source}), (b:Symbol {id: $target}) CREATE (a)-[:OVERRIDES {metadata_json: $metadataJson}]->(b)`,
          params,
        )
        break
    }
  }

  /**
   * Returns incoming symbol-to-symbol relations for the requested relationship type.
   * @param relationType - The relationship type to query.
   * @param symbolId - The target symbol identifier.
   * @returns An array of incoming relations of the requested type.
   */
  private async getIncomingSymbolRelations(
    relationType: RelationType,
    symbolId: string,
  ): Promise<Relation[]> {
    this.ensureOpen()
    const rows = await execPrepared(
      this.conn!,
      `MATCH (source:Symbol)-[r:${relationType}]->(target:Symbol {id: $symbolId}) RETURN source.id AS source, r.metadata_json AS metadata_json`,
      { symbolId },
    )
    return rows.map((row) => ({
      source: row['source'] as string,
      target: symbolId,
      type: relationType,
      metadata: row['metadata_json']
        ? (JSON.parse(row['metadata_json'] as string) as Record<string, unknown>)
        : undefined,
    }))
  }

  /**
   * Returns outgoing symbol-to-symbol relations for the requested relationship type.
   * @param relationType - The relationship type to query.
   * @param symbolId - The source symbol identifier.
   * @returns An array of outgoing relations of the requested type.
   */
  private async getOutgoingSymbolRelations(
    relationType: RelationType,
    symbolId: string,
  ): Promise<Relation[]> {
    this.ensureOpen()
    const rows = await execPrepared(
      this.conn!,
      `MATCH (source:Symbol {id: $symbolId})-[r:${relationType}]->(target:Symbol) RETURN target.id AS target, r.metadata_json AS metadata_json`,
      { symbolId },
    )
    return rows.map((row) => ({
      source: symbolId,
      target: row['target'] as string,
      type: relationType,
      metadata: row['metadata_json']
        ? (JSON.parse(row['metadata_json'] as string) as Record<string, unknown>)
        : undefined,
    }))
  }

  /**
   * Updates or inserts a metadata key-value pair in the graph.
   * @param conn - The database connection.
   * @param key - The metadata key.
   * @param value - The metadata value.
   */
  private async updateMeta(conn: Connection, key: string, value: string): Promise<void> {
    await runPrepared(conn, `MATCH (m:Meta {key: $key}) DELETE m`, { key })
    await runPrepared(conn, `CREATE (m:Meta {key: $key, value: $value})`, { key, value })
  }

  /**
   * Replaces one freshness latch within a caller-owned connection.
   * @param conn - Caller-owned Ladybug connection.
   * @param workspace - Workspace or aggregate latch identity.
   * @param knownStale - Latch value to persist.
   */
  private async setFreshnessLatch(
    conn: Connection,
    workspace: string,
    knownStale: boolean,
  ): Promise<void> {
    await runPrepared(conn, 'MATCH (l:FreshnessLatch {workspace: $workspace}) DELETE l', {
      workspace,
    })
    await runPrepared(
      conn,
      'CREATE (l:FreshnessLatch {workspace: $workspace, knownStale: $knownStale})',
      { workspace, knownStale },
    )
  }

  /**
   * Extracts a match-centered snippet from text.
   * @param text - The full text.
   * @param terms - The search terms.
   * @returns A snippet of approximately 200 characters around the best match and line range.
   */
  private extractMatchSnippet(
    text: string,
    terms: string[],
  ): { snippet: string; startLine: number; endLine: number } {
    if (terms.length === 0) {
      const snippet = text.slice(0, 200)
      return { snippet, startLine: 1, endLine: snippet.split(/\r?\n/).length }
    }

    const lowerText = text.toLowerCase()
    let bestPos = 0
    let bestScore = -1

    for (let i = 0; i < lowerText.length; i += 20) {
      const window = lowerText.slice(i, i + 300)
      let score = 0
      for (const term of terms) {
        if (window.includes(term.toLowerCase())) score++
      }
      if (score > bestScore) {
        bestScore = score
        bestPos = i
      }
      if (score === terms.length) break
    }

    const start = Math.max(0, bestPos - 60)
    const end = Math.min(text.length, bestPos + 340)
    let snippet = text.slice(start, end)
    const startLine = text.substring(0, start).split(/\r?\n/).length
    const endLine = startLine + snippet.split(/\r?\n/).length - 1

    if (start > 0) snippet = '...' + snippet
    if (end < text.length) snippet = snippet + '...'
    return { snippet, startLine, endLine }
  }

  /**
   * Converts a database row record into a FileNode value object.
   * @param row - The row containing file fields.
   * @returns The constructed file node.
   */
  private rowToFile(row: Record<string, LbugValue>): FileNode {
    return {
      path: row['path'] as string,
      configRelativePath: (row['configRelativePath'] as string) ?? '',
      language: row['language'] as string,
      contentHash: row['contentHash'] as string,
      workspace: row['workspace'] as string,
      embedding: undefined,
      content: (row['content'] as string) || undefined,
    }
  }

  /**
   * Converts a database row record into a SymbolNode value object.
   * @param row - The row containing symbol fields.
   * @returns The constructed symbol node.
   */
  private rowToSymbol(row: Record<string, LbugValue>): SymbolNode {
    return {
      id: row['id'] as string,
      name: row['name'] as string,
      kind: row['kind'] as SymbolNode['kind'],
      filePath: row['filePath'] as string,
      line: Number(row['line']),
      column: Number(row['col']),
      endLine: Number(row['endLine']),
      endColumn: Number(row['endCol']),
      selectionRange: {
        startLine: Number(row['selectionStartLine']),
        startColumn: Number(row['selectionStartCol']),
        endLine: Number(row['selectionEndLine']),
        endColumn: Number(row['selectionEndCol']),
      },
      parentId: (row['parentId'] as string) || undefined,
      comment: (row['comment'] as string) || undefined,
    }
  }

  /**
   * Converts a database row record into a DocumentNode value object.
   * @param row - The row containing document fields.
   * @returns The constructed document node.
   */
  private rowToDocument(row: Record<string, LbugValue>): DocumentNode {
    return createDocumentNode({
      path: row['path'] as string,
      configRelativePath: (row['configRelativePath'] as string) ?? '',
      contentHash: row['contentHash'] as string,
      content: (row['content'] as string) ?? '',
      workspace: (row['workspace'] as string) ?? '',
    })
  }
}

/**
 * Sanitizes a search query for Ladybug FTS.
 * Splits by whitespace, wraps tokens in double quotes, and joins with OR.
 * @param rawQuery - Raw user search input.
 * @returns Sanitized query string for discovery mode.
 */
function prepareExpandedSearchQuery(rawQuery: string): ExpandedIdentitySearchQuery {
  const query = expandSearchQuery(rawQuery)
  return {
    ...query,
    ftsQuery: sanitizeFtsQuery(query.expandedTokens),
  }
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
 * Sanitizes query tokens for Ladybug FTS `OR` matching.
 * @param query - Raw query text or expanded token list.
 * @returns Quoted FTS query string.
 */
function sanitizeFtsQuery(query: string | readonly string[]): string {
  const tokens = normalizeSearchTokens(query)
  if (tokens.length === 0) return ''
  return tokens.map((token) => '"' + token.replaceAll('"', '""') + '"').join(' OR ')
}

/**
 * Composes a sortable numeric score from identity-ranking dimensions.
 * @param ranking - Ranking factors for one result candidate.
 * @returns Combined score where identity dominates native relevance.
 */
function composeIdentitySearchScore(ranking: IdentityRanking): number {
  return (
    ranking.tier * 1_000_000 +
    ranking.tokenHits * 10_000 +
    ranking.matchStrength * 100 +
    ranking.nativeScore
  )
}

/**
 * Ranks a result candidate by canonical and alternate identity strength.
 * @param input - Identity-ranking inputs for one candidate.
 * @returns The candidate's ranking factors.
 */
function rankIdentityMatch(input: IdentityRankingInput): IdentityRanking {
  const canonical = input.canonicalIdentity.toLowerCase()
  const alternate = input.alternateIdentity?.toLowerCase()

  let tier = 1
  if (canonical === input.normalizedQuery) {
    tier = 5
  } else if (alternate === input.normalizedQuery) {
    tier = 4
  } else if (
    input.rawTokens.length === 1 &&
    (canonical.startsWith(input.normalizedQuery) ||
      alternate?.startsWith(input.normalizedQuery) === true)
  ) {
    tier = 3
  }

  let tokenHits = 0
  let matchStrength = 0
  for (const token of input.expandedTokens) {
    const tokenStrength = Math.max(
      strongestTokenMatch(token, canonical),
      alternate === undefined ? 0 : strongestTokenMatch(token, alternate),
    )
    if (tokenStrength > 0) {
      tokenHits++
      matchStrength += tokenStrength
      if (tier < 2) {
        tier = 2
      }
    }
  }

  return {
    tier,
    tokenHits,
    matchStrength,
    nativeScore: input.nativeScore,
  }
}

/**
 * Returns the strongest match tier for one token against one identity string.
 * @param token - Normalized search token.
 * @param identity - Normalized candidate identity.
 * @returns Match strength score from 0 to 40.
 */
function strongestTokenMatch(token: string, identity: string): number {
  if (identity === token) {
    return 40
  }
  if (identity.startsWith(token)) {
    return 30
  }
  if (identity.endsWith(token)) {
    return 20
  }

  const components = splitIdentityComponents(identity)
  if (components.includes(token)) {
    return 15
  }

  if (identity.includes(token)) {
    return 10
  }

  return 0
}

/**
 * Splits an identity into searchable structural components.
 * @param identity - Normalized identity string.
 * @returns Non-empty identity components.
 */
function splitIdentityComponents(identity: string): string[] {
  return identity
    .split(/[:/_.-]+/)
    .map((component) => component.trim())
    .filter((component) => component.length > 0)
}

/**
 * Counts how many normalized query tokens appear in generic content text.
 * @param text - Lower-cased content text to inspect.
 * @param tokens - Normalized query tokens.
 * @returns Number of matched tokens.
 */
function countContentTokenHits(text: string, tokens: readonly string[]): number {
  let hits = 0
  for (const token of tokens) {
    if (text.includes(token)) {
      hits++
    }
  }
  return hits
}

/**
 * Checks whether any expanded token matches either identity string.
 * @param tokens - Expanded normalized query tokens.
 * @param canonicalIdentity - Primary identity for the candidate.
 * @param alternateIdentity - Optional secondary identity for the candidate.
 * @returns `true` when at least one token matches an identity field.
 */
function matchesExpandedIdentity(
  tokens: readonly string[],
  canonicalIdentity: string,
  alternateIdentity?: string,
): boolean {
  const canonical = canonicalIdentity.toLowerCase()
  const alternate = alternateIdentity?.toLowerCase()
  return tokens.some((token) => {
    return (
      strongestTokenMatch(token, canonical) > 0 ||
      (alternate !== undefined && strongestTokenMatch(token, alternate) > 0)
    )
  })
}
