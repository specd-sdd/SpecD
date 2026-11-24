import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const script = fileURLToPath(new URL('../../../../dev/scripts/check-engines.js', import.meta.url))
let root: string | undefined

afterEach(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true })
  root = undefined
})

/**
 * Builds a fixture repository with the given package manifests and CI Node version.
 *
 * @param packages - Package manifests keyed by directory name
 * @param ciNode - Node version the fixture CI workflow installs
 * @returns The fixture repository root
 */
function makeRepo(packages: Record<string, Record<string, unknown>>, ciNode = '22'): string {
  root = mkdtempSync(join(tmpdir(), 'specd-engines-'))
  for (const [name, manifest] of Object.entries(packages)) {
    mkdirSync(join(root, 'packages', name), { recursive: true })
    writeFileSync(join(root, 'packages', name, 'package.json'), JSON.stringify(manifest))
  }
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true })
  writeFileSync(
    join(root, '.github', 'workflows', 'ci.yml'),
    `jobs:\n  test:\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version: ${ciNode}\n`,
  )
  return root
}

/**
 * Runs the engines check against a fixture root.
 *
 * @param repo - Fixture repository root
 * @returns Exit status and combined output
 */
function check(repo: string): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, [script], {
    env: { ...process.env, SPECD_REPO_ROOT: `${repo}/` },
    encoding: 'utf8',
  })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

describe('dev/scripts/check-engines.js', () => {
  it('passes when every published package declares >=22 and CI satisfies it', () => {
    const repo = makeRepo({
      a: { name: '@x/a', private: false, engines: { node: '>=22' } },
      b: { name: '@x/b', engines: { node: '>=22' } },
    })

    const result = check(repo)

    expect(result.status).toBe(0)
    expect(result.output).toContain('>=22')
  })

  it('fails and names the package when a published package lacks engines', () => {
    const repo = makeRepo({
      a: { name: '@x/a', engines: { node: '>=22' } },
      b: { name: '@x/b' },
    })

    const result = check(repo)

    expect(result.status).toBe(1)
    expect(result.output).toContain('@x/b')
  })

  it('fails when published packages disagree on the floor', () => {
    const repo = makeRepo({
      a: { name: '@x/a', engines: { node: '>=22' } },
      b: { name: '@x/b', engines: { node: '>=20' } },
    })

    const result = check(repo)

    expect(result.status).toBe(1)
    expect(result.output).toMatch(/@x\/b/)
  })

  it('fails when CI installs a Node version below the floor', () => {
    const repo = makeRepo({ a: { name: '@x/a', engines: { node: '>=22' } } }, '20')

    const result = check(repo)

    expect(result.status).toBe(1)
    expect(result.output).toContain('CI installs Node 20')
  })

  it('lets private packages omit engines', () => {
    const repo = makeRepo({
      a: { name: '@x/a', engines: { node: '>=22' } },
      docs: { name: '@x/docs', private: true },
    })

    expect(check(repo).status).toBe(0)
  })

  it('passes on the real repository', () => {
    expect(() => execFileSync(process.execPath, [script], { stdio: 'pipe' })).not.toThrow()
  })
})
