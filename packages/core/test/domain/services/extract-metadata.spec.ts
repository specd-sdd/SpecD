import { describe, it, expect } from 'vitest'
import {
  extractContent,
  type SubtreeRenderer,
  type GroupedExtraction,
  type StructuredExtraction,
} from '../../../src/domain/services/content-extraction.js'
import { extractMetadata } from '../../../src/domain/services/extract-metadata.js'
import { type SelectorNode } from '../../../src/domain/services/selector-matching.js'
import { type Extractor } from '../../../src/domain/value-objects/extractor.js'
import { type MetadataExtraction } from '../../../src/domain/value-objects/metadata-extraction.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple renderer that returns label or renders children recursively (with trailing newline like real parsers). */
const renderer: SubtreeRenderer = {
  renderSubtree(node: SelectorNode): string {
    if (node.children === undefined || node.children.length === 0) {
      const text =
        node.value !== undefined && node.value !== null ? String(node.value) : (node.label ?? '')
      return text + '\n'
    }
    return node.children
      .map((c) => renderer.renderSubtree(c))
      .filter(Boolean)
      .join('')
  },
}

function section(label: string, children?: SelectorNode[], level?: number): SelectorNode {
  return {
    type: 'section',
    label,
    ...(level !== undefined ? { level } : {}),
    ...(children !== undefined ? { children } : {}),
  }
}

function listItem(label: string, value?: string): SelectorNode {
  return {
    type: 'list-item',
    label,
    ...(value !== undefined ? { value } : {}),
  }
}

function paragraph(value: string): SelectorNode {
  return { type: 'paragraph', value }
}

// ---------------------------------------------------------------------------
// extractContent — single/array values
// ---------------------------------------------------------------------------

describe('extractContent', () => {
  it('extracts label from first matching node', () => {
    const root: SelectorNode = {
      type: 'document',
      children: [section('My Title', [], 1)],
    }
    const extractor: Extractor = {
      selector: { type: 'section', level: 1 },
      extract: 'label',
    }
    const result = extractContent(root, extractor, renderer)
    expect(result).toEqual(['My Title'])
  })

  it('extracts content from matching nodes', () => {
    const root: SelectorNode = {
      type: 'document',
      children: [section('Overview', [paragraph('This is the overview.')])],
    }
    const extractor: Extractor = {
      selector: { type: 'section', matches: '^Overview$' },
      extract: 'content',
    }
    const result = extractContent(root, extractor, renderer)
    expect(result).toEqual(['This is the overview.'])
  })

  it('returns empty array when no nodes match', () => {
    const root: SelectorNode = { type: 'document', children: [] }
    const extractor: Extractor = {
      selector: { type: 'section', matches: '^Missing$' },
    }
    expect(extractContent(root, extractor, renderer)).toEqual([])
  })

  it('applies capture regex to extract links', () => {
    const root: SelectorNode = {
      type: 'document',
      children: [
        section('Spec Dependencies', [
          paragraph('[dep1](../dep1/spec.md) and [dep2](../dep2/spec.md)'),
        ]),
      ],
    }
    const extractor: Extractor = {
      selector: { type: 'section', matches: '^Spec Dependencies$' },
      extract: 'content',
      capture: '\\[.*?\\]\\(([^)]+)\\)',
    }
    const result = extractContent(root, extractor, renderer)
    expect(result).toEqual(['../dep1/spec.md', '../dep2/spec.md'])
  })

  it('applies strip regex to remove prefix', () => {
    const root: SelectorNode = {
      type: 'document',
      children: [section('Requirement: User Login')],
    }
    const extractor: Extractor = {
      selector: { type: 'section', matches: '^Requirement:' },
      extract: 'label',
      strip: '^Requirement:\\s*',
    }
    const result = extractContent(root, extractor, renderer)
    expect(result).toEqual(['User Login'])
  })

  it('applies named transform', () => {
    const root: SelectorNode = {
      type: 'document',
      children: [section('Deps', [paragraph('../a/spec.md')])],
    }
    const extractor: Extractor = {
      selector: { type: 'section', matches: '^Deps$' },
      extract: 'content',
      transform: 'resolveSpecPath',
    }
    const transforms = new Map([
      [
        'resolveSpecPath',
        (vals: string[]) => vals.map((v) => v.replace('../', '').replace('/spec.md', '')),
      ],
    ])
    const result = extractContent(root, extractor, renderer, transforms)
    expect(result).toEqual(['a'])
  })

  // groupBy: label
  it('groups matched nodes by label', () => {
    const root: SelectorNode = {
      type: 'document',
      children: [
        section('Requirements', [
          section('Requirement: Auth', [
            listItem('Must validate tokens'),
            listItem('Must check expiry'),
          ]),
          section('Requirement: Logging', [listItem('Must log all errors')]),
        ]),
      ],
    }
    const extractor: Extractor = {
      selector: {
        type: 'section',
        matches: '^Requirement:',
        parent: { type: 'section', matches: '^Requirements$' },
      },
      groupBy: 'label',
      strip: '^Requirement:\\s*',
      extract: 'content',
    }
    const result = extractContent(root, extractor, renderer) as GroupedExtraction[]
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      label: 'Auth',
      items: ['Must validate tokens\nMust check expiry'],
    })
    expect(result[1]).toEqual({
      label: 'Logging',
      items: ['Must log all errors'],
    })
  })

  // fields (structured extraction)
  it('extracts structured objects with fields mapping', () => {
    const root: SelectorNode = {
      type: 'document',
      children: [
        section('Requirement: Auth', [
          section('Scenario: Token Valid', [
            listItem('GIVEN a valid token', '**GIVEN** a valid token'),
            listItem('WHEN validated', '**WHEN** the token is validated'),
            listItem('THEN access granted', '**THEN** access is granted'),
          ]),
        ]),
      ],
    }
    const extractor: Extractor = {
      selector: {
        type: 'section',
        matches: '^Scenario:',
        parent: { type: 'section', matches: '^Requirement:' },
      },
      fields: {
        name: { from: 'label', strip: '^Scenario:\\s*' },
        given: {
          childSelector: { type: 'list-item', contains: 'GIVEN' },
          capture: '\\*\\*GIVEN\\*\\*\\s*(.+)',
        },
        when: {
          childSelector: { type: 'list-item', contains: 'WHEN' },
          capture: '\\*\\*WHEN\\*\\*\\s*(.+)',
        },
        then: {
          childSelector: { type: 'list-item', contains: 'THEN' },
          capture: '\\*\\*THEN\\*\\*\\s*(.+)',
        },
      },
    }
    const result = extractContent(root, extractor, renderer) as StructuredExtraction[]
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      name: 'Token Valid',
      given: ['a valid token'],
      when: ['the token is validated'],
      then: ['access is granted'],
    })
  })

  // followSiblings — sequential AND grouping
  it('groups AND siblings with the preceding keyword field via followSiblings', () => {
    const root: SelectorNode = {
      type: 'document',
      children: [
        section('Requirement: Auth', [
          section('Scenario: Multi-step', [
            listItem('GIVEN a user exists'),
            listItem('AND the user is active'),
            listItem('WHEN login is attempted'),
            listItem('THEN access is granted'),
            listItem('AND a session is created'),
          ]),
        ]),
      ],
    }
    const extractor: Extractor = {
      selector: {
        type: 'section',
        matches: '^Scenario:',
        parent: { type: 'section', matches: '^Requirement:' },
      },
      fields: {
        name: { from: 'label', strip: '^Scenario:\\s*' },
        given: {
          childSelector: { type: 'list-item', matches: '^GIVEN\\b' },
          capture: '^GIVEN\\s+(.+)',
          followSiblings: '^(?:AND|OR)\\b',
        },
        when: {
          childSelector: { type: 'list-item', matches: '^WHEN\\b' },
          capture: '^WHEN\\s+(.+)',
          followSiblings: '^(?:AND|OR)\\b',
        },
        then: {
          childSelector: { type: 'list-item', matches: '^THEN\\b' },
          capture: '^THEN\\s+(.+)',
          followSiblings: '^(?:AND|OR)\\b',
        },
      },
    }
    const result = extractContent(root, extractor, renderer) as StructuredExtraction[]
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      name: 'Multi-step',
      given: ['a user exists', 'AND the user is active'],
      when: ['login is attempted'],
      then: ['access is granted', 'AND a session is created'],
    })
  })

  it('handles scenario with no WHEN (GIVEN + AND + THEN)', () => {
    const root: SelectorNode = {
      type: 'document',
      children: [
        section('Requirement: Auth', [
          section('Scenario: Direct', [
            listItem('GIVEN a precondition'),
            listItem('AND another precondition'),
            listItem('THEN outcome happens'),
          ]),
        ]),
      ],
    }
    const extractor: Extractor = {
      selector: {
        type: 'section',
        matches: '^Scenario:',
        parent: { type: 'section', matches: '^Requirement:' },
      },
      fields: {
        name: { from: 'label', strip: '^Scenario:\\s*' },
        given: {
          childSelector: { type: 'list-item', matches: '^GIVEN\\b' },
          capture: '^GIVEN\\s+(.+)',
          followSiblings: '^(?:AND|OR)\\b',
        },
        when: {
          childSelector: { type: 'list-item', matches: '^WHEN\\b' },
          capture: '^WHEN\\s+(.+)',
          followSiblings: '^(?:AND|OR)\\b',
        },
        then: {
          childSelector: { type: 'list-item', matches: '^THEN\\b' },
          capture: '^THEN\\s+(.+)',
          followSiblings: '^(?:AND|OR)\\b',
        },
      },
    }
    const result = extractContent(root, extractor, renderer) as StructuredExtraction[]
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      name: 'Direct',
      given: ['a precondition', 'AND another precondition'],
      then: ['outcome happens'],
    })
  })
})

// ---------------------------------------------------------------------------
// extractMetadata — orchestrator
// ---------------------------------------------------------------------------

describe('extractMetadata', () => {
  it('extracts title and description from spec artifact', () => {
    const specAst: { root: SelectorNode } = {
      root: {
        type: 'document',
        children: [
          section('Selector Model', [], 1),
          section('Overview', [paragraph('The selector model defines how nodes are identified.')]),
        ],
      },
    }

    const extraction: MetadataExtraction = {
      title: {
        artifact: 'specs',
        extractor: { selector: { type: 'section', level: 1 }, extract: 'label' },
      },
      description: {
        artifact: 'specs',
        extractor: { selector: { type: 'section', matches: '^Overview$' }, extract: 'content' },
      },
    }

    const asts = new Map([['specs', specAst]])
    const renderers = new Map([['specs', renderer]])

    const result = extractMetadata(extraction, asts, renderers)
    expect(result.title).toBe('Selector Model')
    expect(result.description).toBe('The selector model defines how nodes are identified.')
  })

  it('extracts dependsOn with capture and transform', () => {
    const specAst: { root: SelectorNode } = {
      root: {
        type: 'document',
        children: [
          section('Spec Dependencies', [
            paragraph('[ast](../artifact-ast/spec.md) and [delta](../delta-format/spec.md)'),
          ]),
        ],
      },
    }

    const extraction: MetadataExtraction = {
      dependsOn: {
        artifact: 'specs',
        extractor: {
          selector: { type: 'section', matches: '^Spec Dependencies$' },
          extract: 'content',
          capture: '\\[.*?\\]\\(([^)]+)\\)',
          transform: 'resolveSpecPath',
        },
      },
    }

    const asts = new Map([['specs', specAst]])
    const renderers = new Map([['specs', renderer]])
    const transforms = new Map([
      [
        'resolveSpecPath',
        (vals: string[]) =>
          vals.map((v) => {
            const match = v.match(/\.\.\/([^/]+)\/spec\.md/)
            return match ? `core/${match[1]}` : v
          }),
      ],
    ])

    const result = extractMetadata(extraction, asts, renderers, transforms)
    expect(result.dependsOn).toEqual(['core/artifact-ast', 'core/delta-format'])
  })

  it('extracts rules as grouped extraction', () => {
    const specAst: { root: SelectorNode } = {
      root: {
        type: 'document',
        children: [
          section('Requirements', [
            section('Requirement: Selector fields', [
              listItem('type is required'),
              listItem('matches is optional'),
            ]),
            section('Requirement: Multi-match', [listItem('multiple matches are returned')]),
          ]),
        ],
      },
    }

    const extraction: MetadataExtraction = {
      rules: [
        {
          artifact: 'specs',
          extractor: {
            selector: {
              type: 'section',
              matches: '^Requirement:',
              parent: { type: 'section', matches: '^Requirements$' },
            },
            groupBy: 'label',
            strip: '^Requirement:\\s*',
            extract: 'content',
          },
        },
      ],
    }

    const asts = new Map([['specs', specAst]])
    const renderers = new Map([['specs', renderer]])

    const result = extractMetadata(extraction, asts, renderers)
    expect(result.rules).toEqual([
      { requirement: 'Selector fields', rules: ['type is required\nmatches is optional'] },
      { requirement: 'Multi-match', rules: ['multiple matches are returned'] },
    ])
  })

  it('extracts constraints as string array', () => {
    const specAst: { root: SelectorNode } = {
      root: {
        type: 'document',
        children: [
          section('Constraints', [
            listItem('index and where are mutually exclusive'),
            listItem('type must be valid'),
          ]),
        ],
      },
    }

    const extraction: MetadataExtraction = {
      constraints: [
        {
          artifact: 'specs',
          extractor: {
            selector: {
              type: 'list-item',
              parent: { type: 'section', matches: '^Constraints$' },
            },
            extract: 'label',
          },
        },
      ],
    }

    const asts = new Map([['specs', specAst]])
    const renderers = new Map([['specs', renderer]])

    const result = extractMetadata(extraction, asts, renderers)
    expect(result.constraints).toEqual([
      'index and where are mutually exclusive',
      'type must be valid',
    ])
  })

  it('returns empty metadata when no ASTs are provided', () => {
    const extraction: MetadataExtraction = {
      title: {
        artifact: 'specs',
        extractor: { selector: { type: 'section', level: 1 }, extract: 'label' },
      },
    }

    const result = extractMetadata(extraction, new Map(), new Map())
    expect(result.title).toBeUndefined()
  })

  it('extracts context from multiple entries', () => {
    const specAst: { root: SelectorNode } = {
      root: {
        type: 'document',
        children: [
          section('Overview', [paragraph('Overview content.')]),
          section('Purpose', [paragraph('Purpose content.')]),
        ],
      },
    }

    const extraction: MetadataExtraction = {
      context: [
        {
          artifact: 'specs',
          extractor: {
            selector: { type: 'section', matches: '^Overview$' },
            extract: 'content',
          },
        },
        {
          artifact: 'specs',
          extractor: {
            selector: { type: 'section', matches: '^Purpose$' },
            extract: 'content',
          },
        },
      ],
    }

    const asts = new Map([['specs', specAst]])
    const renderers = new Map([['specs', renderer]])

    const result = extractMetadata(extraction, asts, renderers)
    expect(result.context).toEqual(['Overview content.', 'Purpose content.'])
  })
})
