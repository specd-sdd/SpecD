import { describe, it, expect } from 'vitest'
import { createFileNode } from '../../../src/domain/value-objects/file-node.js'

describe('FileNode', () => {
  it('creates a file node with normalized path', () => {
    const node = createFileNode({
      path: 'src\\domain\\file.ts',
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
      language: 'typescript',
      contentHash: 'sha256:abc',
      workspace: 'core',
      embedding,
    })
    expect(node.embedding).toBe(embedding)
  })

  it('workspace value is passed through as-is', () => {
    const node = createFileNode({
      path: 'org/core/src/index.ts',
      language: 'typescript',
      contentHash: 'sha256:abc',
      workspace: 'org/core',
    })
    expect(node.workspace).toBe('org/core')
  })
})
