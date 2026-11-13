import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  findPackageManifest,
  findManifestField,
  type ManifestInspection,
} from '../../../src/infrastructure/tree-sitter/find-manifest-field.js'

describe('findPackageManifest', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'specd-find-manifest-')))
  })

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup errors
    }
  })

  it('Manifest above the code root inside the repository is found', () => {
    // Given a repo root with a manifest and a nested code root
    const repoRoot = path.join(tempDir, 'repo')
    const codeRoot = path.join(repoRoot, 'packages', 'core', 'src')
    mkdirSync(codeRoot, { recursive: true })
    const manifestPath = path.join(repoRoot, 'packages', 'core', 'package.json')
    writeFileSync(manifestPath, JSON.stringify({ name: '@scope/core' }), 'utf-8')

    // When searching for package.json from codeRoot bounded by repoRoot
    const result = findPackageManifest(
      codeRoot,
      'package.json',
      (content) => {
        const pkg = JSON.parse(content) as { name?: string }
        return pkg.name === '@scope/core' ? { kind: 'match', value: pkg } : { kind: 'skip' }
      },
      repoRoot,
    )

    // Then it finds the manifest at packages/core
    expect(result.match).toBeDefined()
    expect(result.match?.packageRoot).toBe(path.join(repoRoot, 'packages', 'core'))
    expect(result.match?.manifestPath).toBe(manifestPath)
    expect(result.skipped).toEqual([])
  })

  it('Search stops at the repository root', () => {
    // Given a manifest above the repository root and none inside
    const outsideRepo = tempDir
    const repoRoot = path.join(tempDir, 'repo')
    const codeRoot = path.join(repoRoot, 'src')
    mkdirSync(codeRoot, { recursive: true })
    writeFileSync(
      path.join(outsideRepo, 'package.json'),
      JSON.stringify({ name: 'outside' }),
      'utf-8',
    )

    // When searching from codeRoot bounded by repoRoot
    const result = findPackageManifest(
      codeRoot,
      'package.json',
      () => ({ kind: 'match', value: true }),
      repoRoot,
    )

    // Then search stops at repoRoot and returns undefined
    expect(result.match).toBeUndefined()
  })

  it('External code root uses its own repository boundary', () => {
    // Given an external workspace in a separate repository sibling directory
    const extRepo = path.join(tempDir, 'external-repo')
    const extCodeRoot = path.join(extRepo, 'lib', 'src')
    mkdirSync(extCodeRoot, { recursive: true })
    const manifestPath = path.join(extRepo, 'lib', 'package.json')
    writeFileSync(manifestPath, JSON.stringify({ name: '@ext/lib' }), 'utf-8')

    // When searching using extRepo as repoRoot
    const result = findPackageManifest(
      extCodeRoot,
      'package.json',
      (content) => {
        const pkg = JSON.parse(content) as { name?: string }
        return pkg.name === '@ext/lib' ? { kind: 'match', value: pkg } : { kind: 'skip' }
      },
      extRepo,
    )

    // Then it finds the manifest within external repo boundary
    expect(result.match).toBeDefined()
    expect(result.match?.packageRoot).toBe(path.join(extRepo, 'lib'))
    expect(result.match?.manifestPath).toBe(manifestPath)
  })

  it('No repoRoot inspects only the code root', () => {
    // Given a manifest in parent directory but none in code root
    const parentDir = path.join(tempDir, 'workspace')
    const codeRoot = path.join(parentDir, 'src')
    mkdirSync(codeRoot, { recursive: true })
    writeFileSync(
      path.join(parentDir, 'package.json'),
      JSON.stringify({ name: 'parent-pkg' }),
      'utf-8',
    )

    // When searching without repoRoot
    const result = findPackageManifest(
      codeRoot,
      'package.json',
      () => ({ kind: 'match', value: true }),
      undefined,
    )

    // Then parent is not searched
    expect(result.match).toBeUndefined()

    // But if manifest is in codeRoot, it is found
    writeFileSync(
      path.join(codeRoot, 'package.json'),
      JSON.stringify({ name: 'code-root-pkg' }),
      'utf-8',
    )
    const resultInside = findPackageManifest(
      codeRoot,
      'package.json',
      () => ({ kind: 'match', value: true }),
      undefined,
    )
    expect(resultInside.match).toBeDefined()
    expect(resultInside.match?.packageRoot).toBe(codeRoot)
  })

  it('Nameless manifest is skipped and reported', () => {
    // Given a nearest manifest without name and a higher valid manifest
    const repoRoot = path.join(tempDir, 'repo')
    const innerDir = path.join(repoRoot, 'pkg', 'sub')
    mkdirSync(innerDir, { recursive: true })

    const innerManifest = path.join(innerDir, 'package.json')
    writeFileSync(innerManifest, JSON.stringify({ version: '1.0.0' }), 'utf-8')

    const rootManifest = path.join(repoRoot, 'package.json')
    writeFileSync(rootManifest, JSON.stringify({ name: 'root-pkg' }), 'utf-8')

    // When searching from innerDir
    const result = findPackageManifest(
      innerDir,
      'package.json',
      (content) => {
        try {
          const parsed = JSON.parse(content) as { name?: string }
          return typeof parsed.name === 'string' && parsed.name !== ''
            ? { kind: 'match', value: parsed.name }
            : { kind: 'skip' }
        } catch {
          return { kind: 'skip' }
        }
      },
      repoRoot,
    )

    // Then the inner manifest is skipped and the outer is returned
    expect(result.match).toBeDefined()
    expect(result.match?.packageRoot).toBe(repoRoot)
    expect(result.skipped).toContain(innerManifest)
  })

  it('Symlinked and trailing-separator code roots are canonicalized', () => {
    const repoRoot = path.join(tempDir, 'repo')
    const realCodeRoot = path.join(repoRoot, 'packages', 'core')
    mkdirSync(realCodeRoot, { recursive: true })
    const manifestPath = path.join(realCodeRoot, 'package.json')
    writeFileSync(manifestPath, JSON.stringify({ name: 'canonical-pkg' }), 'utf-8')

    // Test trailing separator
    const codeRootWithSlash = `${realCodeRoot}${path.sep}`
    const matchTrailing = findPackageManifest(
      codeRootWithSlash,
      'package.json',
      () => ({ kind: 'match', value: true }),
      repoRoot,
    )
    expect(matchTrailing.match?.packageRoot).toBe(realCodeRoot)

    // Test symlink if platform allows
    const symlinkCodeRoot = path.join(tempDir, 'linked-core')
    let symlinkCreated = false
    try {
      symlinkSync(realCodeRoot, symlinkCodeRoot, 'dir')
      symlinkCreated = true
    } catch {
      // Symlinks might require admin privileges on Windows
    }

    if (symlinkCreated) {
      const matchSymlink = findPackageManifest(
        symlinkCodeRoot,
        'package.json',
        () => ({ kind: 'match', value: true }),
        repoRoot,
      )
      expect(matchSymlink.match?.packageRoot).toBe(realCodeRoot)
    }
  })

  it('Code root outside the supplied boundary collapses to the code root and never reaches filesystem root', () => {
    // Given an unrelated boundary that doesn't contain codeRoot
    const unrelatedBoundary = path.join(tempDir, 'unrelated-boundary')
    mkdirSync(unrelatedBoundary, { recursive: true })

    const parentDir = path.join(tempDir, 'workspace')
    const codeRoot = path.join(parentDir, 'src')
    mkdirSync(codeRoot, { recursive: true })

    // Put a manifest in parentDir
    writeFileSync(
      path.join(parentDir, 'package.json'),
      JSON.stringify({ name: 'outside' }),
      'utf-8',
    )

    // When searching from codeRoot with unrelatedBoundary
    const result = findPackageManifest(
      codeRoot,
      'package.json',
      () => ({ kind: 'match', value: true }),
      unrelatedBoundary,
    )

    // Then boundary collapses to codeRoot and parentDir is NOT searched
    expect(result.match).toBeUndefined()
  })

  it('findManifestField extracts field from matched manifest using findPackageManifest', () => {
    const repoRoot = path.join(tempDir, 'repo')
    const codeRoot = path.join(repoRoot, 'packages', 'lib')
    mkdirSync(codeRoot, { recursive: true })
    writeFileSync(
      path.join(repoRoot, 'package.json'),
      JSON.stringify({ name: 'monorepo-root' }),
      'utf-8',
    )

    const name = findManifestField(
      codeRoot,
      'package.json',
      (c) => (JSON.parse(c) as { name?: string }).name,
      repoRoot,
    )
    expect(name).toBe('monorepo-root')
  })

  it('Scenario: Terminal skipped manifest still reports its diagnostic', () => {
    // Given an unreadable or malformed manifest and no valid manifest
    const repoRoot = path.join(tempDir, 'repo')
    const codeRoot = path.join(repoRoot, 'src')
    mkdirSync(codeRoot, { recursive: true })
    const candidatePath = path.join(codeRoot, 'package.json')
    writeFileSync(candidatePath, '{ invalid json', 'utf-8')

    const result = findPackageManifest(codeRoot, 'package.json', () => ({ kind: 'skip' }), repoRoot)

    // When the walk reaches the boundary without a match, skipped contains the candidate
    expect(result.match).toBeUndefined()
    expect(result.skipped).toContain(candidatePath)
  })

  it('calls inspector exactly once per read manifest file and reuses parsed value', () => {
    const repoRoot = path.join(tempDir, 'repo')
    const codeRoot = path.join(repoRoot, 'packages', 'app')
    mkdirSync(codeRoot, { recursive: true })
    const manifestPath = path.join(codeRoot, 'package.json')
    writeFileSync(manifestPath, JSON.stringify({ name: 'parsed-value-app' }), 'utf-8')

    const inspector = vi.fn(
      (content: string): ManifestInspection<{ readonly parsedName: string }> => {
        const parsed = JSON.parse(content) as { name?: string }
        return { kind: 'match', value: { parsedName: parsed.name ?? '' } }
      },
    )

    const result = findPackageManifest(codeRoot, 'package.json', inspector, repoRoot)

    expect(inspector).toHaveBeenCalledTimes(1)
    expect(result.match?.value).toEqual({ parsedName: 'parsed-value-app' })
  })

  it('prefers match over fallback and appends displaced fallback to skipped', () => {
    const repoRoot = path.join(tempDir, 'repo')
    const childDir = path.join(repoRoot, 'packages', 'child')
    mkdirSync(childDir, { recursive: true })

    const childManifest = path.join(childDir, 'package.json')
    writeFileSync(childManifest, JSON.stringify({ nameless: true }), 'utf-8')

    const parentManifest = path.join(repoRoot, 'package.json')
    writeFileSync(parentManifest, JSON.stringify({ name: 'parent' }), 'utf-8')

    const result = findPackageManifest(
      childDir,
      'package.json',
      (content) => {
        const parsed = JSON.parse(content) as { name?: string; nameless?: boolean }
        if (parsed.name) return { kind: 'match', value: parsed.name }
        if (parsed.nameless) return { kind: 'fallback', value: 'nameless' }
        return { kind: 'skip' }
      },
      repoRoot,
    )

    expect(result.match?.value).toBe('parent')
    expect(result.match?.manifestPath).toBe(parentManifest)
    expect(result.skipped).toContain(childManifest)
  })

  it('selects nearest fallback when no preferred match is found', () => {
    const repoRoot = path.join(tempDir, 'repo')
    const subDir = path.join(repoRoot, 'sub')
    const childDir = path.join(subDir, 'child')
    mkdirSync(childDir, { recursive: true })

    const childManifest = path.join(childDir, 'package.json')
    writeFileSync(childManifest, JSON.stringify({ fallbackId: 1 }), 'utf-8')

    const subManifest = path.join(subDir, 'package.json')
    writeFileSync(subManifest, JSON.stringify({ fallbackId: 2 }), 'utf-8')

    const result = findPackageManifest(
      childDir,
      'package.json',
      (content) => {
        const parsed = JSON.parse(content) as { fallbackId?: number }
        return parsed.fallbackId ? { kind: 'fallback', value: parsed.fallbackId } : { kind: 'skip' }
      },
      repoRoot,
    )

    // The nearest fallback (childManifest) is retained, subsequent fallbacks go to skipped
    expect(result.match?.value).toBe(1)
    expect(result.match?.manifestPath).toBe(childManifest)
    expect(result.skipped).toContain(subManifest)
  })
})
