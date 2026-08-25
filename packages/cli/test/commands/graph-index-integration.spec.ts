import { execFile, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { decode as decodeToon } from '@toon-format/toon'
import { afterEach, describe, expect, it } from 'vitest'

const packageRoot = join(fileURLToPath(new URL('../..', import.meta.url)))
const cliEntry = join(packageRoot, 'dist/index.js')
const execFileAsync = promisify(execFile)
const indexTimeoutMs = 30_000

function createRepository(): string {
  const root = mkdtempSync(join(tmpdir(), 'specd-graph-index-int-'))
  for (const path of [
    'src',
    'specs',
    '.specd/metadata',
    '.specd/changes',
    '.specd/drafts',
    '.specd/discarded',
    '.specd/archive',
    '.specd/config/schemas',
  ]) {
    mkdirSync(join(root, path), { recursive: true })
  }
  writeFileSync(join(root, 'src/index.ts'), 'export const value = 1\n')
  execFileSync('git', ['init'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: root })
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['commit', '-m', 'init'], { cwd: root })
  return root
}

async function index(
  root: string,
  options: { readonly format?: 'json' | 'text' | 'toon'; readonly force?: boolean } = {},
): Promise<{
  readonly status: number
  readonly stdout: string
  readonly stderr: string
  readonly timedOut: boolean
}> {
  const args = [cliEntry, 'graph', 'index', '--path', root]
  if (options.force ?? true) args.push('--force')
  if (options.format !== undefined) args.push('--format', options.format)
  try {
    const result = await execFileAsync(process.execPath, args, {
      cwd: root,
      encoding: 'utf8',
      killSignal: 'SIGKILL',
      timeout: indexTimeoutMs,
    })
    return { status: 0, stdout: result.stdout, stderr: result.stderr, timedOut: false }
  } catch (error) {
    const failure = error as {
      readonly code?: number | string
      readonly killed?: boolean
      readonly signal?: string
      readonly stderr?: string
      readonly stdout?: string
    }
    return {
      status: typeof failure.code === 'number' ? failure.code : -1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
      timedOut: failure.killed === true && failure.signal === 'SIGKILL',
    }
  }
}

describe('graph index integration', () => {
  let tmpDir: string

  afterEach(() => {
    if (tmpDir !== undefined) rmSync(tmpDir, { recursive: true, force: true })
  })

  it('runs the publish-shaped CLI task in a real isolated child', async () => {
    tmpDir = createRepository()
    const completed = await index(tmpDir)
    expect(completed.status).toBe(0)
    expect(completed.timedOut).toBe(false)
    expect(completed.stdout).toContain('Indexed')
    expect(completed.stdout).toContain('discovered:')
  }, 120_000)

  it('keeps repeated forced structured indexes bounded, clean, and unlockable', async () => {
    tmpDir = createRepository()
    const lock = join(tmpDir, '.specd', 'config', 'graph', 'index.lock')

    const json = await index(tmpDir, { format: 'json' })
    expect(json.status).toBe(0)
    expect(json.timedOut).toBe(false)
    expect(json.stderr).toBe('')
    expect(`${json.stdout}${json.stderr}`).not.toContain('SIGSEGV')
    const parsedJson: unknown = JSON.parse(json.stdout)
    expect(parsedJson).toMatchObject({ fullRebuild: true })
    expect(json.stdout).not.toMatch(
      /Indexing:|specd\.graph-index\.v1|"type":"(?:progress|result|failure)"/,
    )
    expect(existsSync(lock)).toBe(false)

    const toon = await index(tmpDir, { format: 'toon' })
    expect(toon.status).toBe(0)
    expect(toon.timedOut).toBe(false)
    expect(toon.stderr).toBe('')
    expect(`${toon.stdout}${toon.stderr}`).not.toContain('SIGSEGV')
    expect(() => decodeToon(toon.stdout)).not.toThrow()
    expect(decodeToon(toon.stdout)).toMatchObject({ fullRebuild: true })
    expect(toon.stdout).not.toMatch(
      /Indexing:|specd\.graph-index\.v1|type:\s*(?:progress|result|failure)/,
    )
    expect(existsSync(lock)).toBe(false)
  }, 120_000)

  it('repairs typed corrupted storage only for a forced run without leaving a lock', async () => {
    tmpDir = createRepository()
    const graphDir = join(tmpDir, '.specd', 'config', 'graph')
    const database = join(graphDir, 'code-graph.sqlite')
    const lock = join(graphDir, 'index.lock')

    const healthy = await index(tmpDir, { format: 'json' })
    expect(healthy.status).toBe(0)
    expect(healthy.timedOut).toBe(false)
    expect(existsSync(database)).toBe(true)

    writeFileSync(database, 'not a SQLite database')
    const corruptedBytes = readFileSync(database)

    const nonForced = await index(tmpDir, { format: 'json', force: false })
    expect(nonForced.status).toBe(3)
    expect(nonForced.timedOut).toBe(false)
    expect(readFileSync(database)).toEqual(corruptedBytes)
    expect(existsSync(lock)).toBe(false)

    const recovered = await index(tmpDir, { format: 'json' })
    expect(recovered.status).toBe(0)
    expect(recovered.timedOut).toBe(false)
    expect(recovered.stderr).toBe('')
    expect(JSON.parse(recovered.stdout)).toMatchObject({ fullRebuild: true })
    expect(existsSync(lock)).toBe(false)
  }, 120_000)

  it('returns busy before a second same-root task starts', async () => {
    tmpDir = createRepository()
    const lock = join(tmpDir, '.specd', 'config', 'graph', 'index.lock')
    mkdirSync(join(tmpDir, '.specd', 'config', 'graph'), { recursive: true })
    writeFileSync(
      lock,
      `${JSON.stringify({ version: 1, pid: process.pid, token: 'held-by-first-task' })}\n`,
    )
    const completed = await index(tmpDir)
    expect(completed.status).toBe(3)
    expect(completed.timedOut).toBe(false)
    expect(`${completed.stdout}${completed.stderr}`).toContain('currently being indexed')
  }, 120_000)
})
