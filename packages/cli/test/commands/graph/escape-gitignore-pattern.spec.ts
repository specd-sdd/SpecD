import { describe, expect, it } from 'vitest'
import {
  escapeGitignorePattern,
  toLargeFilePathsEntry,
  yamlScalar,
} from '../../../src/commands/graph/index-graph.js'

describe('escapeGitignorePattern', () => {
  it('passes regular alphanumeric paths unchanged', () => {
    expect(escapeGitignorePattern('src/main.ts')).toBe('src/main.ts')
    expect(escapeGitignorePattern('packages/core/src/index.ts')).toBe('packages/core/src/index.ts')
  })

  it('escapes glob characters and backslashes', () => {
    expect(escapeGitignorePattern('path/with/\\backslash')).toBe('path/with/\\\\backslash')
    expect(escapeGitignorePattern('path/with/*/star')).toBe('path/with/\\*/star')
    expect(escapeGitignorePattern('path/with/?/question')).toBe('path/with/\\?/question')
    expect(escapeGitignorePattern('path/with/[bracket]')).toBe('path/with/\\[bracket\\]')
  })

  it('escapes leading exclamation mark and hash', () => {
    expect(escapeGitignorePattern('!important.ts')).toBe('\\!important.ts')
    expect(escapeGitignorePattern('#notes.md')).toBe('\\#notes.md')
    // Internal exclamation mark or hash is not escaped
    expect(escapeGitignorePattern('foo/!bar.ts')).toBe('foo/!bar.ts')
    expect(escapeGitignorePattern('foo/#bar.ts')).toBe('foo/#bar.ts')
  })

  it('escapes leading and trailing whitespace', () => {
    expect(escapeGitignorePattern(' file.ts')).toBe('\\ file.ts')
    expect(escapeGitignorePattern('file.ts ')).toBe('file.ts\\ ')
    expect(escapeGitignorePattern(' file.ts ')).toBe('\\ file.ts\\ ')
  })
})

describe('toLargeFilePathsEntry', () => {
  it('anchors a root-level file with a leading slash so it cannot match at any depth', () => {
    expect(toLargeFilePathsEntry('big.ts')).toBe('/big.ts')
  })

  it('leaves a path that already contains a slash anchored to the project root', () => {
    expect(toLargeFilePathsEntry('src/big.ts')).toBe('src/big.ts')
  })

  it('escapes glob characters in both forms', () => {
    expect(toLargeFilePathsEntry('a[1].ts')).toBe('/a\\[1\\].ts')
    expect(toLargeFilePathsEntry('dir/a*.ts')).toBe('dir/a\\*.ts')
  })
})

describe('yamlScalar', () => {
  it('keeps ordinary paths plain', () => {
    expect(yamlScalar('src/big.ts')).toBe('src/big.ts')
    expect(yamlScalar('/big.ts')).toBe('/big.ts')
  })

  it('single-quotes values a plain scalar would misread', () => {
    expect(yamlScalar('docs/a #b.md')).toBe("'docs/a #b.md'")
    expect(yamlScalar('docs/note: draft.md')).toBe("'docs/note: draft.md'")
    expect(yamlScalar('- list.md')).toBe("'- list.md'")
    expect(yamlScalar('trailing ')).toBe("'trailing '")
  })

  it('doubles embedded single quotes', () => {
    expect(yamlScalar("-it's.md")).toBe("'-it''s.md'")
  })
})
