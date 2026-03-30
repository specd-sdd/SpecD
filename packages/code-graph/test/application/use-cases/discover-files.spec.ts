import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  discoverFiles,
  DEFAULT_EXCLUDE_PATHS,
} from '../../../src/application/use-cases/discover-files.js'

/** Creates a file at the given path, creating parent directories as needed. */
function touch(root: string, relPath: string, content = ''): void {
  const full = join(root, relPath)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content)
}

/** A hasAdapter predicate that accepts all `.ts` files. */
const allTs = (filePath: string): boolean => filePath.endsWith('.ts')

describe('discoverFiles', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'discover-files-test-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  describe('DEFAULT_EXCLUDE_PATHS applied when no options', () => {
    it('excludes node_modules/ by default', () => {
      touch(root, 'src/index.ts')
      touch(root, 'node_modules/dep/index.ts')

      const files = discoverFiles(root, allTs)

      expect(files).toContain('src/index.ts')
      expect(files).not.toContain('node_modules/dep/index.ts')
    })

    it('excludes .specd/ by default', () => {
      touch(root, 'src/index.ts')
      touch(root, '.specd/metadata/spec.ts')

      const files = discoverFiles(root, allTs)

      expect(files).toContain('src/index.ts')
      expect(files).not.toContain('.specd/metadata/spec.ts')
    })

    it('excludes dist/ by default', () => {
      touch(root, 'src/index.ts')
      touch(root, 'dist/index.ts')

      const files = discoverFiles(root, allTs)

      expect(files).toContain('src/index.ts')
      expect(files).not.toContain('dist/index.ts')
    })
  })

  describe('custom excludePaths replaces defaults', () => {
    it('node_modules/ is discovered when not in custom excludePaths', () => {
      touch(root, 'src/index.ts')
      touch(root, 'node_modules/dep/index.ts')

      const files = discoverFiles(root, allTs, { excludePaths: ['custom-exclude/'] })

      expect(files).toContain('src/index.ts')
      expect(files).toContain('node_modules/dep/index.ts')
    })

    it('custom dir is excluded when listed in excludePaths', () => {
      touch(root, 'src/index.ts')
      touch(root, 'fixtures/helper.ts')

      const files = discoverFiles(root, allTs, { excludePaths: ['fixtures/'] })

      expect(files).toContain('src/index.ts')
      expect(files).not.toContain('fixtures/helper.ts')
    })
  })

  describe('negation re-includes subdirectory', () => {
    it('!.specd/metadata/ re-includes metadata subdir when .specd/* is excluded', () => {
      touch(root, 'src/index.ts')
      touch(root, '.specd/internal/config.ts')
      touch(root, '.specd/metadata/spec.ts')

      const files = discoverFiles(root, allTs, {
        excludePaths: ['.specd/*', '!.specd/metadata/'],
      })

      expect(files).toContain('src/index.ts')
      expect(files).not.toContain('.specd/internal/config.ts')
      expect(files).toContain('.specd/metadata/spec.ts')
    })
  })

  describe('respectGitignore: false ignores .gitignore', () => {
    it('discovers .gitignore-excluded files when respectGitignore is false', () => {
      touch(root, 'src/index.ts')
      touch(root, 'src/generated.ts')
      writeFileSync(join(root, '.gitignore'), 'generated.ts\n')

      const filesWithGitignore = discoverFiles(root, allTs)
      const filesWithout = discoverFiles(root, allTs, { respectGitignore: false })

      expect(filesWithGitignore).not.toContain('src/generated.ts')
      expect(filesWithout).toContain('src/generated.ts')
    })
  })

  describe('gitignore has absolute priority over excludePaths', () => {
    it('!generated/ in excludePaths cannot re-include a gitignored directory', () => {
      touch(root, 'src/index.ts')
      touch(root, 'generated/output.ts')
      writeFileSync(join(root, '.gitignore'), 'generated/\n')

      const files = discoverFiles(root, allTs, {
        excludePaths: ['node_modules/', '!generated/'],
      })

      expect(files).toContain('src/index.ts')
      expect(files).not.toContain('generated/output.ts')
    })
  })

  describe('empty excludePaths excludes nothing', () => {
    it('discovers node_modules/ when excludePaths is an empty array', () => {
      touch(root, 'src/index.ts')
      touch(root, 'node_modules/dep/index.ts')

      const files = discoverFiles(root, allTs, { excludePaths: [] })

      expect(files).toContain('src/index.ts')
      expect(files).toContain('node_modules/dep/index.ts')
    })
  })

  describe('DEFAULT_EXCLUDE_PATHS export', () => {
    it('includes expected built-in paths', () => {
      expect(DEFAULT_EXCLUDE_PATHS).toContain('node_modules/')
      expect(DEFAULT_EXCLUDE_PATHS).toContain('.git/')
      expect(DEFAULT_EXCLUDE_PATHS).toContain('.specd/')
      expect(DEFAULT_EXCLUDE_PATHS).toContain('dist/')
      expect(DEFAULT_EXCLUDE_PATHS).toContain('build/')
    })
  })
})
