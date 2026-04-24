import { Database, Connection, type QueryResult, type LbugValue } from 'lbug'
import { GraphStore } from '../../domain/ports/graph-store.js'
import { type FileNode } from '../../domain/value-objects/file-node.js'
import { type SymbolNode } from '../../domain/value-objects/symbol-node.js'
import { type SpecNode } from '../../domain/value-objects/spec-node.js'
import { type Relation } from '../../domain/value-objects/relation.js'
import { type SymbolQuery } from '../../domain/value-objects/symbol-query.js'
import { type GraphStatistics } from '../../domain/value-objects/graph-statistics.js'
import { type RelationType, RelationType as RT } from '../../domain/value-objects/relation-type.js'
import { type SearchOptions } from '../../domain/value-objects/search-options.js'
import { StoreNotOpenError } from '../../domain/errors/store-not-open-error.js'
import { SCHEMA_DDL } from './schema.js'
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
    await this.createFtsIndex('Spec', 'spec_fts', ['title', 'description', 'content'])

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

    this._isOpen = true
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
    const escaped = this.escape(filePath)

    const symbolRows = await exec(
      conn,
      `MATCH (s:Symbol {filePath: '${escaped}'}) RETURN s.id AS id`,
    )

    for (const row of symbolRows) {
      const symbolId = row['id'] as string
      await conn.query(`MATCH (s:Symbol {id: '${this.escape(symbolId)}'})-[r]->() DELETE r`)
      await conn.query(`MATCH ()-[r]->(s:Symbol {id: '${this.escape(symbolId)}'}) DELETE r`)
      await conn.query(`MATCH (s:Symbol {id: '${this.escape(symbolId)}'}) DELETE s`)
    }

    await conn.query(`MATCH (f:File {path: '${escaped}'})-[r]->() DELETE r`)
    await conn.query(`MATCH ()-[r]->(f:File {path: '${escaped}'}) DELETE r`)
    await conn.query(`MATCH (f:File {path: '${escaped}'}) DELETE f`)
  }

  /**
   * Deletes a spec node and adjacent relations without rebuilding FTS.
   * @param conn - The active Ladybug connection.
   * @param specId - Identifier of the spec to remove.
   */
  private async deleteSpecLocalState(conn: Connection, specId: string): Promise<void> {
    const escaped = this.escape(specId)

    await conn.query(`MATCH (s:Spec {specId: '${escaped}'})-[r]->() DELETE r`)
    await conn.query(`MATCH ()-[r]->(s:Spec {specId: '${escaped}'}) DELETE r`)
    await conn.query(`MATCH (s:Spec {specId: '${escaped}'}) DELETE s`)
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
    await this.createFtsIndex('Spec', 'spec_fts', ['title', 'description', 'content'])
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

      const escapedPath = this.escape(file.path)
      const escapedLang = this.escape(file.language)
      const escapedHash = this.escape(file.contentHash)
      const escapedWorkspace = this.escape(file.workspace)

      await conn.query(
        `CREATE (f:File {path: '${escapedPath}', language: '${escapedLang}', contentHash: '${escapedHash}', workspace: '${escapedWorkspace}'})`,
      )

      for (const symbol of symbols) {
        await conn.query(
          `CREATE (s:Symbol {id: '${this.escape(symbol.id)}', name: '${this.escape(symbol.name)}', searchName: '${this.escape(expandSymbolName(symbol.name))}', kind: '${this.escape(symbol.kind)}', filePath: '${escapedPath}', line: ${symbol.line}, col: ${symbol.column}, comment: '${this.escape(symbol.comment ?? '')}'})`,
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
   */
  async bulkLoad(data: {
    files: FileNode[]
    symbols: SymbolNode[]
    specs: SpecNode[]
    relations: Relation[]
    onProgress?: (step: string) => void
    vcsRef?: string
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
          const fileRows = ['path,language,contentHash,workspace']
          for (const f of batch) {
            fileRows.push(
              `${csvEscape(f.path)},${csvEscape(f.language)},${csvEscape(f.contentHash)},${csvEscape(f.workspace)}`,
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
          const symRows = ['id,name,searchName,kind,filePath,line,col,comment']
          for (const s of batch) {
            symRows.push(
              `${csvEscape(s.id)},${csvEscape(s.name)},${csvEscape(expandSymbolName(s.name))},${csvEscape(s.kind)},${csvEscape(s.filePath)},${s.line},${s.column},${csvEscape(s.comment ?? '')}`,
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
      await conn.query('COMMIT')
      this._lastIndexedAt = now
      if (data.vcsRef !== undefined) {
        this._lastIndexedRef = data.vcsRef
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

      await conn.query(
        `CREATE (s:Spec {specId: '${this.escape(spec.specId)}', path: '${this.escape(spec.path)}', title: '${this.escape(spec.title)}', description: '${this.escape(spec.description)}', contentHash: '${this.escape(spec.contentHash)}', content: '${this.escape(spec.content)}', workspace: '${this.escape(spec.workspace)}'})`,
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
   * Retrieves a file node by its path.
   * @param path - The file path to look up.
   * @returns The file node, or undefined if not found.
   */
  async getFile(path: string): Promise<FileNode | undefined> {
    this.ensureOpen()
    const rows = await exec(
      this.conn!,
      `MATCH (f:File {path: '${this.escape(path)}'}) RETURN f.path AS path, f.language AS language, f.contentHash AS contentHash, f.workspace AS workspace`,
    )
    if (rows.length === 0 || !rows[0]) return undefined
    const row = rows[0]
    return {
      path: row['path'] as string,
      language: row['language'] as string,
      contentHash: row['contentHash'] as string,
      workspace: row['workspace'] as string,
      embedding: undefined,
    }
  }

  /**
   * Retrieves a symbol node by its unique identifier.
   * @param id - The symbol identifier.
   * @returns The symbol node, or undefined if not found.
   */
  async getSymbol(id: string): Promise<SymbolNode | undefined> {
    this.ensureOpen()
    const rows = await exec(
      this.conn!,
      `MATCH (s:Symbol {id: '${this.escape(id)}'}) RETURN s.id AS id, s.name AS name, s.kind AS kind, s.filePath AS filePath, s.line AS line, s.col AS col, s.comment AS comment`,
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
    const rows = await exec(
      this.conn!,
      `MATCH (s:Spec {specId: '${this.escape(specId)}'}) RETURN s.specId AS specId, s.path AS path, s.title AS title, s.description AS description, s.contentHash AS contentHash, s.content AS content, s.workspace AS workspace`,
    )
    if (rows.length === 0 || !rows[0]) return undefined
    const row = rows[0]

    const depRows = await exec(
      this.conn!,
      `MATCH (s:Spec {specId: '${this.escape(specId)}'})-[:DEPENDS_ON]->(t:Spec) RETURN t.specId AS specId`,
    )

    return {
      specId: row['specId'] as string,
      path: row['path'] as string,
      title: row['title'] as string,
      description: (row['description'] as string) ?? '',
      contentHash: row['contentHash'] as string,
      content: (row['content'] as string) ?? '',
      dependsOn: depRows.map((r) => r['specId'] as string),
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
    const rows = await exec(
      this.conn!,
      `MATCH (importer:File)-[:IMPORTS]->(f:File {path: '${this.escape(filePath)}'}) RETURN importer.path AS source`,
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
    const rows = await exec(
      this.conn!,
      `MATCH (f:File {path: '${this.escape(filePath)}'})-[:IMPORTS]->(imported:File) RETURN imported.path AS target`,
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
    const rows = await exec(
      this.conn!,
      `MATCH (f:File {path: '${this.escape(filePath)}'})-[:EXPORTS]->(s:Symbol) RETURN s.id AS id, s.name AS name, s.kind AS kind, s.filePath AS filePath, s.line AS line, s.col AS col, s.comment AS comment`,
    )
    return rows.map((r) => ({
      id: r['id'] as string,
      name: r['name'] as string,
      kind: r['kind'] as string as import('../../domain/value-objects/symbol-kind.js').SymbolKind,
      filePath: r['filePath'] as string,
      line: Number(r['line']),
      column: Number(r['col']),
      comment: (r['comment'] as string) || undefined,
    }))
  }

  /**
   * Returns all specs that the given spec depends on.
   * @param specId - The spec identifier.
   * @returns An array of DEPENDS_ON relations.
   */
  async getSpecDependencies(specId: string): Promise<Relation[]> {
    this.ensureOpen()
    const rows = await exec(
      this.conn!,
      `MATCH (s:Spec {specId: '${this.escape(specId)}'})-[:DEPENDS_ON]->(t:Spec) RETURN t.specId AS target`,
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
    const rows = await exec(
      this.conn!,
      `MATCH (s:Spec)-[:DEPENDS_ON]->(t:Spec {specId: '${this.escape(specId)}'}) RETURN s.specId AS source`,
    )
    return rows.map((r) => ({
      source: r['source'] as string,
      target: specId,
      type: RT.DependsOn as RelationType,
      metadata: undefined,
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
    if (query.kind !== undefined) {
      conditions.push(`s.kind = '${this.escape(query.kind)}'`)
    }
    if (query.filePath !== undefined) {
      if (query.filePath.includes('*')) {
        const regex = query.filePath.replaceAll('.', '\\.').replaceAll('*', '.*')
        conditions.push(`s.filePath =~ '${this.escape(regex)}'`)
      } else {
        conditions.push(`s.filePath = '${this.escape(query.filePath)}'`)
      }
    }
    if (query.name !== undefined) {
      const ci = query.caseSensitive !== true
      if (query.name.includes('*')) {
        const regex = query.name.replaceAll('.', '\\.').replaceAll('*', '.*')
        if (ci) {
          conditions.push(`lower(s.name) =~ '${this.escape(regex.toLowerCase())}'`)
        } else {
          conditions.push(`s.name =~ '${this.escape(regex)}'`)
        }
      } else if (ci) {
        conditions.push(`lower(s.name) = '${this.escape(query.name.toLowerCase())}'`)
      } else {
        conditions.push(`s.name = '${this.escape(query.name)}'`)
      }
    }
    if (query.comment !== undefined) {
      const ci = query.caseSensitive !== true
      if (ci) {
        conditions.push(`lower(s.comment) CONTAINS '${this.escape(query.comment.toLowerCase())}'`)
      } else {
        conditions.push(`s.comment CONTAINS '${this.escape(query.comment)}'`)
      }
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
    const rows = await exec(
      this.conn!,
      `MATCH (s:Symbol)${where} RETURN s.id AS id, s.name AS name, s.kind AS kind, s.filePath AS filePath, s.line AS line, s.col AS col, s.comment AS comment`,
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
    const symbolRows = await exec(conn, 'MATCH (s:Symbol) RETURN count(s) AS c')
    const specRows = await exec(conn, 'MATCH (s:Spec) RETURN count(s) AS c')

    const fileCount = Number(fileRows[0]?.['c'] ?? 0)
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
      symbolCount,
      specCount,
      relationCounts: relationCounts as Record<RelationType, number>,
      languages,
      lastIndexedAt: this._lastIndexedAt,
      lastIndexedRef: this._lastIndexedRef,
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
      'MATCH (f:File) RETURN f.path AS path, f.language AS language, f.contentHash AS contentHash, f.workspace AS workspace',
    )
    return rows.map((r) => ({
      path: r['path'] as string,
      language: r['language'] as string,
      contentHash: r['contentHash'] as string,
      workspace: r['workspace'] as string,
      embedding: undefined,
    }))
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
      const depRows = await exec(
        this.conn!,
        `MATCH (s:Spec {specId: '${this.escape(specId)}'})-[:DEPENDS_ON]->(t:Spec) RETURN t.specId AS target`,
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
  ): Promise<Array<{ symbol: SymbolNode; score: number }>> {
    this.ensureOpen()
    const top = options.limit ?? 20

    const conditions: string[] = []
    if (options.kinds && options.kinds.length > 0) {
      const kindCondition = options.kinds
        .map((kind) => `node.kind = '${this.escape(kind)}'`)
        .join(' OR ')
      conditions.push(`(${kindCondition})`)
    }
    if (options.filePattern) {
      const regex = options.filePattern.replaceAll('.', '\\.').replaceAll('*', '.*')
      conditions.push(`node.filePath =~ '(?i)${this.escape(regex)}'`)
    }
    if (options.workspace) {
      conditions.push(`starts_with(node.filePath, '${this.escape(options.workspace + ':')}')`)
    }
    if (options.excludePaths && options.excludePaths.length > 0) {
      for (const pattern of options.excludePaths) {
        const regex = pattern.replaceAll('.', '\\.').replaceAll('*', '.*')
        conditions.push(`NOT node.filePath =~ '(?i)${this.escape(regex)}'`)
      }
    }
    if (options.excludeWorkspaces && options.excludeWorkspaces.length > 0) {
      for (const ws of options.excludeWorkspaces) {
        conditions.push(`NOT starts_with(node.filePath, '${this.escape(ws + ':')}')`)
      }
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
    const rows = await exec(
      this.conn!,
      `CALL QUERY_FTS_INDEX('Symbol', 'symbol_fts', '${this.escape(options.query)}', k := 1000)${where} RETURN node.id AS id, node.name AS name, node.kind AS kind, node.filePath AS filePath, node.line AS line, node.col AS col, node.comment AS comment, score ORDER BY score DESC LIMIT ${String(top)}`,
    )
    return rows.map((r) => ({
      symbol: this.rowToSymbol(r),
      score: r['score'] as number,
    }))
  }

  /**
   * Full-text search across specs using the `spec_fts` index.
   * Filters (workspace, excludeWorkspaces) are applied as WHERE clauses before LIMIT.
   * @param options - Search options including query, limit, and filters.
   * @returns Matching specs with BM25 scores, ordered by relevance.
   */
  async searchSpecs(options: SearchOptions): Promise<Array<{ spec: SpecNode; score: number }>> {
    this.ensureOpen()
    const top = options.limit ?? 20

    const conditions: string[] = []
    if (options.workspace) {
      conditions.push(`node.workspace = '${this.escape(options.workspace)}'`)
    }
    if (options.excludeWorkspaces && options.excludeWorkspaces.length > 0) {
      for (const ws of options.excludeWorkspaces) {
        conditions.push(`node.workspace <> '${this.escape(ws)}'`)
      }
    }
    if (options.excludePaths && options.excludePaths.length > 0) {
      for (const pattern of options.excludePaths) {
        const regex = pattern.replaceAll('.', '\\.').replaceAll('*', '.*')
        conditions.push(`NOT node.path =~ '(?i)${this.escape(regex)}'`)
      }
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
    const rows = await exec(
      this.conn!,
      `CALL QUERY_FTS_INDEX('Spec', 'spec_fts', '${this.escape(options.query)}', k := 1000)${where} RETURN node.specId AS specId, node.path AS path, node.title AS title, node.description AS description, node.contentHash AS contentHash, node.content AS content, node.workspace AS workspace, score ORDER BY score DESC LIMIT ${String(top)}`,
    )

    const results: Array<{ spec: SpecNode; score: number }> = []
    for (const row of rows) {
      const specId = row['specId'] as string
      const depRows = await exec(
        this.conn!,
        `MATCH (s:Spec {specId: '${this.escape(specId)}'})-[:DEPENDS_ON]->(t:Spec) RETURN t.specId AS target`,
      )
      results.push({
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
        score: row['score'] as number,
      })
    }
    return results
  }

  /**
   * Returns all (symbol, caller) pairs in the graph for batch hotspot scoring.
   * @returns An array of objects containing the target symbol and the caller's file path.
   */
  async getSymbolCallers(): Promise<Array<{ symbol: SymbolNode; callerFilePath: string }>> {
    this.ensureOpen()
    const rows = await exec(
      this.conn!,
      `MATCH (caller:Symbol)-[:CALLS|CONSTRUCTS|USES_TYPE]->(s:Symbol) RETURN s.id AS id, s.name AS name, s.kind AS kind, s.filePath AS filePath, s.line AS line, s.col AS col, s.comment AS comment, caller.filePath AS callerFilePath`,
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
      'COVERS',
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
    await conn.query('MATCH (s:Symbol) DELETE s')
    await conn.query('MATCH (s:Spec) DELETE s')
    await conn.query('MATCH (m:Meta) DELETE m')
    await this.rebuildFtsIndexes()
    this._lastIndexedAt = undefined
    this._lastIndexedRef = null
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
  }

  /**
   * Creates a typed relation between two graph nodes.
   * @param conn - The database connection.
   * @param rel - The relation to create.
   */
  private async createRelation(conn: Connection, rel: Relation): Promise<void> {
    switch (rel.type) {
      case RT.Imports:
        await conn.query(
          `MATCH (a:File {path: '${this.escape(rel.source)}'}), (b:File {path: '${this.escape(rel.target)}'}) CREATE (a)-[:IMPORTS]->(b)`,
        )
        break
      case RT.Defines:
        await conn.query(
          `MATCH (a:File {path: '${this.escape(rel.source)}'}), (b:Symbol {id: '${this.escape(rel.target)}'}) CREATE (a)-[:DEFINES]->(b)`,
        )
        break
      case RT.Calls:
        await conn.query(
          `MATCH (a:Symbol {id: '${this.escape(rel.source)}'}), (b:Symbol {id: '${this.escape(rel.target)}'}) CREATE (a)-[:CALLS]->(b)`,
        )
        break
      case RT.Constructs:
        await conn.query(
          `MATCH (a:Symbol {id: '${this.escape(rel.source)}'}), (b:Symbol {id: '${this.escape(rel.target)}'}) CREATE (a)-[:CONSTRUCTS]->(b)`,
        )
        break
      case RT.UsesType:
        await conn.query(
          `MATCH (a:Symbol {id: '${this.escape(rel.source)}'}), (b:Symbol {id: '${this.escape(rel.target)}'}) CREATE (a)-[:USES_TYPE]->(b)`,
        )
        break
      case RT.Exports:
        await conn.query(
          `MATCH (a:File {path: '${this.escape(rel.source)}'}), (b:Symbol {id: '${this.escape(rel.target)}'}) CREATE (a)-[:EXPORTS]->(b)`,
        )
        break
      case RT.DependsOn:
        await conn.query(
          `MATCH (a:Spec {specId: '${this.escape(rel.source)}'}), (b:Spec {specId: '${this.escape(rel.target)}'}) CREATE (a)-[:DEPENDS_ON]->(b)`,
        )
        break
      case RT.Covers:
        await conn.query(
          `MATCH (a:Spec {specId: '${this.escape(rel.source)}'}), (b:File {path: '${this.escape(rel.target)}'}) CREATE (a)-[:COVERS]->(b)`,
        )
        break
      case RT.Extends:
        await conn.query(
          `MATCH (a:Symbol {id: '${this.escape(rel.source)}'}), (b:Symbol {id: '${this.escape(rel.target)}'}) CREATE (a)-[:EXTENDS]->(b)`,
        )
        break
      case RT.Implements:
        await conn.query(
          `MATCH (a:Symbol {id: '${this.escape(rel.source)}'}), (b:Symbol {id: '${this.escape(rel.target)}'}) CREATE (a)-[:IMPLEMENTS]->(b)`,
        )
        break
      case RT.Overrides:
        await conn.query(
          `MATCH (a:Symbol {id: '${this.escape(rel.source)}'}), (b:Symbol {id: '${this.escape(rel.target)}'}) CREATE (a)-[:OVERRIDES]->(b)`,
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
    const rows = await exec(
      this.conn!,
      `MATCH (source:Symbol)-[r:${relationType}]->(target:Symbol {id: '${this.escape(symbolId)}'}) RETURN source.id AS source`,
    )
    return rows.map((row) => ({
      source: row['source'] as string,
      target: symbolId,
      type: relationType,
      metadata: undefined,
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
    const rows = await exec(
      this.conn!,
      `MATCH (source:Symbol {id: '${this.escape(symbolId)}'})-[r:${relationType}]->(target:Symbol) RETURN target.id AS target`,
    )
    return rows.map((row) => ({
      source: symbolId,
      target: row['target'] as string,
      type: relationType,
      metadata: undefined,
    }))
  }

  /**
   * Updates or inserts a metadata key-value pair in the graph.
   * @param conn - The database connection.
   * @param key - The metadata key.
   * @param value - The metadata value.
   */
  private async updateMeta(conn: Connection, key: string, value: string): Promise<void> {
    await conn.query(`MATCH (m:Meta {key: '${this.escape(key)}'}) DELETE m`)
    await conn.query(`CREATE (m:Meta {key: '${this.escape(key)}', value: '${this.escape(value)}'})`)
  }

  /**
   * Escapes single quotes, backslashes, and newlines for safe inclusion in Cypher query strings.
   * @param value - The string value to escape.
   * @returns The escaped string.
   */
  private escape(value: string): string {
    return value
      .replaceAll('\\', '\\\\')
      .replaceAll("'", "\\'")
      .replaceAll('\n', '\\n')
      .replaceAll('\r', '\\r')
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
      comment: (row['comment'] as string) || undefined,
    }
  }
}
