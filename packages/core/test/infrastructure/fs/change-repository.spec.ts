import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Change } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { type ActorIdentity } from '../../../src/domain/entities/change.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import { ArtifactConflictError } from '../../../src/domain/errors/artifact-conflict-error.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { SchemaMismatchError } from '../../../src/application/errors/schema-mismatch-error.js'
import { Logger } from '../../../src/application/logger.js'
import { FsChangeRepository } from '../../../src/infrastructure/fs/change-repository.js'
import { vi } from 'vitest'
import { sha256 } from '../../../src/infrastructure/fs/hash.js'
import { artifactDagFromChangeArtifacts } from '../../../src/domain/value-objects/artifact-dag.js'
import { ArtifactType } from '../../../src/domain/value-objects/artifact-type.js'

const actor: ActorIdentity = { name: 'Alice', email: 'alice@example.com' }

// ---- Setup / teardown helpers ----

interface RepoContext {
  repo: FsChangeRepository
  tmpDir: string
  configPath: string
  changesPath: string
  draftsPath: string
  discardedPath: string
}

async function setupRepo(): Promise<RepoContext> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-test-'))
  const changesPath = path.join(tmpDir, 'changes')
  const draftsPath = path.join(tmpDir, 'drafts')
  const discardedPath = path.join(tmpDir, 'discarded')
  const configPath = path.join(tmpDir, 'config')
  await fs.mkdir(changesPath, { recursive: true })
  await fs.mkdir(draftsPath, { recursive: true })
  await fs.mkdir(discardedPath, { recursive: true })
  await fs.mkdir(configPath, { recursive: true })

  const repo = new FsChangeRepository({
    workspace: 'default',
    ownership: 'owned',
    isExternal: false,
    configPath,
    changesPath,
    draftsPath,
    discardedPath,
  })

  return { repo, tmpDir, configPath, changesPath, draftsPath, discardedPath }
}

async function cleanupRepo(ctx: RepoContext): Promise<void> {
  await fs.rm(ctx.tmpDir, { recursive: true, force: true })
}

function makeChange(name: string, createdAt?: Date): Change {
  const at = createdAt ?? new Date('2024-01-15T10:00:00.000Z')
  return new Change({
    name,
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
}

// ---- Tests ----

describe('FsChangeRepository', () => {
  let ctx: RepoContext

  beforeEach(async () => {
    ctx = await setupRepo()
  })

  afterEach(async () => {
    await cleanupRepo(ctx)
  })

  describe('save and get — round-trip', () => {
    it('given a new change, when save is called, then a timestamped directory is created under changes/', async () => {
      const change = makeChange('add-auth', new Date('2024-03-15T10:00:00.000Z'))
      await ctx.repo.save(change)

      const entries = await fs.readdir(ctx.changesPath)
      expect(entries).toHaveLength(1)
      expect(entries[0]).toBe('20240315-100000-add-auth')
    })

    it('given a saved change, when get is called with the name, then the change is returned with correct fields', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)

      const loaded = await ctx.repo.get('add-auth')

      expect(loaded).not.toBeNull()
      expect(loaded?.name).toBe('add-auth')
      expect(loaded?.specIds).toEqual(['auth/login'])
      expect(loaded?.workspaces).toEqual(['default'])
      expect(loaded?.history).toHaveLength(1)
      expect(loaded?.history[0]?.type).toBe('created')
    })

    it('given no change with that name, when get is called, then null is returned', async () => {
      const result = await ctx.repo.get('nonexistent')
      expect(result).toBeNull()
    })

    it('given a saved change with history, when get is called, then history events are deserialized correctly', async () => {
      const change = makeChange('add-auth')
      change.transition('designing', actor)
      change.transition('ready', actor)
      await ctx.repo.save(change)

      const loaded = await ctx.repo.get('add-auth')
      expect(loaded?.history).toHaveLength(3)
      expect(loaded?.state).toBe('ready')
    })

    it('given a historical manifest stores artifact-change, when get is called, then the cause is normalized to artifact-drift', async () => {
      const change = makeChange('legacy-invalidated-cause')
      change.invalidate(
        'artifact-drift',
        actor,
        'Invalidated because validated artifacts drifted: proposal (proposal)',
        [{ type: 'proposal', files: ['proposal'] }],
        artifactDagFromChangeArtifacts([{ type: 'proposal', requires: [] }]),
      )
      await ctx.repo.save(change)

      const manifestPath = path.join(
        ctx.changesPath,
        '20240115-100000-legacy-invalidated-cause',
        'manifest.json',
      )
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {
        history: Array<Record<string, unknown>>
      }
      const invalidated = manifest.history.find((event) => event.type === 'invalidated')
      expect(invalidated).toBeDefined()
      invalidated!.cause = 'artifact-change'
      await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

      const loaded = await ctx.repo.get('legacy-invalidated-cause')
      expect(loaded).not.toBeNull()
      const invalidatedEvents = loaded?.history.filter(
        (event): event is Extract<Change['history'][number], { type: 'invalidated' }> =>
          event.type === 'invalidated',
      )

      expect(invalidatedEvents).toHaveLength(1)
      expect(invalidatedEvents?.[0]?.cause).toBe('artifact-drift')
    })

    it('given a saved change, when save is called again with updated history, then the manifest is updated', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)

      change.transition('designing', actor)
      await ctx.repo.save(change)

      const loaded = await ctx.repo.get('add-auth')
      expect(loaded?.state).toBe('designing')
    })

    it('given a newly created change, when save is called, then manifest.json persists updatedAt not before createdAt', async () => {
      const createdAt = new Date('2024-03-15T10:00:00.000Z')
      const change = makeChange('updated-at-on-create', createdAt)
      await ctx.repo.save(change)

      const manifestPath = path.join(
        ctx.changesPath,
        '20240315-100000-updated-at-on-create',
        'manifest.json',
      )
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {
        createdAt: string
        updatedAt: string
      }
      const loaded = await ctx.repo.get('updated-at-on-create')

      expect(new Date(manifest.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(manifest.createdAt).getTime(),
      )
      expect(loaded?.updatedAt.toISOString()).toBe(manifest.updatedAt)
    })

    it('given a persisted change transitions, when save is called again, then updatedAt advances in manifest and reload', async () => {
      const change = makeChange('updated-at-advances')
      await ctx.repo.save(change)

      const manifestPath = path.join(
        ctx.changesPath,
        '20240115-100000-updated-at-advances',
        'manifest.json',
      )
      const firstManifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {
        updatedAt: string
      }

      change.transition('designing', actor)
      await ctx.repo.save(change)

      const secondManifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {
        updatedAt: string
      }
      const loaded = await ctx.repo.get('updated-at-advances')

      expect(new Date(secondManifest.updatedAt).getTime()).toBeGreaterThan(
        new Date(firstManifest.updatedAt).getTime(),
      )
      expect(loaded?.updatedAt.toISOString()).toBe(secondManifest.updatedAt)
    })

    it('round-trips tracked implementation files and links', async () => {
      const change = makeChange('add-auth')
      change.trackImplementationFile('packages/core/src/login.ts', 'resolved')
      change.addImplementationLink({
        specId: 'default:auth/login',
        file: 'packages/core/src/login.ts',
        fileLinkExplicit: true,
        symbols: ['login', 'logout'],
      })

      await ctx.repo.save(change)
      const loaded = await ctx.repo.get('add-auth')

      expect(loaded?.trackedImplementationFiles).toEqual([
        { file: 'packages/core/src/login.ts', state: 'resolved' },
      ])
      expect(loaded?.implementationLinks).toEqual([
        {
          specId: 'default:auth/login',
          file: 'packages/core/src/login.ts',
          fileLinkExplicit: true,
          symbols: ['login', 'logout'],
        },
      ])
    })
  })

  describe('mutate()', () => {
    it('given no change with that name, when mutate is called, then ChangeNotFoundError is thrown', async () => {
      await expect(
        ctx.repo.mutate('missing', (change) => {
          change.transition('designing', actor)
        }),
      ).rejects.toBeInstanceOf(ChangeNotFoundError)
    })

    it('given the callback succeeds, when mutate is called, then the callback result is returned and the manifest is persisted', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)

      const result = await ctx.repo.mutate('add-auth', (loaded) => {
        loaded.transition('designing', actor)
        return loaded.state
      })

      expect(result).toBe('designing')
      expect((await ctx.repo.get('add-auth'))?.state).toBe('designing')
    })

    it('given the callback throws, when mutate is called, then partial manifest changes are not persisted', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)

      await expect(
        ctx.repo.mutate('add-auth', (loaded) => {
          loaded.transition('designing', actor)
          throw new Error('boom')
        }),
      ).rejects.toThrow('boom')

      expect((await ctx.repo.get('add-auth'))?.state).toBe('drafting')
    })

    it('given two concurrent mutations for the same change, when mutate is called twice, then the second waits and reloads fresh state', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)

      let releaseFirst: (() => void) | undefined
      const firstCanFinish = new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      let resolveFirstStarted: (() => void) | undefined
      const firstStarted = new Promise<void>((resolve) => {
        resolveFirstStarted = resolve
      })

      const order: string[] = []
      let secondEntered = false

      const first = ctx.repo.mutate('add-auth', async (loaded) => {
        order.push('first-start')
        loaded.transition('designing', actor)
        resolveFirstStarted?.()
        await firstCanFinish
        order.push('first-end')
        return loaded.state
      })

      await firstStarted

      const second = ctx.repo.mutate('add-auth', (loaded) => {
        secondEntered = true
        order.push('second-start')
        expect(loaded.state).toBe('designing')
        loaded.transition('ready', actor)
        order.push('second-end')
        return loaded.state
      })

      await new Promise((resolve) => setTimeout(resolve, 75))
      expect(secondEntered).toBe(false)

      releaseFirst?.()

      await expect(first).resolves.toBe('designing')
      await expect(second).resolves.toBe('ready')
      expect((await ctx.repo.get('add-auth'))?.state).toBe('ready')
      expect(order).toEqual(['first-start', 'first-end', 'second-start', 'second-end'])
    })

    it('given concurrent mutations for different changes, when mutate is called, then unrelated changes do not block each other', async () => {
      const alpha = makeChange('alpha')
      const beta = makeChange('beta')
      await ctx.repo.save(alpha)
      await ctx.repo.save(beta)

      let releaseAlpha: (() => void) | undefined
      const alphaCanFinish = new Promise<void>((resolve) => {
        releaseAlpha = resolve
      })
      let betaCompleted = false

      const mutateAlpha = ctx.repo.mutate('alpha', async (loaded) => {
        loaded.transition('designing', actor)
        await alphaCanFinish
        return loaded.state
      })

      const mutateBeta = ctx.repo.mutate('beta', (loaded) => {
        loaded.transition('designing', actor)
        betaCompleted = true
        return loaded.state
      })

      await expect(
        Promise.race([
          mutateBeta.then(() => 'completed'),
          new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 500)),
        ]),
      ).resolves.toBe('completed')
      expect(betaCompleted).toBe(true)

      releaseAlpha?.()

      await expect(mutateAlpha).resolves.toBe('designing')
      await expect(mutateBeta).resolves.toBe('designing')
      expect((await ctx.repo.get('alpha'))?.state).toBe('designing')
      expect((await ctx.repo.get('beta'))?.state).toBe('designing')
    })

    it('given a stale lock owned by a dead pid, when mutate is called, then the lock is reaped and the mutation succeeds', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)

      const lockDir = path.join(ctx.configPath, 'tmp', 'change-locks', 'add-auth.lock')
      await fs.mkdir(lockDir, { recursive: true })
      await fs.writeFile(
        path.join(lockDir, 'owner.json'),
        JSON.stringify({ pid: 999_999, acquiredAt: new Date().toISOString() }),
        'utf8',
      )

      await ctx.repo.mutate('add-auth', (loaded) => {
        loaded.transition('designing', actor)
      })

      expect((await ctx.repo.get('add-auth'))?.state).toBe('designing')
      await expect(fs.access(lockDir)).rejects.toThrow()
    })

    it('given a change with drifted artifacts loaded inside mutate, when mutate completes, then the lock is not acquired a second time during the internal load and the mutation is persisted', async () => {
      const content = '# Proposal\n'
      const hash = sha256(content)
      const at = new Date('2024-01-15T10:00:00.000Z')

      // Create an initialized repo with a single artifact type
      const repoWithTypes = new FsChangeRepository({
        workspace: 'default',
        ownership: 'owned',
        isExternal: false,
        configPath: ctx.configPath,
        changesPath: ctx.changesPath,
        draftsPath: ctx.draftsPath,
        discardedPath: ctx.discardedPath,
        artifactTypes: [
          new ArtifactType({
            id: 'proposal',
            scope: 'change',
            output: 'proposal.md',
            requires: [],
            validations: [],
            deltaValidations: [],
            preHashCleanup: [],
          }),
        ],
      })

      const change = new Change({
        name: 'add-auth',
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
          { type: 'transitioned', from: 'drafting', to: 'designing', at, by: actor },
          { type: 'transitioned', from: 'designing', to: 'ready', at, by: actor },
          { type: 'transitioned', from: 'ready', to: 'implementing', at, by: actor },
        ],
        artifacts: new Map([
          [
            'proposal',
            new ChangeArtifact({
              type: 'proposal',
              requires: [],
              files: new Map([
                [
                  'proposal',
                  new ArtifactFile({
                    key: 'proposal',
                    filename: 'proposal.md',
                    validatedHash: hash,
                  }),
                ],
              ]),
            }),
          ],
        ]),
      })
      await repoWithTypes.save(change)

      // Write proposal.md so validatedHash matches — no drift on first load
      const dir = path.join(ctx.changesPath, '20240115-100000-add-auth')
      await fs.writeFile(path.join(dir, 'proposal.md'), content, 'utf8')

      // Spy on the private lock method to count acquisitions
      const repoAsAny = repoWithTypes as unknown as {
        _withChangeLock: (name: string, fn: () => Promise<unknown>) => Promise<unknown>
      }
      let lockAcquisitions = 0
      const original = repoAsAny._withChangeLock.bind(repoWithTypes)
      repoAsAny._withChangeLock = async (name: string, fn: () => Promise<unknown>) => {
        lockAcquisitions++
        return original(name, fn)
      }

      // mutate should acquire lock exactly once (for the outer mutation); the inner
      // _getInternal(skipWrite:true) call must NOT re-acquire it
      await repoWithTypes.mutate('add-auth', (loaded) => {
        loaded.updateDescription('updated', actor)
        return 'ok'
      })

      expect(lockAcquisitions).toBe(1)

      // Confirm the final save went through
      const after = await repoWithTypes.get('add-auth')
      expect(after?.description).toBe('updated')
    })
  })

  describe('save — directory movement', () => {
    it('given a change in changes/, when drafted via mutate, then directory is moved to drafts/', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)

      await ctx.repo.mutate('add-auth', (loaded) => {
        loaded.draft(actor, 'parking for now')
        return loaded
      })

      const changesEntries = await fs.readdir(ctx.changesPath)
      const draftsEntries = await fs.readdir(ctx.draftsPath)
      expect(changesEntries).toHaveLength(0)
      expect(draftsEntries).toHaveLength(1)
    })

    it('given a drafted change, when restored via mutateDraft, then directory is moved back to changes/', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)
      await ctx.repo.mutate('add-auth', (loaded) => {
        loaded.draft(actor)
        return loaded
      })

      await ctx.repo.mutateDraft('add-auth', (loaded) => {
        loaded.restore(actor)
        return loaded
      })

      const changesEntries = await fs.readdir(ctx.changesPath)
      const draftsEntries = await fs.readdir(ctx.draftsPath)
      expect(changesEntries).toHaveLength(1)
      expect(draftsEntries).toHaveLength(0)
    })

    it('given an active change, when discarded and saved, then directory is moved to discarded/', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)
      change.discard('superseded', actor)
      await ctx.repo.save(change)

      const changesEntries = await fs.readdir(ctx.changesPath)
      const discardedEntries = await fs.readdir(ctx.discardedPath)
      expect(changesEntries).toHaveLength(0)
      expect(discardedEntries).toHaveLength(1)
    })
  })

  describe('get vs getDraft — drafted storage', () => {
    it('given a drafted change, when getDraft is called, then a drafted view is returned', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)
      await ctx.repo.mutate('add-auth', (loaded) => {
        loaded.draft(actor)
        return loaded
      })

      const loaded = await ctx.repo.getDraft('add-auth')
      expect(loaded).not.toBeNull()
      expect(loaded?.isDrafted).toBe(true)
    })

    it('given a drafted change, when get is called, then null is returned', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)
      await ctx.repo.mutate('add-auth', (loaded) => {
        loaded.draft(actor)
        return loaded
      })

      expect(await ctx.repo.get('add-auth')).toBeNull()
    })
  })

  describe('list()', () => {
    it('given three saved changes, when list is called, then they are returned oldest first', async () => {
      const c1 = makeChange('alpha', new Date('2024-01-01T00:00:00.000Z'))
      const c2 = makeChange('beta', new Date('2024-02-01T00:00:00.000Z'))
      const c3 = makeChange('gamma', new Date('2024-03-01T00:00:00.000Z'))
      await ctx.repo.save(c1)
      await ctx.repo.save(c2)
      await ctx.repo.save(c3)

      const changes = await ctx.repo.list()
      expect(changes.map((c) => c.name)).toEqual(['alpha', 'beta', 'gamma'])
    })

    it('given a drafted change and an active change, when list is called, then only the active change is returned', async () => {
      const active = makeChange('active', new Date('2024-01-01T00:00:00.000Z'))
      const drafted = makeChange('drafted', new Date('2024-02-01T00:00:00.000Z'))
      await ctx.repo.save(active)
      await ctx.repo.save(drafted)
      await ctx.repo.mutate('drafted', (loaded) => {
        loaded.draft(actor)
        return loaded
      })

      const changes = await ctx.repo.list()
      expect(changes.map((c) => c.name)).toEqual(['active'])
    })

    it('given no changes, when list is called, then an empty array is returned', async () => {
      const result = await ctx.repo.list()
      expect(result).toEqual([])
    })
  })

  describe('delete()', () => {
    it('given a saved change, when delete is called, then the directory is removed', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)

      await ctx.repo.delete(change)

      const entries = await fs.readdir(ctx.changesPath)
      expect(entries).toHaveLength(0)
    })

    it('given no change with that name, when delete is called, then nothing happens', async () => {
      const change = makeChange('nonexistent')
      await expect(ctx.repo.delete(change)).resolves.not.toThrow()
    })
  })

  describe('artifact status derivation', () => {
    beforeEach(() => {
      ctx.repo = new FsChangeRepository({
        workspace: 'default',
        ownership: 'owned',
        isExternal: false,
        configPath: ctx.configPath,
        changesPath: ctx.changesPath,
        draftsPath: ctx.draftsPath,
        discardedPath: ctx.discardedPath,
        artifactTypes: [
          new ArtifactType({
            id: 'proposal',
            scope: 'change',
            output: 'proposal.md',
            requires: [],
            validations: [],
            deltaValidations: [],
            preHashCleanup: [],
          }),
        ],
      })
    })

    function makeChangeWithArtifact(name: string, validatedHash: string | null): Change {
      const change = makeChange(name)
      const fileProps: { key: string; filename: string; validatedHash?: string } = {
        key: 'proposal',
        filename: 'proposal.md',
      }
      if (validatedHash !== null) fileProps.validatedHash = validatedHash
      change.setArtifact(
        new ChangeArtifact({
          type: 'proposal',
          optional: false,
          requires: [],
          files: new Map([['proposal', new ArtifactFile(fileProps)]]),
        }),
      )
      return change
    }

    it('given validatedHash is null and no file on disk, when get is called, then artifact status is missing', async () => {
      const change = makeChangeWithArtifact('c1', null)
      await ctx.repo.save(change)

      const loaded = await ctx.repo.get('c1')
      expect(loaded?.getArtifact('proposal')?.status).toBe('missing')
    })

    it('given validatedHash is null and a file exists on disk, when get is called, then artifact status is in-progress', async () => {
      const change = makeChangeWithArtifact('c1', null)
      await ctx.repo.save(change)
      // Write the artifact file manually
      const dir = path.join(ctx.changesPath, '20240115-100000-c1')
      await fs.writeFile(path.join(dir, 'proposal.md'), '# Proposal\n', 'utf8')

      const loaded = await ctx.repo.get('c1')
      expect(loaded?.getArtifact('proposal')?.status).toBe('in-progress')
    })

    it('given validatedHash matches the file on disk, when get is called, then artifact status is complete', async () => {
      const content = '# Proposal\n'
      const hash = sha256(content)
      const change = makeChangeWithArtifact('c1', hash)
      await ctx.repo.save(change)
      const dir = path.join(ctx.changesPath, '20240115-100000-c1')
      await fs.writeFile(path.join(dir, 'proposal.md'), content, 'utf8')

      const loaded = await ctx.repo.get('c1')
      expect(loaded?.getArtifact('proposal')?.status).toBe('complete')
    })

    it('given validatedHash does not match the file on disk, when get is called, then artifact status is drifted-pending-review', async () => {
      const change = makeChangeWithArtifact('c1', sha256('original content'))
      await ctx.repo.save(change)
      const dir = path.join(ctx.changesPath, '20240115-100000-c1')
      await fs.writeFile(path.join(dir, 'proposal.md'), 'modified content', 'utf8')

      const loaded = await ctx.repo.get('c1')
      expect(loaded?.state).toBe('designing')
      expect(loaded?.getArtifact('proposal')?.status).toBe('drifted-pending-review')

      const reloaded = await ctx.repo.get('c1')
      expect(reloaded?.state).toBe('designing')
      expect(reloaded?.getArtifact('proposal')?.status).toBe('drifted-pending-review')
      expect(reloaded?.history.filter((event) => event.type === 'invalidated')).toHaveLength(1)
    })

    it('given a drifted file is later revalidated, when get is called again, then it stays complete without a second invalidation', async () => {
      const updatedContent = 'modified content'
      const updatedHash = sha256(updatedContent)
      const change = makeChangeWithArtifact('c1', sha256('original content'))
      await ctx.repo.save(change)
      const dir = path.join(ctx.changesPath, '20240115-100000-c1')
      await fs.writeFile(path.join(dir, 'proposal.md'), updatedContent, 'utf8')

      const drifted = await ctx.repo.get('c1')
      expect(drifted?.state).toBe('designing')
      expect(drifted?.getArtifact('proposal')?.status).toBe('drifted-pending-review')
      expect(drifted?.history.filter((event) => event.type === 'invalidated')).toHaveLength(1)

      expect(drifted).not.toBeNull()
      drifted!.getArtifact('proposal')?.markComplete('proposal', updatedHash)
      await ctx.repo.save(drifted!)

      const reloaded = await ctx.repo.get('c1')
      expect(reloaded?.state).toBe('designing')
      expect(reloaded?.getArtifact('proposal')?.status).toBe('complete')
      expect(reloaded?.getArtifact('proposal')?.getFile('proposal')?.validatedHash).toBe(
        updatedHash,
      )
      expect(reloaded?.history.filter((event) => event.type === 'invalidated')).toHaveLength(1)
    })

    it('given validatedHash is __skipped__ and optional, when get is called, then artifact status is skipped', async () => {
      const change = makeChange('c1')
      change.setArtifact(
        new ChangeArtifact({
          type: 'proposal',
          optional: true,
          requires: [],
          files: new Map([
            [
              'proposal',
              new ArtifactFile({
                key: 'proposal',
                filename: 'proposal.md',
                validatedHash: '__skipped__',
              }),
            ],
          ]),
        }),
      )
      await ctx.repo.save(change)

      const loaded = await ctx.repo.get('c1')
      expect(loaded?.getArtifact('proposal')?.status).toBe('skipped')
    })

    it('given validatedHash is __skipped__ but not optional, when get is called, then artifact status is in-progress', async () => {
      const change = makeChangeWithArtifact('c1', '__skipped__')
      await ctx.repo.save(change)

      const loaded = await ctx.repo.get('c1')
      expect(loaded?.getArtifact('proposal')?.status).toBe('in-progress')
    })

    it('given tasks artifact type with preHashCleanup, when get is called on a change where task checklist progress was updated, then the artifact status remains complete', async () => {
      const tasksType = new ArtifactType({
        id: 'tasks',
        scope: 'change',
        output: 'tasks.md',
        hasTasks: true,
        requires: [],
        validations: [],
        deltaValidations: [],
        preHashCleanup: [
          {
            id: 'normalize-checkboxes',
            pattern: '^([ \\t]*-\\s+)\\[x\\]',
            replacement: '$1[ ]',
          },
        ],
      })

      const repoWithResolver = new FsChangeRepository({
        workspace: 'default',
        ownership: 'owned',
        isExternal: false,
        configPath: ctx.configPath,
        changesPath: ctx.changesPath,
        draftsPath: ctx.draftsPath,
        discardedPath: ctx.discardedPath,
        resolveArtifactTypes: async () => [tasksType],
      })

      const initialContent = '- [ ] Task 1\n'
      const { applyPreHashCleanup } =
        await import('../../../src/domain/services/pre-hash-cleanup.js')
      const cleaned = applyPreHashCleanup(initialContent, tasksType.preHashCleanup)
      const validatedHash = sha256(cleaned)

      const change = makeChange('c1')
      change.setArtifact(
        new ChangeArtifact({
          type: 'tasks',
          optional: false,
          requires: [],
          files: new Map([
            [
              'tasks',
              new ArtifactFile({
                key: 'tasks',
                filename: 'tasks.md',
                status: 'complete',
                validatedHash,
              }),
            ],
          ]),
        }),
      )

      await repoWithResolver.save(change)

      const dir = path.join(ctx.changesPath, '20240115-100000-c1')
      await fs.writeFile(path.join(dir, 'tasks.md'), '- [x] Task 1\n', 'utf8')

      const loaded = await repoWithResolver.get('c1')
      expect(loaded?.getArtifact('tasks')?.status).toBe('complete')
    })
  })

  describe('artifact()', () => {
    it('given a file present in the change directory, when artifact is called, then the content and originalHash are returned', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)
      const dir = path.join(ctx.changesPath, '20240115-100000-add-auth')
      const content = '# Proposal content\n'
      await fs.writeFile(path.join(dir, 'proposal.md'), content, 'utf8')

      const result = await ctx.repo.artifact(change, 'proposal.md')
      expect(result).not.toBeNull()
      expect(result?.content).toBe(content)
      expect(result?.originalHash).toBe(sha256(content))
    })

    it('given a file absent, when artifact is called, then null is returned', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)

      const result = await ctx.repo.artifact(change, 'nonexistent.md')
      expect(result).toBeNull()
    })

    it('given a change directory does not exist, when artifact is called, then null is returned', async () => {
      const change = makeChange('ghost')
      const result = await ctx.repo.artifact(change, 'proposal.md')
      expect(result).toBeNull()
    })

    it('given a file present, when artifact is called, then originalHash equals sha256 of file content', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)
      const dir = path.join(ctx.changesPath, '20240115-100000-add-auth')
      const content = 'Hello world'
      await fs.writeFile(path.join(dir, 'spec.md'), content, 'utf8')

      const result = await ctx.repo.artifact(change, 'spec.md')
      expect(result?.originalHash).toBe(sha256(content))
    })
  })

  describe('saveArtifact()', () => {
    it('given an artifact loaded via artifact(), when the file has not changed, then saveArtifact succeeds', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)
      const dir = path.join(ctx.changesPath, '20240115-100000-add-auth')
      const content = '# Original\n'
      await fs.writeFile(path.join(dir, 'proposal.md'), content, 'utf8')

      const loaded = await ctx.repo.artifact(change, 'proposal.md')
      const updated = new SpecArtifact('proposal.md', '# Updated\n', loaded?.originalHash)
      await expect(ctx.repo.saveArtifact(change, updated)).resolves.not.toThrow()

      const written = await fs.readFile(path.join(dir, 'proposal.md'), 'utf8')
      expect(written).toBe('# Updated\n')
    })

    it('given a concurrent write changed the file on disk, when saveArtifact is called, then ArtifactConflictError is thrown', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)
      const dir = path.join(ctx.changesPath, '20240115-100000-add-auth')
      await fs.writeFile(path.join(dir, 'proposal.md'), '# Original\n', 'utf8')

      // Load with the original hash
      const loaded = await ctx.repo.artifact(change, 'proposal.md')

      // Simulate concurrent write
      await fs.writeFile(path.join(dir, 'proposal.md'), '# Concurrent write\n', 'utf8')

      const updated = new SpecArtifact('proposal.md', '# My changes\n', loaded?.originalHash)
      await expect(ctx.repo.saveArtifact(change, updated)).rejects.toThrow(ArtifactConflictError)
    })

    it('given an outdated originalHash and force is true, when saveArtifact is called, then the file is overwritten', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)
      const dir = path.join(ctx.changesPath, '20240115-100000-add-auth')
      await fs.writeFile(path.join(dir, 'proposal.md'), '# Original\n', 'utf8')

      const loaded = await ctx.repo.artifact(change, 'proposal.md')
      // Concurrent write changes the file
      await fs.writeFile(path.join(dir, 'proposal.md'), '# Concurrent\n', 'utf8')

      const updated = new SpecArtifact('proposal.md', '# Forced write\n', loaded?.originalHash)
      await expect(ctx.repo.saveArtifact(change, updated, { force: true })).resolves.not.toThrow()

      const written = await fs.readFile(path.join(dir, 'proposal.md'), 'utf8')
      expect(written).toBe('# Forced write\n')
    })

    it('given a brand-new artifact with no originalHash, when saveArtifact is called, then it writes without conflict checking', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)

      const artifact = new SpecArtifact('proposal.md', '# New content\n')
      await expect(ctx.repo.saveArtifact(change, artifact)).resolves.not.toThrow()

      const dir = path.join(ctx.changesPath, '20240115-100000-add-auth')
      const written = await fs.readFile(path.join(dir, 'proposal.md'), 'utf8')
      expect(written).toBe('# New content\n')
    })

    it('given a tracked artifact file marked complete, when saveArtifact is called, then the in-memory artifact resets to in-progress', async () => {
      const content = '# Original\n'
      const hash = sha256(content)
      const change = makeChange('save-artifact-status')
      change.setArtifact(
        new ChangeArtifact({
          type: 'proposal',
          optional: false,
          requires: [],
          files: new Map([
            [
              'proposal',
              new ArtifactFile({
                key: 'proposal',
                filename: 'proposal.md',
                status: 'complete',
                validatedHash: hash,
              }),
            ],
          ]),
        }),
      )
      await ctx.repo.save(change)
      const dir = path.join(ctx.changesPath, '20240115-100000-save-artifact-status')
      await fs.writeFile(path.join(dir, 'proposal.md'), content, 'utf8')

      const loaded = await ctx.repo.artifact(change, 'proposal.md')
      const updated = new SpecArtifact('proposal.md', '# Updated\n', loaded?.originalHash)
      await ctx.repo.saveArtifact(change, updated)

      expect(change.getArtifact('proposal')?.status).toBe('in-progress')
      expect(change.getArtifact('proposal')?.getFile('proposal')?.status).toBe('in-progress')
    })

    it('given no change directory exists, when saveArtifact is called, then an error is thrown', async () => {
      const change = makeChange('ghost')
      const artifact = new SpecArtifact('proposal.md', '# Content\n')
      await expect(ctx.repo.saveArtifact(change, artifact)).rejects.toBeInstanceOf(
        ChangeNotFoundError,
      )
    })
  })

  describe('atomic write', () => {
    it('given a valid change, when save is called, then no temp files remain in the directory', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)

      const dir = path.join(ctx.changesPath, '20240115-100000-add-auth')
      const entries = await fs.readdir(dir)
      const tmpFiles = entries.filter((e) => e.startsWith('manifest.json.tmp-'))
      expect(tmpFiles).toHaveLength(0)
      expect(entries).toContain('manifest.json')
    })

    it('given a valid change, when save is called, then manifest.json contains valid JSON', async () => {
      const change = makeChange('add-auth')
      change.transition('designing', actor)
      await ctx.repo.save(change)

      const dir = path.join(ctx.changesPath, '20240115-100000-add-auth')
      const raw = await fs.readFile(path.join(dir, 'manifest.json'), 'utf8')
      expect(() => {
        JSON.parse(raw)
      }).not.toThrow()

      const parsed = JSON.parse(raw) as Record<string, unknown>
      expect(parsed['name']).toBe('add-auth')
      expect(parsed['workspaces']).toBeUndefined()
      expect(Array.isArray(parsed['history'])).toBe(true)
    })
  })

  describe('artifactExists', () => {
    it('given a saved change with an artifact file, returns true', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)

      // Write a file directly to simulate an artifact
      const dir = path.join(ctx.changesPath, '20240115-100000-add-auth')
      await fs.writeFile(path.join(dir, 'spec.md'), '# Spec', 'utf8')

      expect(await ctx.repo.artifactExists(change, 'spec.md')).toBe(true)
    })

    it('given a saved change without the artifact file, returns false', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)

      expect(await ctx.repo.artifactExists(change, 'spec.md')).toBe(false)
    })

    it('given no change directory, returns false', async () => {
      const change = makeChange('nonexistent')
      expect(await ctx.repo.artifactExists(change, 'spec.md')).toBe(false)
    })

    it('given an untracked artifact filename, when artifactExists is called, then the repository contract error is preserved', async () => {
      const change = makeChange('tracked-only-artifacts')
      change.setArtifact(
        new ChangeArtifact({
          type: 'proposal',
          optional: false,
          requires: [],
          files: new Map([
            ['proposal', new ArtifactFile({ key: 'proposal', filename: 'proposal.md' })],
          ]),
        }),
      )
      await ctx.repo.save(change)

      await expect(ctx.repo.artifactExists(change, 'spec.md')).rejects.toThrow()
    })
  })

  describe('deltaExists', () => {
    it('given a saved change with a delta file, returns true', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)

      const dir = path.join(ctx.changesPath, '20240115-100000-add-auth')
      const deltaDir = path.join(dir, 'deltas', 'auth/login')
      await fs.mkdir(deltaDir, { recursive: true })
      await fs.writeFile(path.join(deltaDir, 'spec.delta.yaml'), 'delta: true', 'utf8')

      expect(await ctx.repo.deltaExists(change, 'auth/login', 'spec.delta.yaml')).toBe(true)
    })

    it('given a saved change without the delta file, returns false', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)

      expect(await ctx.repo.deltaExists(change, 'auth/login', 'spec.delta.yaml')).toBe(false)
    })

    it('given no change directory, returns false', async () => {
      const change = makeChange('nonexistent')
      expect(await ctx.repo.deltaExists(change, 'auth/login', 'spec.delta.yaml')).toBe(false)
    })
  })

  describe('specDependsOn round-trip', () => {
    it('given a change with specDependsOn, when saved and loaded, then specDependsOn is preserved', async () => {
      const change = makeChange('add-auth')
      change.setSpecDependsOn('auth/login', ['auth/shared', 'auth/jwt'])
      await ctx.repo.save(change)

      const loaded = await ctx.repo.get('add-auth')
      expect(loaded).not.toBeNull()
      expect([...loaded!.specDependsOn.entries()]).toEqual([
        ['auth/login', ['auth/shared', 'auth/jwt']],
      ])
    })

    it('given a change without specDependsOn, when saved and loaded, then specDependsOn is empty', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)

      const loaded = await ctx.repo.get('add-auth')
      expect(loaded).not.toBeNull()
      expect(loaded!.specDependsOn.size).toBe(0)
    })

    it('given a change with specDependsOn, when saved, then manifest.json omits specDependsOn when empty', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)

      const dir = path.join(ctx.changesPath, '20240115-100000-add-auth')
      const raw = await fs.readFile(path.join(dir, 'manifest.json'), 'utf8')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      expect(parsed['specDependsOn']).toBeUndefined()
    })

    it('given a change with specDependsOn, when saved, then manifest.json includes specDependsOn as a record', async () => {
      const change = makeChange('add-auth')
      change.setSpecDependsOn('auth/login', ['auth/shared'])
      await ctx.repo.save(change)

      const dir = path.join(ctx.changesPath, '20240115-100000-add-auth')
      const raw = await fs.readFile(path.join(dir, 'manifest.json'), 'utf8')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      expect(parsed['specDependsOn']).toEqual({ 'auth/login': ['auth/shared'] })
    })
  })

  describe('event serialization', () => {
    it('given a change with optional event fields, when saved and loaded, then optional fields are preserved', async () => {
      const change = makeChange('add-auth')
      change.draft(actor, 'parking for now')
      change.restore(actor)
      change.discard('superseded', actor, ['new-auth'])
      await ctx.repo.save(change)

      // Discarded changes are excluded from get() — use listDiscarded()
      const discarded = await ctx.repo.listDiscarded()
      const loaded = discarded.find((c) => c.name === 'add-auth')
      expect(loaded).toBeDefined()
      const draftedEvent = loaded?.history.find((e) => e.type === 'drafted')
      expect(draftedEvent?.type === 'drafted' && draftedEvent.reason).toBe('parking for now')
      const discardedEvent = loaded?.history.find((e) => e.type === 'discarded')
      expect(discardedEvent?.type === 'discarded' && discardedEvent.supersededBy).toEqual([
        'new-auth',
      ])
    })

    it('given a change with artifact-skipped event, when saved and loaded, then artifact-skipped event is preserved', async () => {
      const change = makeChange('add-auth')
      change.setArtifact(
        new ChangeArtifact({
          type: 'design',
          optional: true,
          files: new Map([['design', new ArtifactFile({ key: 'design', filename: 'design.md' })]]),
        }),
      )
      change.recordArtifactSkipped('design', actor, 'not needed')
      await ctx.repo.save(change)

      const loaded = await ctx.repo.get('add-auth')
      const evt = loaded?.history.find((e) => e.type === 'artifact-skipped')
      expect(evt?.type === 'artifact-skipped' && evt.artifactId).toBe('design')
      expect(evt?.type === 'artifact-skipped' && evt.reason).toBe('not needed')
    })
  })

  describe('expected artifact filenames', () => {
    function makeSpecsArtifactType(): ArtifactType {
      return new ArtifactType({
        id: 'specs',
        scope: 'spec',
        output: 'specs/**/spec.md',
        delta: true,
        requires: [],
        validations: [],
        deltaValidations: [],
        preHashCleanup: [],
      })
    }

    function makeRepoWithArtifactSync(
      resolveSpecExists?: (specId: string) => Promise<boolean>,
    ): FsChangeRepository {
      return new FsChangeRepository({
        workspace: 'default',
        ownership: 'owned',
        isExternal: false,
        configPath: ctx.configPath,
        changesPath: ctx.changesPath,
        draftsPath: ctx.draftsPath,
        discardedPath: ctx.discardedPath,
        artifactTypes: [makeSpecsArtifactType()],
        ...(resolveSpecExists !== undefined ? { resolveSpecExists } : {}),
      })
    }

    function makeScopedChange(name: string, specIds: readonly string[]): Change {
      const at = new Date('2024-01-15T10:00:00.000Z')
      return new Change({
        name,
        createdAt: at,
        specIds,
        history: [
          {
            type: 'created',
            at,
            by: actor,
            specIds,
            schemaName: '@specd/schema-std',
            schemaVersion: 1,
          },
        ],
      })
    }

    it('persists delta filenames in manifest for existing specs', async () => {
      const repo = makeRepoWithArtifactSync(async (specId) => specId === 'default:auth/login')
      const change = makeScopedChange('existing-spec', ['default:auth/login'])

      await repo.save(change)

      const manifestPath = path.join(
        ctx.changesPath,
        '20240115-100000-existing-spec',
        'manifest.json',
      )
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {
        artifacts: Array<{ type: string; files: Array<{ filename: string }> }>
      }
      const specs = manifest.artifacts.find((artifact) => artifact.type === 'specs')
      expect(specs?.files[0]?.filename).toBe('deltas/default/auth/login/spec.md.delta.yaml')
    })

    it('normalizes legacy stale manifest filenames on load', async () => {
      const repo = makeRepoWithArtifactSync(async () => true)
      const change = makeScopedChange('legacy-stale', ['default:auth/login'])

      await repo.save(change)

      const manifestPath = path.join(
        ctx.changesPath,
        '20240115-100000-legacy-stale',
        'manifest.json',
      )
      const stale = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {
        artifacts: Array<{ type: string; files: Array<{ filename: string }> }>
      }
      const specs = stale.artifacts.find((artifact) => artifact.type === 'specs')
      if (specs === undefined || specs.files[0] === undefined) {
        throw new Error('missing specs artifact in manifest fixture')
      }
      specs.files[0].filename = 'specs/default/auth/login/spec.md'
      await fs.writeFile(manifestPath, `${JSON.stringify(stale, null, 2)}\n`, 'utf8')

      const loaded = await repo.get('legacy-stale')
      expect(loaded?.getArtifact('specs')?.getFile('default:auth/login')?.filename).toBe(
        'deltas/default/auth/login/spec.md.delta.yaml',
      )

      const normalized = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {
        artifacts: Array<{ type: string; files: Array<{ filename: string }> }>
      }
      const normalizedSpecs = normalized.artifacts.find((artifact) => artifact.type === 'specs')
      expect(normalizedSpecs?.files[0]?.filename).toBe(
        'deltas/default/auth/login/spec.md.delta.yaml',
      )
    })

    it('scaffold creates directories from expected filenames', async () => {
      const repo = makeRepoWithArtifactSync()
      const change = makeScopedChange('scaffold-expected', [
        'default:auth/login',
        'default:auth/register',
      ])

      await repo.save(change)
      await repo.scaffold(change, async (specId) => specId === 'default:auth/login')

      const baseDir = path.join(ctx.changesPath, '20240115-100000-scaffold-expected')
      await expect(
        fs.access(path.join(baseDir, 'deltas', 'default', 'auth', 'login')),
      ).resolves.toBeUndefined()
      await expect(
        fs.access(path.join(baseDir, 'specs', 'default', 'auth', 'register')),
      ).resolves.toBeUndefined()
    })
  })

  describe('preHashCleanup in status derivation', () => {
    function makeArtifactTypeWithCleanup(): ArtifactType {
      return new ArtifactType({
        id: 'tasks',
        scope: 'change',
        output: 'tasks.md',
        requires: [],
        validations: [],
        deltaValidations: [],
        preHashCleanup: [{ pattern: '^\\s*-\\s+\\[x\\]', replacement: '- [ ]' }],
      })
    }

    function makeArtifactTypeNoCleanup(): ArtifactType {
      return new ArtifactType({
        id: 'tasks',
        scope: 'change',
        output: 'tasks.md',
        requires: [],
        validations: [],
        deltaValidations: [],
        preHashCleanup: [],
      })
    }

    function makeRepoWithArtifactTypes(
      basePath: string,
      artifactTypes: readonly ArtifactType[],
    ): FsChangeRepository {
      return new FsChangeRepository({
        workspace: 'default',
        ownership: 'owned',
        isExternal: false,
        configPath: path.join(basePath, 'config'),
        changesPath: path.join(basePath, 'changes'),
        draftsPath: path.join(basePath, 'drafts'),
        discardedPath: path.join(basePath, 'discarded'),
        artifactTypes,
      })
    }

    function makeChangeWithTasks(name: string, validatedHash: string): Change {
      const at = new Date('2024-01-15T10:00:00.000Z')
      return new Change({
        name,
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
        artifacts: new Map([
          [
            'tasks',
            new ChangeArtifact({
              type: 'tasks',
              optional: false,
              requires: [],
              files: new Map([
                [
                  'tasks',
                  new ArtifactFile({
                    key: 'tasks',
                    filename: 'tasks.md',
                    validatedHash,
                  }),
                ],
              ]),
            }),
          ],
        ]),
      })
    }

    it('preHashCleanup-normalized edit preserves complete status', async () => {
      const originalContent = '- [ ] task one\n'
      // Hash is computed after cleanup — but original already has [ ], so hash = sha256(original)
      const cleanedHash = sha256(originalContent)

      const repo = makeRepoWithArtifactTypes(ctx.tmpDir, [makeArtifactTypeWithCleanup()])
      const change = makeChangeWithTasks('c1', cleanedHash)
      await repo.save(change)

      // Edit file to mark checkbox — cleanup normalizes [x] → [ ]
      const dir = path.join(ctx.changesPath, '20240115-100000-c1')
      await fs.writeFile(path.join(dir, 'tasks.md'), '- [x] task one\n', 'utf8')

      const loaded = await repo.get('c1')
      expect(loaded?.getArtifact('tasks')?.status).toBe('complete')
    })

    it('non-normalized edit triggers drifted-pending-review', async () => {
      const originalContent = '- [ ] task one\n'
      const cleanedHash = sha256(originalContent)

      const repo = makeRepoWithArtifactTypes(ctx.tmpDir, [makeArtifactTypeWithCleanup()])
      const change = makeChangeWithTasks('c1', cleanedHash)
      await repo.save(change)

      // Edit file with actual content change — cleanup can't normalize this
      const dir = path.join(ctx.changesPath, '20240115-100000-c1')
      await fs.writeFile(path.join(dir, 'tasks.md'), '- [ ] task one\n- [ ] task two\n', 'utf8')

      const loaded = await repo.get('c1')
      expect(loaded?.state).toBe('designing')
      expect(loaded?.getArtifact('tasks')?.status).toBe('drifted-pending-review')
    })

    it('no preHashCleanup rules hashes raw content', async () => {
      const content = '- [x] task one\n'
      const rawHash = sha256(content)

      const repo = makeRepoWithArtifactTypes(ctx.tmpDir, [makeArtifactTypeNoCleanup()])
      const change = makeChangeWithTasks('c1', rawHash)
      await repo.save(change)

      const dir = path.join(ctx.changesPath, '20240115-100000-c1')
      await fs.writeFile(path.join(dir, 'tasks.md'), content, 'utf8')

      const loaded = await repo.get('c1')
      expect(loaded?.getArtifact('tasks')?.status).toBe('complete')
    })
  })

  describe('auto-invalidation with drifted IDs', () => {
    function makeRepoWithTypes(
      basePath: string,
      artifactTypes: readonly ArtifactType[],
    ): FsChangeRepository {
      return new FsChangeRepository({
        workspace: 'default',
        ownership: 'owned',
        isExternal: false,
        configPath: path.join(basePath, 'config'),
        changesPath: path.join(basePath, 'changes'),
        draftsPath: path.join(basePath, 'drafts'),
        discardedPath: path.join(basePath, 'discarded'),
        artifactTypes,
      })
    }

    function makeArtifactTypes(): readonly ArtifactType[] {
      return [
        new ArtifactType({
          id: 'proposal',
          scope: 'change',
          output: 'proposal.md',
          requires: [],
          validations: [],
          deltaValidations: [],
          preHashCleanup: [],
        }),
        new ArtifactType({
          id: 'design',
          scope: 'change',
          output: 'design.md',
          requires: ['proposal'],
          validations: [],
          deltaValidations: [],
          preHashCleanup: [],
        }),
        new ArtifactType({
          id: 'tasks',
          scope: 'change',
          output: 'tasks.md',
          requires: ['design'],
          validations: [],
          deltaValidations: [],
          preHashCleanup: [],
        }),
      ]
    }

    it('single artifact drifts — only it and downstream are reset, upstream stays complete', async () => {
      const proposalContent = '# Proposal\n'
      const designContent = '# Design\n'
      const tasksContent = '# Tasks\n'
      const proposalHash = sha256(proposalContent)
      const designHash = sha256(designContent)
      const tasksHash = sha256(tasksContent)

      const at = new Date('2024-01-15T10:00:00.000Z')
      const change = new Change({
        name: 'c1',
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
          { type: 'transitioned', from: 'drafting', to: 'designing', at, by: actor },
          { type: 'transitioned', from: 'designing', to: 'ready', at, by: actor },
          { type: 'transitioned', from: 'ready', to: 'implementing', at, by: actor },
        ],
        artifacts: new Map([
          [
            'proposal',
            new ChangeArtifact({
              type: 'proposal',
              requires: [],
              files: new Map([
                [
                  'proposal',
                  new ArtifactFile({
                    key: 'proposal',
                    filename: 'proposal.md',
                    validatedHash: proposalHash,
                  }),
                ],
              ]),
            }),
          ],
          [
            'design',
            new ChangeArtifact({
              type: 'design',
              requires: ['proposal'],
              files: new Map([
                [
                  'design',
                  new ArtifactFile({
                    key: 'design',
                    filename: 'design.md',
                    validatedHash: designHash,
                  }),
                ],
              ]),
            }),
          ],
          [
            'tasks',
            new ChangeArtifact({
              type: 'tasks',
              requires: ['design'],
              files: new Map([
                [
                  'tasks',
                  new ArtifactFile({
                    key: 'tasks',
                    filename: 'tasks.md',
                    validatedHash: tasksHash,
                  }),
                ],
              ]),
            }),
          ],
        ]),
      })

      const repo = makeRepoWithTypes(ctx.tmpDir, makeArtifactTypes())
      await repo.save(change)

      // Write original content for proposal and design (no drift)
      const dir = path.join(ctx.changesPath, '20240115-100000-c1')
      await fs.writeFile(path.join(dir, 'proposal.md'), proposalContent, 'utf8')
      await fs.writeFile(path.join(dir, 'design.md'), designContent, 'utf8')
      // Write MODIFIED content for tasks (drift)
      await fs.writeFile(path.join(dir, 'tasks.md'), '# Tasks MODIFIED\n', 'utf8')

      const loaded = await repo.get('c1')

      // State should be rolled back to designing
      expect(loaded?.state).toBe('designing')
      // Proposal (upstream) should remain complete
      expect(loaded?.getArtifact('proposal')?.getFile('proposal')?.validatedHash).toBe(proposalHash)
      // Design (upstream of tasks) should remain complete
      expect(loaded?.getArtifact('design')?.getFile('design')?.validatedHash).toBe(designHash)
      expect(loaded?.getArtifact('tasks')?.getFile('tasks')?.validatedHash).toBe(tasksHash)
      expect(loaded?.getArtifact('tasks')?.status).toBe('drifted-pending-review')
    })

    it('upstream artifact drifts — it and all downstream are reset', async () => {
      const proposalContent = '# Proposal\n'
      const designContent = '# Design\n'
      const tasksContent = '# Tasks\n'
      const proposalHash = sha256(proposalContent)
      const designHash = sha256(designContent)
      const tasksHash = sha256(tasksContent)

      const at = new Date('2024-01-15T10:00:00.000Z')
      const change = new Change({
        name: 'c2',
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
          { type: 'transitioned', from: 'drafting', to: 'designing', at, by: actor },
          { type: 'transitioned', from: 'designing', to: 'ready', at, by: actor },
          { type: 'transitioned', from: 'ready', to: 'implementing', at, by: actor },
        ],
        artifacts: new Map([
          [
            'proposal',
            new ChangeArtifact({
              type: 'proposal',
              requires: [],
              files: new Map([
                [
                  'proposal',
                  new ArtifactFile({
                    key: 'proposal',
                    filename: 'proposal.md',
                    validatedHash: proposalHash,
                  }),
                ],
              ]),
            }),
          ],
          [
            'design',
            new ChangeArtifact({
              type: 'design',
              requires: ['proposal'],
              files: new Map([
                [
                  'design',
                  new ArtifactFile({
                    key: 'design',
                    filename: 'design.md',
                    validatedHash: designHash,
                  }),
                ],
              ]),
            }),
          ],
          [
            'tasks',
            new ChangeArtifact({
              type: 'tasks',
              requires: ['design'],
              files: new Map([
                [
                  'tasks',
                  new ArtifactFile({
                    key: 'tasks',
                    filename: 'tasks.md',
                    validatedHash: tasksHash,
                  }),
                ],
              ]),
            }),
          ],
        ]),
      })

      const repo = makeRepoWithTypes(ctx.tmpDir, makeArtifactTypes())
      await repo.save(change)

      const dir = path.join(ctx.changesPath, '20240115-100000-c2')
      await fs.writeFile(path.join(dir, 'proposal.md'), proposalContent, 'utf8')
      // Drift design — should move the whole change back to review, preserving drift on design
      await fs.writeFile(path.join(dir, 'design.md'), '# Design MODIFIED\n', 'utf8')
      await fs.writeFile(path.join(dir, 'tasks.md'), tasksContent, 'utf8')

      const loaded = await repo.get('c2')

      expect(loaded?.state).toBe('designing')
      expect(loaded?.getArtifact('proposal')?.status).toBe('complete')
      expect(loaded?.getArtifact('proposal')?.getFile('proposal')?.validatedHash).toBe(proposalHash)
      expect(loaded?.getArtifact('design')?.getFile('design')?.validatedHash).toBe(designHash)
      expect(loaded?.getArtifact('design')?.status).toBe('drifted-pending-review')
      expect(loaded?.getArtifact('tasks')?.getFile('tasks')?.validatedHash).toBe(tasksHash)
      expect(loaded?.getArtifact('tasks')?.status).toBe('pending-review')
    })

    it('no drift — no invalidation', async () => {
      const proposalContent = '# Proposal\n'
      const proposalHash = sha256(proposalContent)

      const at = new Date('2024-01-15T10:00:00.000Z')
      const change = new Change({
        name: 'c3',
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
          { type: 'transitioned', from: 'drafting', to: 'designing', at, by: actor },
          { type: 'transitioned', from: 'designing', to: 'ready', at, by: actor },
          { type: 'transitioned', from: 'ready', to: 'implementing', at, by: actor },
        ],
        artifacts: new Map([
          [
            'proposal',
            new ChangeArtifact({
              type: 'proposal',
              requires: [],
              files: new Map([
                [
                  'proposal',
                  new ArtifactFile({
                    key: 'proposal',
                    filename: 'proposal.md',
                    validatedHash: proposalHash,
                  }),
                ],
              ]),
            }),
          ],
        ]),
      })

      const repo = makeRepoWithTypes(ctx.tmpDir, [makeArtifactTypes()[0]!])
      await repo.save(change)

      const dir = path.join(ctx.changesPath, '20240115-100000-c3')
      await fs.writeFile(path.join(dir, 'proposal.md'), proposalContent, 'utf8')

      const loaded = await repo.get('c3')

      expect(loaded?.state).toBe('implementing')
      expect(loaded?.getArtifact('proposal')?.getFile('proposal')?.validatedHash).toBe(proposalHash)
    })

    it('excluded saved file does not self-invalidate during drift reconciliation', async () => {
      const proposalContent = '# Proposal\n'
      const proposalHash = sha256(proposalContent)

      const at = new Date('2024-01-15T10:00:00.000Z')
      const change = new Change({
        name: 'c3-excluded-drift',
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
          { type: 'transitioned', from: 'drafting', to: 'designing', at, by: actor },
          { type: 'transitioned', from: 'designing', to: 'ready', at, by: actor },
          { type: 'transitioned', from: 'ready', to: 'implementing', at, by: actor },
        ],
        artifacts: new Map([
          [
            'proposal',
            new ChangeArtifact({
              type: 'proposal',
              requires: [],
              files: new Map([
                [
                  'proposal',
                  new ArtifactFile({
                    key: 'proposal',
                    filename: 'proposal.md',
                    validatedHash: proposalHash,
                  }),
                ],
              ]),
            }),
          ],
        ]),
      })

      const repo = makeRepoWithTypes(ctx.tmpDir, [makeArtifactTypes()[0]!])
      await repo.save(change)

      const dir = path.join(ctx.changesPath, '20240115-100000-c3-excluded-drift')
      await fs.writeFile(path.join(dir, 'proposal.md'), '# Proposal updated\n', 'utf8')

      const invalidated = await repo.reconcileArtifactDrift(change, {
        excludeFileKeys: ['proposal'],
      })
      const manifestPath = path.join(dir, 'manifest.json')
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {
        history: Array<{ type: string }>
      }

      expect(invalidated).toBe(false)
      expect(change.state).toBe('implementing')
      expect(manifest.history.filter((event) => event.type === 'invalidated')).toHaveLength(0)
    })

    it('given an initialized repository and a change with a drifted artifact, when get is called, then the lock is acquired, the invalidation is persisted to disk, and the returned change reflects the invalidation', async () => {
      const proposalContent = '# Proposal\n'
      const proposalHash = sha256(proposalContent)

      const at = new Date('2024-01-15T10:00:00.000Z')
      const change = new Change({
        name: 'drift-lock-test',
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
          { type: 'transitioned', from: 'drafting', to: 'designing', at, by: actor },
          { type: 'transitioned', from: 'designing', to: 'ready', at, by: actor },
          { type: 'transitioned', from: 'ready', to: 'implementing', at, by: actor },
        ],
        artifacts: new Map([
          [
            'proposal',
            new ChangeArtifact({
              type: 'proposal',
              requires: [],
              files: new Map([
                [
                  'proposal',
                  new ArtifactFile({
                    key: 'proposal',
                    filename: 'proposal.md',
                    validatedHash: proposalHash,
                  }),
                ],
              ]),
            }),
          ],
        ]),
      })

      const repo = makeRepoWithTypes(ctx.tmpDir, makeArtifactTypes())
      await repo.save(change)

      const dir = path.join(ctx.changesPath, '20240115-100000-drift-lock-test')
      await fs.writeFile(path.join(dir, 'proposal.md'), 'DRIFTED CONTENT', 'utf8')

      let lockAcquisitions = 0
      const repoAsAny = repo as unknown as {
        _withChangeLock: (name: string, fn: () => Promise<unknown>) => Promise<unknown>
      }
      const originalLock = repoAsAny._withChangeLock.bind(repo)
      repoAsAny._withChangeLock = async (name: string, fn: () => Promise<unknown>) => {
        lockAcquisitions++
        return originalLock(name, fn)
      }

      const loaded = await repo.get('drift-lock-test')

      expect(lockAcquisitions).toBe(1)
      expect(loaded?.state).toBe('designing')

      const reloaded = await repo.get('drift-lock-test')
      expect(reloaded?.state).toBe(loaded?.state)
    })

    it('repeated get with unchanged drift scope does not rewrite manifest', async () => {
      const designContent = '# Design\n'
      const designHash = sha256(designContent)

      const at = new Date('2024-01-15T10:00:00.000Z')
      const change = new Change({
        name: 'c4',
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
          { type: 'transitioned', from: 'drafting', to: 'designing', at, by: actor },
          {
            type: 'invalidated',
            at,
            by: actor,
            cause: 'artifact-drift',
            message: 'drift',
            affectedArtifacts: [{ type: 'design', files: ['design'] }],
          },
        ],
        artifacts: new Map([
          [
            'design',
            new ChangeArtifact({
              type: 'design',
              requires: [],
              files: new Map([
                [
                  'design',
                  new ArtifactFile({
                    key: 'design',
                    filename: 'design.md',
                    validatedHash: designHash,
                    hasDrift: true,
                  }),
                ],
              ]),
            }),
          ],
        ]),
      })

      const repo = makeRepoWithTypes(ctx.tmpDir, [
        new ArtifactType({
          id: 'design',
          scope: 'change',
          output: 'design.md',
          requires: [],
          validations: [],
          deltaValidations: [],
          preHashCleanup: [],
        }),
      ])
      await repo.save(change)

      const dir = path.join(ctx.changesPath, '20240115-100000-c4')
      const manifestPath = path.join(dir, 'manifest.json')
      await fs.writeFile(path.join(dir, 'design.md'), '# Design MODIFIED\n', 'utf8')

      const first = await repo.get('c4')
      const firstManifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {
        history: unknown[]
      }
      const firstStat = await fs.stat(manifestPath)

      await new Promise((resolve) => setTimeout(resolve, 20))

      const second = await repo.get('c4')
      const secondManifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {
        history: unknown[]
      }
      const secondStat = await fs.stat(manifestPath)

      expect(first?.history).toHaveLength(second?.history.length ?? -1)
      expect(firstManifest.history).toHaveLength(secondManifest.history.length)
      expect(secondStat.mtimeMs).toBe(firstStat.mtimeMs)
    })
  })

  describe('unscaffold', () => {
    it('removes specs/ and deltas/ directories for a spec', async () => {
      const change = makeChange('remove-test')
      await ctx.repo.save(change)

      const dir = path.join(ctx.changesPath, '20240115-100000-remove-test')
      await fs.mkdir(path.join(dir, 'specs', 'default', 'auth', 'login'), { recursive: true })
      await fs.mkdir(path.join(dir, 'deltas', 'default', 'auth', 'login'), { recursive: true })

      await ctx.repo.unscaffold(change, ['default:auth/login'])

      await expect(fs.access(path.join(dir, 'specs', 'default', 'auth', 'login'))).rejects.toThrow()
      await expect(
        fs.access(path.join(dir, 'deltas', 'default', 'auth', 'login')),
      ).rejects.toThrow()
    })

    it('is idempotent when directory does not exist', async () => {
      const change = makeChange('remove-test')
      await ctx.repo.save(change)

      await expect(ctx.repo.unscaffold(change, ['default:auth/login'])).resolves.toBeUndefined()
    })

    it('removes directories containing files', async () => {
      const change = makeChange('remove-test')
      await ctx.repo.save(change)

      const dir = path.join(ctx.changesPath, '20240115-100000-remove-test')
      const specsDir = path.join(dir, 'specs', 'default', 'auth', 'login')
      await fs.mkdir(specsDir, { recursive: true })
      await fs.writeFile(path.join(specsDir, 'spec.md'), '# Spec\n', 'utf8')

      await ctx.repo.unscaffold(change, ['default:auth/login'])

      await expect(fs.access(specsDir)).rejects.toThrow()
      await expect(fs.access(path.join(specsDir, 'spec.md'))).rejects.toThrow()
    })

    it('removes empty parent directories up to the change root', async () => {
      const change = makeChange('remove-test')
      await ctx.repo.save(change)

      const dir = path.join(ctx.changesPath, '20240115-100000-remove-test')
      await fs.mkdir(path.join(dir, 'specs', 'default', 'core', 'compile-context'), {
        recursive: true,
      })
      await fs.mkdir(path.join(dir, 'deltas', 'default', 'core', 'compile-context'), {
        recursive: true,
      })

      await ctx.repo.unscaffold(change, ['default:core/compile-context'])

      await expect(
        fs.access(path.join(dir, 'specs', 'default', 'core', 'compile-context')),
      ).rejects.toThrow()
      await expect(fs.access(path.join(dir, 'specs', 'default', 'core'))).rejects.toThrow()
      await expect(fs.access(path.join(dir, 'specs', 'default'))).rejects.toThrow()
      await expect(fs.access(path.join(dir, 'deltas', 'default', 'core'))).rejects.toThrow()
      await expect(fs.access(path.join(dir, 'deltas', 'default'))).rejects.toThrow()
    })

    it('preserves non-empty parent directories', async () => {
      const change = makeChange('remove-test')
      await ctx.repo.save(change)

      const dir = path.join(ctx.changesPath, '20240115-100000-remove-test')
      await fs.mkdir(path.join(dir, 'specs', 'default', 'core', 'compile-context'), {
        recursive: true,
      })
      await fs.mkdir(path.join(dir, 'specs', 'default', 'core', 'other-spec'), {
        recursive: true,
      })

      await ctx.repo.unscaffold(change, ['default:core/compile-context'])

      await expect(
        fs.access(path.join(dir, 'specs', 'default', 'core', 'compile-context')),
      ).rejects.toThrow()
      await expect(
        fs.access(path.join(dir, 'specs', 'default', 'core', 'other-spec')),
      ).resolves.toBeUndefined()
      await expect(fs.access(path.join(dir, 'specs', 'default', 'core'))).resolves.toBeUndefined()
    })

    it('never removes the change directory itself', async () => {
      const change = makeChange('remove-test')
      await ctx.repo.save(change)

      const dir = path.join(ctx.changesPath, '20240115-100000-remove-test')
      await fs.mkdir(path.join(dir, 'specs', 'default'), { recursive: true })

      await ctx.repo.unscaffold(change, ['default:'])

      await expect(fs.access(dir)).resolves.toBeUndefined()
    })
  })

  describe('invalidationPolicy round-trip', () => {
    it('persists default downstream when not set', async () => {
      const change = makeChange('c1')
      await ctx.repo.save(change)

      const loaded = await ctx.repo.get('c1')
      expect(loaded?.invalidationPolicy).toBe('downstream')
    })

    it('persists explicit surgical policy', async () => {
      const change = new Change({
        name: 'c1',
        createdAt: new Date('2024-01-15T10:00:00.000Z'),
        specIds: ['auth/login'],
        history: [
          {
            type: 'created',
            at: new Date('2024-01-15T10:00:00.000Z'),
            by: actor,
            specIds: ['auth/login'],
            schemaName: '@specd/schema-std',
            schemaVersion: 1,
          },
        ],
        artifacts: new Map(),
        invalidationPolicy: 'surgical',
      })
      await ctx.repo.save(change)

      const loaded = await ctx.repo.get('c1')
      expect(loaded?.invalidationPolicy).toBe('surgical')
    })

    it('persists none policy', async () => {
      const change = new Change({
        name: 'c1',
        createdAt: new Date('2024-01-15T10:00:00.000Z'),
        specIds: ['auth/login'],
        history: [
          {
            type: 'created',
            at: new Date('2024-01-15T10:00:00.000Z'),
            by: actor,
            specIds: ['auth/login'],
            schemaName: '@specd/schema-std',
            schemaVersion: 1,
          },
        ],
        artifacts: new Map(),
        invalidationPolicy: 'none',
      })
      await ctx.repo.save(change)

      const loaded = await ctx.repo.get('c1')
      expect(loaded?.invalidationPolicy).toBe('none')
    })

    it('persists global policy', async () => {
      const change = new Change({
        name: 'c1',
        createdAt: new Date('2024-01-15T10:00:00.000Z'),
        specIds: ['auth/login'],
        history: [
          {
            type: 'created',
            at: new Date('2024-01-15T10:00:00.000Z'),
            by: actor,
            specIds: ['auth/login'],
            schemaName: '@specd/schema-std',
            schemaVersion: 1,
          },
        ],
        artifacts: new Map(),
        invalidationPolicy: 'global',
      })
      await ctx.repo.save(change)

      const loaded = await ctx.repo.get('c1')
      expect(loaded?.invalidationPolicy).toBe('global')
    })
  })

  describe('hasDrift round-trip', () => {
    it('persists hasDrift true on a file', async () => {
      const change = makeChange('c1')
      change.setArtifact(
        new ChangeArtifact({
          type: 'proposal',
          requires: [],
          files: new Map([
            [
              'proposal',
              new ArtifactFile({
                key: 'proposal',
                filename: 'proposal.md',
                status: 'drifted-pending-review',
                validatedHash: 'sha256:abc',
                hasDrift: true,
              }),
            ],
          ]),
        }),
      )
      await ctx.repo.save(change)

      const loaded = await ctx.repo.get('c1')
      const file = loaded?.getArtifact('proposal')?.getFile('proposal')
      expect(file?.hasDrift).toBe(true)
      expect(file?.status).toBe('drifted-pending-review')
    })

    it('omits hasDrift from manifest when false', async () => {
      const change = makeChange('c1')
      change.setArtifact(
        new ChangeArtifact({
          type: 'proposal',
          requires: [],
          files: new Map([
            [
              'proposal',
              new ArtifactFile({
                key: 'proposal',
                filename: 'proposal.md',
                status: 'complete',
                validatedHash: 'sha256:abc',
              }),
            ],
          ]),
        }),
      )
      await ctx.repo.save(change)

      const dir = path.join(ctx.changesPath, '20240115-100000-c1')
      const raw = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'))
      const proposalFile = raw.artifacts[0].files[0]
      expect(proposalFile.hasDrift).toBeUndefined()
    })
  })

  describe('load-time drift by policy', () => {
    function makeRepoWithChain(basePath: string): FsChangeRepository {
      return new FsChangeRepository({
        workspace: 'default',
        ownership: 'owned',
        isExternal: false,
        configPath: path.join(basePath, 'config'),
        changesPath: path.join(basePath, 'changes'),
        draftsPath: path.join(basePath, 'drafts'),
        discardedPath: path.join(basePath, 'discarded'),
        artifactTypes: [
          new ArtifactType({
            id: 'proposal',
            scope: 'change',
            output: 'proposal.md',
            requires: [],
            validations: [],
            deltaValidations: [],
            preHashCleanup: [],
          }),
          new ArtifactType({
            id: 'design',
            scope: 'change',
            output: 'design.md',
            requires: ['proposal'],
            validations: [],
            deltaValidations: [],
            preHashCleanup: [],
          }),
          new ArtifactType({
            id: 'tasks',
            scope: 'change',
            output: 'tasks.md',
            requires: ['design'],
            validations: [],
            deltaValidations: [],
            preHashCleanup: [],
          }),
        ],
      })
    }

    it('none policy: state does not roll back on drift', async () => {
      const content = '# Proposal\n'
      const hash = sha256(content)
      const at = new Date('2024-01-15T10:00:00.000Z')
      const change = new Change({
        name: 'c1',
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
          { type: 'transitioned', from: 'drafting', to: 'designing', at, by: actor },
          { type: 'transitioned', from: 'designing', to: 'ready', at, by: actor },
          { type: 'transitioned', from: 'ready', to: 'implementing', at, by: actor },
        ],
        artifacts: new Map([
          [
            'proposal',
            new ChangeArtifact({
              type: 'proposal',
              requires: [],
              files: new Map([
                [
                  'proposal',
                  new ArtifactFile({
                    key: 'proposal',
                    filename: 'proposal.md',
                    validatedHash: hash,
                    status: 'complete',
                  }),
                ],
              ]),
            }),
          ],
        ]),
        invalidationPolicy: 'none',
      })
      const repo = makeRepoWithChain(ctx.tmpDir)
      await repo.save(change)

      const dir = path.join(ctx.changesPath, '20240115-100000-c1')
      await fs.writeFile(path.join(dir, 'proposal.md'), 'MODIFIED', 'utf8')

      const loaded = await repo.get('c1')
      expect(loaded?.state).toBe('designing')
      expect(loaded?.getArtifact('proposal')?.status).toBe('complete')
      expect(loaded?.getArtifact('proposal')?.getFile('proposal')?.hasDrift).toBe(true)
    })

    it('surgical policy: only drifted file is reopened', async () => {
      const proposalContent = '# Proposal\n'
      const designContent = '# Design\n'
      const proposalHash = sha256(proposalContent)
      const designHash = sha256(designContent)
      const at = new Date('2024-01-15T10:00:00.000Z')
      const change = new Change({
        name: 'c2',
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
          { type: 'transitioned', from: 'drafting', to: 'designing', at, by: actor },
          { type: 'transitioned', from: 'designing', to: 'ready', at, by: actor },
          { type: 'transitioned', from: 'ready', to: 'implementing', at, by: actor },
        ],
        artifacts: new Map([
          [
            'proposal',
            new ChangeArtifact({
              type: 'proposal',
              requires: [],
              files: new Map([
                [
                  'proposal',
                  new ArtifactFile({
                    key: 'proposal',
                    filename: 'proposal.md',
                    validatedHash: proposalHash,
                  }),
                ],
              ]),
            }),
          ],
          [
            'design',
            new ChangeArtifact({
              type: 'design',
              requires: ['proposal'],
              files: new Map([
                [
                  'design',
                  new ArtifactFile({
                    key: 'design',
                    filename: 'design.md',
                    validatedHash: designHash,
                  }),
                ],
              ]),
            }),
          ],
        ]),
        invalidationPolicy: 'surgical',
      })
      const repo = makeRepoWithChain(ctx.tmpDir)
      await repo.save(change)

      const dir = path.join(ctx.changesPath, '20240115-100000-c2')
      await fs.writeFile(path.join(dir, 'proposal.md'), proposalContent, 'utf8')
      await fs.writeFile(path.join(dir, 'design.md'), 'MODIFIED', 'utf8')

      const loaded = await repo.get('c2')
      expect(loaded?.state).toBe('designing')
      expect(loaded?.getArtifact('proposal')?.status).toBe('complete')
      expect(loaded?.getArtifact('design')?.status).toBe('drifted-pending-review')
    })

    it('global policy: all artifacts are reopened on drift', async () => {
      const proposalContent = '# Proposal\n'
      const designContent = '# Design\n'
      const proposalHash = sha256(proposalContent)
      const designHash = sha256(designContent)
      const at = new Date('2024-01-15T10:00:00.000Z')
      const change = new Change({
        name: 'c3',
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
          { type: 'transitioned', from: 'drafting', to: 'designing', at, by: actor },
          { type: 'transitioned', from: 'designing', to: 'ready', at, by: actor },
          { type: 'transitioned', from: 'ready', to: 'implementing', at, by: actor },
        ],
        artifacts: new Map([
          [
            'proposal',
            new ChangeArtifact({
              type: 'proposal',
              requires: [],
              files: new Map([
                [
                  'proposal',
                  new ArtifactFile({
                    key: 'proposal',
                    filename: 'proposal.md',
                    validatedHash: proposalHash,
                  }),
                ],
              ]),
            }),
          ],
          [
            'design',
            new ChangeArtifact({
              type: 'design',
              requires: ['proposal'],
              files: new Map([
                [
                  'design',
                  new ArtifactFile({
                    key: 'design',
                    filename: 'design.md',
                    validatedHash: designHash,
                  }),
                ],
              ]),
            }),
          ],
        ]),
        invalidationPolicy: 'global',
      })
      const repo = makeRepoWithChain(ctx.tmpDir)
      await repo.save(change)

      const dir = path.join(ctx.changesPath, '20240115-100000-c3')
      await fs.writeFile(path.join(dir, 'proposal.md'), proposalContent, 'utf8')
      await fs.writeFile(path.join(dir, 'design.md'), 'MODIFIED', 'utf8')

      const loaded = await repo.get('c3')
      expect(loaded?.state).toBe('designing')
      expect(loaded?.getArtifact('proposal')?.status).toBe('pending-review')
      expect(loaded?.getArtifact('design')?.status).toBe('drifted-pending-review')
    })

    it('given an uninitialized repository (no artifactTypes) and a change with a drifted artifact, when get is called, then no invalidation occurs and no manifest is written to disk', async () => {
      const content = '# Proposal\n'
      const hash = sha256(content)
      const at = new Date('2024-01-15T10:00:00.000Z')

      // Uninitialized repo: artifactTypes not provided
      const uninitRepo = new FsChangeRepository({
        workspace: 'default',
        ownership: 'owned',
        isExternal: false,
        configPath: ctx.configPath,
        changesPath: ctx.changesPath,
        draftsPath: ctx.draftsPath,
        discardedPath: ctx.discardedPath,
      })

      const change = new Change({
        name: 'uninit-drift-test',
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
          { type: 'transitioned', from: 'drafting', to: 'designing', at, by: actor },
          { type: 'transitioned', from: 'designing', to: 'ready', at, by: actor },
          { type: 'transitioned', from: 'ready', to: 'implementing', at, by: actor },
        ],
        artifacts: new Map([
          [
            'proposal',
            new ChangeArtifact({
              type: 'proposal',
              requires: [],
              files: new Map([
                [
                  'proposal',
                  new ArtifactFile({
                    key: 'proposal',
                    filename: 'proposal.md',
                    validatedHash: hash,
                  }),
                ],
              ]),
            }),
          ],
        ]),
      })

      // Use an initialized repo just to persist the initial manifest
      const initRepo = new FsChangeRepository({
        workspace: 'default',
        ownership: 'owned',
        isExternal: false,
        configPath: ctx.configPath,
        changesPath: ctx.changesPath,
        draftsPath: ctx.draftsPath,
        discardedPath: ctx.discardedPath,
        artifactTypes: [
          new ArtifactType({
            id: 'proposal',
            scope: 'change',
            output: 'proposal.md',
            requires: [],
            validations: [],
            deltaValidations: [],
            preHashCleanup: [],
          }),
        ],
      })
      await initRepo.save(change)

      const dir = path.join(ctx.changesPath, '20240115-100000-uninit-drift-test')

      // Capture the manifest content before the read
      const manifestBefore = await fs.readFile(path.join(dir, 'manifest.json'), 'utf8')

      // Drift the file — mismatches the stored hash
      await fs.writeFile(path.join(dir, 'proposal.md'), 'DRIFTED CONTENT', 'utf8')

      // Read via uninitialized repo — must bypass drift detection entirely
      const loaded = await uninitRepo.get('uninit-drift-test')

      // State must be unchanged (no invalidation)
      expect(loaded?.state).toBe('implementing')

      // Manifest must not have been rewritten
      const manifestAfter = await fs.readFile(path.join(dir, 'manifest.json'), 'utf8')
      expect(manifestAfter).toBe(manifestBefore)
    })
  })

  describe('compliance validations', () => {
    it('throws SchemaMismatchError when schema name differs from active schema', async () => {
      const change = makeChange('c-schema-mismatch')
      await ctx.repo.save(change)

      const repo = new FsChangeRepository({
        workspace: 'default',
        ownership: 'owned',
        isExternal: false,
        configPath: ctx.configPath,
        changesPath: ctx.changesPath,
        draftsPath: ctx.draftsPath,
        discardedPath: ctx.discardedPath,
        activeSchema: { name: 'different-schema', version: 1 },
      })

      await expect(repo.get('c-schema-mismatch')).rejects.toThrow(SchemaMismatchError)
    })

    it('logs a warning when schema version differs from active schema', async () => {
      const change = makeChange('c-version-mismatch')
      await ctx.repo.save(change)

      const repo = new FsChangeRepository({
        workspace: 'default',
        ownership: 'owned',
        isExternal: false,
        configPath: ctx.configPath,
        changesPath: ctx.changesPath,
        draftsPath: ctx.draftsPath,
        discardedPath: ctx.discardedPath,
        activeSchema: { name: '@specd/schema-std', version: 2 },
      })

      const warnSpy = vi.spyOn(Logger, 'warn')
      await repo.get('c-version-mismatch')
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('created with schema version 1 but the active schema version is 2'),
      )
    })

    it('preserves tracked-intent by not flipping filename when hash is null', async () => {
      const type = new ArtifactType({
        id: 'specs',
        scope: 'spec',
        output: 'specs/**/spec.md',
        optional: false,
        requires: [],
        format: 'markdown',
        validations: [],
        deltaValidations: [],
        preHashCleanup: [],
      })

      const repo = new FsChangeRepository({
        workspace: 'default',
        ownership: 'owned',
        isExternal: false,
        configPath: ctx.configPath,
        changesPath: ctx.changesPath,
        draftsPath: ctx.draftsPath,
        discardedPath: ctx.discardedPath,
        artifactTypes: [type],
        // Mock resolver to simulate spec existing (which would normally trigger a flip to delta)
        resolveSpecExists: async () => true,
      })

      const change = new Change({
        name: 'c-normalization',
        createdAt: new Date('2024-01-15T10:00:00.000Z'),
        specIds: ['core:auth'],
        history: [
          {
            type: 'created',
            at: new Date('2024-01-15T10:00:00.000Z'),
            by: actor,
            specIds: ['core:auth'],
            schemaName: '@specd/schema-std',
            schemaVersion: 1,
          },
        ],
        artifacts: new Map([
          [
            'specs',
            new ChangeArtifact({
              type: 'specs',
              optional: false,
              requires: [],
              status: 'in-progress',
              files: new Map([
                [
                  'core:auth',
                  new ArtifactFile({
                    key: 'core:auth',
                    filename: 'specs/core/auth/spec.md',
                    status: 'in-progress',
                    // validatedHash is intentionally undefined (null in manifest)
                  }),
                ],
              ]),
            }),
          ],
        ]),
      })

      await repo.save(change)

      const loaded = await repo.get('c-normalization')
      const file = loaded?.getArtifact('specs')?.getFile('core:auth')

      // Even though the spec exists (per resolveSpecExists), the filename should NOT
      // have flipped to deltas/ because the hash is null (it's unvalidated).
      expect(file?.filename).toBe('specs/core/auth/spec.md')
    })
  })
})
