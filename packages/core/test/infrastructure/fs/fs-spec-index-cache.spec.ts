import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import {
  FsSpecIndexCache,
  type SpecIndexSource,
} from '../../../src/infrastructure/fs/fs-spec-index-cache.js'

function makeSpec(pathStr: string, filenames: string[] = ['spec.md']): Spec {
  return new Spec('default', SpecPath.parse(pathStr), filenames)
}

describe('FsSpecIndexCache', () => {
  let tmpDir: string
  let bucketDir: string
  let specs: Spec[]
  let specContent: Map<string, string>
  let fileMtimes: Map<string, string>
  let cache: FsSpecIndexCache

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-spec-index-cache-'))
    bucketDir = path.join(tmpDir, 'fs-cache', 'specs', 'default')
    specs = []
    specContent = new Map()
    fileMtimes = new Map()

    const source: SpecIndexSource = {
      walk: async () => specs,
      metadata: async () => null,
      artifact: async (spec, filename) => {
        const content = specContent.get(`${spec.name.toString()}/${filename}`)
        return content !== undefined ? new SpecArtifact(filename, content) : null
      },
      sourceFileStamps: async (spec) =>
        [...spec.filenames].map((filename) => ({
          filename,
          mtime: fileMtimes.get(`${spec.name.toString()}/${filename}`) ?? new Date().toISOString(),
        })),
    }

    cache = new FsSpecIndexCache({
      bucketDir,
      workspace: 'default',
      source,
    })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('rebuilds from disk and lists specs in path order', async () => {
    specs.push(makeSpec('billing/invoices'), makeSpec('auth/login'))
    specContent.set('auth/login/spec.md', '# Login\n\nAuth spec')
    specContent.set('billing/invoices/spec.md', '# Invoices')
    fileMtimes.set('auth/login/spec.md', new Date('2024-01-01T00:00:00.000Z').toISOString())
    fileMtimes.set('billing/invoices/spec.md', new Date('2024-01-02T00:00:00.000Z').toISOString())

    const result = await cache.list()
    expect(result.items.map((entry) => entry.path)).toEqual(['auth/login', 'billing/invoices'])
    expect(result.meta.total).toBe(2)
  })

  it('materializes title and summary at index time', async () => {
    specs.push(makeSpec('auth/login'))
    specContent.set('auth/login/spec.md', '# Login\n\nOAuth2 authentication flow')
    fileMtimes.set('auth/login/spec.md', new Date().toISOString())

    const result = await cache.list()
    expect(result.items[0]!.title).toBe('login')
    expect(result.items[0]!.summary).toContain('OAuth2')
  })

  it('refresh upserts one spec row', async () => {
    const spec = makeSpec('auth/login')
    specs.push(spec)
    specContent.set('auth/login/spec.md', '# Login')
    const mtime = new Date().toISOString()
    fileMtimes.set('auth/login/spec.md', mtime)

    await cache.refresh(spec)
    expect(await cache.count()).toBe(1)
  })

  it('invalidate triggers rebuild on next list', async () => {
    specs.push(makeSpec('auth/login'))
    specContent.set('auth/login/spec.md', '# Login')
    fileMtimes.set('auth/login/spec.md', new Date().toISOString())

    await cache.list()
    await cache.invalidate()
    const result = await cache.list()
    expect(result.items[0]!.path).toBe('auth/login')
  })

  it('remove drops a spec row', async () => {
    specs.push(makeSpec('auth/login'))
    specContent.set('auth/login/spec.md', '# Login')
    fileMtimes.set('auth/login/spec.md', new Date().toISOString())

    await cache.reindex()
    expect(await cache.count()).toBe(1)

    await cache.remove('auth/login')
    specs.length = 0
    expect(await cache.count()).toBe(0)
  })
})
