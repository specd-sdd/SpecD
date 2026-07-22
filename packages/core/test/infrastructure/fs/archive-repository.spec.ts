import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Change } from '../../../src/domain/entities/change.js'
import { type ActorIdentity } from '../../../src/domain/entities/change.js'
import { InvalidStateTransitionError } from '../../../src/domain/errors/invalid-state-transition-error.js'
import { FsChangeRepository } from '../../../src/infrastructure/fs/change-repository.js'
import { FsArchiveRepository } from '../../../src/infrastructure/fs/archive-repository.js'
import { changeDirName } from '../../../src/infrastructure/fs/dir-name.js'

const actor: ActorIdentity = { name: 'Alice', email: 'alice@example.com' }

interface RepoContext {
  changes: FsChangeRepository
  archive: FsArchiveRepository
  tmpDir: string
  changesPath: string
  draftsPath: string
  archivePath: string
  configPath: string
}

function archiveCacheDir(configPath: string): string {
  return path.join(configPath, 'tmp', 'fs-cache', 'archive')
}

function archiveIndexPath(configPath: string): string {
  return path.join(archiveCacheDir(configPath), '.specd-index.jsonl')
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
    configPath: tmpDir,
    changesPath,
    draftsPath,
    discardedPath,
  })

  const archive = new FsArchiveRepository({
    workspace: 'default',
    ownership: 'owned',
    isExternal: false,
    configPath: tmpDir,
    changesPath,
    draftsPath,
    archivePath,
    ...(pattern !== undefined ? { pattern } : {}),
  })

  return { changes, archive, tmpDir, changesPath, draftsPath, archivePath, configPath: tmpDir }
}

async function cleanupRepo(ctx: RepoContext): Promise<void> {
  await fs.rm(ctx.tmpDir, { recursive: true, force: true })
}

async function readArchiveGitignoreEntries(archivePath: string): Promise<string[]> {
  const content = await fs.readFile(path.join(archivePath, '.gitignore'), 'utf8')
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

async function makeArchivableChange(
  ctx: RepoContext,
  name: string,
  createdAt?: Date,
): Promise<Change> {
  const at = createdAt ?? new Date('2024-01-15T10:00:00.000Z')
  const change = new Change({
    name,
    createdAt: at,
    specIds: ['default:auth/login'],
    history: [
      {
        type: 'created',
        at,
        by: actor,
        specIds: ['default:auth/login'],
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

describe('FsArchiveRepository', () => {
  let ctx: RepoContext

  beforeEach(async () => {
    ctx = await setupRepo()
  })

  afterEach(async () => {
    await cleanupRepo(ctx)
  })

  describe('constructor', () => {
    it('throws when pattern contains {{change.scope}}', () => {
      expect(
        () =>
          new FsArchiveRepository({
            workspace: 'default',
            ownership: 'owned',
            isExternal: false,
            configPath: '/test',
            changesPath: ctx.changesPath,
            draftsPath: ctx.draftsPath,
            archivePath: ctx.archivePath,
            pattern: '{{change.scope}}/{{change.archivedName}}',
          }),
      ).toThrow()
    })

    it('throws when pattern contains {{change.workspace}}', () => {
      expect(
        () =>
          new FsArchiveRepository({
            workspace: 'default',
            ownership: 'owned',
            isExternal: false,
            configPath: '/test',
            changesPath: ctx.changesPath,
            draftsPath: ctx.draftsPath,
            archivePath: ctx.archivePath,
            pattern: '{{change.workspace}}/{{change.archivedName}}',
          }),
      ).toThrow()
    })
  })

  describe('archive', () => {
    it('moves the change directory from changes/ to archive/', async () => {
      const change = await makeArchivableChange(ctx, 'add-auth')
      const expectedDirName = changeDirName('add-auth', change.createdAt)

      await ctx.archive.archive(change)

      const changesEntries = await fs.readdir(ctx.changesPath)
      expect(changesEntries).toHaveLength(0)

      const archiveEntries = await fs.readdir(ctx.archivePath)
      expect(archiveEntries).toContain(expectedDirName)
    })

    it('returns an ArchivedChange with correct fields', async () => {
      const change = await makeArchivableChange(ctx, 'add-auth')

      const { archivedChange } = await ctx.archive.archive(change)

      expect(archivedChange.name).toBe('add-auth')
      expect(archivedChange.archivedName).toBe(changeDirName('add-auth', change.createdAt))
      expect(archivedChange.workspaces[0]).toBe('default')
      expect(archivedChange.archivedAt).toBeInstanceOf(Date)
      expect([...archivedChange.artifacts.keys()]).toEqual([])
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

    it('appends an entry to fs-cache archive index', async () => {
      const change = await makeArchivableChange(ctx, 'add-auth')

      await ctx.archive.archive(change)

      const indexContent = await fs.readFile(archiveIndexPath(ctx.configPath), 'utf8')
      const lines = indexContent.trim().split('\n')
      expect(lines).toHaveLength(1)
      const wire = JSON.parse(lines[0]!) as { entry: Record<string, unknown> }
      expect(wire.entry['name']).toBe('add-auth')
      expect(typeof wire.entry['path']).toBe('string')
      expect(wire.entry['artifacts']).toBeUndefined()
      expect(wire.entry['workspaces']).toBeUndefined()
    })

    it('ensures tmp gitignore and archive runtime ignore entries after archive()', async () => {
      const change = await makeArchivableChange(ctx, 'add-auth')

      await ctx.archive.archive(change)

      const tmpGitignore = await fs.readFile(path.join(ctx.configPath, 'tmp', '.gitignore'), 'utf8')
      expect(tmpGitignore).toBe('*\n!.gitignore\n')

      const entries = await readArchiveGitignoreEntries(ctx.archivePath)
      expect(entries).toContain('.staging')
    })

    it('throws InvalidStateTransitionError when change is not archivable', async () => {
      const at = new Date('2024-01-15T10:00:00.000Z')
      const change = new Change({
        name: 'not-ready',
        createdAt: at,
        specIds: ['auth/login'],
        history: [
          {
            type: 'created',
            at,
            by: actor,
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
        specIds: ['auth/login'],
        history: [
          {
            type: 'created',
            at,
            by: actor,
            specIds: ['auth/login'],
            schemaName: '@specd/schema-std',
            schemaVersion: 1,
          },
        ],
      })
      await ctx.changes.save(change)

      const { archivedChange } = await ctx.archive.archive(change, { force: true })

      expect(archivedChange.name).toBe('forced')
    })

    it('archives a drafted change from drafts/', async () => {
      const change = await makeArchivableChange(ctx, 'drafted-change')
      await ctx.changes.mutate('drafted-change', (loaded) => {
        loaded.draft(actor, undefined, true)
        return loaded
      })

      const { archivedChange } = await ctx.archive.archive(change)

      expect(archivedChange.name).toBe('drafted-change')
      const draftsEntries = await fs.readdir(ctx.draftsPath)
      expect(draftsEntries).toHaveLength(0)
    })

    it('uses custom pattern to place archive directory', async () => {
      const localCtx = await setupRepo('{{year}}/{{change.archivedName}}')
      try {
        const change = await makeArchivableChange(localCtx, 'patterned')
        const beforeArchive = new Date()

        await localCtx.archive.archive(change)

        const expectedYear = beforeArchive.getUTCFullYear().toString()
        const yearDir = path.join(localCtx.archivePath, expectedYear)
        const yearEntries = await fs.readdir(yearDir)
        const expectedDirName = changeDirName('patterned', change.createdAt)
        expect(yearEntries).toContain(expectedDirName)
      } finally {
        await cleanupRepo(localCtx)
      }
    })

    it('index path uses forward slashes with nested pattern', async () => {
      const localCtx = await setupRepo('{{year}}/{{change.archivedName}}')
      try {
        const change = await makeArchivableChange(localCtx, 'slash-test')

        await localCtx.archive.archive(change)

        const indexContent = await fs.readFile(archiveIndexPath(localCtx.configPath), 'utf8')
        const wire = JSON.parse(indexContent.trim()) as { entry: Record<string, unknown> }
        expect(wire.entry['path']).toContain('/')
        expect(wire.entry['path']).not.toContain('\\')
      } finally {
        await cleanupRepo(localCtx)
      }
    })
  })

  describe('archivePath', () => {
    it('returns the correct absolute path for an archived change', async () => {
      const change = await makeArchivableChange(ctx, 'add-auth')

      const { archivedChange, archiveDirPath } = await ctx.archive.archive(change)
      const result = ctx.archive.archivePath(archivedChange)

      expect(result).toBe(archiveDirPath)
    })

    it('returns a path consistent with archive() when using a custom pattern', async () => {
      const localCtx = await setupRepo('{{year}}/{{change.archivedName}}')
      try {
        const change = await makeArchivableChange(localCtx, 'custom-pattern')

        const { archivedChange, archiveDirPath } = await localCtx.archive.archive(change)
        const result = localCtx.archive.archivePath(archivedChange)

        expect(result).toBe(archiveDirPath)
      } finally {
        await cleanupRepo(localCtx)
      }
    })

    it('accepts a path entry without workspaces', async () => {
      const change = await makeArchivableChange(ctx, 'no-workspaces-field')
      const { archivedChange, archiveDirPath } = await ctx.archive.archive(change)

      const result = ctx.archive.archivePath({
        name: archivedChange.name,
        archivedName: archivedChange.archivedName,
        archivedAt: archivedChange.archivedAt,
      })

      expect(result).toBe(archiveDirPath)
    })
  })

  describe('list', () => {
    it('returns empty result when archive is empty', async () => {
      const result = await ctx.archive.list()
      expect(result.items).toHaveLength(0)
      expect(result.meta).toEqual({ total: 0, count: 0, limit: 0 })
    })

    it('returns archived changes newest first', async () => {
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

      const result = await ctx.archive.list()

      expect(result.items).toHaveLength(2)
      expect(result.items[0]!.name).toBe('newer-change')
      expect(result.items[1]!.name).toBe('older-change')
      expect(result.meta.total).toBe(2)
      expect(result.items[0]).not.toHaveProperty('path')
    })

    it('deduplicates by name — last entry wins', async () => {
      const change = await makeArchivableChange(ctx, 'dedup-change')
      await ctx.archive.archive(change)

      const indexPath = archiveIndexPath(ctx.configPath)
      const existing = await fs.readFile(indexPath, 'utf8')
      await fs.appendFile(indexPath, existing.trim() + '\n', 'utf8')

      const result = await ctx.archive.list()
      expect(result.items).toHaveLength(1)
      expect(result.items[0]!.name).toBe('dedup-change')
    })

    it('auto-rebuilds index when new manifests appear on disk', async () => {
      const first = await makeArchivableChange(ctx, 'first-change')
      await ctx.archive.archive(first)

      const second = await makeArchivableChange(ctx, 'second-change')
      await ctx.archive.archive(second)

      const indexPath = archiveIndexPath(ctx.configPath)
      const lines = (await fs.readFile(indexPath, 'utf8')).trim().split('\n')
      await fs.writeFile(indexPath, lines[0]! + '\n', 'utf8')

      const result = await ctx.archive.list()
      expect(result.items).toHaveLength(2)
      const names = result.items.map((r) => r.name)
      expect(names).toContain('first-change')
      expect(names).toContain('second-change')
    })
  })

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

      const indexPath = archiveIndexPath(ctx.configPath)
      const line = (await fs.readFile(indexPath, 'utf8')).trim()
      await fs.appendFile(indexPath, line + '\n', 'utf8')

      const result = await ctx.archive.get('multi-entry')
      expect(result).not.toBeNull()
      expect(result!.name).toBe('multi-entry')
    })

    it('falls back to directory scan when not in index', async () => {
      const change = await makeArchivableChange(ctx, 'missing-from-index')
      const archivedName = changeDirName('missing-from-index', change.createdAt)
      const archiveDir = path.join(ctx.archivePath, archivedName)

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

    it('appends recovered entry to fs-cache index after fallback', async () => {
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

      const indexContent = await fs.readFile(archiveIndexPath(ctx.configPath), 'utf8')
      const wire = JSON.parse(indexContent.trim()) as { entry: Record<string, unknown> }
      expect(wire.entry['name']).toBe('recovered')
    })

    it('ensures archive runtime ignore entries during recovery append path', async () => {
      const change = await makeArchivableChange(ctx, 'recovered-ignore')
      const archivedName = changeDirName('recovered-ignore', change.createdAt)
      const archiveDir = path.join(ctx.archivePath, archivedName)

      const sourceDir = path.join(ctx.changesPath, (await fs.readdir(ctx.changesPath))[0]!)
      await fs.rename(sourceDir, archiveDir)

      const manifestPath = path.join(archiveDir, 'manifest.json')
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as Record<
        string,
        unknown
      >
      manifest['archivedAt'] = new Date().toISOString()
      await fs.writeFile(manifestPath, JSON.stringify(manifest), 'utf8')

      await fs.writeFile(path.join(ctx.archivePath, '.gitignore'), '.staging\n', 'utf8')
      await ctx.archive.get('recovered-ignore')

      const entries = await readArchiveGitignoreEntries(ctx.archivePath)
      expect(entries).toContain('.staging')
      expect(entries.filter((entry) => entry === '.staging')).toHaveLength(1)
    })
  })

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

      await fs.writeFile(archiveIndexPath(ctx.configPath), '', 'utf8')

      await ctx.archive.reindex()

      const result = await ctx.archive.list()
      expect(result.items).toHaveLength(2)
      expect(result.items[0]!.name).toBe('new-change')
      expect(result.items[1]!.name).toBe('old-change')
    })

    it('creates an empty index file when archive is empty', async () => {
      await ctx.archive.reindex()

      const indexContent = await fs.readFile(archiveIndexPath(ctx.configPath), 'utf8')
      expect(indexContent).toBe('')
    })

    it('sorts entries chronologically by archivedAt in the index file', async () => {
      const older = await makeArchivableChange(ctx, 'older', new Date('2024-01-01T10:00:00.000Z'))
      const newer = await makeArchivableChange(ctx, 'newer', new Date('2024-03-01T10:00:00.000Z'))
      await ctx.archive.archive(older)
      await ctx.archive.archive(newer)

      await fs.writeFile(archiveIndexPath(ctx.configPath), '', 'utf8')
      await ctx.archive.reindex()

      const lines = (await fs.readFile(archiveIndexPath(ctx.configPath), 'utf8'))
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l) as { entry: Record<string, unknown> })

      expect(lines[0]!.entry['name']).toBe('older')
      expect(lines[1]!.entry['name']).toBe('newer')
    })

    it('deletes legacy archive-root index files on reindex', async () => {
      const change = await makeArchivableChange(ctx, 'legacy-cleanup')
      await ctx.archive.archive(change)

      await fs.writeFile(
        path.join(ctx.archivePath, '.specd-index.jsonl'),
        '{"legacy":true}\n',
        'utf8',
      )
      await fs.writeFile(
        path.join(ctx.archivePath, '.specd-index-meta.json'),
        '{"totalCount":1}\n',
        'utf8',
      )

      await ctx.archive.reindex()

      await expect(fs.access(path.join(ctx.archivePath, '.specd-index.jsonl'))).rejects.toThrow()
      await expect(
        fs.access(path.join(ctx.archivePath, '.specd-index-meta.json')),
      ).rejects.toThrow()
    })

    it('ensures archive runtime ignore entries during reindex()', async () => {
      await fs.writeFile(path.join(ctx.archivePath, '.gitignore'), '.staging\n', 'utf8')

      await ctx.archive.reindex()

      const entries = await readArchiveGitignoreEntries(ctx.archivePath)
      expect(entries).toContain('.staging')
    })

    it('invalidateCache triggers rebuild on next list', async () => {
      const change = await makeArchivableChange(ctx, 'invalidate-me')
      await ctx.archive.archive(change)
      await ctx.archive.list()

      await ctx.archive.invalidateCache()

      const result = await ctx.archive.list()
      expect(result.items).toHaveLength(1)
      expect(result.items[0]!.name).toBe('invalidate-me')
    })
  })
})
