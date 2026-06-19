/* eslint-disable jsdoc/require-jsdoc, @typescript-eslint/require-await */
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import Database, { type Statement } from 'better-sqlite3'
import { GraphStore } from '../../domain/ports/graph-store.js'
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
import { SQLITE_SCHEMA_DDL, SQLITE_SCHEMA_VERSION } from './schema.js'

type SqliteDatabase = InstanceType<typeof Database>
type SqliteStatement = Statement
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

    this.migrateSchemaIfNeeded()

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
    })
    tx()
    await this.rebuildFtsIndexes()
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
      'SELECT id, name, kind, file_path, parent_id, line, column_number, comment FROM symbols WHERE id = ?',
    ).get(id) as
      | {
          id: string
          name: string
          kind: string
          file_path: string
          parent_id: string | null
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

  async getCoveringSpecs(filePath: string): Promise<Relation[]> {
    return this.getRelationsByTarget(RelationType.CoversFile, filePath)
  }

  async getCoveredSymbols(specId: string): Promise<Relation[]> {
    return this.getRelationsBySource(RelationType.CoversSymbol, specId)
  }

  async getSymbolCoveringSpecs(symbolId: string): Promise<Relation[]> {
    return this.getRelationsByTarget(RelationType.CoversSymbol, symbolId)
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
      `SELECT id, name, kind, file_path, parent_id, line, column_number, comment FROM symbols${where}`,
    ).all(...params) as Array<{
      id: string
      name: string
      kind: string
      file_path: string
      parent_id: string | null
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
      canonicalExpr: 'lower(s.id)',
      canonicalComponentsExpr: buildIdentityComponentsExpr('lower(s.id)'),
      alternateExpr: 'lower(s.name)',
      alternateComponentsExpr: buildIdentityComponentsExpr('lower(s.name)'),
      normalizedQuery: query.normalizedQuery,
      rawTokens: query.rawTokens,
      expandedTokens: query.expandedTokens,
    })
    const identityCandidates = buildIdentityCandidatePredicateSql({
      canonicalExpr: 'lower(s.id)',
      canonicalComponentsExpr: buildIdentityComponentsExpr('lower(s.id)'),
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
            ${ranking.selectSql},
            (-bm25(spec_fts)) AS text_score,
            snippet(spec_fts, 3, '', '', '...', 32) as snippet
          FROM spec_fts
          INNER JOIN specs s ON s.spec_id = spec_fts.spec_id
          WHERE spec_fts MATCH ?
          ORDER BY identity_tier DESC, identity_token_hits DESC, identity_match_strength DESC, text_score DESC
        `,
      )
      .all(...ranking.params, query.ftsQuery) as Array<{
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
    const rows = this.ensureOpen()
      .prepare(
        `
          SELECT
            d.path,
            d.config_relative_path,
            d.content_hash,
            d.content,
            d.workspace,
            ${ranking.selectSql},
            (-bm25(document_fts)) AS text_score,
            snippet(document_fts, 2, '', '', '...', 32) as snippet
          FROM document_fts
          INNER JOIN documents d ON d.path = document_fts.path
          WHERE document_fts MATCH ?
          ORDER BY identity_tier DESC, identity_token_hits DESC, identity_match_strength DESC, text_score DESC
        `,
      )
      .all(...ranking.params, query.ftsQuery) as Array<{
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

  async rebuildFtsIndexes(): Promise<void> {
    const db = this.ensureOpen()
    db.transaction(() => {
      db.prepare('DELETE FROM symbol_fts').run()
      db.prepare('DELETE FROM spec_fts').run()
      db.prepare('DELETE FROM document_fts').run()

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

      const documentInsert = db.prepare(
        'INSERT INTO document_fts (path, config_relative_path, content) VALUES (?, ?, ?)',
      )
      const documentRows = db
        .prepare('SELECT path, config_relative_path, content FROM documents')
        .all() as Array<{ path: string; config_relative_path: string; content: string }>
      for (const row of documentRows) {
        documentInsert.run(row.path, row.config_relative_path, row.content)
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
            target.parent_id,
            target.line,
            target.column_number,
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
    await this.close()
    rmSync(this.graphDir, { recursive: true, force: true })
    this._lastIndexedAt = undefined
    this._lastIndexedRef = null
    this._graphFingerprint = null
  }

  private ensureOpen(): SqliteDatabase {
    if (this.db === undefined) {
      throw new StoreNotOpenError()
    }
    return this.db
  }

  private migrateSchemaIfNeeded(): void {
    if (!existsSync(this.dbPath)) return
    try {
      const db = new Database(this.dbPath, { readonly: true })
      try {
        const row = db.prepare("SELECT value FROM meta WHERE key = 'schemaVersion'").get() as
          | { value: string }
          | undefined
        if (row !== undefined && Number(row.value) < SQLITE_SCHEMA_VERSION) {
          db.close()
          rmSync(this.dbPath, { force: true })
        }
      } finally {
        if (db.open) db.close()
      }
    } catch {
      rmSync(this.dbPath, { force: true })
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
      rmSync(this.dbPath, { force: true })
      const freshDb = new Database(this.dbPath)
      freshDb.pragma('foreign_keys = ON')
      freshDb.pragma('journal_mode = WAL')
      freshDb.pragma(`busy_timeout = ${SQLiteGraphStore.SQLITE_BUSY_TIMEOUT_MS}`)
      freshDb.pragma('synchronous = NORMAL')
      freshDb.pragma('temp_store = MEMORY')
      freshDb.exec(SQLITE_SCHEMA_DDL)
      this.db = freshDb
      this.setMeta(freshDb, 'schemaVersion', String(SQLITE_SCHEMA_VERSION))
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
    for (const file of files) {
      this.insertFile(db, file)
    }
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
    for (const document of documents) {
      this.insertDocument(db, document)
    }
  }

  private insertSymbols(db: SqliteDatabase, symbols: readonly SymbolNode[]): void {
    const stmt = db.prepare(
      `
        INSERT INTO symbols (
          id, name, kind, file_path, parent_id, line, column_number, comment, search_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          kind = excluded.kind,
          file_path = excluded.file_path,
          parent_id = excluded.parent_id,
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
        symbol.parentId ?? null,
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
      case RelationType.Constructs:
      case RelationType.UsesType:
      case RelationType.Extends:
      case RelationType.Implements:
      case RelationType.Overrides:
        return this.symbolExists(relation.source) && this.symbolExists(relation.target)
      case RelationType.DependsOn:
        return this.specExists(relation.source) && this.specExists(relation.target)
      case RelationType.CoversFile:
        return this.specExists(relation.source) && this.fileExists(relation.target)
      case RelationType.CoversSymbol:
        return this.specExists(relation.source) && this.symbolExists(relation.target)
      default:
        return false
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
    comment: string | null
  }): SymbolNode {
    return createSymbolNode({
      name: row.name,
      kind: row.kind,
      filePath: row.file_path,
      line: row.line,
      column: row.column_number,
      parentId: row.parent_id ?? undefined,
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
