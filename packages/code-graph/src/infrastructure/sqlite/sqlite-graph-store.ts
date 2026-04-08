/* eslint-disable jsdoc/require-jsdoc, @typescript-eslint/require-await */
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import Database, { type Statement } from 'better-sqlite3'
import { GraphStore } from '../../domain/ports/graph-store.js'
import { StoreNotOpenError } from '../../domain/errors/store-not-open-error.js'
import { expandSymbolName } from '../../domain/services/expand-symbol-name.js'
import { matchesExclude } from '../../domain/services/matches-exclude.js'
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
import { SQLITE_SCHEMA_DDL, SQLITE_SCHEMA_VERSION } from './schema.js'

type SqliteDatabase = InstanceType<typeof Database>
type SqliteStatement = Statement

interface RelationRow {
  readonly source: string
  readonly target: string
  readonly type: string
  readonly metadata_json: string | null
}

/**
 * SQLite-backed GraphStore implementation.
 */
export class SQLiteGraphStore extends GraphStore {
  private static readonly SQLITE_BUSY_TIMEOUT_MS = 5000
  private db: SqliteDatabase | undefined
  private _lastIndexedAt: string | undefined
  private _lastIndexedRef: string | null = null
  private readonly preparedStatements = new Map<string, SqliteStatement>()

  private readonly graphDir: string
  private readonly tmpDir: string
  private readonly dbPath: string

  /**
   * Creates a new SQLite-backed graph store under the provided storage root.
   *
   * @param storagePath - Root path owning `graph/` and `tmp/` directories.
   */
  constructor(storagePath: string) {
    super(storagePath)
    this.graphDir = join(storagePath, 'graph')
    this.tmpDir = join(storagePath, 'tmp')
    this.dbPath = join(this.graphDir, 'code-graph.sqlite')
  }

  async open(): Promise<void> {
    if (this.db !== undefined) return
    mkdirSync(this.graphDir, { recursive: true })
    mkdirSync(this.tmpDir, { recursive: true })

    const db = new Database(this.dbPath)
    db.pragma('foreign_keys = ON')
    db.pragma('journal_mode = WAL')
    db.pragma(`busy_timeout = ${SQLiteGraphStore.SQLITE_BUSY_TIMEOUT_MS}`)
    db.pragma('synchronous = NORMAL')
    db.pragma('temp_store = MEMORY')
    db.exec(SQLITE_SCHEMA_DDL)
    this.db = db

    this.ensureSchemaVersion()
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
      this.touchIndexTimestamp(db)
    })
    tx()
    await this.rebuildFtsIndexes()
  }

  async removeFile(filePath: string): Promise<void> {
    const db = this.ensureOpen()
    db.transaction(() => {
      this.deleteFileLocalState(db, filePath)
      this.touchIndexTimestamp(db)
    })()
    await this.rebuildFtsIndexes()
  }

  async upsertSpec(spec: SpecNode, relations: Relation[]): Promise<void> {
    const db = this.ensureOpen()
    db.transaction(() => {
      this.deleteSpecLocalState(db, spec.specId)
      this.insertSpec(db, spec)
      this.insertRelations(db, relations)
    })()
    await this.rebuildFtsIndexes()
  }

  async removeSpec(specId: string): Promise<void> {
    const db = this.ensureOpen()
    db.transaction(() => {
      this.deleteSpecLocalState(db, specId)
    })()
    await this.rebuildFtsIndexes()
  }

  async addRelations(relations: Relation[]): Promise<void> {
    const db = this.ensureOpen()
    db.transaction(() => {
      this.insertRelations(db, relations)
    })()
    await this.rebuildFtsIndexes()
  }

  async bulkLoad(data: {
    files: FileNode[]
    symbols: SymbolNode[]
    specs: SpecNode[]
    relations: Relation[]
    onProgress?: (step: string) => void
    vcsRef?: string
  }): Promise<void> {
    const db = this.ensureOpen()
    const tx = db.transaction(() => {
      data.onProgress?.('files')
      this.insertFiles(db, data.files)
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
    })
    tx()
    await this.rebuildFtsIndexes()
  }

  async getFile(path: string): Promise<FileNode | undefined> {
    const row = this.statement(
      'SELECT path, language, content_hash, workspace, embedding FROM files WHERE path = ?',
    ).get(path) as
      | {
          path: string
          language: string
          content_hash: string
          workspace: string
          embedding: Buffer | null
        }
      | undefined
    return row === undefined ? undefined : this.mapFileRow(row)
  }

  async getSymbol(id: string): Promise<SymbolNode | undefined> {
    const row = this.statement(
      'SELECT id, name, kind, file_path, line, column_number, comment FROM symbols WHERE id = ?',
    ).get(id) as
      | {
          id: string
          name: string
          kind: string
          file_path: string
          line: number
          column_number: number
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
    return this.getRelationsByTarget(RelationType.Calls, symbolId)
  }

  async getCallees(symbolId: string): Promise<Relation[]> {
    return this.getRelationsBySource(RelationType.Calls, symbolId)
  }

  async getImporters(filePath: string): Promise<Relation[]> {
    return this.getRelationsByTarget(RelationType.Imports, filePath)
  }

  async getImportees(filePath: string): Promise<Relation[]> {
    return this.getRelationsBySource(RelationType.Imports, filePath)
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

  async getExportedSymbols(filePath: string): Promise<SymbolNode[]> {
    const rows = this.statement(
      `
        SELECT s.id, s.name, s.kind, s.file_path, s.line, s.column_number, s.comment
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
      line: number
      column_number: number
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

    if (query.filePath !== undefined && !needsFilePathPatternFilter) {
      conditions.push('file_path = ?')
      params.push(query.filePath)
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
      `SELECT id, name, kind, file_path, line, column_number, comment FROM symbols${where}`,
    ).all(...params) as Array<{
      id: string
      name: string
      kind: string
      file_path: string
      line: number
      column_number: number
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
      symbolCount,
      specCount,
      relationCounts,
      languages,
      lastIndexedAt: this._lastIndexedAt,
      lastIndexedRef: this._lastIndexedRef,
    }
  }

  async getAllFiles(): Promise<FileNode[]> {
    const rows = this.ensureOpen()
      .prepare('SELECT path, language, content_hash, workspace, embedding FROM files')
      .all() as Array<{
      path: string
      language: string
      content_hash: string
      workspace: string
      embedding: Buffer | null
    }>
    return rows.map((row) => this.mapFileRow(row))
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

  async searchSymbols(
    options: SearchOptions,
  ): Promise<Array<{ symbol: SymbolNode; score: number }>> {
    const query = options.query.trim()
    if (query.length === 0) return []

    const rows = this.ensureOpen()
      .prepare(
        `
          SELECT
            s.id,
            s.name,
            s.kind,
            s.file_path,
            s.line,
            s.column_number,
            s.comment,
            -bm25(symbol_fts) AS score
          FROM symbol_fts
          INNER JOIN symbols s ON s.id = symbol_fts.id
          WHERE symbol_fts MATCH ?
          ORDER BY score DESC
        `,
      )
      .all(query) as Array<{
      id: string
      name: string
      kind: string
      file_path: string
      line: number
      column_number: number
      comment: string | null
      score: number
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
      return !matchesExclude(row.file_path, options.excludePaths, options.excludeWorkspaces)
    })

    return filtered.slice(0, options.limit ?? 20).map((row) => ({
      symbol: this.mapSymbolRow(row),
      score: row.score,
    }))
  }

  async searchSpecs(options: SearchOptions): Promise<Array<{ spec: SpecNode; score: number }>> {
    const query = options.query.trim()
    if (query.length === 0) return []

    const rows = this.ensureOpen()
      .prepare(
        `
          SELECT
            s.spec_id,
            s.path,
            s.title,
            s.description,
            s.content_hash,
            s.content,
            s.depends_on_json,
            s.workspace,
            -bm25(spec_fts) AS score
          FROM spec_fts
          INNER JOIN specs s ON s.spec_id = spec_fts.spec_id
          WHERE spec_fts MATCH ?
          ORDER BY score DESC
        `,
      )
      .all(query) as Array<{
      spec_id: string
      path: string
      title: string
      description: string
      content_hash: string
      content: string
      depends_on_json: string
      workspace: string
      score: number
    }>

    const filtered = rows.filter((row) => {
      if (options.workspace !== undefined && row.workspace !== options.workspace) return false
      if (options.excludeWorkspaces?.includes(row.workspace)) return false
      return !matchesExclude(row.path, options.excludePaths, options.excludeWorkspaces)
    })

    return filtered.slice(0, options.limit ?? 20).map((row) => ({
      spec: this.mapSpecRow(row),
      score: row.score,
    }))
  }

  async rebuildFtsIndexes(): Promise<void> {
    const db = this.ensureOpen()
    db.transaction(() => {
      db.prepare('DELETE FROM symbol_fts').run()
      db.prepare('DELETE FROM spec_fts').run()

      const symbolInsert = db.prepare(
        'INSERT INTO symbol_fts (id, search_text, comment) VALUES (?, ?, ?)',
      )
      const symbolRows = db.prepare('SELECT id, name, comment FROM symbols').all() as Array<{
        id: string
        name: string
        comment: string | null
      }>
      for (const row of symbolRows) {
        symbolInsert.run(row.id, expandSymbolName(row.name), row.comment ?? '')
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
    })()
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
            target.line,
            target.column_number,
            target.comment,
            caller.file_path AS caller_file_path
          FROM relations r
          INNER JOIN symbols target ON target.id = r.target
          INNER JOIN symbols caller ON caller.id = r.source
          WHERE r.type = ?
        `,
      )
      .all(RelationType.Calls) as Array<{
      id: string
      name: string
      kind: string
      file_path: string
      line: number
      column_number: number
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
      db.prepare('DELETE FROM files').run()
      db.prepare("DELETE FROM meta WHERE key IN ('lastIndexedAt', 'lastIndexedRef')").run()
      db.prepare('DELETE FROM symbol_fts').run()
      db.prepare('DELETE FROM spec_fts').run()
    })()

    this._lastIndexedAt = undefined
    this._lastIndexedRef = null
  }

  async recreate(): Promise<void> {
    await this.close()
    rmSync(this.graphDir, { recursive: true, force: true })
    this._lastIndexedAt = undefined
    this._lastIndexedRef = null
  }

  private ensureOpen(): SqliteDatabase {
    if (this.db === undefined) {
      throw new StoreNotOpenError()
    }
    return this.db
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
      throw new Error(
        `sqlite graph-store schema version ${current.value} is incompatible with ${SQLITE_SCHEMA_VERSION}`,
      )
    }
  }

  private loadMetadata(): void {
    const db = this.ensureOpen()
    const lastIndexedAt = db
      .prepare('SELECT value FROM meta WHERE key = ?')
      .get('lastIndexedAt') as { value: string } | undefined
    const lastIndexedRef = db
      .prepare('SELECT value FROM meta WHERE key = ?')
      .get('lastIndexedRef') as { value: string } | undefined

    this._lastIndexedAt = lastIndexedAt?.value
    this._lastIndexedRef = lastIndexedRef?.value ?? null
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
        INSERT INTO files (path, language, content_hash, workspace, embedding)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET
          language = excluded.language,
          content_hash = excluded.content_hash,
          workspace = excluded.workspace,
          embedding = excluded.embedding
      `,
    ).run(
      file.path,
      file.language,
      file.contentHash,
      file.workspace,
      this.serializeEmbedding(file.embedding),
    )
  }

  private insertFiles(db: SqliteDatabase, files: readonly FileNode[]): void {
    for (const file of files) {
      this.insertFile(db, file)
    }
  }

  private insertSymbols(db: SqliteDatabase, symbols: readonly SymbolNode[]): void {
    const stmt = db.prepare(
      `
        INSERT INTO symbols (
          id, name, kind, file_path, line, column_number, comment, search_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          kind = excluded.kind,
          file_path = excluded.file_path,
          line = excluded.line,
          column_number = excluded.column_number,
          comment = excluded.comment,
          search_text = excluded.search_text
      `,
    )

    for (const symbol of symbols) {
      stmt.run(
        symbol.id,
        symbol.name,
        symbol.kind,
        symbol.filePath,
        symbol.line,
        symbol.column,
        symbol.comment ?? null,
        expandSymbolName(symbol.name),
      )
    }
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
    for (const spec of specs) {
      this.insertSpec(db, spec)
    }
  }

  private insertRelations(db: SqliteDatabase, relations: readonly Relation[]): void {
    const stmt = db.prepare(
      `
        INSERT INTO relations (source, target, type, metadata_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(source, target, type) DO UPDATE SET
          metadata_json = excluded.metadata_json
      `,
    )
    for (const relation of relations) {
      if (!this.relationEndpointsExist(relation)) {
        continue
      }
      stmt.run(
        relation.source,
        relation.target,
        relation.type,
        relation.metadata === undefined ? null : JSON.stringify(relation.metadata),
      )
    }
  }

  private relationEndpointsExist(relation: Relation): boolean {
    switch (relation.type) {
      case RelationType.Imports:
        return this.fileExists(relation.source) && this.fileExists(relation.target)
      case RelationType.Defines:
      case RelationType.Exports:
        return this.fileExists(relation.source) && this.symbolExists(relation.target)
      case RelationType.Calls:
      case RelationType.Extends:
      case RelationType.Implements:
      case RelationType.Overrides:
        return this.symbolExists(relation.source) && this.symbolExists(relation.target)
      case RelationType.DependsOn:
        return this.specExists(relation.source) && this.specExists(relation.target)
      case RelationType.Covers:
        return this.specExists(relation.source) && this.fileExists(relation.target)
    }
  }

  private fileExists(filePath: string): boolean {
    return (
      this.statement('SELECT 1 AS present FROM files WHERE path = ? LIMIT 1').get(filePath) !==
      undefined
    )
  }

  private symbolExists(symbolId: string): boolean {
    return (
      this.statement('SELECT 1 AS present FROM symbols WHERE id = ? LIMIT 1').get(symbolId) !==
      undefined
    )
  }

  private specExists(specId: string): boolean {
    return (
      this.statement('SELECT 1 AS present FROM specs WHERE spec_id = ? LIMIT 1').get(specId) !==
      undefined
    )
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
    db.prepare('DELETE FROM files WHERE path = ?').run(filePath)
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

  private mapFileRow(row: {
    path: string
    language: string
    content_hash: string
    workspace: string
    embedding: Buffer | null
  }): FileNode {
    return createFileNode({
      path: row.path,
      language: row.language,
      contentHash: row.content_hash,
      workspace: row.workspace,
      ...(row.embedding !== null ? { embedding: this.deserializeEmbedding(row.embedding) } : {}),
    })
  }

  private mapSymbolRow(row: {
    id: string
    name: string
    kind: string
    file_path: string
    line: number
    column_number: number
    comment: string | null
  }): SymbolNode {
    return createSymbolNode({
      name: row.name,
      kind: row.kind,
      filePath: row.file_path,
      line: row.line,
      column: row.column_number,
      ...(row.comment !== null ? { comment: row.comment } : {}),
    })
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
