import { describe, it, expect } from 'vitest'
import { buildSchema, type SchemaYamlData } from '../../../src/domain/services/build-schema.js'
import { SchemaValidationError } from '../../../src/domain/errors/schema-validation-error.js'
import { CheckRegistry } from '../../../src/domain/services/check-registry.js'
import {
  CheckBindingOverrideForbiddenError,
  CheckConfigOverrideForbiddenError,
  CheckDisableForbiddenError,
  CheckEmbeddingForbiddenError,
  DuplicateCheckBindingError,
  UnknownCheckError,
} from '../../../src/domain/errors/check-registry-errors.js'

function minimalData(workflow?: Array<Record<string, unknown>>): SchemaYamlData {
  return {
    kind: 'schema',
    name: 'test',
    version: 1,
    artifacts: [{ id: 'spec', scope: 'spec', output: 'spec.md' }],
    workflow: workflow as unknown as SchemaYamlData['workflow'],
  }
}

function step(name: string): Record<string, unknown> {
  return {
    step: name,
    requires: [],
    requiresTaskCompletion: [],
    hooks: { pre: [], post: [] },
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

  it('populates compat and canonicalSpecSchema from string compat', () => {
    const data = {
      ...minimalData([]),
      compat: '@specd/schema-std@2',
    }
    const schema = buildSchema('#test', data, new Map())
    expect(schema.compat()).toEqual({ name: '@specd/schema-std', version: 2 })
    expect(schema.canonicalSpecSchema()).toEqual({ name: '@specd/schema-std', version: 2 })
  })

  it('populates compat and canonicalSpecSchema from object compat', () => {
    const data = {
      ...minimalData([]),
      compat: { name: 'schema-std', version: 3 },
    }
    const schema = buildSchema('#test', data, new Map())
    expect(schema.compat()).toEqual({ name: 'schema-std', version: 3 })
    expect(schema.canonicalSpecSchema()).toEqual({ name: 'schema-std', version: 3 })
  })

  it('falls back to extends parent in canonicalSpecSchema when compat is omitted', () => {
    const data = {
      ...minimalData([]),
      extends: '@specd/schema-std@1',
    }
    const schema = buildSchema('#test', data, new Map())
    expect(schema.compat()).toBeUndefined()
    expect(schema.canonicalSpecSchema()).toEqual({ name: '@specd/schema-std', version: 1 })
  })

  it('prefers compat over extends in canonicalSpecSchema', () => {
    const data = {
      ...minimalData([]),
      extends: '@specd/other-base',
      compat: '@specd/schema-std@2',
    }
    const schema = buildSchema('#test', data, new Map())
    expect(schema.compat()).toEqual({ name: '@specd/schema-std', version: 2 })
    expect(schema.canonicalSpecSchema()).toEqual({ name: '@specd/schema-std', version: 2 })
  })

  it('falls back to own identity in canonicalSpecSchema when compat and extends are omitted', () => {
    const schema = buildSchema('#test', minimalData([]), new Map())
    expect(schema.compat()).toBeUndefined()
    expect(schema.canonicalSpecSchema()).toEqual({ name: 'test', version: 1 })
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

  it('accepts explicit external hook entries in workflow steps', () => {
    const data = {
      kind: 'schema' as const,
      name: 'test',
      version: 1,
      artifacts: [{ id: 'spec', scope: 'spec' as const, output: 'spec.md' }],
      workflow: [
        {
          step: 'implementing',
          requires: [],
          requiresTaskCompletion: [],
          hooks: {
            pre: [
              {
                id: 'docker-test',
                type: 'external' as const,
                externalType: 'docker',
                config: { image: 'node:20' },
              },
            ],
            post: [],
          },
        },
      ],
    }

    const schema = buildSchema('#test', data, new Map())
    expect(schema.workflowStep('implementing')?.hooks.pre[0]).toEqual(
      data.workflow[0]!.hooks.pre[0],
    )
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
              { id: 'normative', instruction: 'Use SHALL' },
              { id: 'normative', instruction: 'Use MUST' },
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
              { id: 'format', instruction: 'Format rules' },
              { id: 'format', instruction: 'More format rules' },
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

  it('rejects requiresTaskCompletion entry referencing artifact without task capability (hasTasks: true)', () => {
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
    expect(() => buildSchema('#test', data, new Map())).toThrow(
      'does not have task capability (hasTasks: true)',
    )
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
          hasTasks: true,
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

  it('rejects requiresTaskCompletion referencing artifact without hasTasks', () => {
    const data = {
      kind: 'schema' as const,
      name: 'test',
      version: 1,
      artifacts: [
        { id: 'spec', scope: 'spec' as const, output: 'spec.md' },
        { id: 'tasks', scope: 'change' as const, output: 'tasks.md', hasTasks: false },
      ],
      workflow: [
        {
          step: 'implementing',
          requires: ['tasks'],
          requiresTaskCompletion: ['tasks'],
          hooks: { pre: [], post: [] },
        },
      ],
    }
    expect(() => buildSchema('#test', data, new Map())).toThrow(SchemaValidationError)
  })

  it('accepts requiresTaskCompletion referencing artifact with hasTasks: true', () => {
    const data = {
      kind: 'schema' as const,
      name: 'test',
      version: 1,
      artifacts: [
        { id: 'spec', scope: 'spec' as const, output: 'spec.md' },
        { id: 'tasks', scope: 'change' as const, output: 'tasks.md', hasTasks: true },
      ],
      workflow: [
        {
          step: 'implementing',
          requires: ['tasks'],
          requiresTaskCompletion: ['tasks'],
          hooks: { pre: [], post: [] },
        },
      ],
    }
    expect(() => buildSchema('#test', data, new Map())).not.toThrow()
  })

  it('treats hasTasks as metadata even when the output file is not tasks.md', () => {
    const data = {
      kind: 'schema' as const,
      name: 'test',
      version: 1,
      artifacts: [
        { id: 'checklist', scope: 'change' as const, output: 'checklist.md', hasTasks: true },
      ],
      workflow: [
        {
          step: 'archiving',
          requires: ['checklist'],
          requiresTaskCompletion: ['checklist'],
          hooks: { pre: [], post: [] },
        },
      ],
    }
    const schema = buildSchema('#test', data, new Map())
    expect(schema.artifact('checklist')?.hasTasks).toBe(true)
    expect(schema.workflowStep('archiving')?.requiresTaskCompletion).toEqual(['checklist'])
  })

  it('injects default patterns when hasTasks is true and patterns are missing', () => {
    const data = {
      kind: 'schema' as const,
      name: 'test',
      version: 1,
      artifacts: [{ id: 'tasks', scope: 'change' as const, output: 'tasks.md', hasTasks: true }],
    }
    const schema = buildSchema('#test', data, new Map())
    const artifact = schema.artifact('tasks')!
    expect(artifact.hasTasks).toBe(true)
    expect(artifact.taskCompletionCheck).toBeDefined()
    expect(artifact.taskCompletionCheck!.incompletePattern).toBe('^\\s*-\\s+\\[ \\]')
    expect(artifact.taskCompletionCheck!.completePattern).toBe('^\\s*-\\s+\\[[xX]\\]')
    const completePattern = new RegExp(artifact.taskCompletionCheck!.completePattern!, 'm')
    expect(completePattern.test('- [x] complete')).toBe(true)
    expect(completePattern.test('- [X] complete')).toBe(true)
  })

  it('rejects crossArtifactValidations relation alias that is not declared by participants', () => {
    const data = {
      kind: 'schema' as const,
      name: 'test',
      version: 1,
      artifacts: [
        { id: 'specs', scope: 'spec' as const, output: 'spec.md' },
        { id: 'verify', scope: 'spec' as const, output: 'verify.md' },
      ],
      crossArtifactValidations: [
        {
          id: 'mirrored',
          scope: 'spec' as const,
          participants: [
            {
              artifact: 'specs',
              as: 'left',
              selector: { type: 'section' },
              key: { from: 'label' as const },
            },
            {
              artifact: 'verify',
              as: 'right',
              selector: { type: 'section' },
              key: { from: 'label' as const },
            },
          ],
          relation: { kind: 'all-equal' as const, between: ['left', 'missing'] },
        },
      ],
    }
    expect(() => buildSchema('#test', data, new Map())).toThrow(SchemaValidationError)
  })

  it('rejects crossArtifactValidations participant alias duplicates', () => {
    const data = {
      kind: 'schema' as const,
      name: 'test',
      version: 1,
      artifacts: [
        { id: 'specs', scope: 'spec' as const, output: 'spec.md' },
        { id: 'verify', scope: 'spec' as const, output: 'verify.md' },
      ],
      crossArtifactValidations: [
        {
          id: 'mirrored',
          scope: 'spec' as const,
          participants: [
            {
              artifact: 'specs',
              as: 'dup',
              selector: { type: 'section' },
              key: { from: 'label' as const },
            },
            {
              artifact: 'verify',
              as: 'dup',
              selector: { type: 'section' },
              key: { from: 'label' as const },
            },
          ],
          relation: { kind: 'all-equal' as const, between: ['dup', 'dup'] },
        },
      ],
    }
    expect(() => buildSchema('#test', data, new Map())).toThrow(SchemaValidationError)
  })

  it('rejects duplicate crossArtifactValidations ids', () => {
    const data = {
      kind: 'schema' as const,
      name: 'test',
      version: 1,
      artifacts: [
        { id: 'specs', scope: 'spec' as const, output: 'spec.md' },
        { id: 'verify', scope: 'spec' as const, output: 'verify.md' },
      ],
      crossArtifactValidations: [
        {
          id: 'mirrored',
          scope: 'spec' as const,
          participants: [
            {
              artifact: 'specs',
              as: 'a',
              selector: { type: 'section' },
              key: { from: 'label' as const },
            },
            {
              artifact: 'verify',
              as: 'b',
              selector: { type: 'section' },
              key: { from: 'label' as const },
            },
          ],
          relation: { kind: 'all-equal' as const, between: ['a', 'b'] },
        },
        {
          id: 'mirrored',
          scope: 'spec' as const,
          participants: [
            {
              artifact: 'specs',
              as: 'c',
              selector: { type: 'section' },
              key: { from: 'label' as const },
            },
            {
              artifact: 'verify',
              as: 'd',
              selector: { type: 'section' },
              key: { from: 'label' as const },
            },
          ],
          relation: { kind: 'all-equal' as const, between: ['c', 'd'] },
        },
      ],
    }
    expect(() => buildSchema('#test', data, new Map())).toThrow(SchemaValidationError)
  })

  it('rejects crossArtifactValidations with unknown artifact reference', () => {
    const data = {
      kind: 'schema' as const,
      name: 'test',
      version: 1,
      artifacts: [
        { id: 'specs', scope: 'spec' as const, output: 'spec.md' },
        { id: 'verify', scope: 'spec' as const, output: 'verify.md' },
      ],
      crossArtifactValidations: [
        {
          id: 'mirrored',
          scope: 'spec' as const,
          participants: [
            {
              artifact: 'specs',
              as: 'a',
              selector: { type: 'section' },
              key: { from: 'label' as const },
            },
            {
              artifact: 'nonexistent',
              as: 'b',
              selector: { type: 'section' },
              key: { from: 'label' as const },
            },
          ],
          relation: { kind: 'all-equal' as const, between: ['a', 'b'] },
        },
      ],
    }
    expect(() => buildSchema('#test', data, new Map())).toThrow(SchemaValidationError)
  })

  it('rejects crossArtifactValidations with mixed scopes', () => {
    const data = {
      kind: 'schema' as const,
      name: 'test',
      version: 1,
      artifacts: [
        { id: 'specs', scope: 'spec' as const, output: 'spec.md' },
        { id: 'design', scope: 'change' as const, output: 'design.md' },
      ],
      crossArtifactValidations: [
        {
          id: 'mirrored',
          scope: 'spec' as const,
          participants: [
            {
              artifact: 'specs',
              as: 'a',
              selector: { type: 'section' },
              key: { from: 'label' as const },
            },
            {
              artifact: 'design',
              as: 'b',
              selector: { type: 'section' },
              key: { from: 'label' as const },
            },
          ],
          relation: { kind: 'all-equal' as const, between: ['a', 'b'] },
        },
      ],
    }
    expect(() => buildSchema('#test', data, new Map())).toThrow(SchemaValidationError)
  })

  it('stores crossArtifactValidations on schema when valid', () => {
    const data = {
      kind: 'schema' as const,
      name: 'test',
      version: 1,
      artifacts: [
        { id: 'specs', scope: 'spec' as const, output: 'spec.md' },
        { id: 'verify', scope: 'spec' as const, output: 'verify.md' },
      ],
      crossArtifactValidations: [
        {
          id: 'mirrored',
          scope: 'spec' as const,
          participants: [
            {
              artifact: 'specs',
              as: 'a',
              selector: { type: 'section' },
              key: { from: 'label' as const },
            },
            {
              artifact: 'verify',
              as: 'b',
              selector: { type: 'section' },
              key: { from: 'label' as const },
            },
          ],
          relation: { kind: 'all-equal' as const, between: ['a', 'b'] },
        },
      ],
    }
    const schema = buildSchema('#test', data, new Map())
    expect(schema.crossArtifactValidations()).toHaveLength(1)
    expect(schema.crossArtifactValidations()[0]!.id).toBe('mirrored')
  })

  it('rejects count.exactly combined with min/max', () => {
    const data = {
      ...minimalData(),
      artifacts: [
        {
          id: 'spec',
          scope: 'spec' as const,
          output: 'spec.md',
          validations: [{ id: 'v1', type: 'section', count: { exactly: 1, min: 1 } }],
        },
      ],
    }
    expect(() => buildSchema('#test', data, new Map())).toThrow(SchemaValidationError)
  })

  it('rejects count.unique.exactlyUnique combined with minUnique/maxUnique', () => {
    const data = {
      ...minimalData(),
      artifacts: [
        {
          id: 'spec',
          scope: 'spec' as const,
          output: 'spec.md',
          validations: [
            {
              id: 'v1',
              type: 'section',
              count: {
                unique: { by: { from: 'label' as const }, exactlyUnique: 2, minUnique: 1 },
              },
            },
          ],
        },
      ],
    }
    expect(() => buildSchema('#test', data, new Map())).toThrow(SchemaValidationError)
  })

  it('rejects count.unique minUnique > maxUnique', () => {
    const data = {
      ...minimalData(),
      artifacts: [
        {
          id: 'spec',
          scope: 'spec' as const,
          output: 'spec.md',
          validations: [
            {
              id: 'v1',
              type: 'section',
              count: {
                unique: { by: { from: 'label' as const }, minUnique: 3, maxUnique: 2 },
              },
            },
          ],
        },
      ],
    }
    expect(() => buildSchema('#test', data, new Map())).toThrow(SchemaValidationError)
  })

  describe('workflow checks validation and governance', () => {
    it('accepts valid custom checks registered in CheckRegistry', () => {
      const registry = new CheckRegistry()
      registry.register('my-plugin', {
        id: 'linter',
        label: 'Linter',
        execute: async () => ({
          id: 'test',
          label: 'Test',
          kind: 'predicate',
          outcome: 'pass',
          details: {},
        }),
      })

      const data = {
        ...minimalData([
          {
            ...step('implementing'),
            checks: [{ id: '@my-plugin.linter', config: { strict: true } }],
          },
        ]),
      }

      const schema = buildSchema('#test', data, new Map(), registry)
      const stepObj = schema.workflowStep('implementing')
      expect(stepObj?.checks).toBeDefined()
      expect(stepObj?.checks?.[0]?.id).toBe('@my-plugin.linter')
      expect(stepObj?.checks?.[0]?.config).toEqual({ strict: true })
    })

    it('rejects unknown check IDs with UnknownCheckError', () => {
      const registry = new CheckRegistry()
      const data = {
        ...minimalData([
          {
            ...step('implementing'),
            checks: [{ id: '@unknown.check' }],
          },
        ]),
      }

      expect(() => buildSchema('#test', data, new Map(), registry)).toThrow(UnknownCheckError)
    })

    it('rejects duplicate check IDs in the same workflow step with DuplicateCheckBindingError', () => {
      const registry = new CheckRegistry()
      registry.register('my-plugin', {
        id: 'linter',
        label: 'Linter',
        execute: async () => ({
          id: 'test',
          label: 'Test',
          kind: 'predicate',
          outcome: 'pass',
          details: {},
        }),
      })

      const data = {
        ...minimalData([
          {
            ...step('implementing'),
            checks: [{ id: '@my-plugin.linter' }, { id: '@my-plugin.linter' }],
          },
        ]),
      }

      expect(() => buildSchema('#test', data, new Map(), registry)).toThrow(
        DuplicateCheckBindingError,
      )
    })

    it('rejects embedding Category A protocol invariants and Category B native attributes in schema workflow steps', () => {
      const registry = new CheckRegistry()
      const lockedBuiltinIds = [
        // Category A: Protocol & State Invariants
        'protocol.edge',
        'verification.current',
        'archive.archivable',
        'schema.nameMatch',
        'hook.pre',
        'hook.post',
        // Category B: Native Step Attributes
        'workflow.requires',
        'workflow.taskCompletion',
        'approval.spec',
        'approval.signoff',
      ]

      for (const id of lockedBuiltinIds) {
        const data = {
          ...minimalData([
            {
              ...step('verifying'),
              checks: [{ id }],
            },
          ]),
        }
        expect(() => buildSchema('#test', data, new Map(), registry)).toThrow(
          CheckEmbeddingForbiddenError,
        )
      }
    })

    it('allows embedding and configuring Category C built-in checks in schema workflow steps', () => {
      const registry = new CheckRegistry()
      const categoryCIds = [
        'impl.linksInScope',
        'spec.overlap',
        'deps.consistent',
        'impl.filesResolved',
        'workspace.readOnly',
      ]

      for (const id of categoryCIds) {
        const data = {
          ...minimalData([
            {
              ...step('verifying'),
              checks: [{ id, config: { maxScopeDiff: 10 } }],
            },
          ]),
        }
        const schema = buildSchema('#test', data, new Map(), registry)
        const verifyingStep = schema.workflowStep('verifying')
        const declaredCheck = verifyingStep?.checks?.find((c) => c.id === id)
        expect(declaredCheck).toBeDefined()
        expect(declaredCheck?.config).toEqual({ maxScopeDiff: 10 })
      }
    })

    it('allows Category C built-in checks to be declaratively disabled with disabled: true', () => {
      const registry = new CheckRegistry()
      const categoryCIds = [
        'impl.linksInScope',
        'spec.overlap',
        'deps.consistent',
        'impl.filesResolved',
        'workspace.readOnly',
      ]

      for (const id of categoryCIds) {
        const data = {
          ...minimalData([
            {
              ...step('verifying'),
              checks: [{ id, disabled: true }],
            },
          ]),
        }
        const schema = buildSchema('#test', data, new Map(), registry)
        const verifyingStep = schema.workflowStep('verifying')
        const declaredCheck = verifyingStep?.checks?.find((c) => c.id === id)
        expect(declaredCheck).toBeDefined()
        expect(declaredCheck?.disabled).toBe(true)
      }
    })

    it('rejects binding override when allowBindingOverride is false with CheckBindingOverrideForbiddenError', () => {
      const registry = new CheckRegistry()
      registry.register(
        'my-plugin',
        {
          id: 'locked-binding',
          label: 'Locked Binding',
          execute: async () => ({
            id: 'test',
            label: 'Test',
            kind: 'predicate',
            outcome: 'pass',
            details: {},
          }),
        },
        [
          {
            scope: 'transition',
            to: 'implementing',
            skippable: false,
          },
        ],
        { allowBindingOverride: false },
      )

      const data = {
        ...minimalData([
          {
            ...step('implementing'),
            checks: [{ id: '@my-plugin.locked-binding', skippable: true }],
          },
        ]),
      }

      expect(() => buildSchema('#test', data, new Map(), registry)).toThrow(
        CheckBindingOverrideForbiddenError,
      )
    })

    it('rejects config override when allowConfigOverride is false with CheckConfigOverrideForbiddenError', () => {
      const registry = new CheckRegistry()
      registry.register(
        'my-plugin',
        {
          id: 'locked-config',
          label: 'Locked Config',
          execute: async () => ({
            id: 'test',
            label: 'Test',
            kind: 'predicate',
            outcome: 'pass',
            details: {},
          }),
        },
        [],
        { allowConfigOverride: false },
      )

      const data = {
        ...minimalData([
          {
            ...step('implementing'),
            checks: [{ id: '@my-plugin.locked-config', config: { override: true } }],
          },
        ]),
      }

      expect(() => buildSchema('#test', data, new Map(), registry)).toThrow(
        CheckConfigOverrideForbiddenError,
      )
    })

    it('rejects disabled: true when check has allowDisable: false with CheckDisableForbiddenError', () => {
      const registry = new CheckRegistry()
      registry.register(
        'my-plugin',
        {
          id: 'non-disableable',
          label: 'Non Disableable',
          execute: async () => ({
            id: 'test',
            label: 'Test',
            kind: 'predicate',
            outcome: 'pass',
            details: {},
          }),
        },
        [],
        { allowDisable: false },
      )

      const data = {
        ...minimalData([
          {
            ...step('implementing'),
            checks: [{ id: '@my-plugin.non-disableable', disabled: true }],
          },
        ]),
      }

      expect(() => buildSchema('#test', data, new Map(), registry)).toThrow(
        CheckDisableForbiddenError,
      )
    })

    it('rejects disabled: true when binding has allowDisable: false with CheckDisableForbiddenError', () => {
      const registry = new CheckRegistry()
      registry.register(
        'my-plugin',
        {
          id: 'binding-locked',
          label: 'Binding Locked',
          execute: async () => ({
            id: 'test',
            label: 'Test',
            kind: 'predicate',
            outcome: 'pass',
            details: {},
          }),
        },
        [
          {
            scope: 'transition',
            to: 'implementing',
            allowDisable: false,
          },
        ],
        { allowDisable: true }, // check allows it, but binding locks it
      )

      const data = {
        ...minimalData([
          {
            ...step('implementing'),
            checks: [{ id: '@my-plugin.binding-locked', disabled: true }],
          },
        ]),
      }

      expect(() => buildSchema('#test', data, new Map(), registry)).toThrow(
        CheckDisableForbiddenError,
      )
    })

    it('preserves existing binding allowDisable lock when an identical binding is redeclared in schema', () => {
      const registry = new CheckRegistry()
      registry.register(
        'compliance',
        {
          id: 'audit',
          label: 'Audit Check',
          execute: async () => ({
            id: 'test',
            label: 'Test',
            kind: 'predicate',
            outcome: 'pass',
            details: {},
          }),
        },
        [
          {
            scope: 'transition',
            to: 'verifying',
            along: 'forward',
            allowDisable: false,
          },
        ],
      )

      // Schema redeclares the exact same check coordinate attempting to disable it
      const data = {
        ...minimalData([
          {
            ...step('verifying'),
            checks: [
              {
                id: '@compliance.audit',
                along: 'forward',
                disabled: true,
              },
            ],
          },
        ]),
      }

      // Pre-existing binding lock must NOT be overwritten or erased
      expect(() => buildSchema('#test', data, new Map(), registry)).toThrow(
        CheckDisableForbiddenError,
      )
    })

    it('allows disabled: true when allowDisable is true', () => {
      const registry = new CheckRegistry()
      registry.register(
        'my-plugin',
        {
          id: 'optional-check',
          label: 'Optional Check',
          execute: async () => ({
            id: 'test',
            label: 'Test',
            kind: 'predicate',
            outcome: 'pass',
            details: {},
          }),
        },
        [],
        { allowDisable: true },
      )

      const data = {
        ...minimalData([
          {
            ...step('implementing'),
            checks: [{ id: '@my-plugin.optional-check', disabled: true }],
          },
        ]),
      }

      const schema = buildSchema('#test', data, new Map(), registry)
      const stepObj = schema.workflowStep('implementing')
      expect(stepObj?.checks?.[0]?.disabled).toBe(true)
    })
  })

  describe('hook onFailure policy', () => {
    it('parses onFailure: "warn" and "abort" correctly', () => {
      const data = {
        ...minimalData([
          {
            ...step('implementing'),
            hooks: {
              pre: [
                { id: 'h1', type: 'run', command: 'echo 1', onFailure: 'warn' },
                { id: 'h2', type: 'run', command: 'echo 2', onFailure: 'abort' },
              ],
              post: [],
            },
          },
        ]),
      }

      const schema = buildSchema('#test', data, new Map())
      const stepObj = schema.workflowStep('implementing')
      expect((stepObj?.hooks.pre[0] as any)?.onFailure).toBe('warn')
      expect((stepObj?.hooks.pre[1] as any)?.onFailure).toBe('abort')
    })

    it('rejects invalid hook onFailure values with SchemaValidationError', () => {
      const data = {
        ...minimalData([
          {
            ...step('implementing'),
            hooks: {
              pre: [{ id: 'h1', type: 'run', command: 'echo 1', onFailure: 'invalid' as any }],
              post: [],
            },
          },
        ]),
      }

      expect(() => buildSchema('#test', data, new Map())).toThrow(SchemaValidationError)
    })
  })
})
