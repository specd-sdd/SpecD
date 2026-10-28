import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const fixture = fileURLToPath(new URL('./fixtures/run-child.ts', import.meta.url))
const packageRoot = fileURLToPath(new URL('..', import.meta.url))

interface ChildResult {
  readonly code: number | null
  readonly stderr: string
  readonly elapsedMs: number
}

/**
 * Runs the run-child fixture in a real process and collects how it ended.
 *
 * @param mode - `clean` or `leak`
 * @returns Exit code, stderr and elapsed time
 */
function runChild(mode: 'clean' | 'leak'): Promise<ChildResult> {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', fixture, mode], {
      cwd: packageRoot,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += String(chunk)
    })
    child.once('error', reject)
    child.once('exit', (code) => resolve({ code, stderr, elapsedMs: Date.now() - started }))
  })
}

describe('run in a real process', () => {
  it('ends by itself with no grace-period warning when nothing keeps it alive', async () => {
    const result = await runChild('clean')

    expect(result.code).toBe(0)
    expect(result.stderr).not.toContain('warning:')
  }, 30_000)

  it('warns after 1 s and forces the exit after 5 s when an open handle keeps it alive', async () => {
    const result = await runChild('leak')

    expect(result.code).toBe(0)
    expect(result.stderr).toContain('warning: waiting for open handles to close')
    expect(result.stderr).toContain('Timeout')
    expect(result.stderr).toContain('warning: process did not exit after cleanup; forcing exit')
    expect(result.elapsedMs).toBeGreaterThanOrEqual(5000)
  }, 60_000)
})
