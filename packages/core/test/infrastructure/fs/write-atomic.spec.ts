import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const renameControl = vi.hoisted(() => ({
  remaining: 0,
  error: null as NodeJS.ErrnoException | null,
  calls: 0,
}))

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return {
    ...actual,
    rename: async (
      from: Parameters<typeof actual.rename>[0],
      to: Parameters<typeof actual.rename>[1],
    ) => {
      renameControl.calls += 1
      if (renameControl.remaining > 0) {
        renameControl.remaining -= 1
        throw renameControl.error ?? Object.assign(new Error('busy'), { code: 'EBUSY' })
      }
      return actual.rename(from, to)
    },
  }
})

import { writeFileAtomic } from '../../../src/infrastructure/fs/write-atomic.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-write-atomic-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('writeFileAtomic', () => {
  it('writes file content atomically', async () => {
    const filePath = path.join(tmpDir, 'test.txt')
    await writeFileAtomic(filePath, 'hello world')

    const content = await fs.readFile(filePath, 'utf8')
    expect(content).toBe('hello world')
  })

  it('creates parent directories if they already exist', async () => {
    const nested = path.join(tmpDir, 'sub')
    await fs.mkdir(nested, { recursive: true })
    const filePath = path.join(nested, 'deep.txt')

    await writeFileAtomic(filePath, 'nested content')

    const content = await fs.readFile(filePath, 'utf8')
    expect(content).toBe('nested content')
  })

  it('overwrites existing file', async () => {
    const filePath = path.join(tmpDir, 'overwrite.txt')
    await fs.writeFile(filePath, 'original', 'utf8')

    await writeFileAtomic(filePath, 'replaced')

    const content = await fs.readFile(filePath, 'utf8')
    expect(content).toBe('replaced')
  })

  it('cleans up temp file on rename error', async () => {
    // Point to a directory that does not exist — rename will fail because
    // the target parent directory is missing. writeFileAtomic writes the tmp
    // file next to the target, so if the target dir doesn't exist, writeFile
    // itself fails. We need a subtler approach: make the target path a
    // directory so rename fails with EISDIR / EPERM.
    const dirPath = path.join(tmpDir, 'blocker')
    await fs.mkdir(dirPath)

    // The tmp file is written next to the target, which is inside tmpDir.
    // rename(tmpFile, dirPath) will fail because dirPath is a directory.
    await expect(writeFileAtomic(dirPath, 'will fail')).rejects.toThrow()

    // Verify no stale .tmp-* files remain in tmpDir
    const entries = await fs.readdir(tmpDir)
    const tmpFiles = entries.filter((e) => e.includes('.tmp-'))
    expect(tmpFiles).toHaveLength(0)
  })

  it('retries one EBUSY and then writes the file', async () => {
    const filePath = path.join(tmpDir, 'retry.txt')
    const busy = Object.assign(new Error('busy'), { code: 'EBUSY' })
    renameControl.remaining = 1
    renameControl.error = busy
    renameControl.calls = 0

    await writeFileAtomic(filePath, 'ok')

    expect(await fs.readFile(filePath, 'utf8')).toBe('ok')
    expect(renameControl.calls).toBe(2)
    renameControl.remaining = 0
  })

  it('throws the original error after five EBUSY failures', async () => {
    const filePath = path.join(tmpDir, 'stuck.txt')
    const busy = Object.assign(new Error('busy'), { code: 'EBUSY' })
    renameControl.remaining = 5
    renameControl.error = busy
    renameControl.calls = 0

    await expect(writeFileAtomic(filePath, 'nope')).rejects.toBe(busy)
    expect(renameControl.calls).toBe(5)
    renameControl.remaining = 0
  })
})
