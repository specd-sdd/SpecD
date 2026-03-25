import { describe, it, expect } from 'vitest'
import { buildSchema } from '../../../src/domain/services/build-schema.js'
import { SchemaValidationError } from '../../../src/domain/errors/schema-validation-error.js'

function minimalData(
  workflow?: Array<{
    step: string
    requires: string[]
    requiresTaskCompletion: string[]
    hooks: { pre: never[]; post: never[] }
  }>,
) {
  return {
    kind: 'schema' as const,
    name: 'test',
    version: 1,
    artifacts: [{ id: 'spec', scope: 'spec' as const, output: 'spec.md' }],
    workflow,
  }
}

function step(name: string) {
  return {
    step: name,
    requires: [],
    requiresTaskCompletion: [],
    hooks: { pre: [] as never[], post: [] as never[] },
  }
}

describe('buildSchema', () => {
  it('accepts workflow steps that are valid ChangeState values', () => {
    const schema = buildSchema('#test', minimalData([step('designing')]), new Map())
    expect(schema.workflowStep('designing')).not.toBeNull()
  })

  it('rejects workflow steps that are not valid ChangeState values', () => {
    expect(() => buildSchema('#test', minimalData([step('reviewing')]), new Map())).toThrow(
      SchemaValidationError,
    )
  })

  it('accepts archiving as a valid workflow step', () => {
    const schema = buildSchema('#test', minimalData([step('archiving')]), new Map())
    expect(schema.workflowStep('archiving')).not.toBeNull()
  })

  it('rejects duplicate hook IDs across different workflow steps', () => {
    const data = {
      kind: 'schema' as const,
      name: 'test',
      version: 1,
      artifacts: [{ id: 'spec', scope: 'spec' as const, output: 'spec.md' }],
      workflow: [
        {
          step: 'designing',
          requires: [],
          requiresTaskCompletion: [],
          hooks: {
            pre: [{ id: 'run-lint', type: 'instruction' as const, text: 'lint' }],
            post: [],
          },
        },
        {
          step: 'implementing',
          requires: [],
          requiresTaskCompletion: [],
          hooks: {
            pre: [],
            post: [{ id: 'run-lint', type: 'instruction' as const, text: 'lint' }],
          },
        },
      ],
    }
    expect(() => buildSchema('#test', data, new Map())).toThrow(SchemaValidationError)
  })

  it('accepts unique hook IDs across workflow steps', () => {
    const data = {
      kind: 'schema' as const,
      name: 'test',
      version: 1,
      artifacts: [{ id: 'spec', scope: 'spec' as const, output: 'spec.md' }],
      workflow: [
        {
          step: 'designing',
          requires: [],
          requiresTaskCompletion: [],
          hooks: { pre: [{ id: 'lint', type: 'instruction' as const, text: 'lint' }], post: [] },
        },
        {
          step: 'implementing',
          requires: [],
          requiresTaskCompletion: [],
          hooks: {
            pre: [{ id: 'test', type: 'instruction' as const, text: 'test' }],
            post: [{ id: 'deploy', type: 'instruction' as const, text: 'deploy' }],
          },
        },
      ],
    }
    const schema = buildSchema('#test', data, new Map())
    expect(schema.workflowStep('designing')).not.toBeNull()
    expect(schema.workflowStep('implementing')).not.toBeNull()
  })

  it('rejects duplicate validation IDs within the same artifact', () => {
    const data = {
      kind: 'schema' as const,
      name: 'test',
      version: 1,
      artifacts: [
        {
          id: 'spec',
          scope: 'spec' as const,
          output: 'spec.md',
          validations: [
            { id: 'req-1', type: 'section', matches: '^Requirements$' },
            { id: 'req-1', type: 'list-item', matches: '^Item' },
          ],
        },
      ],
    }
    expect(() => buildSchema('#test', data, new Map())).toThrow(SchemaValidationError)
  })

  it('rejects duplicate deltaValidation IDs within the same artifact', () => {
    const data = {
      kind: 'schema' as const,
      name: 'test',
      version: 1,
      artifacts: [
        {
          id: 'spec',
          scope: 'spec' as const,
          output: 'spec.md',
          delta: true,
          deltaValidations: [
            { id: 'has-scenario', type: 'section' },
            { id: 'has-scenario', type: 'list-item' },
          ],
        },
      ],
    }
    expect(() => buildSchema('#test', data, new Map())).toThrow(SchemaValidationError)
  })

  it('rejects duplicate rules.pre IDs within the same artifact', () => {
    const data = {
      kind: 'schema' as const,
      name: 'test',
      version: 1,
      artifacts: [
        {
          id: 'spec',
          scope: 'spec' as const,
          output: 'spec.md',
          rules: {
            pre: [
              { id: 'normative', text: 'Use SHALL' },
              { id: 'normative', text: 'Use MUST' },
            ],
          },
        },
      ],
    }
    expect(() => buildSchema('#test', data, new Map())).toThrow(SchemaValidationError)
  })

  it('rejects duplicate rules.post IDs within the same artifact', () => {
    const data = {
      kind: 'schema' as const,
      name: 'test',
      version: 1,
      artifacts: [
        {
          id: 'spec',
          scope: 'spec' as const,
          output: 'spec.md',
          rules: {
            post: [
              { id: 'format', text: 'Format rules' },
              { id: 'format', text: 'More format rules' },
            ],
          },
        },
      ],
    }
    expect(() => buildSchema('#test', data, new Map())).toThrow(SchemaValidationError)
  })

  it('rejects duplicate preHashCleanup IDs within the same artifact', () => {
    const data = {
      kind: 'schema' as const,
      name: 'test',
      version: 1,
      artifacts: [
        {
          id: 'spec',
          scope: 'spec' as const,
          output: 'spec.md',
          preHashCleanup: [
            { id: 'checkboxes', pattern: '^- \\[x\\]', replacement: '- [ ]' },
            { id: 'checkboxes', pattern: '^  - \\[x\\]', replacement: '  - [ ]' },
          ],
        },
      ],
    }
    expect(() => buildSchema('#test', data, new Map())).toThrow(SchemaValidationError)
  })

  it('rejects duplicate metadataExtraction.context IDs', () => {
    const data = {
      kind: 'schema' as const,
      name: 'test',
      version: 1,
      artifacts: [{ id: 'spec', scope: 'spec' as const, output: 'spec.md' }],
      metadataExtraction: {
        context: [
          { id: 'ctx-1', artifact: 'spec', extractor: { selector: { type: 'section' } } },
          { id: 'ctx-1', artifact: 'spec', extractor: { selector: { type: 'list-item' } } },
        ],
      },
    }
    expect(() => buildSchema('#test', data, new Map())).toThrow(SchemaValidationError)
  })

  it('rejects duplicate metadataExtraction.rules IDs', () => {
    const data = {
      kind: 'schema' as const,
      name: 'test',
      version: 1,
      artifacts: [{ id: 'spec', scope: 'spec' as const, output: 'spec.md' }],
      metadataExtraction: {
        rules: [
          { id: 'rule-1', artifact: 'spec', extractor: { selector: { type: 'section' } } },
          { id: 'rule-1', artifact: 'spec', extractor: { selector: { type: 'list-item' } } },
        ],
      },
    }
    expect(() => buildSchema('#test', data, new Map())).toThrow(SchemaValidationError)
  })

  it('rejects duplicate metadataExtraction.constraints IDs', () => {
    const data = {
      kind: 'schema' as const,
      name: 'test',
      version: 1,
      artifacts: [{ id: 'spec', scope: 'spec' as const, output: 'spec.md' }],
      metadataExtraction: {
        constraints: [
          { id: 'constraint-1', artifact: 'spec', extractor: { selector: { type: 'section' } } },
          { id: 'constraint-1', artifact: 'spec', extractor: { selector: { type: 'list-item' } } },
        ],
      },
    }
    expect(() => buildSchema('#test', data, new Map())).toThrow(SchemaValidationError)
  })

  it('rejects duplicate metadataExtraction.scenarios IDs', () => {
    const data = {
      kind: 'schema' as const,
      name: 'test',
      version: 1,
      artifacts: [{ id: 'spec', scope: 'spec' as const, output: 'spec.md' }],
      metadataExtraction: {
        scenarios: [
          { id: 'scenario-1', artifact: 'spec', extractor: { selector: { type: 'section' } } },
          { id: 'scenario-1', artifact: 'spec', extractor: { selector: { type: 'list-item' } } },
        ],
      },
    }
    expect(() => buildSchema('#test', data, new Map())).toThrow(SchemaValidationError)
  })

  it('accepts same ID in different arrays', () => {
    const data = {
      kind: 'schema' as const,
      name: 'test',
      version: 1,
      artifacts: [
        {
          id: 'spec',
          scope: 'spec' as const,
          output: 'spec.md',
          validations: [{ id: 'v1', type: 'section' }],
          deltaValidations: [{ id: 'v1', type: 'section' }],
          preHashCleanup: [{ id: 'v1', pattern: 'a', replacement: 'b' }],
        },
        {
          id: 'spec2',
          scope: 'spec' as const,
          output: 'spec2.md',
          validations: [{ id: 'v1', type: 'section' }],
        },
      ],
    }
    const schema = buildSchema('#test', data, new Map())
    expect(schema.artifact('spec')).not.toBeNull()
    expect(schema.artifact('spec2')).not.toBeNull()
  })

  it('rejects requiresTaskCompletion entry not in requires', () => {
    const data = {
      ...minimalData(),
      artifacts: [
        { id: 'specs', scope: 'spec' as const, output: 'spec.md' },
        {
          id: 'tasks',
          scope: 'change' as const,
          output: 'tasks.md',
          taskCompletionCheck: { incompletePattern: '^\\s*-\\s+\\[ \\]' },
        },
      ],
      workflow: [
        {
          step: 'verifying' as const,
          requires: ['specs'],
          requiresTaskCompletion: ['tasks'],
          hooks: { pre: [] as never[], post: [] as never[] },
        },
      ],
    }
    expect(() => buildSchema('#test', data, new Map())).toThrow(SchemaValidationError)
    expect(() => buildSchema('#test', data, new Map())).toThrow("'tasks' is not in requires")
  })

  it('rejects requiresTaskCompletion entry referencing artifact without taskCompletionCheck', () => {
    const data = {
      ...minimalData(),
      artifacts: [{ id: 'specs', scope: 'spec' as const, output: 'spec.md' }],
      workflow: [
        {
          step: 'verifying' as const,
          requires: ['specs'],
          requiresTaskCompletion: ['specs'],
          hooks: { pre: [] as never[], post: [] as never[] },
        },
      ],
    }
    expect(() => buildSchema('#test', data, new Map())).toThrow(SchemaValidationError)
    expect(() => buildSchema('#test', data, new Map())).toThrow('does not have taskCompletionCheck')
  })

  it('accepts valid requiresTaskCompletion', () => {
    const data = {
      ...minimalData(),
      artifacts: [
        { id: 'specs', scope: 'spec' as const, output: 'spec.md' },
        {
          id: 'tasks',
          scope: 'change' as const,
          output: 'tasks.md',
          taskCompletionCheck: { incompletePattern: '^\\s*-\\s+\\[ \\]' },
        },
      ],
      workflow: [
        {
          step: 'verifying' as const,
          requires: ['specs', 'tasks'],
          requiresTaskCompletion: ['tasks'],
          hooks: { pre: [] as never[], post: [] as never[] },
        },
      ],
    }
    const schema = buildSchema('#test', data, new Map())
    const ws = schema.workflowStep('verifying')
    expect(ws?.requiresTaskCompletion).toEqual(['tasks'])
  })
})
