import { describe, it, expect } from 'vitest'
import { createFileNode } from '../../../src/domain/value-objects/file-node.js'

describe('FileNode', () => {
  it('creates a file node with normalized path', () => {
    const node = createFileNode({
      path: 'src\\domain\\file.ts',
      projectRelativePath: '',
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
      projectRelativePath: '',
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
      projectRelativePath: '',
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
      projectRelativePath: '',
      language: 'typescript',
      contentHash: 'sha256:abc',
      workspace: 'org/core',
    })
    expect(node.workspace).toBe('org/core')
  })

  it('supports root-namespaced canonical paths', () => {
    const node = createFileNode({
      path: 'root:dev/scripts/sync.ts',
      projectRelativePath: 'dev/scripts/sync.ts',
      language: 'typescript',
      contentHash: 'sha256:abc',
      workspace: 'root',
    })
    expect(node.path).toBe('root:dev/scripts/sync.ts')
    expect(node.workspace).toBe('root')
  })

  it('normalizes projectRelativePath with backslashes', () => {
    const node = createFileNode({
      path: 'core:src/model.ts',
      projectRelativePath: 'packages\\core\\src\\model.ts',
      language: 'typescript',
      contentHash: 'sha256:abc',
      workspace: 'core',
    })
    expect(node.projectRelativePath).toBe('packages/core/src/model.ts')
  })

  it('preserves forward-slash projectRelativePath', () => {
    const node = createFileNode({
      path: 'core:src/model.ts',
      projectRelativePath: 'packages/core/src/model.ts',
      language: 'typescript',
      contentHash: 'sha256:abc',
      workspace: 'core',
    })
    expect(node.projectRelativePath).toBe('packages/core/src/model.ts')
  })

  it('defaults projectRelativePath to path when omitted', () => {
    const node = createFileNode({
      path: 'src/index.ts',
      language: 'typescript',
      contentHash: 'sha256:abc',
      workspace: 'core',
    })
    expect(node.projectRelativePath).toBe('src/index.ts')
  })

  it('defaults category to source when omitted', () => {
    const node = createFileNode({
      path: 'src/index.ts',
      projectRelativePath: '',
      language: 'typescript',
      contentHash: 'sha256:abc',
      workspace: 'core',
    })
    expect(node.category).toBe('source')
  })

  it('preserves explicit category', () => {
    const testNode = createFileNode({
      path: 'test/foo.spec.ts',
      projectRelativePath: '',
      language: 'typescript',
      contentHash: 'sha256:abc',
      workspace: 'core',
      category: 'test',
    })
    expect(testNode.category).toBe('test')

    const ignoredNode = createFileNode({
      path: 'fixtures/data.json',
      projectRelativePath: '',
      language: 'json',
      contentHash: 'sha256:abc',
      workspace: 'core',
      category: 'ignored',
    })
    expect(ignoredNode.category).toBe('ignored')
  })

  it('FileNode equality still uses canonical path when projectRelativePath differs', () => {
    const fileA = createFileNode({
      path: 'core:src/index.ts',
      projectRelativePath: 'packages/core/src/index.ts',
      language: 'typescript',
      contentHash: 'sha256:hash1',
      workspace: 'core',
    })
    const fileB = createFileNode({
      path: 'core:src/index.ts',
      projectRelativePath: '../../packages/core/src/index.ts',
      language: 'typescript',
      contentHash: 'sha256:hash2',
      workspace: 'core',
    })
    expect(fileA.path).toBe(fileB.path)
    expect(fileA.projectRelativePath).not.toBe(fileB.projectRelativePath)
  })

  it('FileNode projectRelativePath may include parent segments', () => {
    const node = createFileNode({
      path: 'core:src/index.ts',
      projectRelativePath: '../../packages/core/src/index.ts',
      language: 'typescript',
      contentHash: 'sha256:hash',
      workspace: 'core',
    })
    expect(node.projectRelativePath).toBe('../../packages/core/src/index.ts')
  })
})
