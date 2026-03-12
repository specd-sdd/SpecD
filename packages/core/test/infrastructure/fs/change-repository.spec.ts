import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Change } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { type ActorIdentity } from '../../../src/domain/entities/change.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import { ArtifactConflictError } from '../../../src/domain/errors/artifact-conflict-error.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { FsChangeRepository } from '../../../src/infrastructure/fs/change-repository.js'
import { sha256 } from '../../../src/infrastructure/fs/hash.js'

const actor: ActorIdentity = { name: 'Alice', email: 'alice@example.com' }

// ---- Setup / teardown helpers ----

interface RepoContext {
  repo: FsChangeRepository
  tmpDir: string
  changesPath: string
  draftsPath: string
  discardedPath: string
}

async function setupRepo(): Promise<RepoContext> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-test-'))
  const changesPath = path.join(tmpDir, 'changes')
  const draftsPath = path.join(tmpDir, 'drafts')
  const discardedPath = path.join(tmpDir, 'discarded')
  await fs.mkdir(changesPath, { recursive: true })
  await fs.mkdir(draftsPath, { recursive: true })
  await fs.mkdir(discardedPath, { recursive: true })

  const repo = new FsChangeRepository({
    workspace: 'default',
    ownership: 'owned',
    isExternal: false,
    changesPath,
    draftsPath,
    discardedPath,
  })

  return { repo, tmpDir, changesPath, draftsPath, discardedPath }
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

    it('given a saved change, when save is called again with updated history, then the manifest is updated', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)

      change.transition('designing', actor)
      await ctx.repo.save(change)

      const loaded = await ctx.repo.get('add-auth')
      expect(loaded?.state).toBe('designing')
    })
  })

  describe('save — directory movement', () => {
    it('given a change in changes/, when drafted and saved, then directory is moved to drafts/', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)

      change.draft(actor, 'parking for now')
      await ctx.repo.save(change)

      const changesEntries = await fs.readdir(ctx.changesPath)
      const draftsEntries = await fs.readdir(ctx.draftsPath)
      expect(changesEntries).toHaveLength(0)
      expect(draftsEntries).toHaveLength(1)
    })

    it('given a drafted change, when restored and saved, then directory is moved back to changes/', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)
      change.draft(actor)
      await ctx.repo.save(change)

      change.restore(actor)
      await ctx.repo.save(change)

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

  describe('get — finds drafted changes', () => {
    it('given a drafted change, when get is called, then the change is returned from drafts/', async () => {
      const change = makeChange('add-auth')
      await ctx.repo.save(change)
      change.draft(actor)
      await ctx.repo.save(change)

      const loaded = await ctx.repo.get('add-auth')
      expect(loaded).not.toBeNull()
      expect(loaded?.isDrafted).toBe(true)
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
      drafted.draft(actor)
      await ctx.repo.save(drafted)

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
    function makeChangeWithArtifact(name: string, validatedHash: string | null): Change {
      const change = makeChange(name)
      change.setArtifact(
        new ChangeArtifact({
          type: 'proposal',
          filename: 'proposal.md',
          optional: false,
          requires: [],
          ...(validatedHash !== null ? { validatedHash } : {}),
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

    it('given validatedHash does not match the file on disk, when get is called, then artifact status is in-progress', async () => {
      const change = makeChangeWithArtifact('c1', sha256('original content'))
      await ctx.repo.save(change)
      const dir = path.join(ctx.changesPath, '20240115-100000-c1')
      await fs.writeFile(path.join(dir, 'proposal.md'), 'modified content', 'utf8')

      const loaded = await ctx.repo.get('c1')
      expect(loaded?.getArtifact('proposal')?.status).toBe('in-progress')
    })

    it('given validatedHash is __skipped__ and optional, when get is called, then artifact status is skipped', async () => {
      const change = makeChange('c1')
      change.setArtifact(
        new ChangeArtifact({
          type: 'proposal',
          filename: 'proposal.md',
          optional: true,
          requires: [],
          validatedHash: '__skipped__',
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
        new ChangeArtifact({ type: 'design', filename: 'design.md', optional: true }),
      )
      change.recordArtifactSkipped('design', actor, 'not needed')
      await ctx.repo.save(change)

      const loaded = await ctx.repo.get('add-auth')
      const evt = loaded?.history.find((e) => e.type === 'artifact-skipped')
      expect(evt?.type === 'artifact-skipped' && evt.artifactId).toBe('design')
      expect(evt?.type === 'artifact-skipped' && evt.reason).toBe('not needed')
    })
  })
})
