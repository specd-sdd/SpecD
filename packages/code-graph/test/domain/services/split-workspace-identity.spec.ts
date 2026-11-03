import { describe, expect, it } from 'vitest'
import {
  isAbsoluteGraphFilesystemPath,
  isDriveLetterPath,
  isUncPath,
  resolveGraphPath,
  splitWorkspaceIdentity,
  toPortableGraphPath,
} from '../../../src/domain/services/split-workspace-identity.js'

describe('splitWorkspaceIdentity', () => {
  it('does not treat a drive letter as a workspace', () => {
    expect(isDriveLetterPath('C:/repo/src/a.ts')).toBe(true)
    expect(isDriveLetterPath('c:\\repo\\src\\a.ts')).toBe(true)
    expect(splitWorkspaceIdentity('C:/repo/src/a.ts')).toBeNull()
    expect(isDriveLetterPath('C:')).toBe(true)
    expect(splitWorkspaceIdentity('C:')).toBeNull()
  })

  it('splits a workspace identity and keeps parent segments', () => {
    expect(splitWorkspaceIdentity('core:src/../secret')).toEqual({
      workspace: 'core',
      relativePath: 'src/../secret',
    })
  })

  it('keeps parent segments when converting separators', () => {
    expect(toPortableGraphPath('src\\..\\secret')).toBe('src/../secret')
  })

  it('returns null when there is no workspace prefix', () => {
    expect(splitWorkspaceIdentity('src/a.ts')).toBeNull()
  })

  it('does not treat UNC as a workspace identity', () => {
    expect(splitWorkspaceIdentity('//server/share/app/a.php')).toBeNull()
    expect(isUncPath('//server/share/app/a.php')).toBe(true)
    expect(isUncPath('\\\\server\\share\\app\\a.php')).toBe(true)
    expect(isAbsoluteGraphFilesystemPath('//server/share/app/a.php')).toBe(true)
  })
})

describe('resolveGraphPath', () => {
  it('resolves workspace-prefixed relatives with posix semantics', () => {
    expect(
      resolveGraphPath('php-app:app/controllers/PostsController.php', '../models/Post.php'),
    ).toBe('php-app:app/models/Post.php')
  })

  it('normalizes backslashes inside workspace-prefixed paths', () => {
    expect(resolveGraphPath('backend:src\\controllers\\a.php', '..\\models\\Post.php')).toBe(
      'backend:src/models/Post.php',
    )
  })

  it('keeps posix absolute targets unchanged (portable)', () => {
    expect(resolveGraphPath('php-app:app/a.php', '/etc/php/post.php')).toBe('/etc/php/post.php')
  })

  it('resolves against a Windows drive absolute importer on any host', () => {
    expect(
      resolveGraphPath('C:\\repo\\app\\controllers\\PostsController.php', '../models/Post.php'),
    ).toBe('C:/repo/app/models/Post.php')
    expect(
      resolveGraphPath('C:/repo/app/controllers/PostsController.php', '../models/Post.php'),
    ).toBe('C:/repo/app/models/Post.php')
  })

  it('resolves against a posix absolute importer', () => {
    expect(
      resolveGraphPath('/repo/app/controllers/PostsController.php', '../models/Post.php'),
    ).toBe('/repo/app/models/Post.php')
  })

  it('normalizes a Windows drive absolute target', () => {
    expect(resolveGraphPath('php-app:app/a.php', 'D:\\libs\\helper.php')).toBe('D:/libs/helper.php')
  })

  it('collapses . and .. for workspace relatives', () => {
    expect(resolveGraphPath('ws:src/a/b/c.php', './../../d/e.php')).toBe('ws:src/d/e.php')
  })

  it('resolves Cake-style parent-of-file-dir candidates from absolute Windows paths', () => {
    expect(
      resolveGraphPath('C:\\project\\app\\controllers\\posts.php', '../models/article.php'),
    ).toBe('C:/project/app/models/article.php')
  })

  it('matches createSymbolNode portable keys for mixed separator absolute paths', () => {
    const from = 'C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\php-require\\app\\controllers\\a.php'
    const resolved = resolveGraphPath(from, '../models/Post.php')
    expect(resolved).toBe('C:/Users/RUNNER~1/AppData/Local/Temp/php-require/app/models/Post.php')
    expect(resolved).toBe(toPortableGraphPath(resolved))
  })

  it('preserves UNC share identity when resolving relatives (posix must not collapse //)', () => {
    expect(
      resolveGraphPath('//server/share/app/controllers/PostsController.php', '../models/Post.php'),
    ).toBe('//server/share/app/models/Post.php')
    expect(
      resolveGraphPath(
        '\\\\server\\share\\app\\controllers\\PostsController.php',
        '../models/Post.php',
      ),
    ).toBe('//server/share/app/models/Post.php')
  })

  it('normalizes UNC absolute targets to portable form', () => {
    expect(resolveGraphPath('php-app:app/a.php', '\\\\server\\share\\lib\\x.php')).toBe(
      '//server/share/lib/x.php',
    )
    expect(resolveGraphPath('php-app:app/a.php', '//server/share/lib/x.php')).toBe(
      '//server/share/lib/x.php',
    )
  })

  it('treats drive-root absolute targets such as \\foo as absolute', () => {
    expect(resolveGraphPath('php-app:app/a.php', '\\foo\\bar.php')).toBe('/foo/bar.php')
  })

  it('resolves an empty target to the importer directory', () => {
    expect(resolveGraphPath('ws:src/controllers/a.php', '')).toBe('ws:src/controllers')
    expect(resolveGraphPath('C:\\repo\\app\\a.php', '')).toBe('C:/repo/app')
    expect(resolveGraphPath('/repo/app/a.php', '')).toBe('/repo/app')
    expect(resolveGraphPath('ws:a.php', '')).toBe('ws:')
  })
})
