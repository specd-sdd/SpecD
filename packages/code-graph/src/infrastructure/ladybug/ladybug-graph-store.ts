import { Database, Connection, type QueryResult, type LbugValue } from 'lbug'
import { GraphStore } from '../../domain/ports/graph-store.js'
import { createDocumentNode, type DocumentNode } from '../../domain/value-objects/document-node.js'
import { type FileNode } from '../../domain/value-objects/file-node.js'
import { type SymbolNode } from '../../domain/value-objects/symbol-node.js'
import { type SpecNode } from '../../domain/value-objects/spec-node.js'
import { type Relation } from '../../domain/value-objects/relation.js'
import { type SymbolQuery } from '../../domain/value-objects/symbol-query.js'
import { type GraphStatistics } from '../../domain/value-objects/graph-statistics.js'
import { type RelationType, RelationType as RT } from '../../domain/value-objects/relation-type.js'
import { type SearchOptions } from '../../domain/value-objects/search-options.js'
import { StoreNotOpenError } from '../../domain/errors/store-not-open-error.js'
import { SCHEMA_DDL, SCHEMA_VERSION } from './schema.js'
import { expandSymbolName } from '../../domain/services/expand-symbol-name.js'
import { mkdirSync, existsSync, writeFileSync, unlinkSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const SYMBOL_DEPENDENCY_RELATION_TYPES = [RT.Calls, RT.Constructs, RT.UsesType] as const

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
 * Graph store implementation backed by a Ladybug (lbug) embedded graph database.
 * Persists files, symbols, specs, and their relations as a labeled property graph.
 */
export class LadybugGraphStore extends GraphStore {
  private db: Database | undefined
  private conn: Connection | undefined
  private _isOpen = false
  private _lastIndexedAt: string | undefined
  private _lastIndexedRef: string | null = null
  private _graphFingerprint: string | null = null

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
    if (!existsSync(this.graphDir)) {
      mkdirSync(this.graphDir, { recursive: true })
    }
    if (!existsSync(this.bulkLoadTmpDir)) {
      mkdirSync(this.bulkLoadTmpDir, { recursive: true })
    }

    await this.migrateSchemaIfNeeded()

    this.db = new Database(this.dbPath)
    await this.db.init()
    this.conn = new Connection(this.db)
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
      const db = new Database(this.dbPath)
      await db.init()
      const conn = new Connection(db)
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
      ['Spec', 'spec_fts'],
    ] as const) {
      try {
        await conn.query(`CALL DROP_FTS_INDEX('${table}', '${name}')`)
      } catch {
        // Index may not exist yet
      }
    }

    // Recreate
    await this.createFtsIndex('Symbol', 'symbol_fts', ['searchName', 'comment'])
    await this.createFtsIndex('Spec', 'spec_fts', ['specId', 'title', 'description', 'content'])
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
          `CREATE (s:Symbol {id: $id, name: $name, searchName: $searchName, kind: $kind, filePath: $filePath, line: $line, col: $col, comment: $comment})`,
          {
            id: symbol.id,
            name: symbol.name,
            searchName: expandSymbolName(symbol.name),
            kind: symbol.kind,
            filePath: file.path,
            line: symbol.line,
            col: symbol.column,
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
    await this.deleteFileLocalState(conn, filePath)
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
          const symRows = ['id,name,searchName,kind,filePath,parentId,line,col,comment']
          for (const s of batch) {
            symRows.push(
              `${csvEscape(s.id)},${csvEscape(s.name)},${csvEscape(expandSymbolName(s.name))},${csvEscape(s.kind)},${csvEscape(s.filePath)},${csvEscape(s.parentId ?? '')},${s.line},${s.column},${csvEscape(s.comment ?? '')}`,
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

      // Write relations CSVs — one per type
      // IGNORE_ERRORS skips rows referencing non-existent nodes (dangling imports to external files)
      const relsByType = new Map<string, Relation[]>()
      for (const rel of data.relations) {
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
    await this.rebuildFtsIndexes()
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
      `MATCH (s:Symbol {id: $id}) RETURN s.id AS id, s.name AS name, s.kind AS kind, s.filePath AS filePath, s.parentId AS parentId, s.line AS line, s.col AS col, s.comment AS comment`,
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
      `MATCH (f:File {path: $filePath})-[:EXPORTS]->(s:Symbol) RETURN s.id AS id, s.name AS name, s.kind AS kind, s.filePath AS filePath, s.parentId AS parentId, s.line AS line, s.col AS col, s.comment AS comment`,
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
  async getCoveringSpecs(filePath: string): Promise<Relation[]> {
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
  async getSymbolCoveringSpecs(symbolId: string): Promise<Relation[]> {
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
      `MATCH (s:Symbol)${where} RETURN s.id AS id, s.name AS name, s.kind AS kind, s.filePath AS filePath, s.parentId AS parentId, s.line AS line, s.col AS col, s.comment AS comment`,
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
  async searchSymbols(
    options: SearchOptions,
  ): Promise<
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

    const conditions: string[] = []
    const params: Record<string, LbugValue> = { query: options.query }
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
    const query = sanitizeFtsQuery(options.query)
    if (query.length === 0) return []

    params.query = query

    params.rawQuery = options.query.trim()

    const rows = await execPrepared(
      this.conn!,
      `CALL QUERY_FTS_INDEX('Symbol', 'symbol_fts', $query, k := 1000)${where} RETURN node.id AS id, node.name AS name, node.kind AS kind, node.filePath AS filePath, node.parentId AS parentId, node.line AS line, node.col AS col, node.comment AS comment, (score + CASE WHEN node.id = $rawQuery THEN 1000000.0 ELSE 0.0 END + CASE WHEN node.name = $rawQuery THEN 1000.0 ELSE 0.0 END) AS score ORDER BY score DESC LIMIT ${String(top)}`,
      params,
    )

    const results: Array<{
      symbol: SymbolNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }> = []
    for (const r of rows) {
      const symbol = this.rowToSymbol(r)
      const score = r['score'] as number
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

    return results
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

    const conditions: string[] = []
    const params: Record<string, LbugValue> = { query: options.query }
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
    const query = sanitizeFtsQuery(options.query)
    if (query.length === 0) return []

    params.query = query

    params.rawQuery = options.query.trim()

    const rows = await execPrepared(
      this.conn!,
      `CALL QUERY_FTS_INDEX('Spec', 'spec_fts', $query, k := 1000)${where} RETURN node.specId AS specId, node.path AS path, node.title AS title, node.description AS description, node.contentHash AS contentHash, node.content AS content, node.workspace AS workspace, (score + CASE WHEN node.specId = $rawQuery THEN 1000000.0 ELSE 0.0 END) AS score ORDER BY score DESC LIMIT ${String(top)}`,
      params,
    )

    const results: Array<{
      spec: SpecNode
      score: number
      snippet: string
      startLine: number
      endLine: number
    }> = []
    const terms = options.query.split(/\s+/).filter((t) => t.length > 0)
    for (const row of rows) {
      const specId = row['specId'] as string
      const depRows = await execPrepared(
        this.conn!,
        `MATCH (s:Spec {specId: $specId})-[:DEPENDS_ON]->(t:Spec) RETURN t.specId AS target`,
        { specId },
      )
      const content = (row['content'] as string) ?? ''
      const { snippet, startLine, endLine } = this.extractMatchSnippet(content, terms)
      results.push({
        spec: {
          specId,
          path: row['path'] as string,
          title: row['title'] as string,
          description: (row['description'] as string) ?? '',
          contentHash: row['contentHash'] as string,
          content,
          dependsOn: depRows.map((r) => r['target'] as string),
          workspace: (row['workspace'] as string) ?? '',
        },
        score: row['score'] as number,
        snippet,
        startLine,
        endLine,
      })
    }
    return results
  }

  /**
   * Searches for documents using full-text search.
   * @param options - Search options including query and filters.
   * @returns An array of matching documents with their scores.
   */
  async searchDocuments(
    options: SearchOptions,
  ): Promise<
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
    const rawQuery = options.query.trim().toLowerCase()
    if (rawQuery.length === 0) return []

    const terms = rawQuery.split(/\s+/).filter((term) => term.length > 0)
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
      if (!terms.some((term) => text.includes(term))) continue
      if (options.workspace && document.workspace !== options.workspace) continue
      if (options.excludeWorkspaces?.includes(document.workspace)) continue
      if (options.excludePaths && options.excludePaths.length > 0) {
        const excluded = options.excludePaths.some((pattern) => {
          const regex = new RegExp(pattern.replaceAll('.', '\\.').replaceAll('*', '.*'), 'i')
          return regex.test(document.path)
        })
        if (excluded) continue
      }

      const score =
        1 +
        (document.path.toLowerCase() === rawQuery ? 1_000_000 : 0) +
        (document.configRelativePath.toLowerCase() === rawQuery ? 1_000 : 0)

      const { snippet, startLine, endLine } = this.extractMatchSnippet(document.content, terms)
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
   * Returns all (symbol, caller) pairs in the graph for batch hotspot scoring.
   * @returns An array of objects containing the target symbol and the caller's file path.
   */
  async getSymbolCallers(): Promise<Array<{ symbol: SymbolNode; callerFilePath: string }>> {
    this.ensureOpen()
    const rows = await exec(
      this.conn!,
      `MATCH (caller:Symbol)-[:CALLS|CONSTRUCTS|USES_TYPE]->(s:Symbol) RETURN s.id AS id, s.name AS name, s.kind AS kind, s.filePath AS filePath, s.parentId AS parentId, s.line AS line, s.col AS col, s.comment AS comment, caller.filePath AS callerFilePath`,
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
    if (this._isOpen) {
      await this.close()
    }

    rmSync(this.graphDir, { recursive: true, force: true })
    this._lastIndexedAt = undefined
    this._lastIndexedRef = null
    this._graphFingerprint = null
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
 * @param query - Raw user search input.
 * @returns Sanitized query string for discovery mode.
 */
function sanitizeFtsQuery(query: string): string {
  const trimmed = query.trim()
  if (trimmed.length === 0) return ''
  const tokens = trimmed.split(/\s+/).filter((t) => t.length > 0)
  if (tokens.length === 0) return ''
  return tokens.map((token) => '"' + token.replaceAll('"', '""') + '"').join(' OR ')
}
