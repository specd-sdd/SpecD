import { beforeEach, describe, expect, it, vi } from 'vitest'

const rmdir = vi.hoisted(() => vi.fn())

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return {
    ...actual,
    rmdir,
  }
})

const { removeSharedFolderIfEmpty } = await import('../../src/application/shared-folder-owners.js')

describe('removeSharedFolderIfEmpty', () => {
  beforeEach(() => {
    rmdir.mockReset()
  })

  it('given rmdir fails with EACCES, when removal runs, then the error is rethrown', async () => {
    const error = Object.assign(new Error('permission denied'), { code: 'EACCES' })
    rmdir.mockRejectedValue(error)

    await expect(removeSharedFolderIfEmpty('/shared')).rejects.toBe(error)
  })

  it('given rmdir fails with ENOTDIR, when removal runs, then it is swallowed', async () => {
    rmdir.mockRejectedValue(Object.assign(new Error('not a directory'), { code: 'ENOTDIR' }))

    await expect(removeSharedFolderIfEmpty('/shared')).resolves.toBeUndefined()
  })
})
