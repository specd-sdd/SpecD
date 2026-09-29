import { describe, expect, it } from 'vitest'
import { FsFileReader } from '../../../src/infrastructure/fs/file-reader.js'
import { resolveConfinedPath } from '../../../src/infrastructure/fs/path-confinement.js'
import { PathTraversalError } from '../../../src/domain/errors/path-traversal-error.js'

describe('Windows path containment', () => {
  it('accepts a drive-letter path inside the file reader root', async () => {
    const reader = new FsFileReader('C:/repo')
    await expect(reader.read('c:/repo/missing.txt')).resolves.toBeNull()
  })

  it('rejects a longer prefix outside the file reader root', async () => {
    const reader = new FsFileReader('C:/repo')
    await expect(reader.read('C:/repository/file.txt')).rejects.toBeInstanceOf(PathTraversalError)
  })

  it('rejects a confined path that only shares a prefix', () => {
    expect(() => resolveConfinedPath('C:/work/app', '../application')).toThrow(PathTraversalError)
  })
})
