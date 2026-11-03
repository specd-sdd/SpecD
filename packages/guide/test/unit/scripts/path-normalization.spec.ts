import { describe, expect, it } from 'vitest'
import { compileGuide, isPathInside, toPosixPath } from '../../../scripts/guide-bundler.js'
import { resolveSourcePath } from '../../../scripts/sdk-api-generator.js'

const FRONTMATTER = `---
title: Implementing a Port
description: Walks through a port implementation.
sidebar_position: 1
---

# Implementing a Port
`

function declaration(fullFileName: string): Parameters<typeof resolveSourcePath>[0] {
  return {
    name: 'Example',
    kind: 0,
    sources: [{ fullFileName }],
  }
}

describe('toPosixPath', () => {
  it('converts a Windows path to forward slashes', () => {
    // GIVEN a native Windows path
    // WHEN it is normalized
    // THEN every backslash becomes a forward slash
    expect(toPosixPath('C:\\path\\to\\file.ts')).toBe('C:/path/to/file.ts')
  })

  it('converts mixed separators', () => {
    expect(toPosixPath('C:\\path/mixed\\separators/file.ts')).toBe(
      'C:/path/mixed/separators/file.ts',
    )
  })

  it('leaves a POSIX path unchanged', () => {
    expect(toPosixPath('/usr/local/src/index.ts')).toBe('/usr/local/src/index.ts')
  })

  it('returns an empty string for an empty string', () => {
    expect(toPosixPath('')).toBe('')
  })

  it('is idempotent', () => {
    const once = toPosixPath('C:\\path\\to\\file.ts')
    expect(toPosixPath(once)).toBe(once)
  })
})

describe('isPathInside', () => {
  it('matches a forward-slash declaration against a backslash package root', () => {
    // GIVEN a Windows package root and a TypeScript declaration reported with forward slashes
    // WHEN membership is classified
    // THEN the declaration is inside the root
    expect(isPathInside('D:\\a\\repo\\packages\\sdk', 'D:/a/repo/packages/sdk/src/index.ts')).toBe(
      true,
    )
  })

  it('matches a backslash declaration against a forward-slash package root', () => {
    expect(
      isPathInside('D:/a/repo/packages/sdk', 'D:\\a\\repo\\packages\\sdk\\src\\index.ts'),
    ).toBe(true)
  })

  it('ignores drive-letter case', () => {
    expect(isPathInside('d:/a/repo/packages/sdk', 'D:/a/repo/packages/sdk/src/index.ts')).toBe(true)
  })

  it('rejects a sibling directory that shares the root as a name prefix', () => {
    // GIVEN a package root and a sibling whose name starts with that root
    // WHEN membership is classified
    // THEN the sibling is not a member
    expect(isPathInside('packages/sdk', 'packages/sdk-extra/src/index.ts')).toBe(false)
  })

  it('matches a file that is the root itself', () => {
    expect(isPathInside('packages/sdk', 'packages/sdk')).toBe(true)
  })

  it('matches descendants of a drive root without doubling the slash', () => {
    expect(isPathInside('C:/', 'C:/Windows/a.ts')).toBe(true)
    expect(isPathInside('C:/', 'C:/')).toBe(true)
  })

  it('matches a UNC declaration after preserving the leading double slash', () => {
    expect(isPathInside('\\\\srv\\share\\pkg', '//srv/share/pkg/a.ts')).toBe(true)
  })

  it('keeps POSIX paths case-sensitive', () => {
    expect(isPathInside('/a/B', '/a/b/x')).toBe(false)
  })

  it('matches an empty root only against an empty file', () => {
    expect(isPathInside('', '')).toBe(true)
    expect(isPathInside('', 'a')).toBe(false)
  })
})

describe('resolveSourcePath', () => {
  it('returns a repository-relative POSIX path for an in-repo declaration', () => {
    // GIVEN a declaration inside the repository
    // WHEN its source path is resolved
    // THEN the result is relative and uses forward slashes
    expect(resolveSourcePath(declaration('/repo/packages/sdk/src/index.ts'), '/repo')).toBe(
      'packages/sdk/src/index.ts',
    )
  })

  it('normalizes a Windows-style path that lies outside the repository', () => {
    // GIVEN a declaration outside the repository whose path contains backslashes
    // WHEN its source path is resolved
    // THEN the fallback uses forward slashes
    const sourcePath = resolveSourcePath(declaration('E:\\other\\x.d.ts'), '/repo')
    expect(sourcePath).toBe('E:/other/x.d.ts')
    expect(sourcePath).not.toContain('\\')
  })

  it('treats a directory named ..foo as inside the repository', () => {
    expect(resolveSourcePath(declaration('/repo/..foo/file.ts'), '/repo')).toBe('..foo/file.ts')
  })
})

describe('compileGuide', () => {
  it('derives a POSIX topic and source path from a backslash relative path', () => {
    // GIVEN a nested document whose relative path uses backslashes
    // WHEN the bundler compiles it
    // THEN the topic keeps the subdirectory and the source path uses forward slashes
    const topic = compileGuide(
      'core',
      '/repo/docs/core/examples/Implementing-A-Port.md',
      'examples\\Implementing-A-Port.md',
      FRONTMATTER,
    )

    expect(topic.topic).toBe('examples/implementing-a-port')
    expect(topic.sourcePath).toBe('examples/Implementing-A-Port.md')
  })
})
