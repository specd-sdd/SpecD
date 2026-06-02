import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveArchiveBatchSnapshotPort } from '../../src/composition/use-cases/archive-change.js'
import { FsArchiveBatchSnapshot } from '../../src/infrastructure/fs/archive-batch-snapshot.js'
import { FsSpecRepository } from '../../src/infrastructure/fs/spec-repository.js'
import { makeSpecRepository, makeListWorkspaces } from '../application/use-cases/helpers.js'

describe('resolveArchiveBatchSnapshotPort', () => {
  const tmpDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
  })

  it('returns a proxy that works even with stub spec repositories', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-compose-snapshot-stub-'))
    tmpDirs.push(tmpDir)
    const specsPath = path.join(tmpDir, 'specs')
    await fs.mkdir(specsPath, { recursive: true })

    // makeSpecRepository needs a valid specsPath for path.join not to fail
    const repo = makeSpecRepository()
    Object.defineProperty(repo, 'specsPath', {
      configurable: true,
      value: specsPath,
    })

    const port = resolveArchiveBatchSnapshotPort(makeListWorkspaces(new Map([['default', repo]])))
    const manifest = await port.snapshot('default:auth/oauth', 'change')
    expect(manifest.specDirExisted).toBe(false)
    expect(manifest.existingFiles).toEqual([])
  })

  it('derives working snapshot operations from FsSpecRepository instances', async () => {
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

    const port = resolveArchiveBatchSnapshotPort(makeListWorkspaces(new Map([['default', repo]])))

    // We can't check toBeInstanceOf(FsArchiveBatchSnapshot) because it's a proxy
    // but we can check if it has the required methods
    expect(port.snapshot).toBeDefined()
    expect(port.restoreBatch).toBeDefined()
  })
})
