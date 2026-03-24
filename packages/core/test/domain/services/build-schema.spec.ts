import { describe, it, expect } from 'vitest'
import { buildSchema } from '../../../src/domain/services/build-schema.js'
import { SchemaValidationError } from '../../../src/domain/errors/schema-validation-error.js'

function minimalData(
  workflow?: Array<{ step: string; requires: string[]; hooks: { pre: never[]; post: never[] } }>,
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
  return { step: name, requires: [], hooks: { pre: [] as never[], post: [] as never[] } }
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
          hooks: {
            pre: [{ id: 'run-lint', type: 'instruction' as const, text: 'lint' }],
            post: [],
          },
        },
        {
          step: 'implementing',
          requires: [],
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
          hooks: { pre: [{ id: 'lint', type: 'instruction' as const, text: 'lint' }], post: [] },
        },
        {
          step: 'implementing',
          requires: [],
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
})
