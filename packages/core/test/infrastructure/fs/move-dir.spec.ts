import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const renameControl = vi.hoisted(() => ({
  reject: null as NodeJS.ErrnoException | null,
}))

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return {
    ...actual,
    rename: async (
      from: Parameters<typeof actual.rename>[0],
      to: Parameters<typeof actual.rename>[1],
    ) => {
      if (renameControl.reject !== null) {
        const error = renameControl.reject
        renameControl.reject = null
        throw error
      }
      return actual.rename(from, to)
    },
  }
})

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { moveDir } from '../../../src/infrastructure/fs/move-dir.js'

describe('moveDir', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-test-move-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true })
  })

  it('moves a directory to a new location', async () => {
    const source = path.join(tmpDir, 'source')
    const target = path.join(tmpDir, 'target')
    await fs.mkdir(source)
    await fs.writeFile(path.join(source, 'file.txt'), 'hello')

    await moveDir(source, target)

    const content = await fs.readFile(path.join(target, 'file.txt'), 'utf-8')
    expect(content).toBe('hello')
    await expect(fs.access(source)).rejects.toThrow()
  })

  it('overwrites when target directory already exists', async () => {
    const source = path.join(tmpDir, 'source')
    const target = path.join(tmpDir, 'target')
    await fs.mkdir(source)
    await fs.writeFile(path.join(source, 'new.txt'), 'new content')
    await fs.mkdir(target)
    await fs.writeFile(path.join(target, 'old.txt'), 'old content')

    await moveDir(source, target)

    const newContent = await fs.readFile(path.join(target, 'new.txt'), 'utf-8')
    expect(newContent).toBe('new content')
    await expect(fs.access(source)).rejects.toThrow()
  })

  it('moves nested directory structures', async () => {
    const source = path.join(tmpDir, 'source')
    const target = path.join(tmpDir, 'target')
    await fs.mkdir(path.join(source, 'sub', 'deep'), { recursive: true })
    await fs.writeFile(path.join(source, 'sub', 'deep', 'file.txt'), 'deep')

    await moveDir(source, target)

    const content = await fs.readFile(path.join(target, 'sub', 'deep', 'file.txt'), 'utf-8')
    expect(content).toBe('deep')
    await expect(fs.access(source)).rejects.toThrow()
  })

  it('copies the directory when rename fails with EPERM', async () => {
    const source = path.join(tmpDir, 'source')
    const target = path.join(tmpDir, 'target')
    await fs.mkdir(source)
    await fs.writeFile(path.join(source, 'file.txt'), 'copied')
    renameControl.reject = Object.assign(new Error('locked'), { code: 'EPERM' })

    await moveDir(source, target)

    expect(await fs.readFile(path.join(target, 'file.txt'), 'utf-8')).toBe('copied')
    await expect(fs.access(source)).rejects.toThrow()
  })

  it('copies the directory when rename fails with EXDEV', async () => {
    const source = path.join(tmpDir, 'source')
    const target = path.join(tmpDir, 'target')
    await fs.mkdir(source)
    await fs.writeFile(path.join(source, 'file.txt'), 'copied')
    renameControl.reject = Object.assign(new Error('cross-device'), { code: 'EXDEV' })

    await moveDir(source, target)

    expect(await fs.readFile(path.join(target, 'file.txt'), 'utf-8')).toBe('copied')
    await expect(fs.access(source)).rejects.toThrow()
  })

  it('propagates errors other than ENOTEMPTY/EEXIST', async () => {
    const source = path.join(tmpDir, 'nonexistent')
    const target = path.join(tmpDir, 'target')

    await expect(moveDir(source, target)).rejects.toThrow()
  })
})
