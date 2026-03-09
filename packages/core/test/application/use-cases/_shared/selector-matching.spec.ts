import { describe, it, expect } from 'vitest'
import {
  findNodes,
  selectorMatches,
} from '../../../../src/application/use-cases/_shared/selector-matching.js'
import { type ArtifactNode } from '../../../../src/application/ports/artifact-parser.js'
import { type Selector } from '../../../../src/domain/value-objects/selector.js'

describe('selectorMatches', () => {
  it('matches by type only', () => {
    const node: ArtifactNode = { type: 'heading', label: 'Title' }
    expect(selectorMatches(node, { type: 'heading' }, [])).toBe(true)
  })

  it('rejects when type differs', () => {
    const node: ArtifactNode = { type: 'paragraph' }
    expect(selectorMatches(node, { type: 'heading' }, [])).toBe(false)
  })

  it('matches by type and label regex', () => {
    const node: ArtifactNode = { type: 'heading', label: 'Rules' }
    expect(selectorMatches(node, { type: 'heading', matches: '^rules$' }, [])).toBe(true)
  })

  it('rejects when label regex does not match', () => {
    const node: ArtifactNode = { type: 'heading', label: 'Constraints' }
    expect(selectorMatches(node, { type: 'heading', matches: '^rules$' }, [])).toBe(false)
  })

  it('matches case-insensitively on label', () => {
    const node: ArtifactNode = { type: 'heading', label: 'RULES' }
    expect(selectorMatches(node, { type: 'heading', matches: '^rules$' }, [])).toBe(true)
  })

  it('matches by contains on value', () => {
    const node: ArtifactNode = { type: 'paragraph', value: 'some important text' }
    expect(selectorMatches(node, { type: 'paragraph', contains: 'important' }, [])).toBe(true)
  })

  it('rejects when contains does not match value', () => {
    const node: ArtifactNode = { type: 'paragraph', value: 'hello' }
    expect(selectorMatches(node, { type: 'paragraph', contains: 'world' }, [])).toBe(false)
  })

  it('matches with parent selector', () => {
    const parent: ArtifactNode = { type: 'heading', label: 'Rules' }
    const child: ArtifactNode = { type: 'list-item', label: 'rule 1' }
    const selector: Selector = {
      type: 'list-item',
      parent: { type: 'heading', matches: '^rules$' },
    }
    expect(selectorMatches(child, selector, [parent])).toBe(true)
  })

  it('rejects when parent selector does not match any ancestor', () => {
    const parent: ArtifactNode = { type: 'heading', label: 'Constraints' }
    const child: ArtifactNode = { type: 'list-item', label: 'item' }
    const selector: Selector = {
      type: 'list-item',
      parent: { type: 'heading', matches: '^rules$' },
    }
    expect(selectorMatches(child, selector, [parent])).toBe(false)
  })

  it('finds nearest ancestor of matching type for parent', () => {
    const root: ArtifactNode = { type: 'heading', label: 'Outer' }
    const mid: ArtifactNode = { type: 'heading', label: 'Rules' }
    const child: ArtifactNode = { type: 'list-item' }
    const selector: Selector = {
      type: 'list-item',
      parent: { type: 'heading', matches: '^rules$' },
    }
    // nearest heading ancestor is 'Rules' (mid), so should match
    expect(selectorMatches(child, selector, [root, mid])).toBe(true)
  })

  it('returns false for invalid regex in matches (safeRegex returns null)', () => {
    const node: ArtifactNode = { type: 'heading', label: 'test' }
    // Catastrophic backtracking pattern
    expect(selectorMatches(node, { type: 'heading', matches: '(a+)+$' }, [])).toBe(false)
  })

  it('returns false for invalid regex in contains (safeRegex returns null)', () => {
    const node: ArtifactNode = { type: 'paragraph', value: 'test' }
    expect(selectorMatches(node, { type: 'paragraph', contains: '(a+)+$' }, [])).toBe(false)
  })

  it('matches node with undefined label against matches regex', () => {
    const node: ArtifactNode = { type: 'heading' }
    // Label is undefined → regex tests against ''
    expect(selectorMatches(node, { type: 'heading', matches: '^$' }, [])).toBe(true)
    expect(selectorMatches(node, { type: 'heading', matches: '.+' }, [])).toBe(false)
  })
})

describe('findNodes', () => {
  it('returns empty for a root with no matching children', () => {
    const root: ArtifactNode = { type: 'root' }
    expect(findNodes(root, { type: 'heading' })).toEqual([])
  })

  it('returns matching nodes from a flat tree', () => {
    const h1: ArtifactNode = { type: 'heading', label: 'Title' }
    const p: ArtifactNode = { type: 'paragraph', value: 'text' }
    const root: ArtifactNode = { type: 'root', children: [h1, p] }

    const results = findNodes(root, { type: 'heading' })
    expect(results).toEqual([h1])
  })

  it('returns matching nodes from a nested tree', () => {
    const li1: ArtifactNode = { type: 'list-item', label: 'a' }
    const li2: ArtifactNode = { type: 'list-item', label: 'b' }
    const section: ArtifactNode = { type: 'section', children: [li1, li2] }
    const root: ArtifactNode = { type: 'root', children: [section] }

    const results = findNodes(root, { type: 'list-item' })
    expect(results).toEqual([li1, li2])
  })

  it('matches root node itself if selector matches', () => {
    const root: ArtifactNode = { type: 'root' }
    expect(findNodes(root, { type: 'root' })).toEqual([root])
  })

  it('applies parent selector in nested tree', () => {
    const h1: ArtifactNode = { type: 'heading', label: 'Rules' }
    const li: ArtifactNode = { type: 'list-item', label: 'rule 1' }
    const h2: ArtifactNode = { type: 'heading', label: 'Other' }
    const li2: ArtifactNode = { type: 'list-item', label: 'item 2' }
    const root: ArtifactNode = { type: 'root', children: [h1, li, h2, li2] }

    // This will match both li and li2 since parent matching looks at ancestors,
    // and list-items are siblings of headings (both children of root).
    // The parent selector requires a heading ancestor with label 'Rules'.
    // Since li and li2 are direct children of root (not of a heading), neither
    // has a heading ancestor → both should NOT match.
    const selector: Selector = {
      type: 'list-item',
      parent: { type: 'heading', matches: '^rules$' },
    }
    expect(findNodes(root, selector)).toEqual([])
  })
})
