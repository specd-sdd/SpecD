import { describe, it, expect } from 'vitest'
import { createFileNode } from '../../../src/domain/value-objects/file-node.js'

describe('FileNode', () => {
  it('creates a file node with normalized path', () => {
    const node = createFileNode({
      path: 'src\\domain\\file.ts',
      configRelativePath: '',
      language: 'typescript',
      contentHash: 'sha256:abc',
      workspace: 'core',
    })
    expect(node.path).toBe('src/domain/file.ts')
    expect(node.language).toBe('typescript')
    expect(node.contentHash).toBe('sha256:abc')
    expect(node.workspace).toBe('core')
    expect(node.embedding).toBeUndefined()
  })

  it('preserves forward-slash paths', () => {
    const node = createFileNode({
      path: 'src/domain/file.ts',
      configRelativePath: '',
      language: 'typescript',
      contentHash: 'sha256:abc',
      workspace: 'core',
    })
    expect(node.path).toBe('src/domain/file.ts')
  })

  it('supports optional embedding', () => {
    const embedding = new Float32Array([1, 2, 3])
    const node = createFileNode({
      path: 'file.ts',
      configRelativePath: '',
      language: 'typescript',
      contentHash: 'sha256:abc',
      workspace: 'core',
      embedding,
    })
    expect(node.embedding).toEqual(embedding)
  })

  it('workspace value is passed through as-is', () => {
    const node = createFileNode({
      path: 'org/core/src/index.ts',
      configRelativePath: '',
      language: 'typescript',
      contentHash: 'sha256:abc',
      workspace: 'org/core',
    })
    expect(node.workspace).toBe('org/core')
  })

  it('supports root-namespaced canonical paths', () => {
    const node = createFileNode({
      path: 'root:dev/scripts/sync.ts',
      configRelativePath: 'dev/scripts/sync.ts',
      language: 'typescript',
      contentHash: 'sha256:abc',
      workspace: 'root',
    })
    expect(node.path).toBe('root:dev/scripts/sync.ts')
    expect(node.workspace).toBe('root')
  })

  it('normalizes configRelativePath with backslashes', () => {
    const node = createFileNode({
      path: 'core:src/model.ts',
      configRelativePath: 'packages\\core\\src\\model.ts',
      language: 'typescript',
      contentHash: 'sha256:abc',
      workspace: 'core',
    })
    expect(node.configRelativePath).toBe('packages/core/src/model.ts')
  })

  it('preserves forward-slash configRelativePath', () => {
    const node = createFileNode({
      path: 'core:src/model.ts',
      configRelativePath: 'packages/core/src/model.ts',
      language: 'typescript',
      contentHash: 'sha256:abc',
      workspace: 'core',
    })
    expect(node.configRelativePath).toBe('packages/core/src/model.ts')
  })

  it('defaults configRelativePath to empty string', () => {
    const node = createFileNode({
      path: 'src/index.ts',
      configRelativePath: '',
      language: 'typescript',
      contentHash: 'sha256:abc',
      workspace: 'core',
    })
    expect(node.configRelativePath).toBe('')
  })
})
