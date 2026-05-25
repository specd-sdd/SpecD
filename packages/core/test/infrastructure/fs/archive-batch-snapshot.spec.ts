import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ArchiveOrphanBackupError } from '../../../src/domain/errors/archive-orphan-backup-error.js'
import {
  ARCHIVE_BACKUP_DIR,
  FsArchiveBatchSnapshot,
} from '../../../src/infrastructure/fs/archive-batch-snapshot.js'

describe('FsArchiveBatchSnapshot', () => {
  const tempRoots: string[] = []

  afterEach(async () => {
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

    const result = await snapshot.restoreBatch(['default:auth/oauth'], ['default:auth/oauth'])
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

    await snapshot.restoreBatch(['default:new/spec'], ['default:new/spec'])
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
})
