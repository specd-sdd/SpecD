import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type ActorIdentity } from '../../../src/domain/entities/change.js'
import { FsChangeIndexCache } from '../../../src/infrastructure/fs/fs-change-index-cache.js'
import { changeDirName } from '../../../src/infrastructure/fs/dir-name.js'
import { writeFileAtomic } from '../../../src/infrastructure/fs/write-atomic.js'

const actor: ActorIdentity = { name: 'Alice', email: 'alice@example.com' }

async function writeActiveManifest(dir: string, name: string, createdAt: Date): Promise<void> {
  const dirName = changeDirName(name, createdAt)
  const changeDir = path.join(dir, dirName)
  await fs.mkdir(changeDir, { recursive: true })
  const manifest = {
    name,
    createdAt: createdAt.toISOString(),
    specIds: ['default:demo'],
    schema: { name: '@specd/schema-std', version: 1 },
    artifacts: [],
    history: [
      {
        type: 'created',
        at: createdAt.toISOString(),
        by: actor,
        specIds: ['default:demo'],
        schemaName: '@specd/schema-std',
        schemaVersion: 1,
      },
      {
        type: 'transitioned',
        at: createdAt.toISOString(),
        by: actor,
        from: 'drafting',
        to: 'designing',
      },
    ],
  }
  await writeFileAtomic(path.join(changeDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
}

describe('FsChangeIndexCache', () => {
  let tmpDir: string
  let sourceDir: string
  let bucketDir: string
  let cache: FsChangeIndexCache<
    import('../../../src/domain/change-list-entry.js').ActiveChangeListEntry
  >

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-change-index-cache-'))
    sourceDir = path.join(tmpDir, 'changes')
    bucketDir = path.join(tmpDir, 'fs-cache', 'changes')
    await fs.mkdir(sourceDir, { recursive: true })

    cache = new FsChangeIndexCache({
      bucketDir,
      sourceDir,
      kind: 'active',
    })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('rebuilds from disk and lists active changes', async () => {
    const createdAt = new Date('2024-01-15T10:00:00.000Z')
    await writeActiveManifest(sourceDir, 'alpha', createdAt)

    const result = await cache.list()
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.name).toBe('alpha')
    expect(result.items[0]!.state).toBe('designing')
  })

  it('upserts after manifest write', async () => {
    const createdAt = new Date('2024-01-15T10:00:00.000Z')
    await writeActiveManifest(sourceDir, 'beta', createdAt)
    const manifestPath = path.join(sourceDir, changeDirName('beta', createdAt), 'manifest.json')
    const stat = await fs.stat(manifestPath)

    await cache.upsert(
      {
        name: 'beta',
        createdAt,
        state: 'designing',
        specIds: ['default:demo'],
        schemaName: '@specd/schema-std',
        schemaVersion: 1,
      },
      stat.mtime.toISOString(),
    )

    expect(await cache.count()).toBe(1)
  })

  it('invalidate triggers rebuild on next list', async () => {
    await writeActiveManifest(sourceDir, 'gamma', new Date('2024-02-01T10:00:00.000Z'))
    await cache.list()

    await cache.invalidate()
    const result = await cache.list()
    expect(result.items[0]!.name).toBe('gamma')
  })

  it('remove drops a change row', async () => {
    const createdAt = new Date('2024-03-01T10:00:00.000Z')
    await writeActiveManifest(sourceDir, 'delta', createdAt)
    await cache.reindex()
    expect(await cache.count()).toBe(1)

    await cache.remove('delta')
    await fs.rm(path.join(sourceDir, changeDirName('delta', createdAt)), {
      recursive: true,
      force: true,
    })
    expect(await cache.count()).toBe(0)
  })
})
