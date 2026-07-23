import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { FsSpecRepository } from '../../../src/infrastructure/fs/spec-repository.js'
import {
  FsValidationResultCache,
  stampsFromSpec,
} from '../../../src/infrastructure/fs/fs-validation-result-cache.js'
import { sha256 } from '../../../src/infrastructure/fs/hash.js'
import { computeCacheFingerprint } from '../../../src/application/use-cases/_shared/validate-specs-cache-fingerprints.js'

describe('FsValidationResultCache', () => {
  let tmpDir: string
  let configPath: string
  let specsPath: string
  let metadataPath: string
  let repo: FsSpecRepository
  let cache: FsValidationResultCache

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-validate-cache-'))
    configPath = tmpDir
    specsPath = path.join(tmpDir, 'specs')
    metadataPath = path.join(tmpDir, '.specd', 'metadata')
    await Promise.all([
      fs.mkdir(specsPath, { recursive: true }),
      fs.mkdir(metadataPath, { recursive: true }),
    ])
    repo = new FsSpecRepository({
      workspace: 'default',
      ownership: 'owned',
      isExternal: false,
      configPath,
      specsPath,
      metadataPath,
    })
    cache = new FsValidationResultCache({
      specRepository: repo,
      configPath,
      metadataPath,
    })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function writeSpec(specPath: string, content: string): Promise<void> {
    const dir = path.join(specsPath, ...specPath.split('/'))
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'spec.md'), content, 'utf8')
  }

  it('stores rows under validate-specs workspace bucket with extended meta', async () => {
    await writeSpec('auth/login', '# Login')
    const spec = (await repo.get(SpecPath.parse('auth/login')))!
    const schemaFingerprint = sha256('schema-surface')
    const entry = {
      spec: 'default:auth/login',
      passed: true,
      failures: [],
      warnings: [],
    }

    await cache.upsert({
      entry,
      spec,
      schemaFingerprint,
      engineVersion: 1,
    })

    const bucketDir = path.join(configPath, 'tmp', 'fs-cache', 'validate-specs', 'default')
    const meta = JSON.parse(
      await fs.readFile(path.join(bucketDir, '.specd-index-meta.json'), 'utf8'),
    ) as { schemaFingerprint: string; engineVersion: number; totalCount: number }
    expect(meta.schemaFingerprint).toBe(schemaFingerprint)
    expect(meta.engineVersion).toBe(1)
    expect(meta.totalCount).toBe(1)
  })

  it('ensures configPath tmp gitignore on upsert', async () => {
    await writeSpec('auth/login', '# Login')
    const spec = (await repo.get(SpecPath.parse('auth/login')))!
    await cache.upsert({
      entry: {
        spec: 'default:auth/login',
        passed: true,
        failures: [],
        warnings: [],
      },
      spec,
      schemaFingerprint: sha256('schema-surface'),
      engineVersion: 1,
    })

    const gitignore = await fs.readFile(path.join(configPath, 'tmp', '.gitignore'), 'utf8')
    expect(gitignore).toBe('*\n!.gitignore\n')
  })

  it('returns hard hit when stamps match', async () => {
    await writeSpec('auth/login', '# Login')
    const spec = (await repo.get(SpecPath.parse('auth/login')))!
    const schemaFingerprint = sha256('schema-surface')
    const entry = {
      spec: 'default:auth/login',
      passed: true,
      failures: [],
      warnings: [],
    }
    const cacheFingerprint = computeCacheFingerprint(
      {
        specFingerprint: await repo.specFingerprint(spec),
        metadataContentHash: null,
      },
      sha256,
    )

    await cache.upsert({ entry, spec, schemaFingerprint, engineVersion: 1 })

    const lookup = await cache.lookup({ spec, schemaFingerprint, engineVersion: 1 })
    expect(lookup).toEqual({ kind: 'hit', entry })
    void cacheFingerprint
  })

  it('returns soft hit when fingerprint matches but stamps differ', async () => {
    await writeSpec('auth/login', '# Login')
    const spec = (await repo.get(SpecPath.parse('auth/login')))!
    const schemaFingerprint = sha256('schema-surface')
    const entry = {
      spec: 'default:auth/login',
      passed: true,
      failures: [],
      warnings: [],
    }
    const storedStamps = stampsFromSpec(spec)
    const staleStamps = {
      ...storedStamps,
      artifacts: [{ filename: 'spec.md', lastModified: '2020-01-01T00:00:00.000Z' }],
    }
    const cacheFingerprint = computeCacheFingerprint(
      {
        specFingerprint: await repo.specFingerprint(spec),
        metadataContentHash: null,
      },
      sha256,
    )

    await cache.mutate(async () => {
      const bucketDir = path.join(configPath, 'tmp', 'fs-cache', 'validate-specs', 'default')
      await fs.mkdir(bucketDir, { recursive: true })
      await fs.writeFile(
        path.join(bucketDir, '.specd-index-meta.json'),
        JSON.stringify({
          totalCount: 1,
          generatedAt: new Date().toISOString(),
          isInvalidated: false,
          schemaFingerprint,
          engineVersion: 1,
        }) + '\n',
      )
      await fs.writeFile(
        path.join(bucketDir, '.specd-index.jsonl'),
        JSON.stringify({ entry, stamps: staleStamps, cacheFingerprint }) + '\n',
      )
    })

    const lookup = await cache.lookup({ spec, schemaFingerprint, engineVersion: 1 })
    expect(lookup).toEqual({ kind: 'hit', entry })
  })

  it('returns miss when schema fingerprint mismatches', async () => {
    await writeSpec('auth/login', '# Login')
    const spec = (await repo.get(SpecPath.parse('auth/login')))!
    const schemaFingerprint = sha256('schema-surface')
    const entry = {
      spec: 'default:auth/login',
      passed: true,
      failures: [],
      warnings: [],
    }

    await cache.upsert({ entry, spec, schemaFingerprint, engineVersion: 1 })

    const lookup = await cache.lookup({
      spec,
      schemaFingerprint: sha256('other-schema'),
      engineVersion: 1,
    })
    expect(lookup).toEqual({ kind: 'miss' })
  })

  it('returns miss when engine version mismatches', async () => {
    await writeSpec('auth/login', '# Login')
    const spec = (await repo.get(SpecPath.parse('auth/login')))!
    const schemaFingerprint = sha256('schema-surface')
    const entry = {
      spec: 'default:auth/login',
      passed: true,
      failures: [],
      warnings: [],
    }

    await cache.upsert({ entry, spec, schemaFingerprint, engineVersion: 1 })

    const lookup = await cache.lookup({
      spec,
      schemaFingerprint,
      engineVersion: 2,
    })
    expect(lookup).toEqual({ kind: 'miss' })
  })

  it('round-trips failed entries', async () => {
    await writeSpec('auth/login', '# Login')
    const spec = (await repo.get(SpecPath.parse('auth/login')))!
    const schemaFingerprint = sha256('schema-surface')
    const entry = {
      spec: 'default:auth/login',
      passed: false,
      failures: [{ artifactId: 'specs', description: 'missing heading' }],
      warnings: [{ artifactId: 'specs', description: 'deferred rule' }],
    }

    await cache.upsert({ entry, spec, schemaFingerprint, engineVersion: 1 })
    const lookup = await cache.lookup({ spec, schemaFingerprint, engineVersion: 1 })
    expect(lookup).toEqual({ kind: 'hit', entry })
  })
})
