import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Logger } from '../../../src/application/logger.js'
import { ArchiveOrphanBackupError } from '../../../src/domain/errors/archive-orphan-backup-error.js'
import {
  ARCHIVE_BACKUP_DIR,
  FsArchiveBatchSnapshot,
} from '../../../src/infrastructure/fs/archive-batch-snapshot.js'

describe('FsArchiveBatchSnapshot', () => {
  const tempRoots: string[] = []

  afterEach(async () => {
    vi.restoreAllMocks()
    await Promise.all(
      tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
    )
  })

  async function createFixture(): Promise<{ root: string; snapshot: FsArchiveBatchSnapshot }> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-archive-batch-'))
    tempRoots.push(root)
    const specsPath = path.join(root, 'specs')
    await fs.mkdir(specsPath, { recursive: true })
    const snapshot = new FsArchiveBatchSnapshot(new Map([['default', { specsPath }]]))
    return { root, snapshot }
  }

  it('restores existing spec files and removes created files on failure', async () => {
    const { root, snapshot } = await createFixture()
    const specDir = path.join(root, 'specs', 'auth', 'oauth')
    await fs.mkdir(specDir, { recursive: true })
    await fs.writeFile(path.join(specDir, 'spec.md'), '# original\n', 'utf8')

    await snapshot.snapshot('default:auth/oauth', 'my-change')
    await fs.writeFile(path.join(specDir, 'verify.md'), '# new\n', 'utf8')
    await snapshot.recordCreatedFile('default:auth/oauth', 'verify.md')

    const result = await snapshot.restoreBatch(
      ['default:auth/oauth'],
      ['default:auth/oauth'],
      'my-change',
    )
    expect(result.failedSpecIds).toEqual([])
    expect(await fs.readFile(path.join(specDir, 'spec.md'), 'utf8')).toBe('# original\n')
    await expect(fs.access(path.join(specDir, 'verify.md'))).rejects.toThrow()
  })

  it('removes a newly created spec directory on restore', async () => {
    const { root, snapshot } = await createFixture()
    const specDir = path.join(root, 'specs', 'new', 'spec')
    await snapshot.snapshot('default:new/spec', 'my-change')
    await fs.mkdir(specDir, { recursive: true })
    await fs.writeFile(path.join(specDir, 'spec.md'), '# new\n', 'utf8')

    await snapshot.restoreBatch(['default:new/spec'], ['default:new/spec'], 'my-change')
    await expect(fs.access(specDir)).rejects.toThrow()
  })

  it('auto-restores matching orphan backups and aborts', async () => {
    const { root, snapshot } = await createFixture()
    const specDir = path.join(root, 'specs', 'auth', 'oauth')
    await fs.mkdir(specDir, { recursive: true })
    await fs.writeFile(path.join(specDir, 'spec.md'), '# corrupted\n', 'utf8')

    const backupDir = path.join(specDir, ARCHIVE_BACKUP_DIR)
    await fs.mkdir(backupDir, { recursive: true })
    await fs.writeFile(path.join(backupDir, 'spec.md'), '# restored\n', 'utf8')
    await fs.writeFile(
      path.join(backupDir, 'manifest.json'),
      `${JSON.stringify({
        changeName: 'my-change',
        specDirExisted: true,
        existingFiles: ['spec.md'],
        createdFiles: [],
      })}\n`,
      'utf8',
    )

    await expect(snapshot.detectOrphans(['default:auth/oauth'], 'my-change')).rejects.toThrow(
      ArchiveOrphanBackupError,
    )
    expect(await fs.readFile(path.join(specDir, 'spec.md'), 'utf8')).toBe('# restored\n')
  })

  describe('logging', () => {
    function calls(spy: { mock: { calls: unknown[][] } }, message: string) {
      return spy.mock.calls
        .filter(([entry]) => entry === message)
        .map(([, context]) => context as Record<string, unknown>)
    }

    async function writeOrphan(root: string, changeName: string, raw?: string): Promise<void> {
      const backupDir = path.join(root, 'specs', 'auth', 'oauth', ARCHIVE_BACKUP_DIR)
      await fs.mkdir(backupDir, { recursive: true })
      await fs.writeFile(
        path.join(backupDir, 'manifest.json'),
        raw ??
          `${JSON.stringify({
            changeName,
            specDirExisted: true,
            existingFiles: [],
            createdFiles: [],
          })}\n`,
        'utf8',
      )
    }

    it('logs the none-found orphan outcome', async () => {
      const { snapshot } = await createFixture()
      const debug = vi.spyOn(Logger, 'debug')
      await snapshot.detectOrphans(['default:auth/oauth'], 'my-change')
      expect(calls(debug, 'ArchiveBatchSnapshot orphan check')).toEqual([
        { change: 'my-change', specId: 'default:auth/oauth', outcome: 'none-found' },
      ])
    })

    it('logs the matching orphan outcome', async () => {
      const { root, snapshot } = await createFixture()
      await writeOrphan(root, 'my-change')
      const debug = vi.spyOn(Logger, 'debug')
      await expect(snapshot.detectOrphans(['default:auth/oauth'], 'my-change')).rejects.toThrow(
        ArchiveOrphanBackupError,
      )
      expect(calls(debug, 'ArchiveBatchSnapshot orphan check')).toEqual([
        expect.objectContaining({ outcome: 'matching-auto-restore', change: 'my-change' }),
      ])
    })

    it('logs the foreign orphan outcome', async () => {
      const { root, snapshot } = await createFixture()
      await writeOrphan(root, 'other-change')
      const debug = vi.spyOn(Logger, 'debug')
      await expect(snapshot.detectOrphans(['default:auth/oauth'], 'my-change')).rejects.toThrow(
        ArchiveOrphanBackupError,
      )
      expect(calls(debug, 'ArchiveBatchSnapshot orphan check')).toEqual([
        expect.objectContaining({
          outcome: 'foreign-abort',
          manifestChangeName: 'other-change',
        }),
      ])
    })

    async function dirState(dir: string): Promise<Record<string, string>> {
      const out: Record<string, string> = {}
      const walk = async (current: string, rel: string): Promise<void> => {
        const entries = await fs.readdir(current, { withFileTypes: true })
        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
          const full = path.join(current, entry.name)
          const key = path.posix.join(rel, entry.name)
          if (entry.isDirectory()) {
            out[`${key}/`] = ''
            await walk(full, key)
          } else {
            out[key] = (await fs.readFile(full)).toString('base64')
          }
        }
      }
      await walk(dir, '')
      return out
    }

    async function writeCanonical(root: string): Promise<void> {
      const specDir = path.join(root, 'specs', 'auth', 'oauth')
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, 'spec.md'), '# canonical\n', 'utf8')
      await fs.writeFile(path.join(specDir, 'verify.md'), '# verify\n', 'utf8')
    }

    async function expectCorrupt(raw: string): Promise<void> {
      const { root, snapshot } = await createFixture()
      await writeCanonical(root)
      await writeOrphan(root, 'my-change', raw)
      const before = await dirState(path.join(root, 'specs'))
      const order: string[] = []
      const debug = vi.spyOn(Logger, 'debug').mockImplementation(() => {
        order.push('log')
      })
      let error: unknown
      try {
        await snapshot.detectOrphans(['default:auth/oauth'], 'my-change')
      } catch (err) {
        order.push('throw')
        error = err
      }
      expect(error).toBeInstanceOf(ArchiveOrphanBackupError)
      const e = error as ArchiveOrphanBackupError
      expect(e.foreignChangeName).toBe(false)
      expect(e.changeName).not.toBe('undefined')
      expect(e.message).toContain('corrupt')
      expect(e.message).not.toContain('undefined')
      expect(e.message).not.toContain('foreign')
      expect(await dirState(path.join(root, 'specs'))).toEqual(before)
      expect(order).toEqual(['log', 'throw'])
      expect(calls(debug, 'ArchiveBatchSnapshot orphan check')).toEqual([
        { change: 'my-change', specId: 'default:auth/oauth', outcome: 'corrupt-abort' },
      ])
    }

    it('logs the corrupt manifest outcome before aborting (JSON parse failure)', () =>
      expectCorrupt('{not json'))
    it('treats a null manifest as corrupt', () => expectCorrupt('null'))
    it('treats an array manifest as corrupt', () => expectCorrupt('[]'))
    it('treats a primitive manifest as corrupt', () => expectCorrupt('42'))
    it('treats a manifest without changeName as corrupt', () =>
      expectCorrupt(JSON.stringify({ specDirExisted: true, existingFiles: [] })))
    it('treats a manifest with a non-string changeName as corrupt', () =>
      expectCorrupt(JSON.stringify({ changeName: 7 })))

    it('logs unreadable then aborts without touching the backup or canonical files', async () => {
      const { root, snapshot } = await createFixture()
      await writeCanonical(root)
      // A directory in place of manifest.json makes readFile fail with EISDIR (not ENOENT).
      const manifestDir = path.join(
        root,
        'specs',
        'auth',
        'oauth',
        ARCHIVE_BACKUP_DIR,
        'manifest.json',
      )
      await fs.mkdir(manifestDir, { recursive: true })
      await fs.writeFile(path.join(manifestDir, 'keep.txt'), 'keep', 'utf8')
      const before = await dirState(path.join(root, 'specs'))
      const order: string[] = []
      const debug = vi.spyOn(Logger, 'debug').mockImplementation(() => {
        order.push('log')
      })
      let error: unknown
      try {
        await snapshot.detectOrphans(['default:auth/oauth'], 'my-change')
      } catch (err) {
        order.push('throw')
        error = err
      }
      expect(error).toBeInstanceOf(ArchiveOrphanBackupError)
      const e = error as ArchiveOrphanBackupError
      expect(e.foreignChangeName).toBe(false)
      expect(e.changeName).toBe('my-change')
      expect(e.specId).toBe('default:auth/oauth')
      expect(e.message).toContain('cannot be read')
      expect(e.message).toContain('EISDIR')
      expect(e.message).not.toContain('--')
      expect(order).toEqual(['log', 'throw'])
      expect(calls(debug, 'ArchiveBatchSnapshot orphan check')).toEqual([
        expect.objectContaining({
          change: 'my-change',
          specId: 'default:auth/oauth',
          outcome: 'unreadable',
        }),
      ])
      expect(await dirState(path.join(root, 'specs'))).toEqual(before)
    })

    it('logs skipped-unknown-workspace and continues', async () => {
      const { snapshot } = await createFixture()
      const debug = vi.spyOn(Logger, 'debug')
      await snapshot.detectOrphans(['ghost:auth/oauth', 'default:auth/oauth'], 'my-change')
      expect(calls(debug, 'ArchiveBatchSnapshot orphan check')).toEqual([
        { change: 'my-change', specId: 'ghost:auth/oauth', outcome: 'skipped-unknown-workspace' },
        { change: 'my-change', specId: 'default:auth/oauth', outcome: 'none-found' },
      ])
    })

    it('carries the change name in created-file, restore and cleanup logs', async () => {
      const { snapshot } = await createFixture()
      const id = 'default:auth/oauth'
      await snapshot.snapshot(id, 'my-change')
      const debug = vi.spyOn(Logger, 'debug')
      await snapshot.recordCreatedFile(id, 'verify.md')
      await snapshot.restoreBatch([id], [id], 'my-change')
      await snapshot.cleanup([id], 'my-change')
      expect(calls(debug, 'ArchiveBatchSnapshot recorded created file')[0]).toMatchObject({
        change: 'my-change',
      })
      expect(calls(debug, 'ArchiveBatchSnapshot restore started')[0]).toMatchObject({
        change: 'my-change',
      })
      expect(calls(debug, 'ArchiveBatchSnapshot restore completed')[0]).toMatchObject({
        change: 'my-change',
      })
      expect(calls(debug, 'ArchiveBatchSnapshot cleanup completed')[0]).toMatchObject({
        change: 'my-change',
      })
    })

    it('carries the change name in the restore failure log', async () => {
      const { root, snapshot } = await createFixture()
      const id = 'default:auth/oauth'
      const specDir = path.join(root, 'specs', 'auth', 'oauth')
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, 'spec.md'), 'x', 'utf8')
      await snapshot.snapshot(id, 'my-change')
      await fs.rm(path.join(specDir, ARCHIVE_BACKUP_DIR, 'spec.md'))
      const debug = vi.spyOn(Logger, 'debug')
      const result = await snapshot.restoreBatch([id], [id], 'my-change')
      expect(result.failedSpecIds).toEqual([id])
      expect(calls(debug, 'ArchiveBatchSnapshot restore failed for spec')[0]).toMatchObject({
        change: 'my-change',
        specId: id,
      })
    })
  })
})
