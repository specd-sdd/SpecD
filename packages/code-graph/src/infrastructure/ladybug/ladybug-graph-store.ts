import { Database, Connection, type QueryResult, type LbugValue } from 'lbug'
import { GraphStore } from '../../domain/ports/graph-store.js'
import { type FileNode } from '../../domain/value-objects/file-node.js'
import { type SymbolNode } from '../../domain/value-objects/symbol-node.js'
import { type SpecNode } from '../../domain/value-objects/spec-node.js'
import { type Relation } from '../../domain/value-objects/relation.js'
import { type SymbolQuery } from '../../domain/value-objects/symbol-query.js'
import { type GraphStatistics } from '../../domain/value-objects/graph-statistics.js'
import { type RelationType, RelationType as RT } from '../../domain/value-objects/relation-type.js'
import { StoreNotOpenError } from '../../domain/errors/store-not-open-error.js'
import { SCHEMA_DDL } from './schema.js'
import { mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'

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
 * Graph store implementation backed by a Ladybug (lbug) embedded graph database.
 * Persists files, symbols, specs, and their relations as a labeled property graph.
 */
export class LadybugGraphStore extends GraphStore {
  private db: Database | undefined
  private conn: Connection | undefined
  private _isOpen = false
  private _lastIndexedAt: string | undefined

  /**
   * Asserts the store is open and the connection is available.
   * @throws {StoreNotOpenError} If the store has not been opened.
   */
  private ensureOpen(): void {
    if (!this._isOpen || !this.conn) {
      throw new StoreNotOpenError()
    }
  }

  /** Returns the full filesystem path to the Ladybug database file. */
  private get dbPath(): string {
    return join(this.storagePath, '.specd', 'code-graph.lbug')
  }

  /**
   * Opens the database, initializes the schema, and loads metadata.
   */
  async open(): Promise<void> {
    const dir = dirname(this.dbPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
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

    this._isOpen = true

    const metaRows = await exec(
      this.conn,
      `MATCH (m:Meta {key: 'lastIndexedAt'}) RETURN m.value AS v`,
    )
    if (metaRows.length > 0 && metaRows[0]) {
      this._lastIndexedAt = metaRows[0]['v'] as string
    }
  }

  /**
   * Closes the database connection and releases resources.
   */
  async close(): Promise<void> {
    this._isOpen = false
    if (this.conn) {
      await this.conn.close()
      this.conn = undefined
    }
    if (this.db) {
      await this.db.close()
      this.db = undefined
    }
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

    await this.removeFile(file.path)

    const escapedPath = this.escape(file.path)
    const escapedLang = this.escape(file.language)
    const escapedHash = this.escape(file.contentHash)
    const escapedWorkspace = this.escape(file.workspace)

    await conn.query(
      `CREATE (f:File {path: '${escapedPath}', language: '${escapedLang}', contentHash: '${escapedHash}', workspace: '${escapedWorkspace}'})`,
    )

    for (const symbol of symbols) {
      await conn.query(
        `CREATE (s:Symbol {id: '${this.escape(symbol.id)}', name: '${this.escape(symbol.name)}', kind: '${this.escape(symbol.kind)}', filePath: '${escapedPath}', line: ${symbol.line}, col: ${symbol.column}, comment: '${this.escape(symbol.comment ?? '')}'})`,
      )
    }

    for (const rel of relations) {
      await this.createRelation(conn, rel)
    }

    this._lastIndexedAt = new Date().toISOString()
    await this.updateMeta(conn, 'lastIndexedAt', this._lastIndexedAt)
  }

  /**
   * Removes a file node and all its associated symbols and relations from the graph.
   * @param filePath - Path of the file to remove.
   */
  async removeFile(filePath: string): Promise<void> {
    this.ensureOpen()
    const conn = this.conn!
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
   * Inserts or replaces a spec node along with its dependency relations.
   * @param spec - The spec node to upsert.
   * @param relations - Dependency relations for this spec.
   */
  async upsertSpec(spec: SpecNode, relations: Relation[]): Promise<void> {
    this.ensureOpen()
    const conn = this.conn!

    await this.removeSpec(spec.specId)

    await conn.query(
      `CREATE (s:Spec {specId: '${this.escape(spec.specId)}', path: '${this.escape(spec.path)}', title: '${this.escape(spec.title)}'})`,
    )

    for (const rel of relations) {
      await this.createRelation(conn, rel)
    }
  }

  /**
   * Removes a spec node and all its relations from the graph.
   * @param specId - Identifier of the spec to remove.
   */
  async removeSpec(specId: string): Promise<void> {
    this.ensureOpen()
    const conn = this.conn!
    const escaped = this.escape(specId)

    await conn.query(`MATCH (s:Spec {specId: '${escaped}'})-[r]->() DELETE r`)
    await conn.query(`MATCH ()-[r]->(s:Spec {specId: '${escaped}'}) DELETE r`)
    await conn.query(`MATCH (s:Spec {specId: '${escaped}'}) DELETE s`)
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
      `MATCH (s:Spec {specId: '${this.escape(specId)}'}) RETURN s.specId AS specId, s.path AS path, s.title AS title`,
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
      dependsOn: depRows.map((r) => r['specId'] as string),
    }
  }

  /**
   * Returns all CALLS relations where the given symbol is the target (i.e., its callers).
   * @param symbolId - The symbol identifier to find callers for.
   * @returns An array of caller relations.
   */
  async getCallers(symbolId: string): Promise<Relation[]> {
    this.ensureOpen()
    const rows = await exec(
      this.conn!,
      `MATCH (caller:Symbol)-[:CALLS]->(s:Symbol {id: '${this.escape(symbolId)}'}) RETURN caller.id AS source`,
    )
    return rows.map((r) => ({
      source: r['source'] as string,
      target: symbolId,
      type: RT.Calls as RelationType,
      metadata: undefined,
    }))
  }

  /**
   * Returns all CALLS relations where the given symbol is the source (i.e., its callees).
   * @param symbolId - The symbol identifier to find callees for.
   * @returns An array of callee relations.
   */
  async getCallees(symbolId: string): Promise<Relation[]> {
    this.ensureOpen()
    const rows = await exec(
      this.conn!,
      `MATCH (s:Symbol {id: '${this.escape(symbolId)}'})-[:CALLS]->(callee:Symbol) RETURN callee.id AS target`,
    )
    return rows.map((r) => ({
      source: symbolId,
      target: r['target'] as string,
      type: RT.Calls as RelationType,
      metadata: undefined,
    }))
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
      if (query.name.includes('*')) {
        const regex = query.name.replaceAll('.', '\\.').replaceAll('*', '.*')
        conditions.push(`s.name =~ '${this.escape(regex)}'`)
      } else {
        conditions.push(`s.name = '${this.escape(query.name)}'`)
      }
    }
    if (query.comment !== undefined) {
      conditions.push(`s.comment CONTAINS '${this.escape(query.comment)}'`)
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
        const rows = await exec(conn, `MATCH ()-[r:${type}]->() RETURN count(r) AS c`)
        relationCounts[type] = Number(rows[0]?.['c'] ?? 0)
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
      'MATCH (s:Spec) RETURN s.specId AS specId, s.path AS path, s.title AS title',
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
        dependsOn: depRows.map((r) => r['target'] as string),
      })
    }

    return specs
  }

  /**
   * Deletes all nodes and relations from the graph.
   */
  async clear(): Promise<void> {
    this.ensureOpen()
    const conn = this.conn!

    const relTypes = ['IMPORTS', 'DEFINES', 'CALLS', 'EXPORTS', 'DEPENDS_ON', 'COVERS']
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
    this._lastIndexedAt = undefined
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
    }
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
   * Escapes single quotes and backslashes for safe inclusion in Cypher query strings.
   * @param value - The string value to escape.
   * @returns The escaped string.
   */
  private escape(value: string): string {
    return value.replaceAll("'", "\\'").replaceAll('\\', '\\\\')
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
