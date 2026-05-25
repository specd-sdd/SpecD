import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveArchiveBatchSnapshotPort } from '../../src/composition/use-cases/archive-change.js'
import { FsArchiveBatchSnapshot } from '../../src/infrastructure/fs/archive-batch-snapshot.js'
import { FsSpecRepository } from '../../src/infrastructure/fs/spec-repository.js'
import { makeSpecRepository } from '../application/use-cases/helpers.js'

describe('resolveArchiveBatchSnapshotPort', () => {
  const tmpDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
  })

  it('returns noop when only stub spec repositories are provided', async () => {
    const port = resolveArchiveBatchSnapshotPort(new Map([['default', makeSpecRepository()]]))
    const manifest = await port.snapshot('default:auth/oauth', 'change')
    expect(manifest.specDirExisted).toBe(false)
    expect(manifest.existingFiles).toEqual([])
  })

  it('derives FsArchiveBatchSnapshot from FsSpecRepository instances', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-compose-snapshot-'))
    tmpDirs.push(tmpDir)
    const specsPath = path.join(tmpDir, 'specs')
    await fs.mkdir(specsPath, { recursive: true })
    const repo = new FsSpecRepository({
      workspace: 'default',
      ownership: 'owned',
      isExternal: false,
      configPath: '/test',
      specsPath,
      metadataPath: path.join(tmpDir, '.specd', 'metadata'),
    })

    const port = resolveArchiveBatchSnapshotPort(new Map([['default', repo]]))
    expect(port).toBeInstanceOf(FsArchiveBatchSnapshot)
  })
})
