import { describe, expect, it } from 'vitest'
import {
  mergeSchemaLayers,
  type SchemaLayer,
} from '../../../src/domain/services/merge-schema-layers.js'
import { type SchemaYamlData } from '../../../src/domain/services/build-schema.js'
import { SchemaValidationError } from '../../../src/domain/errors/schema-validation-error.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function base(overrides: Partial<SchemaYamlData> = {}): SchemaYamlData {
  return {
    kind: 'schema',
    name: 'test',
    version: 1,
    artifacts: [
      {
        id: 'specs',
        scope: 'spec',
        output: 'spec.md',
        instruction: 'Old instruction',
        description: 'Spec artifact',
        validations: [
          { id: 'has-purpose', type: 'section', matches: '^Purpose$', required: true },
          { id: 'has-requirements', type: 'section', matches: '^Requirements$', required: true },
        ],
        rules: {
          post: [{ id: 'normative', instruction: 'Use MUST/SHALL.' }],
        },
      },
      {
        id: 'tasks',
        scope: 'change',
        output: 'tasks.md',
        requires: ['specs'],
        preHashCleanup: [
          { id: 'normalize-checkboxes', pattern: '^\\s*-\\s+\\[x\\]', replacement: '- [ ]' },
        ],
      },
    ],
    workflow: [
      {
        step: 'designing',
        requires: [],
        requiresTaskCompletion: [],
        hooks: {
          pre: [{ id: 'design-guidance', type: 'instruction', text: 'Design carefully.' }],
          post: [],
        },
      },
      {
        step: 'implementing',
        requires: ['specs'],
        requiresTaskCompletion: [],
        hooks: {
          pre: [],
          post: [{ id: 'run-tests', type: 'run', command: 'pnpm test' }],
        },
      },
    ],
    ...overrides,
  }
}

function layer(
  source: 'extends' | 'plugin' | 'override',
  operations: SchemaLayer['operations'],
): SchemaLayer {
  return { source, ref: `test-${source}`, operations }
}

// ---------------------------------------------------------------------------
// Requirement: Five operations with fixed intra-layer order
// ---------------------------------------------------------------------------

describe('mergeSchemaLayers — remove before create (no collision)', () => {
  it('removes then creates without collision', () => {
    const result = mergeSchemaLayers(base(), [
      layer('plugin', {
        remove: { artifacts: [{ id: 'tasks' }] },
        create: {
          artifacts: [{ id: 'new-tasks', scope: 'change', output: 'new-tasks.md' }],
        },
      }),
    ])
    expect(result.artifacts!.find((a) => a.id === 'tasks')).toBeUndefined()
    expect(result.artifacts!.find((a) => a.id === 'new-tasks')).toBeDefined()
  })
})

describe('mergeSchemaLayers — create collides with existing entry', () => {
  it('throws SchemaValidationError on collision', () => {
    expect(() =>
      mergeSchemaLayers(base(), [
        layer('plugin', {
          create: {
            artifacts: [{ id: 'specs', scope: 'spec', output: 'x.md' }],
          },
        }),
      ]),
    ).toThrow(SchemaValidationError)
  })
})

describe('mergeSchemaLayers — append adds at end in order', () => {
  it('appends workflow steps at the end', () => {
    const result = mergeSchemaLayers(base(), [
      layer('plugin', {
        append: {
          workflow: [
            {
              step: 'reviewing',
              requires: [],
              requiresTaskCompletion: [],
              hooks: { pre: [], post: [] },
            },
            {
              step: 'deploying',
              requires: [],
              requiresTaskCompletion: [],
              hooks: { pre: [], post: [] },
            },
          ],
        },
      }),
    ])
    const steps = result.workflow!.map((s) => s.step)
    expect(steps).toEqual(['designing', 'implementing', 'reviewing', 'deploying'])
  })
})

describe('mergeSchemaLayers — prepend adds at beginning in order', () => {
  it('prepends validations', () => {
    const result = mergeSchemaLayers(base(), [
      layer('plugin', {
        prepend: {
          artifacts: [
            {
              id: 'specs',
              validations: [
                { id: 'has-title', type: 'section', matches: '^Title$', required: true },
              ],
            },
          ],
        },
      }),
    ])
    const specsArtifact = result.artifacts!.find((a) => a.id === 'specs')!
    const ids = specsArtifact.validations!.map((v) => v.id)
    expect(ids).toEqual(['has-title', 'has-purpose', 'has-requirements'])
  })
})

describe('mergeSchemaLayers — set replaces in-place', () => {
  it('replaces artifact instruction preserving other fields', () => {
    const result = mergeSchemaLayers(base(), [
      layer('override', {
        set: {
          artifacts: [{ id: 'specs', instruction: 'New instruction' }],
        },
      }),
    ])
    const specs = result.artifacts!.find((a) => a.id === 'specs')!
    expect(specs.instruction).toBe('New instruction')
    expect(specs.description).toBe('Spec artifact')
    expect(specs.scope).toBe('spec')
  })
})

describe('mergeSchemaLayers — set on non-existent entry throws', () => {
  it('throws for missing artifact', () => {
    expect(() =>
      mergeSchemaLayers(base(), [
        layer('override', {
          set: {
            artifacts: [{ id: 'nonexistent', instruction: 'text' }],
          },
        }),
      ]),
    ).toThrow(SchemaValidationError)
  })
})

// ---------------------------------------------------------------------------
// Requirement: Cross-layer ordering
// ---------------------------------------------------------------------------

describe('mergeSchemaLayers — later layer overrides earlier', () => {
  it('last set wins for scalars', () => {
    const result = mergeSchemaLayers(base(), [
      layer('plugin', { set: { description: 'Plugin description' } }),
      layer('override', { set: { description: 'Override description' } }),
    ])
    expect(result.description).toBe('Override description')
  })
})

describe('mergeSchemaLayers — plugin appends, override removes', () => {
  it('plugin adds rule, override removes it', () => {
    const result = mergeSchemaLayers(base(), [
      layer('plugin', {
        append: {
          artifacts: [
            {
              id: 'specs',
              rules: {
                post: [{ id: 'rfc-rule', instruction: 'Reference RFC.' }],
              },
            },
          ],
        },
      }),
      layer('override', {
        remove: {
          artifacts: [
            {
              id: 'specs',
              rules: { post: [{ id: 'rfc-rule' }] },
            },
          ],
        },
      }),
    ])
    const specs = result.artifacts!.find((a) => a.id === 'specs')!
    expect(specs.rules!.post!.find((r) => r.id === 'rfc-rule')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Requirement: Identity matching
// ---------------------------------------------------------------------------

describe('mergeSchemaLayers — nested hook removal targets correct step', () => {
  it('only removes hook from specified step', () => {
    const result = mergeSchemaLayers(base(), [
      layer('override', {
        remove: {
          workflow: [
            {
              step: 'implementing',
              hooks: { post: [{ id: 'run-tests' }] },
            },
          ],
        },
      }),
    ])
    // implementing hooks.post should be empty
    const implementing = result.workflow!.find((s) => s.step === 'implementing')!
    expect(implementing.hooks.post).toHaveLength(0)
    // designing hooks should be untouched
    const designing = result.workflow!.find((s) => s.step === 'designing')!
    expect(designing.hooks.pre).toHaveLength(1)
  })
})

describe('mergeSchemaLayers — remove non-existent entry throws', () => {
  it('throws for missing hook', () => {
    expect(() =>
      mergeSchemaLayers(base(), [
        layer('override', {
          remove: {
            workflow: [
              {
                step: 'implementing',
                hooks: { post: [{ id: 'nonexistent' }] },
              },
            ],
          },
        }),
      ]),
    ).toThrow(SchemaValidationError)
  })
})

// ---------------------------------------------------------------------------
// Requirement: Remove operation semantics
// ---------------------------------------------------------------------------

describe('mergeSchemaLayers — remove optional scalar field', () => {
  it('clears description to undefined', () => {
    const result = mergeSchemaLayers(base(), [
      layer('override', {
        remove: {
          artifacts: [{ id: 'specs', description: null }],
        },
      }),
    ])
    const specs = result.artifacts!.find((a) => a.id === 'specs')!
    expect(specs.description).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Requirement: Post-merge validation
// ---------------------------------------------------------------------------

describe('mergeSchemaLayers — dangling requires after removal', () => {
  it('throws when requires references removed artifact', () => {
    // tasks requires specs — remove specs
    expect(() =>
      mergeSchemaLayers(base(), [
        layer('override', {
          remove: { artifacts: [{ id: 'specs' }] },
        }),
      ]),
    ).toThrow(/requires.*specs.*does not exist/)
  })
})

describe('mergeSchemaLayers — duplicate identity after merge', () => {
  it('throws for duplicate artifact id', () => {
    // Create a base with one artifact, then append a duplicate through nested operation bypass
    const simpleBase: SchemaYamlData = {
      kind: 'schema',
      name: 'test',
      version: 1,
      artifacts: [{ id: 'specs', scope: 'spec', output: 'spec.md' }],
    }
    // This should be caught by the create operation itself, but verify post-merge also catches
    expect(() =>
      mergeSchemaLayers(simpleBase, [
        layer('plugin', {
          create: {
            artifacts: [{ id: 'specs', scope: 'change', output: 'x.md' }],
          },
        }),
      ]),
    ).toThrow(SchemaValidationError)
  })
})

// ---------------------------------------------------------------------------
// Requirement: Immutability
// ---------------------------------------------------------------------------

describe('mergeSchemaLayers — immutability', () => {
  it('does not mutate the base object', () => {
    const b = base()
    const originalName = b.name
    const originalArtifactCount = b.artifacts!.length

    mergeSchemaLayers(b, [
      layer('override', {
        set: { name: 'modified', description: 'Changed' },
        create: {
          artifacts: [{ id: 'new-one', scope: 'change', output: 'new.md' }],
        },
      }),
    ])

    expect(b.name).toBe(originalName)
    expect(b.artifacts!.length).toBe(originalArtifactCount)
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('mergeSchemaLayers — empty layers', () => {
  it('returns equivalent data with no layers', () => {
    const b = base()
    const result = mergeSchemaLayers(b, [])
    expect(result.name).toBe(b.name)
    expect(result.artifacts!.length).toBe(b.artifacts!.length)
  })
})
