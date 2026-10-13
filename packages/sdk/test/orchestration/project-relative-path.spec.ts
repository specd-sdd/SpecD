import { describe, expect, it } from 'vitest'
import { type SpecdConfig } from '@specd/core'
import {
  splitWorkspaceIdentity,
  toProjectRelativePath,
  toGraphDisplayPath,
} from '../../src/orchestration/project-relative-path.js'

describe('project-relative-path utilities', () => {
  describe('splitWorkspaceIdentity', () => {
    it('splits standard workspace and relative path', () => {
      const result = splitWorkspaceIdentity('core:src/index.ts')
      expect(result).toEqual({ workspace: 'core', relativePath: 'src/index.ts' })
    })

    it('returns null for non-colon paths', () => {
      expect(splitWorkspaceIdentity('src/index.ts')).toBeNull()
    })

    it('returns null for empty workspace prefix (:foo)', () => {
      expect(splitWorkspaceIdentity(':src/index.ts')).toBeNull()
    })

    it('returns null for Windows drive letters', () => {
      expect(splitWorkspaceIdentity('C:\\path\\file.ts')).toBeNull()
      expect(splitWorkspaceIdentity('D:/path/file.ts')).toBeNull()
    })
  })

  describe('toProjectRelativePath', () => {
    const mockConfig = {
      projectRoot: '/repo',
      workspaces: [
        { name: 'core', codeRoot: '/repo/packages/core' },
        { name: 'cli', codeRoot: '/repo/packages/cli' },
      ],
    } as unknown as SpecdConfig

    it('projects workspace-qualified paths relative to projectRoot', () => {
      expect(toProjectRelativePath(mockConfig, 'core:src/index.ts')).toBe(
        'packages/core/src/index.ts',
      )
      expect(toProjectRelativePath(mockConfig, 'cli:src/commands/search.ts')).toBe(
        'packages/cli/src/commands/search.ts',
      )
    })

    it('handles root workspace identity', () => {
      expect(toProjectRelativePath(mockConfig, 'root:docs/readme.md')).toBe('docs/readme.md')
    })

    it('normalizes backslashes to forward slashes', () => {
      const windowsConfig = {
        projectRoot: 'C:/repo',
        workspaces: [{ name: 'core', codeRoot: 'C:/repo/packages/core' }],
      } as unknown as SpecdConfig

      expect(toProjectRelativePath(windowsConfig, 'core:src\\utils.ts')).toBe(
        'packages/core/src/utils.ts',
      )
    })

    it('falls back to input if workspace not found', () => {
      expect(toProjectRelativePath(mockConfig, 'unknown:src/foo.ts')).toBe('unknown:src/foo.ts')
    })

    it('falls back to input if identity does not parse', () => {
      expect(toProjectRelativePath(mockConfig, 'bare-file.ts')).toBe('bare-file.ts')
    })

    it('toGraphDisplayPath is an alias of toProjectRelativePath', () => {
      expect(toGraphDisplayPath).toBe(toProjectRelativePath)
    })
  })
})
