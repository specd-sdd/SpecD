import { describe, expect, it } from 'vitest'
import { evaluateCrossArtifactRule } from '../../../src/domain/services/cross-artifact-rule-evaluator.js'
import { type SelectorNode } from '../../../src/domain/services/selector-matching.js'
import { type RuleEvaluatorParser } from '../../../src/domain/services/rule-evaluator.js'
import { type CrossArtifactValidationRule } from '../../../src/domain/value-objects/cross-artifact-validation.js'

const parser: RuleEvaluatorParser = {
  renderSubtree(node: SelectorNode): string {
    return node.label ?? node.value?.toString() ?? ''
  },
}

function buildRequirementsRoot(ids: string[]): SelectorNode {
  return {
    type: 'section',
    label: 'Requirements',
    children: ids.map((id) => ({
      type: 'section',
      label: `Requirement: ${id}`,
    })),
  }
}

function buildRule(
  kind: 'all-equal' | 'subset' | 'superset',
  ordering: 'ignore' | 'strict',
): CrossArtifactValidationRule {
  return {
    id: 'mirrored-requirements',
    scope: 'spec',
    participants: [
      {
        artifact: 'specs',
        as: 'specRequirements',
        selector: { type: 'section', matches: '^Requirement:' },
        key: { from: 'label', strip: '^Requirement:\\s*' },
      },
      {
        artifact: 'verify',
        as: 'verifyRequirements',
        selector: { type: 'section', matches: '^Requirement:' },
        key: { from: 'label', strip: '^Requirement:\\s*' },
      },
    ],
    relation: {
      kind,
      between: ['specRequirements', 'verifyRequirements'],
      options: { ordering },
    },
  }
}

describe('evaluateCrossArtifactRule', () => {
  it('passes all-equal with ordering ignore on same sets', () => {
    const result = evaluateCrossArtifactRule({
      rule: buildRule('all-equal', 'ignore'),
      participants: new Map([
        [
          'specRequirements',
          { artifactId: 'specs', root: buildRequirementsRoot(['A', 'B']), parser },
        ],
        [
          'verifyRequirements',
          { artifactId: 'verify', root: buildRequirementsRoot(['B', 'A']), parser },
        ],
      ]),
    })

    expect(result.failures).toHaveLength(0)
  })

  it('fails all-equal with ordering strict when order differs', () => {
    const result = evaluateCrossArtifactRule({
      rule: buildRule('all-equal', 'strict'),
      participants: new Map([
        [
          'specRequirements',
          { artifactId: 'specs', root: buildRequirementsRoot(['A', 'B']), parser },
        ],
        [
          'verifyRequirements',
          { artifactId: 'verify', root: buildRequirementsRoot(['B', 'A']), parser },
        ],
      ]),
    })

    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]!.description).toContain('differ')
    expect(result.failures[0]!.description).toContain('ordering: strict')
  })

  it('passes subset with strict ordering when source is subsequence', () => {
    const result = evaluateCrossArtifactRule({
      rule: buildRule('subset', 'strict'),
      participants: new Map([
        [
          'specRequirements',
          { artifactId: 'specs', root: buildRequirementsRoot(['A', 'C']), parser },
        ],
        [
          'verifyRequirements',
          { artifactId: 'verify', root: buildRequirementsRoot(['A', 'B', 'C']), parser },
        ],
      ]),
    })

    expect(result.failures).toHaveLength(0)
  })

  it('fails superset when target contains missing key', () => {
    const result = evaluateCrossArtifactRule({
      rule: buildRule('superset', 'ignore'),
      participants: new Map([
        ['specRequirements', { artifactId: 'specs', root: buildRequirementsRoot(['A']), parser }],
        [
          'verifyRequirements',
          { artifactId: 'verify', root: buildRequirementsRoot(['A', 'B']), parser },
        ],
      ]),
    })

    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]!.description).toContain('Missing in')
  })

  it('fails all-equal with ordering ignore when sets differ', () => {
    const result = evaluateCrossArtifactRule({
      rule: buildRule('all-equal', 'ignore'),
      participants: new Map([
        [
          'specRequirements',
          { artifactId: 'specs', root: buildRequirementsRoot(['A', 'B']), parser },
        ],
        [
          'verifyRequirements',
          { artifactId: 'verify', root: buildRequirementsRoot(['A', 'C']), parser },
        ],
      ]),
    })

    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]!.description).toContain('differ')
  })

  it('passes subset with ordering ignore when source is subset', () => {
    const result = evaluateCrossArtifactRule({
      rule: buildRule('subset', 'ignore'),
      participants: new Map([
        ['specRequirements', { artifactId: 'specs', root: buildRequirementsRoot(['A']), parser }],
        [
          'verifyRequirements',
          { artifactId: 'verify', root: buildRequirementsRoot(['A', 'B']), parser },
        ],
      ]),
    })

    expect(result.failures).toHaveLength(0)
  })

  it('fails superset with ordering strict when not supersequence', () => {
    const result = evaluateCrossArtifactRule({
      rule: buildRule('superset', 'strict'),
      participants: new Map([
        [
          'specRequirements',
          { artifactId: 'specs', root: buildRequirementsRoot(['A', 'C']), parser },
        ],
        [
          'verifyRequirements',
          { artifactId: 'verify', root: buildRequirementsRoot(['A', 'B', 'C']), parser },
        ],
      ]),
    })

    expect(result.failures).toHaveLength(1)
  })
})

describe('evaluateCrossArtifactRule key extraction', () => {
  function buildRootWithValueNodes(ids: string[]): SelectorNode {
    return {
      type: 'section',
      label: 'Requirements',
      children: ids.map((id) => ({
        type: 'item',
        value: `REQ-${id}`,
      })),
    }
  }

  function buildRootWithContentNodes(ids: string[]): SelectorNode {
    return {
      type: 'section',
      label: 'Requirements',
      children: ids.map((id) => ({
        type: 'section',
        label: 'Req',
        content: `req-${id}`,
      })),
    }
  }

  function buildRootWithNestedChildren(ids: string[]): SelectorNode {
    return {
      type: 'section',
      label: 'Requirements',
      children: ids.map((id) => ({
        type: 'section',
        label: 'Req',
        children: [{ type: 'item', value: `NESTED-${id}` }],
      })),
    }
  }

  const valueParser: RuleEvaluatorParser = {
    renderSubtree(node: SelectorNode): string {
      return node.value?.toString() ?? (node.content as string) ?? ''
    },
  }

  it('extracts keys using key.from value', () => {
    const rule: CrossArtifactValidationRule = {
      id: 'mirrored',
      scope: 'spec',
      participants: [
        {
          artifact: 'specs',
          as: 'left',
          selector: { type: 'item' },
          key: { from: 'value' },
        },
        {
          artifact: 'verify',
          as: 'right',
          selector: { type: 'item' },
          key: { from: 'value' },
        },
      ],
      relation: { kind: 'all-equal', between: ['left', 'right'], options: { ordering: 'ignore' } },
    }
    const result = evaluateCrossArtifactRule({
      rule,
      participants: new Map([
        [
          'left',
          { artifactId: 'specs', root: buildRootWithValueNodes(['A', 'B']), parser: valueParser },
        ],
        [
          'right',
          { artifactId: 'verify', root: buildRootWithValueNodes(['B', 'A']), parser: valueParser },
        ],
      ]),
    })

    expect(result.failures).toHaveLength(0)
  })

  it('extracts keys using key.from content', () => {
    const rule: CrossArtifactValidationRule = {
      id: 'mirrored',
      scope: 'spec',
      participants: [
        {
          artifact: 'specs',
          as: 'left',
          selector: { type: 'section', matches: '^Req$' },
          key: { from: 'content' },
        },
        {
          artifact: 'verify',
          as: 'right',
          selector: { type: 'section', matches: '^Req$' },
          key: { from: 'content' },
        },
      ],
      relation: { kind: 'all-equal', between: ['left', 'right'], options: { ordering: 'ignore' } },
    }
    const result = evaluateCrossArtifactRule({
      rule,
      participants: new Map([
        ['left', { artifactId: 'specs', root: buildRootWithContentNodes(['A', 'B']), parser }],
        ['right', { artifactId: 'verify', root: buildRootWithContentNodes(['B', 'A']), parser }],
      ]),
    })

    expect(result.failures).toHaveLength(0)
  })

  it('extracts keys using key.capture regex', () => {
    const rule: CrossArtifactValidationRule = {
      id: 'mirrored',
      scope: 'spec',
      participants: [
        {
          artifact: 'specs',
          as: 'left',
          selector: { type: 'section', matches: '^Requirement:' },
          key: { from: 'label', capture: 'Requirement:\\s*(.+)' },
        },
        {
          artifact: 'verify',
          as: 'right',
          selector: { type: 'section', matches: '^Requirement:' },
          key: { from: 'label', capture: 'Requirement:\\s*(.+)' },
        },
      ],
      relation: { kind: 'all-equal', between: ['left', 'right'], options: { ordering: 'ignore' } },
    }
    const result = evaluateCrossArtifactRule({
      rule,
      participants: new Map([
        ['left', { artifactId: 'specs', root: buildRequirementsRoot(['A', 'B']), parser }],
        ['right', { artifactId: 'verify', root: buildRequirementsRoot(['B', 'A']), parser }],
      ]),
    })

    expect(result.failures).toHaveLength(0)
  })

  it('extracts nested values using keySelector before key extraction', () => {
    const rule: CrossArtifactValidationRule = {
      id: 'mirrored',
      scope: 'spec',
      participants: [
        {
          artifact: 'specs',
          as: 'left',
          selector: { type: 'section', matches: '^Req$' },
          keySelector: { type: 'item' },
          key: { from: 'value' },
        },
        {
          artifact: 'verify',
          as: 'right',
          selector: { type: 'section', matches: '^Req$' },
          keySelector: { type: 'item' },
          key: { from: 'value' },
        },
      ],
      relation: { kind: 'all-equal', between: ['left', 'right'], options: { ordering: 'ignore' } },
    }
    const result = evaluateCrossArtifactRule({
      rule,
      participants: new Map([
        [
          'left',
          {
            artifactId: 'specs',
            root: buildRootWithNestedChildren(['A', 'B']),
            parser: valueParser,
          },
        ],
        [
          'right',
          {
            artifactId: 'verify',
            root: buildRootWithNestedChildren(['B', 'A']),
            parser: valueParser,
          },
        ],
      ]),
    })

    expect(result.failures).toHaveLength(0)
  })

  it('detects mismatch when keySelector extracts different nested values', () => {
    const rule: CrossArtifactValidationRule = {
      id: 'mirrored',
      scope: 'spec',
      participants: [
        {
          artifact: 'specs',
          as: 'left',
          selector: { type: 'section', matches: '^Req$' },
          keySelector: { type: 'item' },
          key: { from: 'value' },
        },
        {
          artifact: 'verify',
          as: 'right',
          selector: { type: 'section', matches: '^Req$' },
          keySelector: { type: 'item' },
          key: { from: 'value' },
        },
      ],
      relation: { kind: 'all-equal', between: ['left', 'right'], options: { ordering: 'ignore' } },
    }
    const result = evaluateCrossArtifactRule({
      rule,
      participants: new Map([
        [
          'left',
          { artifactId: 'specs', root: buildRootWithNestedChildren(['A']), parser: valueParser },
        ],
        [
          'right',
          { artifactId: 'verify', root: buildRootWithNestedChildren(['X']), parser: valueParser },
        ],
      ]),
    })

    expect(result.failures).toHaveLength(1)
  })
})
