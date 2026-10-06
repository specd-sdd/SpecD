import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  loadApiEntryPoints,
  loadWorkspacePackageRoots,
} from '../../../scripts/sdk-api-generator.js'

const repoRoot = path.resolve(import.meta.dirname, '../../../../..')

function writeWorkspace(dir: string, contents: string): void {
  fs.writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), contents)
}

function makePackage(dir: string, name: string): void {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name }))
}

describe('loadWorkspacePackageRoots', () => {
  it('resolves every package the workspace declares, not only the curated API ones', () => {
    const roots = loadWorkspacePackageRoots(repoRoot)

    expect(roots.length).toBeGreaterThanOrEqual(16)
    // A member inherited from a package that publishes no collection of its own is still this
    // repository's own code. The curated list covers three packages, and reading it instead of
    // the workspace file would drop the rest of the monorepo.
    for (const name of ['plugin-manager', 'skills', 'schema-std', 'cli', 'mcp']) {
      expect(roots).toContain(path.join(repoRoot, 'packages', name))
    }
    expect(roots).toContain(path.join(repoRoot, 'apps', 'public-web'))
  })

  it('expands every glob of the packages list', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specd-workspace-'))
    try {
      writeWorkspace(dir, 'packages:\n  - apps/*\n  - packages/*\n')
      makePackage(path.join(dir, 'packages', 'alpha'), '@scope/alpha')
      makePackage(path.join(dir, 'apps', 'site'), '@scope/site')
      fs.mkdirSync(path.join(dir, 'packages', 'not-a-package'), { recursive: true })

      expect(loadWorkspacePackageRoots(dir)).toEqual([
        path.join(dir, 'apps', 'site'),
        path.join(dir, 'packages', 'alpha'),
      ])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('stops at the end of the packages list instead of reading the keys below it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specd-workspace-'))
    try {
      writeWorkspace(
        dir,
        'packages:\n  - packages/*\nonlyBuiltDependencies:\n  - "not-a-directory"\n',
      )
      makePackage(path.join(dir, 'packages', 'alpha'), '@scope/alpha')

      expect(loadWorkspacePackageRoots(dir)).toEqual([path.join(dir, 'packages', 'alpha')])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects a workspace file it cannot read, rather than filtering with an empty list', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specd-workspace-'))
    try {
      // An empty root list would keep every inherited member of every standard library type,
      // which is the exact failure the filtering exists to prevent.
      expect(() => loadWorkspacePackageRoots(dir)).toThrow(/does not exist/)
      writeWorkspace(dir, 'packages: []\n')
      expect(() => loadWorkspacePackageRoots(dir)).toThrow(/Could not parse/)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('the workspace file and the curated entry points are separate facts', () => {
  it('resolves more packages than the curated API list covers', () => {
    const curated = loadApiEntryPoints(repoRoot).map((entryPoint) =>
      path.dirname(path.dirname(path.resolve(repoRoot, 'apps/public-web', entryPoint.entryPoint))),
    )

    // The distinction the generator now relies on: the workspace decides what counts as this
    // repository's own code, the curated list only decides what gets a collection.
    expect(loadWorkspacePackageRoots(repoRoot).length).toBeGreaterThan(curated.length)
  })
})
