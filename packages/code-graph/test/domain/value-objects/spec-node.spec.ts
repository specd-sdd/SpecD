import { describe, it, expect } from 'vitest'
import { createSpecNode } from '../../../src/domain/value-objects/spec-node.js'

describe('SpecNode', () => {
  it('creates a spec node with all fields', () => {
    const node = createSpecNode({
      specId: 'core:core/change',
      path: 'specs/core/change',
      title: 'Change',
      contentHash: 'sha256:test',
      dependsOn: ['core:core/config'],
      workspace: 'core',
    })
    expect(node.specId).toBe('core:core/change')
    expect(node.path).toBe('specs/core/change')
    expect(node.title).toBe('Change')
    expect(node.dependsOn).toEqual(['core:core/config'])
    expect(node.workspace).toBe('core')
  })

  it('defaults dependsOn to empty array', () => {
    const node = createSpecNode({
      specId: 'core:core/change',
      path: 'specs/core/change',
      title: 'Change',
      contentHash: 'sha256:test',
      workspace: 'core',
    })
    expect(node.dependsOn).toEqual([])
  })

  it('normalizes backslash paths', () => {
    const node = createSpecNode({
      specId: 'core:core/change',
      path: 'specs\\core\\change',
      title: 'Change',
      contentHash: 'sha256:test',
      workspace: 'core',
    })
    expect(node.path).toBe('specs/core/change')
  })

  it('preserves workspace field', () => {
    const node = createSpecNode({
      specId: 'default:_global/architecture',
      path: 'architecture',
      title: 'Architecture',
      contentHash: 'sha256:test',
      workspace: 'default',
    })
    expect(node.workspace).toBe('default')
  })
})
