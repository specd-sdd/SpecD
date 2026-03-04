import { describe, it, expect, vi } from 'vitest'
import {
  evaluateRules,
  selectNodes,
  selectBySelector,
  nodeMatches,
  collectNodes,
  selectByJsonPath,
  tokenizeJsonPath,
  type RuleEvaluatorNode,
  type RuleEvaluatorParser,
} from '../../../src/domain/services/rule-evaluator.js'
import { type ValidationRule } from '../../../src/domain/value-objects/validation-rule.js'

const mockParser: RuleEvaluatorParser = {
  renderSubtree: vi.fn((node: RuleEvaluatorNode) => node.label ?? ''),
}

describe('evaluateRules', () => {
  it('returns no failures or warnings when rules match', () => {
    const root: RuleEvaluatorNode = {
      type: 'section',
      label: 'Overview',
      children: [],
    }
    const rules: ValidationRule[] = [
      { selector: { type: 'section', matches: 'Overview' }, required: true },
    ]

    const result = evaluateRules(rules, root, 'specs', mockParser)
    expect(result.failures).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('records failure when required rule not satisfied', () => {
    const root: RuleEvaluatorNode = { type: 'document', children: [] }
    const rules: ValidationRule[] = [
      { selector: { type: 'section', matches: 'Missing' }, required: true },
    ]

    const result = evaluateRules(rules, root, 'specs', mockParser)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]!.description).toContain('Required rule not satisfied')
  })

  it('records warning when optional rule not satisfied', () => {
    const root: RuleEvaluatorNode = { type: 'document', children: [] }
    const rules: ValidationRule[] = [
      { selector: { type: 'section', matches: 'Optional' }, required: false },
    ]

    const result = evaluateRules(rules, root, 'specs', mockParser)
    expect(result.warnings).toHaveLength(1)
    expect(result.failures).toHaveLength(0)
  })

  it('evaluates contentMatches against rendered subtree', () => {
    const root: RuleEvaluatorNode = { type: 'section', label: 'Overview' }
    const rules: ValidationRule[] = [
      { selector: { type: 'section', matches: 'Overview' }, contentMatches: 'XYZ', required: true },
    ]

    const result = evaluateRules(rules, root, 'specs', mockParser)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]!.description).toContain('does not match pattern')
  })

  it('evaluates nested children rules', () => {
    const root: RuleEvaluatorNode = {
      type: 'section',
      label: 'Requirements',
      children: [{ type: 'section', label: 'Req 1' }],
    }
    const rules: ValidationRule[] = [
      {
        selector: { type: 'section', matches: 'Requirements' },
        required: true,
        children: [{ selector: { type: 'section', matches: 'Req 1' }, required: true }],
      },
    ]

    const result = evaluateRules(rules, root, 'specs', mockParser)
    expect(result.failures).toHaveLength(0)
  })
})

describe('selectNodes', () => {
  it('returns root when no path or selector', () => {
    const root: RuleEvaluatorNode = { type: 'document' }
    const result = selectNodes(root, {})
    expect(result).toEqual([root])
  })

  it('selects by selector', () => {
    const child: RuleEvaluatorNode = { type: 'section', label: 'Foo' }
    const root: RuleEvaluatorNode = { type: 'document', children: [child] }
    const result = selectNodes(root, { selector: { type: 'section', matches: 'Foo' } })
    expect(result).toEqual([child])
  })

  it('selects by path', () => {
    const child: RuleEvaluatorNode = { type: 'section', label: 'Bar' }
    const root: RuleEvaluatorNode = { type: 'document', children: [child] }
    const result = selectNodes(root, { path: '$.children[0]' })
    expect(result).toEqual([child])
  })
})

describe('selectBySelector', () => {
  it('respects parent selector', () => {
    const leaf: RuleEvaluatorNode = { type: 'item', label: 'leaf' }
    const parent: RuleEvaluatorNode = { type: 'section', label: 'Parent', children: [leaf] }
    const root: RuleEvaluatorNode = { type: 'document', children: [parent] }

    const result = selectBySelector(root, {
      type: 'item',
      parent: { type: 'section', matches: 'Parent' },
    })
    expect(result).toEqual([leaf])
  })

  it('respects index', () => {
    const a: RuleEvaluatorNode = { type: 'item', label: 'a' }
    const b: RuleEvaluatorNode = { type: 'item', label: 'b' }
    const root: RuleEvaluatorNode = { type: 'document', children: [a, b] }

    const result = selectBySelector(root, { type: 'item', index: 1 })
    expect(result).toEqual([b])
  })
})

describe('nodeMatches', () => {
  it('matches by type', () => {
    expect(nodeMatches({ type: 'section' }, { type: 'section' })).toBe(true)
    expect(nodeMatches({ type: 'section' }, { type: 'paragraph' })).toBe(false)
  })

  it('matches by regex on label', () => {
    expect(
      nodeMatches({ type: 'section', label: 'Overview' }, { type: 'section', matches: 'over' }),
    ).toBe(true)
    expect(
      nodeMatches({ type: 'section', label: 'Details' }, { type: 'section', matches: 'over' }),
    ).toBe(false)
  })

  it('matches by contains on value', () => {
    expect(
      nodeMatches({ type: 'text', value: 'hello world' }, { type: 'text', contains: 'hello' }),
    ).toBe(true)
  })

  it('matches where clause', () => {
    const node: RuleEvaluatorNode = {
      type: 'sequence-item',
      children: [
        {
          type: 'mapping',
          children: [{ type: 'pair', label: 'name', value: 'foo' }],
        },
      ],
    }
    expect(nodeMatches(node, { type: 'sequence-item', where: { name: 'foo' } })).toBe(true)
    expect(nodeMatches(node, { type: 'sequence-item', where: { name: 'bar' } })).toBe(false)
  })
})

describe('collectNodes', () => {
  it('collects all nodes recursively', () => {
    const leaf: RuleEvaluatorNode = { type: 'text', label: 'leaf' }
    const child: RuleEvaluatorNode = { type: 'section', label: 'child', children: [leaf] }
    const root: RuleEvaluatorNode = { type: 'document', children: [child] }

    const result = collectNodes(root)
    expect(result).toHaveLength(3)
    expect(result).toContain(root)
    expect(result).toContain(child)
    expect(result).toContain(leaf)
  })
})

describe('selectByJsonPath', () => {
  it('returns root for $', () => {
    const root: RuleEvaluatorNode = { type: 'document' }
    expect(selectByJsonPath(root, '$')).toEqual([root])
  })

  it('navigates $.children[0]', () => {
    const child: RuleEvaluatorNode = { type: 'section', label: 'A' }
    const root: RuleEvaluatorNode = { type: 'document', children: [child] }
    expect(selectByJsonPath(root, '$.children[0]')).toEqual([child])
  })

  it('navigates $.children[*]', () => {
    const a: RuleEvaluatorNode = { type: 'section', label: 'A' }
    const b: RuleEvaluatorNode = { type: 'section', label: 'B' }
    const root: RuleEvaluatorNode = { type: 'document', children: [a, b] }
    expect(selectByJsonPath(root, '$.children[*]')).toEqual([a, b])
  })
})

describe('tokenizeJsonPath', () => {
  it('tokenizes a simple path', () => {
    expect(tokenizeJsonPath('$.children[0]')).toEqual(['$', '.children', '[0]'])
  })

  it('tokenizes a wildcard path', () => {
    expect(tokenizeJsonPath('$.children[*]')).toEqual(['$', '.children', '[*]'])
  })

  it('tokenizes a recursive descent path', () => {
    expect(tokenizeJsonPath('$..children')).toEqual(['$', '..children'])
  })
})
