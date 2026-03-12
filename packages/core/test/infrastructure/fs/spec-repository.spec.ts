import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import { ArtifactConflictError } from '../../../src/domain/errors/artifact-conflict-error.js'
import { FsSpecRepository } from '../../../src/infrastructure/fs/spec-repository.js'
import { sha256 } from '../../../src/infrastructure/fs/hash.js'

// ---- Setup / teardown helpers ----

interface RepoContext {
  repo: FsSpecRepository
  specsPath: string
  tmpDir: string
}

async function setupRepo(): Promise<RepoContext> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-spec-test-'))
  const specsPath = path.join(tmpDir, 'specs')
  await fs.mkdir(specsPath, { recursive: true })

  const repo = new FsSpecRepository({
    workspace: 'default',
    ownership: 'owned',
    isExternal: false,
    specsPath,
  })

  return { repo, specsPath, tmpDir }
}

async function cleanupRepo(ctx: RepoContext): Promise<void> {
  await fs.rm(ctx.tmpDir, { recursive: true, force: true })
}

/** Writes a file under specsPath directly to set up pre-existing state. */
async function writeSpecFile(
  ctx: RepoContext,
  specStr: string,
  filename: string,
  content: string,
): Promise<void> {
  const dir = path.join(ctx.specsPath, ...specStr.split('/'))
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, filename), content, 'utf8')
}

/** Reads a file under specsPath directly. */
async function readSpecFile(ctx: RepoContext, specStr: string, filename: string): Promise<string> {
  const dir = path.join(ctx.specsPath, ...specStr.split('/'))
  return fs.readFile(path.join(dir, filename), 'utf8')
}

function makeSpec(ctx: RepoContext, specStr: string, filenames: string[]): Spec {
  return new Spec('default', SpecPath.parse(specStr), filenames)
}

// ---- Tests ----

describe('FsSpecRepository', () => {
  let ctx: RepoContext

  beforeEach(async () => {
    ctx = await setupRepo()
  })

  afterEach(async () => {
    await cleanupRepo(ctx)
  })

  // ---- get ----

  describe('get', () => {
    it('returns null when spec directory does not exist', async () => {
      const result = await ctx.repo.get(SpecPath.parse('auth/login'))
      expect(result).toBeNull()
    })

    it('returns spec metadata when directory exists with files', async () => {
      await writeSpecFile(ctx, 'auth/login', 'spec.md', '# Login spec')

      const result = await ctx.repo.get(SpecPath.parse('auth/login'))

      expect(result).not.toBeNull()
      expect(result!.name.toString()).toBe('auth/login')
      expect(result!.workspace).toBe('default')
      expect(result!.filenames).toContain('spec.md')
    })

    it('lists only files (not subdirectories) in filenames', async () => {
      await writeSpecFile(ctx, 'auth/login', 'spec.md', 'content')
      await writeSpecFile(ctx, 'auth/login', 'proposal.md', 'content')
      // create a subdirectory
      await fs.mkdir(path.join(ctx.specsPath, 'auth', 'login', 'subdir'), { recursive: true })

      const result = await ctx.repo.get(SpecPath.parse('auth/login'))

      expect(result!.filenames).toContain('spec.md')
      expect(result!.filenames).toContain('proposal.md')
      expect(result!.filenames).not.toContain('subdir')
    })

    it('returns spec with multiple artifact files', async () => {
      await writeSpecFile(ctx, 'billing/invoices', 'spec.md', 'spec content')
      await writeSpecFile(ctx, 'billing/invoices', 'verify.md', 'verify content')

      const result = await ctx.repo.get(SpecPath.parse('billing/invoices'))

      expect(result!.filenames).toHaveLength(2)
      expect(result!.filenames).toContain('spec.md')
      expect(result!.filenames).toContain('verify.md')
    })

    it('handles deep nested spec paths', async () => {
      await writeSpecFile(ctx, 'a/b/c/d', 'spec.md', 'deep spec')

      const result = await ctx.repo.get(SpecPath.parse('a/b/c/d'))

      expect(result).not.toBeNull()
      expect(result!.name.toString()).toBe('a/b/c/d')
    })
  })

  // ---- list ----

  describe('list', () => {
    it('returns empty array when specsPath is empty', async () => {
      const results = await ctx.repo.list()
      expect(results).toHaveLength(0)
    })

    it('discovers a single spec', async () => {
      await writeSpecFile(ctx, 'auth/login', 'spec.md', 'content')

      const results = await ctx.repo.list()

      expect(results).toHaveLength(1)
      expect(results[0]!.name.toString()).toBe('auth/login')
    })

    it('discovers multiple specs at different depths', async () => {
      await writeSpecFile(ctx, 'auth/login', 'spec.md', 'content')
      await writeSpecFile(ctx, 'billing/invoices', 'spec.md', 'content')
      await writeSpecFile(ctx, 'billing/payments', 'spec.md', 'content')

      const results = await ctx.repo.list()

      const names = results.map((s) => s.name.toString()).sort()
      expect(names).toEqual(['auth/login', 'billing/invoices', 'billing/payments'])
    })

    it('skips intermediate directories that contain only subdirectories', async () => {
      // 'auth' directory only has 'login' subdirectory — should not appear as a spec
      await writeSpecFile(ctx, 'auth/login', 'spec.md', 'content')

      const results = await ctx.repo.list()

      const names = results.map((s) => s.name.toString())
      expect(names).not.toContain('auth')
      expect(names).toContain('auth/login')
    })

    it('filters by prefix when provided', async () => {
      await writeSpecFile(ctx, 'auth/login', 'spec.md', 'content')
      await writeSpecFile(ctx, 'auth/oauth', 'spec.md', 'content')
      await writeSpecFile(ctx, 'billing/invoices', 'spec.md', 'content')

      const results = await ctx.repo.list(SpecPath.parse('auth'))

      const names = results.map((s) => s.name.toString()).sort()
      expect(names).toEqual(['auth/login', 'auth/oauth'])
    })

    it('returns empty when prefix matches no specs', async () => {
      await writeSpecFile(ctx, 'auth/login', 'spec.md', 'content')

      const results = await ctx.repo.list(SpecPath.parse('billing'))

      expect(results).toHaveLength(0)
    })

    it('includes filenames in discovered specs', async () => {
      await writeSpecFile(ctx, 'auth/login', 'spec.md', 'content')
      await writeSpecFile(ctx, 'auth/login', 'verify.md', 'content')

      const results = await ctx.repo.list()

      expect(results[0]!.filenames).toContain('spec.md')
      expect(results[0]!.filenames).toContain('verify.md')
    })
  })

  // ---- artifact ----

  describe('artifact', () => {
    it('returns null when file does not exist', async () => {
      const spec = makeSpec(ctx, 'auth/login', [])

      const result = await ctx.repo.artifact(spec, 'spec.md')

      expect(result).toBeNull()
    })

    it('returns artifact with content and originalHash', async () => {
      const content = '# Login spec\n\nContent here.'
      await writeSpecFile(ctx, 'auth/login', 'spec.md', content)
      const spec = makeSpec(ctx, 'auth/login', ['spec.md'])

      const result = await ctx.repo.artifact(spec, 'spec.md')

      expect(result).not.toBeNull()
      expect(result!.filename).toBe('spec.md')
      expect(result!.content).toBe(content)
      expect(result!.originalHash).toBe(sha256(content))
    })

    it('loads the correct file when multiple artifacts exist', async () => {
      await writeSpecFile(ctx, 'auth/login', 'spec.md', 'spec content')
      await writeSpecFile(ctx, 'auth/login', 'verify.md', 'verify content')
      const spec = makeSpec(ctx, 'auth/login', ['spec.md', 'verify.md'])

      const result = await ctx.repo.artifact(spec, 'verify.md')

      expect(result!.content).toBe('verify content')
    })
  })

  // ---- save ----

  describe('save', () => {
    it('creates the spec directory and writes the file', async () => {
      const spec = makeSpec(ctx, 'auth/login', [])
      const artifact = new SpecArtifact('spec.md', '# Login')

      await ctx.repo.save(spec, artifact)

      const written = await readSpecFile(ctx, 'auth/login', 'spec.md')
      expect(written).toBe('# Login')
    })

    it('overwrites existing file without conflict check when no originalHash', async () => {
      await writeSpecFile(ctx, 'auth/login', 'spec.md', 'original')
      const spec = makeSpec(ctx, 'auth/login', ['spec.md'])
      const artifact = new SpecArtifact('spec.md', 'updated')

      await ctx.repo.save(spec, artifact)

      const written = await readSpecFile(ctx, 'auth/login', 'spec.md')
      expect(written).toBe('updated')
    })

    it('saves successfully when file matches originalHash', async () => {
      const original = 'original content'
      await writeSpecFile(ctx, 'auth/login', 'spec.md', original)
      const spec = makeSpec(ctx, 'auth/login', ['spec.md'])
      const artifact = new SpecArtifact('spec.md', 'updated content', sha256(original))

      await ctx.repo.save(spec, artifact)

      const written = await readSpecFile(ctx, 'auth/login', 'spec.md')
      expect(written).toBe('updated content')
    })

    it('throws ArtifactConflictError when file was modified since load', async () => {
      await writeSpecFile(ctx, 'auth/login', 'spec.md', 'modified by someone else')
      const spec = makeSpec(ctx, 'auth/login', ['spec.md'])
      // originalHash was computed against the old content
      const artifact = new SpecArtifact('spec.md', 'my update', sha256('old content'))

      await expect(ctx.repo.save(spec, artifact)).rejects.toBeInstanceOf(ArtifactConflictError)
    })

    it('overwrites despite hash mismatch when force is true', async () => {
      await writeSpecFile(ctx, 'auth/login', 'spec.md', 'modified by someone else')
      const spec = makeSpec(ctx, 'auth/login', ['spec.md'])
      const artifact = new SpecArtifact('spec.md', 'forced update', sha256('old content'))

      await ctx.repo.save(spec, artifact, { force: true })

      const written = await readSpecFile(ctx, 'auth/login', 'spec.md')
      expect(written).toBe('forced update')
    })

    it('treats missing file as empty string for conflict check', async () => {
      // The spec dir exists but the file does not — originalHash of '' should match
      await fs.mkdir(path.join(ctx.specsPath, 'auth', 'login'), { recursive: true })
      const spec = makeSpec(ctx, 'auth/login', [])
      const artifact = new SpecArtifact('spec.md', 'new file', sha256(''))

      await ctx.repo.save(spec, artifact)

      const written = await readSpecFile(ctx, 'auth/login', 'spec.md')
      expect(written).toBe('new file')
    })

    it('rejects new file creation when originalHash is set and does not match empty', async () => {
      await fs.mkdir(path.join(ctx.specsPath, 'auth', 'login'), { recursive: true })
      const spec = makeSpec(ctx, 'auth/login', [])
      // originalHash is of some non-empty content, but file doesn't exist
      const artifact = new SpecArtifact('spec.md', 'content', sha256('something else'))

      await expect(ctx.repo.save(spec, artifact)).rejects.toBeInstanceOf(ArtifactConflictError)
    })
  })

  // ---- prefix ----

  describe('prefix', () => {
    let prefixCtx: RepoContext

    beforeEach(async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-spec-prefix-'))
      const specsPath = path.join(tmpDir, 'specs')
      await fs.mkdir(specsPath, { recursive: true })

      const repo = new FsSpecRepository({
        workspace: 'default',
        ownership: 'owned',
        isExternal: false,
        specsPath,
        prefix: '_global',
      })

      prefixCtx = { repo, specsPath, tmpDir }
    })

    afterEach(async () => {
      await cleanupRepo(prefixCtx)
    })

    it('list() returns prefixed paths', async () => {
      await writeSpecFile(prefixCtx, 'architecture', 'spec.md', '# Architecture')
      await writeSpecFile(prefixCtx, 'conventions', 'spec.md', '# Conventions')

      const results = await prefixCtx.repo.list()

      const names = results.map((s) => s.name.toString()).sort()
      expect(names).toEqual(['_global/architecture', '_global/conventions'])
    })

    it('get() strips prefix for fs lookup', async () => {
      await writeSpecFile(prefixCtx, 'architecture', 'spec.md', '# Architecture')

      const result = await prefixCtx.repo.get(SpecPath.parse('_global/architecture'))

      expect(result).not.toBeNull()
      expect(result!.name.toString()).toBe('_global/architecture')
      expect(result!.filenames).toContain('spec.md')
    })

    it('artifact() strips prefix for fs lookup', async () => {
      const content = '# Architecture spec'
      await writeSpecFile(prefixCtx, 'architecture', 'spec.md', content)
      const spec = new Spec('default', SpecPath.parse('_global/architecture'), ['spec.md'])

      const result = await prefixCtx.repo.artifact(spec, 'spec.md')

      expect(result).not.toBeNull()
      expect(result!.content).toBe(content)
    })

    it('save() strips prefix for fs write', async () => {
      const spec = new Spec('default', SpecPath.parse('_global/testing'), [])
      const artifact = new SpecArtifact('spec.md', '# Testing')

      await prefixCtx.repo.save(spec, artifact)

      const written = await readSpecFile(prefixCtx, 'testing', 'spec.md')
      expect(written).toBe('# Testing')
    })

    it('delete() strips prefix for fs removal', async () => {
      await writeSpecFile(prefixCtx, 'testing', 'spec.md', 'content')
      const spec = new Spec('default', SpecPath.parse('_global/testing'), ['spec.md'])

      await prefixCtx.repo.delete(spec)

      const dirExists = await fs
        .access(path.join(prefixCtx.specsPath, 'testing'))
        .then(() => true)
        .catch(() => false)
      expect(dirExists).toBe(false)
    })

    it('no prefix = current behavior unchanged', async () => {
      // ctx from the outer describe has no prefix
      await writeSpecFile(ctx, 'auth/login', 'spec.md', 'content')

      const results = await ctx.repo.list()

      expect(results[0]!.name.toString()).toBe('auth/login')
    })

    it('multi-segment prefix works correctly', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-spec-multiprefix-'))
      const specsPath = path.join(tmpDir, 'specs')
      await fs.mkdir(specsPath, { recursive: true })

      const repo = new FsSpecRepository({
        workspace: 'shared',
        ownership: 'readOnly',
        isExternal: false,
        specsPath,
        prefix: 'team_1/shared',
      })

      const multiCtx: RepoContext = { repo, specsPath, tmpDir }
      try {
        await writeSpecFile(multiCtx, 'auth/login', 'spec.md', '# Login')

        const results = await repo.list()
        expect(results[0]!.name.toString()).toBe('team_1/shared/auth/login')

        const spec = await repo.get(SpecPath.parse('team_1/shared/auth/login'))
        expect(spec).not.toBeNull()
        expect(spec!.filenames).toContain('spec.md')
      } finally {
        await cleanupRepo(multiCtx)
      }
    })
  })

  // ---- resolveFromPath ----

  describe('resolveFromPath', () => {
    it('given a path under specsPath, returns specPath and specId', async () => {
      await writeSpecFile(ctx, 'auth/login', 'spec.md', '# Login')

      const result = await ctx.repo.resolveFromPath(path.join(ctx.specsPath, 'auth', 'login'))

      expect(result).not.toBeNull()
      expect(result!.specPath.toString()).toBe('auth/login')
      expect(result!.specId).toBe('default:auth/login')
    })

    it('given a file path, resolves to the parent directory', async () => {
      await writeSpecFile(ctx, 'auth/login', 'spec.md', '# Login')

      const result = await ctx.repo.resolveFromPath(
        path.join(ctx.specsPath, 'auth', 'login', 'spec.md'),
      )

      expect(result).not.toBeNull()
      expect(result!.specPath.toString()).toBe('auth/login')
    })

    it('given a path not under specsPath, returns null', async () => {
      const result = await ctx.repo.resolveFromPath('/some/other/path')

      expect(result).toBeNull()
    })

    it('given specsPath itself, returns null', async () => {
      const result = await ctx.repo.resolveFromPath(ctx.specsPath)

      expect(result).toBeNull()
    })

    it('given a non-existent path, returns null', async () => {
      const result = await ctx.repo.resolveFromPath(path.join(ctx.specsPath, 'nonexistent', 'spec'))

      expect(result).toBeNull()
    })

    it('given a prefix-configured repo, prepends prefix segments', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-spec-resolve-'))
      const specsPath = path.join(tmpDir, 'specs')
      await fs.mkdir(specsPath, { recursive: true })

      const repo = new FsSpecRepository({
        workspace: 'core',
        ownership: 'owned',
        isExternal: false,
        specsPath,
        prefix: 'core',
      })

      // Write a spec at specs/change/
      const specDir = path.join(specsPath, 'change')
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, 'spec.md'), '# Change', 'utf8')

      const result = await repo.resolveFromPath(path.join(specsPath, 'change'))

      expect(result).not.toBeNull()
      expect(result!.specPath.toString()).toBe('core/change')
      expect(result!.specId).toBe('core:core/change')

      await fs.rm(tmpDir, { recursive: true, force: true })
    })

    it('given a partial match of specsPath (e.g. specs-extra), returns null', async () => {
      // The specsPath is <tmpDir>/specs, so <tmpDir>/specs-extra should NOT match
      const result = await ctx.repo.resolveFromPath(ctx.specsPath + '-extra/something')

      expect(result).toBeNull()
    })

    it('given a relative path with from, resolves to sibling spec', async () => {
      const from = SpecPath.parse('auth/login')
      const result = await ctx.repo.resolveFromPath('../signup/spec.md', from)

      expect(result).not.toBeNull()
      expect(result!.specPath.toString()).toBe('auth/signup')
      expect(result!.specId).toBe('default:auth/signup')
    })

    it('given a relative path with anchor fragment, strips anchor', async () => {
      const from = SpecPath.parse('auth/login')
      const result = await ctx.repo.resolveFromPath('../signup/spec.md#overview', from)

      expect(result).not.toBeNull()
      expect(result!.specPath.toString()).toBe('auth/signup')
    })

    it('given a relative path without from, returns null', async () => {
      const result = await ctx.repo.resolveFromPath('../signup/spec.md')

      expect(result).toBeNull()
    })

    it('given a non-matching relative path, returns null', async () => {
      const from = SpecPath.parse('auth/login')
      const result = await ctx.repo.resolveFromPath('./local-file.md', from)

      expect(result).toBeNull()
    })

    it('given a relative path with prefix-configured repo, prepends prefix', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-spec-resolve-'))
      const specsPath = path.join(tmpDir, 'specs')
      await fs.mkdir(specsPath, { recursive: true })

      const repo = new FsSpecRepository({
        workspace: 'core',
        ownership: 'owned',
        isExternal: false,
        specsPath,
        prefix: 'core',
      })

      const from = SpecPath.parse('core/change')
      const result = await repo.resolveFromPath('../storage/spec.md', from)

      expect(result).not.toBeNull()
      expect(result!.specPath.toString()).toBe('core/storage')
      expect(result!.specId).toBe('core:core/storage')

      await fs.rm(tmpDir, { recursive: true, force: true })
    })
  })

  // ---- delete ----

  describe('delete', () => {
    it('removes the spec directory and all its files', async () => {
      await writeSpecFile(ctx, 'auth/login', 'spec.md', 'content')
      await writeSpecFile(ctx, 'auth/login', 'verify.md', 'content')
      const spec = makeSpec(ctx, 'auth/login', ['spec.md', 'verify.md'])

      await ctx.repo.delete(spec)

      const dirExists = await fs
        .access(path.join(ctx.specsPath, 'auth', 'login'))
        .then(() => true)
        .catch(() => false)
      expect(dirExists).toBe(false)
    })

    it('no-ops silently when spec directory does not exist', async () => {
      const spec = makeSpec(ctx, 'nonexistent/spec', [])

      await expect(ctx.repo.delete(spec)).resolves.toBeUndefined()
    })

    it('leaves sibling specs untouched', async () => {
      await writeSpecFile(ctx, 'auth/login', 'spec.md', 'content')
      await writeSpecFile(ctx, 'auth/oauth', 'spec.md', 'content')
      const loginSpec = makeSpec(ctx, 'auth/login', ['spec.md'])

      await ctx.repo.delete(loginSpec)

      const oauthExists = await fs
        .access(path.join(ctx.specsPath, 'auth', 'oauth', 'spec.md'))
        .then(() => true)
        .catch(() => false)
      expect(oauthExists).toBe(true)
    })
  })
})
