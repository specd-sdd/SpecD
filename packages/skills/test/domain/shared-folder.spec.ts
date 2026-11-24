import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { InvalidSharedFolderError } from '../../src/domain/errors/invalid-shared-folder-error.js'
import { resolveSharedFolder } from '../../src/domain/shared-folder.js'

const root = path.resolve('/tmp/specd-proj')
const config = path.join(root, '.specd', 'config')

describe('resolveSharedFolder', () => {
  it.each(['', '.', './', '\\', '/', 'a/..', root, `${root}/`])(
    'given %j, when resolved, then it is rejected',
    (folder) => {
      expect(() => resolveSharedFolder(root, config, folder)).toThrow(InvalidSharedFolderError)
    },
  )

  it.each(['..', '../x', 'a/../..'])(
    'given the escaping path %j, then it is rejected',
    (folder) => {
      expect(() => resolveSharedFolder(root, config, folder)).toThrow(InvalidSharedFolderError)
    },
  )

  it('given ..foo, when resolved, then it is a valid folder name', () => {
    const resolved = resolveSharedFolder(root, config, '..foo')
    expect(resolved.relativePath).toBe('..foo')
    expect(resolved.absolutePath).toBe(path.join(root, '..foo'))
  })

  it('given an absolute path inside the root, when resolved, then relativePath is project-relative', () => {
    const resolved = resolveSharedFolder(root, config, path.join(root, 'a', 'b'))
    expect(resolved.relativePath).toBe('a/b')
    expect(resolved.absolutePath).toBe(path.join(root, 'a', 'b'))
  })

  it('given no override, when resolved, then the default folder is used', () => {
    expect(resolveSharedFolder(root, config).relativePath).toBe('.specd/config/skills/shared')
  })
})
