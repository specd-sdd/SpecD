import { describe, it, expect } from 'vitest'
import { createSpecNode } from '../../../src/domain/value-objects/spec-node.js'

describe('SpecNode', () => {
  it('creates a spec node', () => {
    const node = createSpecNode({
      specId: 'core:core/change',
      path: 'specs/core/change',
      title: 'Change',
      dependsOn: ['core:core/config'],
    })
    expect(node.specId).toBe('core:core/change')
    expect(node.path).toBe('specs/core/change')
    expect(node.title).toBe('Change')
    expect(node.dependsOn).toEqual(['core:core/config'])
  })

  it('defaults dependsOn to empty array', () => {
    const node = createSpecNode({
      specId: 'core:core/change',
      path: 'specs/core/change',
      title: 'Change',
    })
    expect(node.dependsOn).toEqual([])
  })

  it('normalizes backslash paths', () => {
    const node = createSpecNode({
      specId: 'core:core/change',
      path: 'specs\\core\\change',
      title: 'Change',
    })
    expect(node.path).toBe('specs/core/change')
  })
})
