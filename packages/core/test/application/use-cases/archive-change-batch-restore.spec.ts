import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArchiveChange } from '../../../src/application/use-cases/archive-change.js'
import { GenerateSpecMetadata } from '../../../src/application/use-cases/generate-spec-metadata.js'
import { SaveSpecMetadata } from '../../../src/application/use-cases/save-spec-metadata.js'
import { Logger } from '../../../src/application/logger.js'
import {
  type ArchiveBatchManifest,
  type ArchiveBatchSnapshotPort,
  type ArchiveBatchRestoreResult,
} from '../../../src/application/ports/archive-batch-snapshot.js'
import { ArchiveBatchRestoreError } from '../../../src/domain/errors/archive-batch-restore-error.js'
import { ArchiveOrphanBackupError } from '../../../src/domain/errors/archive-orphan-backup-error.js'
import { SpecPublicationError } from '../../../src/domain/errors/spec-publication-error.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import {
  ARCHIVE_BACKUP_DIR,
  FsArchiveBatchSnapshot,
} from '../../../src/infrastructure/fs/archive-batch-snapshot.js'
import { FsSpecRepository } from '../../../src/infrastructure/fs/spec-repository.js'
import { MarkdownParser } from '../../../src/infrastructure/artifact-parser/markdown-parser.js'
import { YamlParser } from '../../../src/infrastructure/artifact-parser/yaml-parser.js'
import {
  makeActorResolver,
  makeArtifactType,
  makeChangeRepository,
  makeListWorkspaces,
  makeParsers,
  makeRunStepHooks,
  makeSchema,
  makeSchemaProvider,
  makeSpecRepository,
  testActor,
} from './helpers.js'
import {
  type RunStepHooksInput,
  type RunStepHooksResult,
} from '../../../src/application/use-cases/run-step-hooks.js'
import {
  ArchiveRepository,
  type ArchiveListOptions,
  type ArchiveListResult,
} from '../../../src/application/ports/archive-repository.js'
import { type ArchivedChange } from '../../../src/domain/entities/archived-change.js'
import { toArchivedChangeView } from '../../../src/domain/read-only-change-view.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'

function makeGenerateMetadata(): GenerateSpecMetadata {
  return {
    execute: vi.fn().mockResolvedValue({ metadata: {}, hasExtraction: false }),
  } as unknown as GenerateSpecMetadata
}

function makeSaveMetadata(): SaveSpecMetadata {
  return {
    execute: vi.fn().mockResolvedValue({ spec: 'default:test' }),
  } as unknown as SaveSpecMetadata
}

async function setupFsSpecRepo(): Promise<{
  repo: FsSpecRepository
  snapshot: FsArchiveBatchSnapshot
  tmpDir: string
}> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-archive-restore-'))
  const specsPath = path.join(tmpDir, 'specs')
  const metadataPath = path.join(tmpDir, '.specd', 'metadata')
  await Promise.all([
    fs.mkdir(specsPath, { recursive: true }),
    fs.mkdir(metadataPath, { recursive: true }),
  ])
  const repo = new FsSpecRepository({
    workspace: 'default',
    ownership: 'owned',
    isExternal: false,
    configPath: '/test',
    specsPath,
    metadataPath,
  })
  const snapshot = new FsArchiveBatchSnapshot(new Map([['default', { specsPath }]]))
  return { repo, snapshot, tmpDir }
}

function makeArchiveRepo(): ArchiveRepository {
  return new (class extends ArchiveRepository {
    constructor() {
      super({ workspace: 'default', ownership: 'owned', isExternal: false, configPath: '/test' })
    }
    override async archive(change: Change) {
      const ts = change.createdAt
      const p = (n: number) => String(n).padStart(2, '0')
      const archivedName = `${ts.getUTCFullYear()}${p(ts.getUTCMonth() + 1)}${p(ts.getUTCDate())}-${p(ts.getUTCHours())}${p(ts.getUTCMinutes())}${p(ts.getUTCSeconds())}-${change.name}`
      return {
        archivedChange: toArchivedChangeView(change, {
          archivedName,
          archivedAt: new Date(),
        }),
        archiveDirPath: `/archive/${archivedName}`,
      }
    }
    override async list(options?: ArchiveListOptions): Promise<ArchiveListResult> {
      return {
        items: [],
        meta: {
          total: 0,
          count: 0,
          limit: options?.limit ?? 100,
        },
      }
    }
    override async get() {
      return null
    }
    override async artifact(
      _change: ArchivedChange,
      _filename: string,
    ): Promise<SpecArtifact | null> {
      return null
    }
    override async reindex() {}
    override archivePath(archivedChange: ArchivedChange) {
      return `/archive/${archivedChange.archivedName}`
    }
    override internalPaths(): readonly string[] {
      return ['/archive']
    }
  })()
}

function makeArchivableChange(
  name: string,
  opts: { specIds?: string[]; createdAt?: Date; schemaName?: string } = {},
): Change {
  const createdAt = opts.createdAt ?? new Date('2024-01-15T12:00:00Z')
  const events: ChangeEvent[] = [
    {
      type: 'created',
      at: createdAt,
      by: testActor,
      specIds: opts.specIds ?? ['default:auth/oauth'],
      schemaName: opts.schemaName ?? 'test-schema',
      schemaVersion: 1,
    },
    { type: 'transitioned', from: 'drafting', to: 'designing', at: createdAt, by: testActor },
    { type: 'transitioned', from: 'designing', to: 'ready', at: createdAt, by: testActor },
    { type: 'transitioned', from: 'ready', to: 'implementing', at: createdAt, by: testActor },
    { type: 'transitioned', from: 'implementing', to: 'verifying', at: createdAt, by: testActor },
    { type: 'transitioned', from: 'verifying', to: 'done', at: createdAt, by: testActor },
    { type: 'transitioned', from: 'done', to: 'archivable', at: createdAt, by: testActor },
  ]
  return new Change({
    name,
    createdAt,
    specIds: opts.specIds ?? ['default:auth/oauth'],
    history: events,
  })
}

function makeTwoSpecChange(name: string): Change {
  const change = makeArchivableChange(name, {
    specIds: ['default:auth/a', 'default:auth/b'],
  })
  change.setArtifact(
    new ChangeArtifact({
      type: 'spec',
      files: new Map([
        [
          'default:auth/a',
          new ArtifactFile({
            key: 'default:auth/a',
            filename: 'specs/default/auth/a/spec.md',
            status: 'complete',
            validatedHash: 'abc123',
          }),
        ],
        [
          'default:auth/b',
          new ArtifactFile({
            key: 'default:auth/b',
            filename: 'specs/default/auth/b/spec.md',
            status: 'complete',
            validatedHash: 'abc123',
          }),
        ],
      ]),
    }),
  )
  return change
}

const DELTA_BASE_SPEC = `## Requirement: Target

Old text.
`

const DELTA_YAML = `- op: modified
  selector:
    type: section
    matches: '^Requirement: Target$'
  content: |
    New text.
`

function expectedDeltaMerge(): string {
  const md = new MarkdownParser()
  const yaml = new YamlParser()
  return md.serialize(md.apply(md.parse(DELTA_BASE_SPEC), yaml.parseDelta(DELTA_YAML)).ast)
}

function makeDeltaSpecChange(name: string): Change {
  const change = makeArchivableChange(name, { specIds: ['default:auth/oauth'] })
  change.setArtifact(
    new ChangeArtifact({
      type: 'spec',
      files: new Map([
        [
          'default:auth/oauth',
          new ArtifactFile({
            key: 'default:auth/oauth',
            filename: 'deltas/default/auth/oauth/spec.md.delta.yaml',
            status: 'complete',
            validatedHash: 'abc123',
          }),
        ],
      ]),
    }),
  )
  return change
}

describe('ArchiveChange batch snapshot integration', () => {
  const tmpDirs: string[] = []

  afterEach(async () => {
    Logger.resetImplementation()
    await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
  })

  it('restores the first spec when the second publish fails in a multi-spec batch', async () => {
    const { repo, snapshot, tmpDir } = await setupFsSpecRepo()
    tmpDirs.push(tmpDir)

    const specA = path.join(repo.specsPath, 'auth', 'a')
    const specB = path.join(repo.specsPath, 'auth', 'b')
    await fs.mkdir(specA, { recursive: true })
    await fs.mkdir(specB, { recursive: true })
    await fs.writeFile(path.join(specA, 'spec.md'), '# A original\n', 'utf8')
    await fs.writeFile(path.join(specB, 'spec.md'), '# B original\n', 'utf8')

    let publishCount = 0
    const origPublish = repo.publish.bind(repo)
    repo.publish = async (spec, publication) => {
      publishCount += 1
      if (publishCount === 2) {
        throw new SpecPublicationError('default:auth/b', '/tmp/staging-b', 'fail second')
      }
      return origPublish(spec, publication)
    }

    const schema = makeSchema([makeArtifactType('spec', { delta: false, scope: 'spec' })])
    const change = makeTwoSpecChange('multi-spec-change')
    const repoChanges = Object.assign(makeChangeRepository([change]), {
      async artifact() {
        return new SpecArtifact('spec.md', '# merged\n')
      },
    })

    const uc = new ArchiveChange(
      repoChanges,
      makeListWorkspaces(new Map([['default', repo]])),
      makeArchiveRepo(),
      makeRunStepHooks(),
      makeActorResolver(),
      makeParsers(),
      makeSchemaProvider(schema),
      makeGenerateMetadata(),
      makeSaveMetadata(),
      undefined,
      [],
      process.cwd(),
      snapshot,
    )

    await expect(uc.execute({ name: 'multi-spec-change' })).rejects.toThrow(SpecPublicationError)
    expect(await fs.readFile(path.join(specA, 'spec.md'), 'utf8')).toBe('# A original\n')
    expect(publishCount).toBe(2)
    const persisted = await repoChanges.get('multi-spec-change')
    expect(persisted?.state).toBe('archivable')
  })

  it('auto-restores matching orphan backup and aborts before publication', async () => {
    const { repo, snapshot, tmpDir } = await setupFsSpecRepo()
    tmpDirs.push(tmpDir)

    const specDir = path.join(repo.specsPath, 'auth', 'oauth')
    await fs.mkdir(specDir, { recursive: true })
    await fs.writeFile(path.join(specDir, 'spec.md'), '# corrupted\n', 'utf8')
    const backupDir = path.join(specDir, ARCHIVE_BACKUP_DIR)
    await fs.mkdir(backupDir, { recursive: true })
    await fs.writeFile(path.join(backupDir, 'spec.md'), '# original\n', 'utf8')
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

    let publishCalled = false
    const origPublish = repo.publish.bind(repo)
    repo.publish = async (...args) => {
      publishCalled = true
      return origPublish(...args)
    }

    const schema = makeSchema([makeArtifactType('spec', { delta: false, scope: 'spec' })])
    const change = makeArchivableChange('my-change', { specIds: ['default:auth/oauth'] })
    change.setArtifact(
      new ChangeArtifact({
        type: 'spec',
        files: new Map([
          [
            'default:auth/oauth',
            new ArtifactFile({
              key: 'default:auth/oauth',
              filename: 'specs/default/auth/oauth/spec.md',
              status: 'complete',
              validatedHash: 'abc123',
            }),
          ],
        ]),
      }),
    )
    const repoChanges = Object.assign(makeChangeRepository([change]), {
      async artifact() {
        return new SpecArtifact('spec.md', '# New')
      },
    })

    const uc = new ArchiveChange(
      repoChanges,
      makeListWorkspaces(new Map([['default', repo]])),
      makeArchiveRepo(),
      makeRunStepHooks(),
      makeActorResolver(),
      makeParsers(),
      makeSchemaProvider(schema),
      makeGenerateMetadata(),
      makeSaveMetadata(),
      undefined,
      [],
      process.cwd(),
      snapshot,
    )

    await expect(uc.execute({ name: 'my-change' })).rejects.toThrow(ArchiveOrphanBackupError)
    expect(await fs.readFile(path.join(specDir, 'spec.md'), 'utf8')).toBe('# original\n')
    expect(publishCalled).toBe(false)
  })

  it('aborts on foreign orphan backup without auto-restore', async () => {
    const { repo, snapshot, tmpDir } = await setupFsSpecRepo()
    tmpDirs.push(tmpDir)

    const specDir = path.join(repo.specsPath, 'auth', 'oauth')
    await fs.mkdir(specDir, { recursive: true })
    await fs.writeFile(path.join(specDir, 'spec.md'), '# live\n', 'utf8')
    const backupDir = path.join(specDir, ARCHIVE_BACKUP_DIR)
    await fs.mkdir(backupDir, { recursive: true })
    await fs.writeFile(path.join(backupDir, 'spec.md'), '# backup\n', 'utf8')
    await fs.writeFile(
      path.join(backupDir, 'manifest.json'),
      `${JSON.stringify({
        changeName: 'other-change',
        specDirExisted: true,
        existingFiles: ['spec.md'],
        createdFiles: [],
      })}\n`,
      'utf8',
    )

    const schema = makeSchema([makeArtifactType('spec', { delta: false, scope: 'spec' })])
    const change = makeArchivableChange('my-change', { specIds: ['default:auth/oauth'] })
    change.setArtifact(
      new ChangeArtifact({
        type: 'spec',
        files: new Map([
          [
            'default:auth/oauth',
            new ArtifactFile({
              key: 'default:auth/oauth',
              filename: 'specs/default/auth/oauth/spec.md',
              status: 'complete',
              validatedHash: 'abc123',
            }),
          ],
        ]),
      }),
    )
    const repoChanges = Object.assign(makeChangeRepository([change]), {
      async artifact() {
        return new SpecArtifact('spec.md', '# New')
      },
    })

    const uc = new ArchiveChange(
      repoChanges,
      makeListWorkspaces(new Map([['default', repo]])),
      makeArchiveRepo(),
      makeRunStepHooks(),
      makeActorResolver(),
      makeParsers(),
      makeSchemaProvider(schema),
      makeGenerateMetadata(),
      makeSaveMetadata(),
      undefined,
      [],
      process.cwd(),
      snapshot,
    )

    await expect(uc.execute({ name: 'my-change' })).rejects.toThrow(ArchiveOrphanBackupError)
    expect(await fs.readFile(path.join(specDir, 'spec.md'), 'utf8')).toBe('# live\n')
  })

  it('stays in archiving when batch restore is partial', async () => {
    class PartialRestoreSnapshot implements ArchiveBatchSnapshotPort {
      async detectOrphans(): Promise<void> {}
      async snapshot(_specId: string, changeName: string): Promise<ArchiveBatchManifest> {
        return {
          changeName,
          specDirExisted: true,
          existingFiles: ['spec.md'],
          createdFiles: [],
        }
      }
      async recordCreatedFile(): Promise<void> {}
      async restoreBatch(
        _specIds: readonly string[],
        publishOrder: readonly string[],
      ): Promise<ArchiveBatchRestoreResult> {
        return {
          restoredSpecIds: [],
          failedSpecIds: [...publishOrder],
        }
      }
      async cleanup(): Promise<void> {}
    }

    const schema = makeSchema([makeArtifactType('spec', { delta: false, scope: 'spec' })])
    const specRepo = makeSpecRepository({
      specs: [new Spec('default', SpecPath.parse('auth/oauth'), ['spec.md'])],
      artifacts: { 'auth/oauth/spec.md': '# Old' },
    })
    vi.spyOn(specRepo, 'publish').mockImplementation(async (): Promise<void> => {
      throw new SpecPublicationError('default:auth/oauth', '/tmp/staging', 'fail')
    })
    const change = makeArchivableChange('my-change', { specIds: ['default:auth/oauth'] })
    change.setArtifact(
      new ChangeArtifact({
        type: 'spec',
        files: new Map([
          [
            'default:auth/oauth',
            new ArtifactFile({
              key: 'default:auth/oauth',
              filename: 'specs/default/auth/oauth/spec.md',
              status: 'complete',
              validatedHash: 'abc123',
            }),
          ],
        ]),
      }),
    )
    const repoChanges = Object.assign(makeChangeRepository([change]), {
      async artifact() {
        return new SpecArtifact('spec.md', '# New')
      },
    })

    const uc = new ArchiveChange(
      repoChanges,
      makeListWorkspaces(new Map([['default', specRepo]])),
      makeArchiveRepo(),
      makeRunStepHooks(),
      makeActorResolver(),
      makeParsers(),
      makeSchemaProvider(schema),
      makeGenerateMetadata(),
      makeSaveMetadata(),
      undefined,
      [],
      process.cwd(),
      new PartialRestoreSnapshot(),
    )

    const debugSpy = vi.spyOn(Logger, 'debug')
    await expect(uc.execute({ name: 'my-change' })).rejects.toThrow(ArchiveBatchRestoreError)
    const persisted = await repoChanges.get('my-change')
    expect(persisted?.state).toBe('archiving')
    const messages = debugSpy.mock.calls.map(([message]) => String(message))
    expect(messages.some((m) => m.includes('partial restore'))).toBe(true)
    debugSpy.mockRestore()
  })

  it('merges delta against restored base on archive retry after commit failure', async () => {
    const { repo, snapshot, tmpDir } = await setupFsSpecRepo()
    tmpDirs.push(tmpDir)

    const specDir = path.join(repo.specsPath, 'auth', 'oauth')
    await fs.mkdir(specDir, { recursive: true })
    await fs.writeFile(path.join(specDir, 'spec.md'), DELTA_BASE_SPEC, 'utf8')

    const schema = makeSchema([
      makeArtifactType('spec', { delta: true, format: 'markdown', scope: 'spec' }),
    ])
    const change = makeDeltaSpecChange('delta-retry-change')
    const repoChanges = Object.assign(makeChangeRepository([change]), {
      async artifact(_change: Change, filename: string) {
        if (filename === 'deltas/default/auth/oauth/spec.md.delta.yaml') {
          return new SpecArtifact(filename, DELTA_YAML)
        }
        return null
      },
    })

    const archiveRepo = makeArchiveRepo()
    let archiveAttempts = 0
    const archiveImpl = archiveRepo.archive.bind(archiveRepo)
    archiveRepo.archive = async (c) => {
      archiveAttempts += 1
      if (archiveAttempts === 1) {
        throw new Error('simulated archive move failure')
      }
      return archiveImpl(c)
    }

    const uc = new ArchiveChange(
      repoChanges,
      makeListWorkspaces(new Map([['default', repo]])),
      archiveRepo,
      makeRunStepHooks(),
      makeActorResolver(),
      makeParsers(new MarkdownParser(), new YamlParser()),
      makeSchemaProvider(schema),
      makeGenerateMetadata(),
      makeSaveMetadata(),
      undefined,
      [],
      process.cwd(),
      snapshot,
    )

    await expect(uc.execute({ name: 'delta-retry-change' })).rejects.toThrow(
      'simulated archive move failure',
    )
    expect(await fs.readFile(path.join(specDir, 'spec.md'), 'utf8')).toBe(DELTA_BASE_SPEC)
    expect((await repoChanges.get('delta-retry-change'))?.state).toBe('archivable')

    await uc.execute({ name: 'delta-retry-change' })
    const merged = await fs.readFile(path.join(specDir, 'spec.md'), 'utf8')
    expect(merged).toBe(expectedDeltaMerge())
    expect(merged).toContain('New text.')
    expect(merged).not.toContain('Old text.')
    expect(archiveAttempts).toBe(2)
  })

  it('calls archive before persisted metadata generation', async () => {
    const order: string[] = []
    const archiveRepo = makeArchiveRepo()
    vi.spyOn(archiveRepo, 'archive').mockImplementation(async (change) => {
      order.push('archive')
      const ts = change.createdAt
      const p = (n: number) => String(n).padStart(2, '0')
      const archivedName = `${ts.getUTCFullYear()}${p(ts.getUTCMonth() + 1)}${p(ts.getUTCDate())}-${p(ts.getUTCHours())}${p(ts.getUTCMinutes())}${p(ts.getUTCSeconds())}-${change.name}`
      return {
        archivedChange: toArchivedChangeView(change, {
          archivedName,
          archivedAt: new Date(),
        }),
        archiveDirPath: `/archive/${archivedName}`,
      }
    })

    const generateMetadata = {
      execute: vi.fn(async () => {
        order.push('metadata')
        return { metadata: { dependsOn: ['default:auth/oauth'] }, hasExtraction: true }
      }),
    }

    const schema = makeSchema([makeArtifactType('spec', { delta: false, scope: 'spec' })])
    const specRepo = makeSpecRepository({
      specs: [new Spec('default', SpecPath.parse('auth/oauth'), ['spec.md'])],
      artifacts: { 'auth/oauth/spec.md': '# Old' },
    })
    const change = makeArchivableChange('my-change', { specIds: ['default:auth/oauth'] })
    change.setArtifact(
      new ChangeArtifact({
        type: 'spec',
        files: new Map([
          [
            'default:auth/oauth',
            new ArtifactFile({
              key: 'default:auth/oauth',
              filename: 'specs/default/auth/oauth/spec.md',
              status: 'complete',
              validatedHash: 'abc123',
            }),
          ],
        ]),
      }),
    )
    const repoChanges = Object.assign(makeChangeRepository([change]), {
      async artifact() {
        return new SpecArtifact('spec.md', '# New')
      },
    })

    const uc = new ArchiveChange(
      repoChanges,
      makeListWorkspaces(new Map([['default', specRepo]])),
      archiveRepo,
      makeRunStepHooks(),
      makeActorResolver(),
      makeParsers(),
      makeSchemaProvider(schema),
      generateMetadata as never,
      makeSaveMetadata(),
    )

    await uc.execute({ name: 'my-change' })
    expect(order).toEqual(['archive', 'metadata'])
  })

  it('emits snapshot debug lines before transitioning to archiving', async () => {
    const debugSpy = vi.spyOn(Logger, 'debug')
    const { repo, snapshot, tmpDir } = await setupFsSpecRepo()
    tmpDirs.push(tmpDir)

    const specDir = path.join(repo.specsPath, 'auth', 'oauth')
    await fs.mkdir(specDir, { recursive: true })
    await fs.writeFile(path.join(specDir, 'spec.md'), '# Old\n', 'utf8')

    const schema = makeSchema([makeArtifactType('spec', { delta: false, scope: 'spec' })])
    const change = makeArchivableChange('my-change', { specIds: ['default:auth/oauth'] })
    change.setArtifact(
      new ChangeArtifact({
        type: 'spec',
        files: new Map([
          [
            'default:auth/oauth',
            new ArtifactFile({
              key: 'default:auth/oauth',
              filename: 'specs/default/auth/oauth/spec.md',
              status: 'complete',
              validatedHash: 'abc123',
            }),
          ],
        ]),
      }),
    )
    const repoChanges = Object.assign(makeChangeRepository([change]), {
      async artifact() {
        return new SpecArtifact('spec.md', '# New')
      },
    })

    const uc = new ArchiveChange(
      repoChanges,
      makeListWorkspaces(new Map([['default', repo]])),
      makeArchiveRepo(),
      makeRunStepHooks(),
      makeActorResolver(),
      makeParsers(),
      makeSchemaProvider(schema),
      makeGenerateMetadata(),
      makeSaveMetadata(),
      undefined,
      [],
      process.cwd(),
      snapshot,
    )

    await uc.execute({ name: 'my-change' })

    const messages = debugSpy.mock.calls.map(([message]) => String(message))
    const snapshotIdx = messages.findIndex((m) =>
      m.includes('ArchiveBatchSnapshot snapshot started'),
    )
    const transitionIdx = messages.findIndex((m) => m.includes('transitioning to archiving'))
    expect(snapshotIdx).toBeGreaterThanOrEqual(0)
    expect(transitionIdx).toBeGreaterThan(snapshotIdx)
    debugSpy.mockRestore()
  })

  it('emits post-commit debug diagnostics after successful archive', async () => {
    const debugSpy = vi.spyOn(Logger, 'debug')
    const { repo, snapshot, tmpDir } = await setupFsSpecRepo()
    tmpDirs.push(tmpDir)

    const specDir = path.join(repo.specsPath, 'auth', 'oauth')
    await fs.mkdir(specDir, { recursive: true })
    await fs.writeFile(path.join(specDir, 'spec.md'), '# Old\n', 'utf8')

    const postHookSpy = vi.fn()
    const runStepHooks = makeRunStepHooks({
      execute: async (input: RunStepHooksInput): Promise<RunStepHooksResult> => {
        if (input.phase === 'post') {
          postHookSpy(input)
        }
        return { hooks: [], success: true, failedHook: null }
      },
    })

    const generateMetadata = {
      execute: vi.fn().mockResolvedValue({
        metadata: { dependsOn: ['default:auth/oauth'] },
        hasExtraction: true,
      }),
    }

    const schema = makeSchema([makeArtifactType('spec', { delta: false, scope: 'spec' })])
    const change = makeArchivableChange('my-change', { specIds: ['default:auth/oauth'] })
    change.setArtifact(
      new ChangeArtifact({
        type: 'spec',
        files: new Map([
          [
            'default:auth/oauth',
            new ArtifactFile({
              key: 'default:auth/oauth',
              filename: 'specs/default/auth/oauth/spec.md',
              status: 'complete',
              validatedHash: 'abc123',
            }),
          ],
        ]),
      }),
    )
    const repoChanges = Object.assign(makeChangeRepository([change]), {
      async artifact() {
        return new SpecArtifact('spec.md', '# New')
      },
    })

    const uc = new ArchiveChange(
      repoChanges,
      makeListWorkspaces(new Map([['default', repo]])),
      makeArchiveRepo(),
      runStepHooks,
      makeActorResolver(),
      makeParsers(),
      makeSchemaProvider(schema),
      generateMetadata as never,
      makeSaveMetadata(),
      undefined,
      [],
      process.cwd(),
      snapshot,
    )

    await uc.execute({ name: 'my-change' })

    const messages = debugSpy.mock.calls.map(([message]) => String(message))
    expect(messages.some((m) => m.includes('metadata generation started'))).toBe(true)
    expect(messages.some((m) => m.includes('metadata generation completed'))).toBe(true)
    expect(messages.some((m) => m.includes('post-archive hooks started'))).toBe(true)
    expect(messages.some((m) => m.includes('post-archive hooks completed'))).toBe(true)
    expect(postHookSpy).toHaveBeenCalled()
    debugSpy.mockRestore()
  })
})
