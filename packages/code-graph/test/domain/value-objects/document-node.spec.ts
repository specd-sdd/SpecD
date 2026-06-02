import { describe, expect, it } from 'vitest'
import { createDocumentNode } from '../../../src/domain/value-objects/document-node.js'

describe('DocumentNode', () => {
  it('creates a document node with normalized paths', () => {
    const node = createDocumentNode({
      path: 'root:docs\\guide.md',
      configRelativePath: 'docs\\guide.md',
      contentHash: 'sha256:abc',
      content: '# Guide',
      workspace: 'root',
    })

    expect(node.path).toBe('root:docs/guide.md')
    expect(node.configRelativePath).toBe('docs/guide.md')
    expect(node.contentHash).toBe('sha256:abc')
    expect(node.content).toBe('# Guide')
    expect(node.workspace).toBe('root')
  })
})
