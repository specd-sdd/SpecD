import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const fixture = fileURLToPath(new URL('../fixtures/signal-child.ts', import.meta.url))
const packageRoot = fileURLToPath(new URL('../..', import.meta.url))
const posixOnly = process.platform === 'win32' ? describe.skip : describe

let dir: string | undefined
let child: ChildProcess | undefined

afterEach(() => {
  child?.kill('SIGKILL')
  child = undefined
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
  dir = undefined
})

/**
 * Starts the signal fixture and waits until it reports readiness.
 *
 * @param mode - `clean` (cleanup finishes) or `hang` (cleanup never finishes)
 * @returns The running child and the marker file it writes when cleanup starts
 */
async function start(mode: 'clean' | 'hang'): Promise<{ child: ChildProcess; marker: string }> {
  dir = mkdtempSync(join(tmpdir(), 'specd-signal-'))
  const marker = join(dir, 'marker')
  const started = spawn(process.execPath, ['--import', 'tsx', fixture, marker, mode], {
    cwd: packageRoot,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  child = started
  await new Promise<void>((resolve, reject) => {
    started.once('error', reject)
    started.stdout?.on('data', (chunk: Buffer) => {
      if (String(chunk).includes('ready')) resolve()
    })
    started.once('exit', (code) => reject(new Error(`fixture exited early with ${String(code)}`)))
  })
  return { child: started, marker }
}

/**
 * Waits for a child to exit.
 *
 * @param target - Child process
 * @returns Its exit code
 */
function exited(target: ChildProcess): Promise<number | null> {
  return new Promise((resolve) => target.once('exit', (code) => resolve(code)))
}

/**
 * Polls until a condition holds.
 *
 * @param condition - Predicate to wait for
 */
async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('condition not met in time')
}

posixOnly('CLI signal handlers in a real process', () => {
  it('runs cleanup and exits 130 on SIGINT', async () => {
    const started = await start('clean')
    const done = exited(started.child)

    started.child.kill('SIGINT')

    expect(await done).toBe(130)
    expect(readFileSync(started.marker, 'utf8')).toBe('cleanup-started')
  }, 60_000)

  it('runs cleanup and exits 143 on SIGTERM', async () => {
    const started = await start('clean')
    const done = exited(started.child)

    started.child.kill('SIGTERM')

    expect(await done).toBe(143)
    expect(readFileSync(started.marker, 'utf8')).toBe('cleanup-started')
  }, 60_000)

  it('exits immediately on a second signal with the exit code of the first one', async () => {
    const started = await start('hang')
    const done = exited(started.child)

    started.child.kill('SIGINT')
    await waitFor(() => existsSync(started.marker))
    started.child.kill('SIGTERM')

    expect(await done).toBe(130)
  }, 60_000)
})
