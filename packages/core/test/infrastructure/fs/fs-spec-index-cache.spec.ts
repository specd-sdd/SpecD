import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeSpec } from '../../helpers/make-spec.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import {
  FsSpecIndexCache,
  type SpecIndexSource,
} from '../../../src/infrastructure/fs/fs-spec-index-cache.js'

describe('FsSpecIndexCache', () => {
  let tmpDir: string
  let bucketDir: string
  let specs: ReturnType<typeof makeSpec>[]
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
        spec.artifacts.map((artifact) => ({
          filename: artifact.filename,
          mtime:
            fileMtimes.get(`${spec.name.toString()}/${artifact.filename}`) ?? artifact.lastModified,
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
    specs.push(makeSpec({ name: 'billing/invoices' }), makeSpec({ name: 'auth/login' }))
    specContent.set('auth/login/spec.md', '# Login\n\nAuth spec')
    specContent.set('billing/invoices/spec.md', '# Invoices')

    await cache.reindex()
    const result = await cache.list()

    expect(result.items.map((item) => item.path)).toEqual(['auth/login', 'billing/invoices'])
  })
})
