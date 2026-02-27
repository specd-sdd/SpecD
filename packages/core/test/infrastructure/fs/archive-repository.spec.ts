import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Change } from '../../../src/domain/entities/change.js'
import { type GitIdentity } from '../../../src/domain/entities/change.js'
import { InvalidStateTransitionError } from '../../../src/domain/errors/invalid-state-transition-error.js'
import { FsChangeRepository } from '../../../src/infrastructure/fs/change-repository.js'
import { FsArchiveRepository } from '../../../src/infrastructure/fs/archive-repository.js'
import { changeDirName } from '../../../src/infrastructure/fs/dir-name.js'

const actor: GitIdentity = { name: 'Alice', email: 'alice@example.com' }

// ---- Setup / teardown helpers ----

interface RepoContext {
  changes: FsChangeRepository
  archive: FsArchiveRepository
  tmpDir: string
  changesPath: string
  draftsPath: string
  archivePath: string
}

async function setupRepo(pattern?: string): Promise<RepoContext> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-archive-test-'))
  const changesPath = path.join(tmpDir, 'changes')
  const draftsPath = path.join(tmpDir, 'drafts')
  const discardedPath = path.join(tmpDir, 'discarded')
  const archivePath = path.join(tmpDir, 'archive')
  await fs.mkdir(changesPath, { recursive: true })
  await fs.mkdir(draftsPath, { recursive: true })
  await fs.mkdir(discardedPath, { recursive: true })
  await fs.mkdir(archivePath, { recursive: true })

  const changes = new FsChangeRepository({
    workspace: 'default',
    ownership: 'owned',
    isExternal: false,
    changesPath,
    draftsPath,
    discardedPath,
  })

  const archive = new FsArchiveRepository({
    workspace: 'default',
    ownership: 'owned',
    isExternal: false,
    changesPath,
    draftsPath,
    archivePath,
    ...(pattern !== undefined ? { pattern } : {}),
  })

  return { changes, archive, tmpDir, changesPath, draftsPath, archivePath }
}

async function cleanupRepo(ctx: RepoContext): Promise<void> {
  await fs.rm(ctx.tmpDir, { recursive: true, force: true })
}

/**
 * Creates a `Change` in `archivable` state and saves it via `FsChangeRepository`.
 *
 * Transitions: drafting → designing → ready → implementing → verifying → done → archivable
 */
async function makeArchivableChange(
  ctx: RepoContext,
  name: string,
  createdAt?: Date,
): Promise<Change> {
  const at = createdAt ?? new Date('2024-01-15T10:00:00.000Z')
  const change = new Change({
    name,
    createdAt: at,
    workspaces: ['default'],
    specIds: ['auth/login'],
    history: [
      {
        type: 'created',
        at,
        by: actor,
        workspaces: ['default'],
        specIds: ['auth/login'],
        schemaName: '@specd/schema-std',
        schemaVersion: 1,
      },
    ],
  })
  change.transition('designing', actor)
  change.transition('ready', actor)
  change.transition('implementing', actor)
  change.transition('verifying', actor)
  change.transition('done', actor)
  change.transition('archivable', actor)
  await ctx.changes.save(change)
  return change
}

// ---- Tests ----

describe('FsArchiveRepository', () => {
  let ctx: RepoContext

  beforeEach(async () => {
    ctx = await setupRepo()
  })

  afterEach(async () => {
    await cleanupRepo(ctx)
  })

  // ---- constructor ----

  describe('constructor', () => {
    it('throws when pattern contains {{change.scope}}', () => {
      expect(
        () =>
          new FsArchiveRepository({
            workspace: 'default',
            ownership: 'owned',
            isExternal: false,
            changesPath: ctx.changesPath,
            draftsPath: ctx.draftsPath,
            archivePath: ctx.archivePath,
            pattern: '{{change.scope}}/{{change.archivedName}}',
          }),
      ).toThrow()
    })
  })

  // ---- archive ----

  describe('archive', () => {
    it('moves the change directory from changes/ to archive/', async () => {
      const change = await makeArchivableChange(ctx, 'add-auth')
      const expectedDirName = changeDirName('add-auth', change.createdAt)

      await ctx.archive.archive(change)

      // Source directory is gone
      const changesEntries = await fs.readdir(ctx.changesPath)
      expect(changesEntries).toHaveLength(0)

      // Destination directory exists under archive
      const archiveEntries = await fs.readdir(ctx.archivePath)
      expect(archiveEntries).toContain(expectedDirName)
    })

    it('returns an ArchivedChange with correct fields', async () => {
      const change = await makeArchivableChange(ctx, 'add-auth')

      const result = await ctx.archive.archive(change)

      expect(result.name).toBe('add-auth')
      expect(result.archivedName).toBe(changeDirName('add-auth', change.createdAt))
      expect(result.workspace.toString()).toBe('default')
      expect(result.archivedAt).toBeInstanceOf(Date)
      expect(result.artifacts).toEqual([])
    })

    it('augments the manifest with archivedAt', async () => {
      const change = await makeArchivableChange(ctx, 'add-auth')

      await ctx.archive.archive(change)

      const dirName = changeDirName('add-auth', change.createdAt)
      const manifestContent = await fs.readFile(
        path.join(ctx.archivePath, dirName, 'manifest.json'),
        'utf8',
      )
      const manifest = JSON.parse(manifestContent) as Record<string, unknown>
      expect(typeof manifest['archivedAt']).toBe('string')
    })

    it('appends an entry to index.jsonl', async () => {
      const change = await makeArchivableChange(ctx, 'add-auth')

      await ctx.archive.archive(change)

      const indexContent = await fs.readFile(path.join(ctx.archivePath, 'index.jsonl'), 'utf8')
      const lines = indexContent.trim().split('\n')
      expect(lines).toHaveLength(1)
      const entry = JSON.parse(lines[0]!) as Record<string, unknown>
      expect(entry['name']).toBe('add-auth')
      expect(typeof entry['path']).toBe('string')
    })

    it('throws InvalidStateTransitionError when change is not archivable', async () => {
      const at = new Date('2024-01-15T10:00:00.000Z')
      const change = new Change({
        name: 'not-ready',
        createdAt: at,
        workspaces: ['default'],
        specIds: ['auth/login'],
        history: [
          {
            type: 'created',
            at,
            by: actor,
            workspaces: ['default'],
            specIds: ['auth/login'],
            schemaName: '@specd/schema-std',
            schemaVersion: 1,
          },
        ],
      })
      await ctx.changes.save(change)

      await expect(ctx.archive.archive(change)).rejects.toBeInstanceOf(InvalidStateTransitionError)
    })

    it('archives regardless of state when force is true', async () => {
      const at = new Date('2024-01-15T10:00:00.000Z')
      const change = new Change({
        name: 'forced',
        createdAt: at,
        workspaces: ['default'],
        specIds: ['auth/login'],
        history: [
          {
            type: 'created',
            at,
            by: actor,
            workspaces: ['default'],
            specIds: ['auth/login'],
            schemaName: '@specd/schema-std',
            schemaVersion: 1,
          },
        ],
      })
      await ctx.changes.save(change)

      const result = await ctx.archive.archive(change, { force: true })

      expect(result.name).toBe('forced')
    })

    it('archives a drafted change from drafts/', async () => {
      const change = await makeArchivableChange(ctx, 'drafted-change')
      change.draft(actor)
      await ctx.changes.save(change)

      // Restore to archivable state (already archivable, just drafted)
      // Actually we need to check: can an archivable change also be drafted?
      // The isDrafted flag is orthogonal to state. Let's just archive directly.
      const result = await ctx.archive.archive(change)

      expect(result.name).toBe('drafted-change')
      const draftsEntries = await fs.readdir(ctx.draftsPath)
      expect(draftsEntries).toHaveLength(0)
    })

    it('uses custom pattern to place archive directory', async () => {
      const localCtx = await setupRepo('{{year}}/{{change.archivedName}}')
      const change = await makeArchivableChange(localCtx, 'patterned')
      const beforeArchive = new Date()

      await localCtx.archive.archive(change)

      // Year directory should exist (derived from archivedAt, which is ~now)
      const expectedYear = beforeArchive.getUTCFullYear().toString()
      const yearDir = path.join(localCtx.archivePath, expectedYear)
      const yearEntries = await fs.readdir(yearDir)
      const expectedDirName = changeDirName('patterned', change.createdAt)
      expect(yearEntries).toContain(expectedDirName)

      await cleanupRepo(localCtx)
    })

    it('index path uses forward slashes with nested pattern', async () => {
      const localCtx = await setupRepo('{{year}}/{{change.archivedName}}')
      const change = await makeArchivableChange(localCtx, 'slash-test')

      await localCtx.archive.archive(change)

      const indexContent = await fs.readFile(path.join(localCtx.archivePath, 'index.jsonl'), 'utf8')
      const entry = JSON.parse(indexContent.trim()) as Record<string, unknown>
      expect(entry['path']).toContain('/')
      expect(entry['path']).not.toContain('\\')

      await cleanupRepo(localCtx)
    })
  })

  // ---- list ----

  describe('list', () => {
    it('returns empty array when archive is empty', async () => {
      const results = await ctx.archive.list()
      expect(results).toHaveLength(0)
    })

    it('returns archived changes in order after archiving', async () => {
      const older = await makeArchivableChange(
        ctx,
        'older-change',
        new Date('2024-01-10T10:00:00.000Z'),
      )
      const newer = await makeArchivableChange(
        ctx,
        'newer-change',
        new Date('2024-02-10T10:00:00.000Z'),
      )
      await ctx.archive.archive(older)
      await ctx.archive.archive(newer)

      const results = await ctx.archive.list()

      expect(results).toHaveLength(2)
      expect(results[0]!.name).toBe('older-change')
      expect(results[1]!.name).toBe('newer-change')
    })

    it('deduplicates by name — last entry wins', async () => {
      // Manually write two index entries for the same change (simulates manual recovery)
      const change = await makeArchivableChange(ctx, 'dedup-change')
      await ctx.archive.archive(change)

      // Append a duplicate entry pointing to same path
      const indexPath = path.join(ctx.archivePath, 'index.jsonl')
      const existing = await fs.readFile(indexPath, 'utf8')
      await fs.appendFile(indexPath, existing.trim() + '\n', 'utf8')

      const results = await ctx.archive.list()
      expect(results).toHaveLength(1)
      expect(results[0]!.name).toBe('dedup-change')
    })
  })

  // ---- get ----

  describe('get', () => {
    it('returns null when change is not in archive', async () => {
      const result = await ctx.archive.get('nonexistent')
      expect(result).toBeNull()
    })

    it('returns the archived change by name', async () => {
      const change = await makeArchivableChange(ctx, 'find-me')
      await ctx.archive.archive(change)

      const result = await ctx.archive.get('find-me')

      expect(result).not.toBeNull()
      expect(result!.name).toBe('find-me')
    })

    it('returns last index entry when multiple exist for same name', async () => {
      const change = await makeArchivableChange(ctx, 'multi-entry')
      await ctx.archive.archive(change)

      // Duplicate index entry — both point to same path, last should win
      const indexPath = path.join(ctx.archivePath, 'index.jsonl')
      const line = (await fs.readFile(indexPath, 'utf8')).trim()
      await fs.appendFile(indexPath, line + '\n', 'utf8')

      const result = await ctx.archive.get('multi-entry')
      expect(result).not.toBeNull()
      expect(result!.name).toBe('multi-entry')
    })

    it('falls back to directory scan when not in index', async () => {
      // Archive directly without adding to index
      const change = await makeArchivableChange(ctx, 'missing-from-index')
      const archivedName = changeDirName('missing-from-index', change.createdAt)
      const archiveDir = path.join(ctx.archivePath, archivedName)

      // Move directory manually, write minimal manifest with archivedAt
      const changesEntries = await fs.readdir(ctx.changesPath)
      const sourceDir = path.join(ctx.changesPath, changesEntries[0]!)
      await fs.rename(sourceDir, archiveDir)
      const manifestContent = await fs.readFile(path.join(archiveDir, 'manifest.json'), 'utf8')
      const manifest = JSON.parse(manifestContent) as Record<string, unknown>
      manifest['archivedAt'] = new Date().toISOString()
      await fs.writeFile(path.join(archiveDir, 'manifest.json'), JSON.stringify(manifest), 'utf8')

      const result = await ctx.archive.get('missing-from-index')
      expect(result).not.toBeNull()
      expect(result!.name).toBe('missing-from-index')
    })

    it('appends recovered entry to index after fallback', async () => {
      const change = await makeArchivableChange(ctx, 'recovered')
      const archivedName = changeDirName('recovered', change.createdAt)
      const archiveDir = path.join(ctx.archivePath, archivedName)

      const changesEntries = await fs.readdir(ctx.changesPath)
      const sourceDir = path.join(ctx.changesPath, changesEntries[0]!)
      await fs.rename(sourceDir, archiveDir)
      const manifestContent = await fs.readFile(path.join(archiveDir, 'manifest.json'), 'utf8')
      const manifest = JSON.parse(manifestContent) as Record<string, unknown>
      manifest['archivedAt'] = new Date().toISOString()
      await fs.writeFile(path.join(archiveDir, 'manifest.json'), JSON.stringify(manifest), 'utf8')

      await ctx.archive.get('recovered')

      // Index should now exist with a recovered entry
      const indexContent = await fs.readFile(path.join(ctx.archivePath, 'index.jsonl'), 'utf8')
      const entry = JSON.parse(indexContent.trim()) as Record<string, unknown>
      expect(entry['name']).toBe('recovered')
    })
  })

  // ---- reindex ----

  describe('reindex', () => {
    it('creates a clean index from existing archive directories', async () => {
      const older = await makeArchivableChange(
        ctx,
        'old-change',
        new Date('2024-01-10T10:00:00.000Z'),
      )
      const newer = await makeArchivableChange(
        ctx,
        'new-change',
        new Date('2024-02-10T10:00:00.000Z'),
      )
      await ctx.archive.archive(older)
      await ctx.archive.archive(newer)

      // Corrupt the index
      await fs.writeFile(path.join(ctx.archivePath, 'index.jsonl'), '', 'utf8')

      await ctx.archive.reindex()

      const results = await ctx.archive.list()
      expect(results).toHaveLength(2)
      expect(results[0]!.name).toBe('old-change')
      expect(results[1]!.name).toBe('new-change')
    })

    it('creates an empty index file when archive is empty', async () => {
      await ctx.archive.reindex()

      const indexContent = await fs.readFile(path.join(ctx.archivePath, 'index.jsonl'), 'utf8')
      expect(indexContent).toBe('')
    })

    it('sorts entries chronologically by archivedAt', async () => {
      // Archive in order: older first, newer second — archivedAt timestamps follow archive order
      const older = await makeArchivableChange(ctx, 'older', new Date('2024-01-01T10:00:00.000Z'))
      const newer = await makeArchivableChange(ctx, 'newer', new Date('2024-03-01T10:00:00.000Z'))
      await ctx.archive.archive(older)
      await ctx.archive.archive(newer)

      // Corrupt the index to force reindex to rebuild from manifests
      await fs.writeFile(path.join(ctx.archivePath, 'index.jsonl'), '', 'utf8')
      await ctx.archive.reindex()

      const lines = (await fs.readFile(path.join(ctx.archivePath, 'index.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l) as Record<string, unknown>)

      // After reindex, order is by archivedAt — older was archived first so it comes first
      expect(lines[0]!['name']).toBe('older')
      expect(lines[1]!['name']).toBe('newer')
    })
  })
})
