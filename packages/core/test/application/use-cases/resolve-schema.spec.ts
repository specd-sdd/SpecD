import { describe, it, expect } from 'vitest'
import { ResolveSchema } from '../../../src/application/use-cases/resolve-schema.js'
import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { SchemaValidationError } from '../../../src/domain/errors/schema-validation-error.js'
import {
  type SchemaRegistry,
  type SchemaRawResult,
} from '../../../src/application/ports/schema-registry.js'
import { type SchemaYamlData } from '../../../src/domain/services/build-schema.js'
import { type SchemaOperations } from '../../../src/domain/services/merge-schema-layers.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minimalData(overrides: Partial<SchemaYamlData> = {}): SchemaYamlData {
  return {
    kind: 'schema',
    name: 'test',
    version: 1,
    artifacts: [{ id: 'spec', scope: 'spec', output: 'spec.md' }],
    ...overrides,
  }
}

function rawResult(
  data: SchemaYamlData,
  resolvedPath = '/schemas/test/schema.yaml',
  templates = new Map<string, string>(),
): SchemaRawResult {
  return { data, templates, resolvedPath }
}

function makeRegistry(results: Record<string, SchemaRawResult | null>): SchemaRegistry {
  return {
    async resolve() {
      return null
    },
    async resolveRaw(_ref: string) {
      return results[_ref] ?? null
    },
    async list() {
      return []
    },
  }
}

/**
 * Shorthand to build a ResolveSchema and execute it.
 */
async function resolve(
  registry: SchemaRegistry,
  ref: string,
  plugins: string[] = [],
  overrides?: SchemaOperations,
) {
  const sut = new ResolveSchema(registry, ref, new Map(), plugins, overrides)
  return sut.execute()
}

// ===========================================================================
// 1. Base resolution (no extends, no plugins, no overrides)
// ===========================================================================

describe('ResolveSchema — base resolution', () => {
  it('resolves a plain schema with no customisation', async () => {
    const data = minimalData({ name: 'my-schema' })
    const registry = makeRegistry({ '#base': rawResult(data) })

    const schema = await resolve(registry, '#base')

    expect(schema.name()).toBe('my-schema')
    expect(schema.kind()).toBe('schema')
    expect(schema.artifacts()).toHaveLength(1)
    expect(schema.artifacts()[0]!.id).toBe('spec')
  })

  it('throws SchemaNotFoundError when base not found', async () => {
    const registry = makeRegistry({})
    await expect(resolve(registry, '@specd/missing')).rejects.toThrow(SchemaNotFoundError)
  })
})

// ===========================================================================
// 2. Extends chain — cascade semantics
// ===========================================================================

describe('ResolveSchema — extends', () => {
  it('child inherits artifacts from parent', async () => {
    const parent = minimalData({
      name: 'parent',
      artifacts: [
        { id: 'spec', scope: 'spec', output: 'spec.md', instruction: 'Parent instruction' },
        { id: 'tasks', scope: 'change', output: 'tasks.md' },
      ],
    })
    const child = minimalData({
      name: 'child',
      extends: '#parent',
      artifacts: [], // declares no artifacts of its own
    })

    const registry = makeRegistry({
      '#child': rawResult(child, '/schemas/child/schema.yaml'),
      '#parent': rawResult(parent, '/schemas/parent/schema.yaml'),
    })

    const schema = await resolve(registry, '#child')
    expect(schema.name()).toBe('child')
    // Both artifacts inherited from parent
    expect(schema.artifact('spec')).not.toBeNull()
    expect(schema.artifact('spec')!.instruction).toBe('Parent instruction')
    expect(schema.artifact('tasks')).not.toBeNull()
  })

  it('child overrides parent artifact by id', async () => {
    const parent = minimalData({
      name: 'parent',
      artifacts: [
        {
          id: 'spec',
          scope: 'spec',
          output: 'spec.md',
          instruction: 'Parent',
          description: 'Parent desc',
        },
      ],
    })
    const child = minimalData({
      name: 'child',
      extends: '#parent',
      artifacts: [{ id: 'spec', scope: 'spec', output: 'spec.md', instruction: 'Child' }],
    })

    const registry = makeRegistry({
      '#child': rawResult(child, '/schemas/child/schema.yaml'),
      '#parent': rawResult(parent, '/schemas/parent/schema.yaml'),
    })

    const schema = await resolve(registry, '#child')
    expect(schema.artifact('spec')!.instruction).toBe('Child')
  })

  it('child adds new artifacts alongside inherited ones', async () => {
    const parent = minimalData({
      name: 'parent',
      artifacts: [{ id: 'spec', scope: 'spec', output: 'spec.md' }],
    })
    const child = minimalData({
      name: 'child',
      extends: '#parent',
      artifacts: [{ id: 'design', scope: 'change', output: 'design.md' }],
    })

    const registry = makeRegistry({
      '#child': rawResult(child, '/schemas/child/schema.yaml'),
      '#parent': rawResult(parent, '/schemas/parent/schema.yaml'),
    })

    const schema = await resolve(registry, '#child')
    expect(schema.artifact('spec')).not.toBeNull()
    expect(schema.artifact('design')).not.toBeNull()
    expect(schema.artifacts()).toHaveLength(2)
  })

  it('three-level chain cascades root → parent → leaf', async () => {
    const root = minimalData({
      name: 'root',
      artifacts: [
        { id: 'spec', scope: 'spec', output: 'spec.md', description: 'Root spec' },
        { id: 'tasks', scope: 'change', output: 'tasks.md', instruction: 'Root tasks' },
      ],
      workflow: [{ step: 'designing', requires: [], hooks: { pre: [], post: [] } }],
    })
    const parent = minimalData({
      name: 'parent',
      extends: '#root',
      artifacts: [{ id: 'spec', scope: 'spec', output: 'spec.md', description: 'Parent spec' }],
    })
    const leaf = minimalData({
      name: 'leaf',
      extends: '#parent',
      artifacts: [
        { id: 'spec', scope: 'spec', output: 'spec.md', instruction: 'Leaf instruction' },
      ],
    })

    const registry = makeRegistry({
      '#leaf': rawResult(leaf, '/schemas/leaf/schema.yaml'),
      '#parent': rawResult(parent, '/schemas/parent/schema.yaml'),
      '#root': rawResult(root, '/schemas/root/schema.yaml'),
    })

    const schema = await resolve(registry, '#leaf')
    expect(schema.name()).toBe('leaf')
    expect(schema.artifact('spec')!.instruction).toBe('Leaf instruction')
    // tasks inherited from root (not overridden by parent or leaf)
    expect(schema.artifact('tasks')).not.toBeNull()
    expect(schema.artifact('tasks')!.instruction).toBe('Root tasks')
    // workflow inherited from root
    expect(schema.workflowStep('designing')).not.toBeNull()
  })

  it('child inherits workflow from parent', async () => {
    const parent = minimalData({
      name: 'parent',
      workflow: [
        {
          step: 'implementing',
          requires: [],
          hooks: {
            pre: [{ id: 'guidance', type: 'instruction' as const, text: 'Read tasks.' }],
            post: [],
          },
        },
      ],
    })
    const child = minimalData({ name: 'child', extends: '#parent' })

    const registry = makeRegistry({
      '#child': rawResult(child, '/schemas/child/schema.yaml'),
      '#parent': rawResult(parent, '/schemas/parent/schema.yaml'),
    })

    const schema = await resolve(registry, '#child')
    const step = schema.workflowStep('implementing')
    expect(step).not.toBeNull()
    expect(step!.hooks.pre).toHaveLength(1)
    expect(step!.hooks.pre[0]!.id).toBe('guidance')
  })

  it('child overrides workflow step by name', async () => {
    const parent = minimalData({
      name: 'parent',
      workflow: [
        {
          step: 'implementing',
          requires: [],
          hooks: {
            pre: [{ id: 'old-hook', type: 'instruction' as const, text: 'Old.' }],
            post: [],
          },
        },
      ],
    })
    const child = minimalData({
      name: 'child',
      extends: '#parent',
      workflow: [
        {
          step: 'implementing',
          requires: [],
          hooks: {
            pre: [{ id: 'new-hook', type: 'instruction' as const, text: 'New.' }],
            post: [],
          },
        },
      ],
    })

    const registry = makeRegistry({
      '#child': rawResult(child, '/schemas/child/schema.yaml'),
      '#parent': rawResult(parent, '/schemas/parent/schema.yaml'),
    })

    const schema = await resolve(registry, '#child')
    const step = schema.workflowStep('implementing')!
    expect(step.hooks.pre).toHaveLength(1)
    expect(step.hooks.pre[0]!.id).toBe('new-hook')
  })

  it('child inherits metadataExtraction from parent', async () => {
    const parent = minimalData({
      name: 'parent',
      artifacts: [{ id: 'spec', scope: 'spec', output: 'spec.md' }],
      metadataExtraction: {
        title: {
          artifact: 'spec',
          extractor: { selector: { type: 'section', level: 1 }, extract: 'label' },
        },
      },
    })
    const child = minimalData({ name: 'child', extends: '#parent' })

    const registry = makeRegistry({
      '#child': rawResult(child, '/schemas/child/schema.yaml'),
      '#parent': rawResult(parent, '/schemas/parent/schema.yaml'),
    })

    const schema = await resolve(registry, '#child')
    expect(schema.metadataExtraction()).toBeDefined()
    expect(schema.metadataExtraction()!.title).toBeDefined()
  })

  it('throws SchemaValidationError on extends cycle', async () => {
    const a = minimalData({ name: 'a', extends: '#b' })
    const b = minimalData({ name: 'b', extends: '#a' })

    const registry = makeRegistry({
      '#a': rawResult(a, '/schemas/a/schema.yaml'),
      '#b': rawResult(b, '/schemas/b/schema.yaml'),
    })

    await expect(resolve(registry, '#a')).rejects.toThrow(SchemaValidationError)
  })

  it('throws SchemaNotFoundError when extends parent not found', async () => {
    const leaf = minimalData({ name: 'leaf', extends: '#missing' })
    const registry = makeRegistry({
      '#leaf': rawResult(leaf, '/schemas/leaf/schema.yaml'),
    })

    await expect(resolve(registry, '#leaf')).rejects.toThrow(SchemaNotFoundError)
  })
})

// ===========================================================================
// 3. Extends — template merging
// ===========================================================================

describe('ResolveSchema — extends template merging', () => {
  it('child template overrides parent template for same path', async () => {
    const parent = minimalData({
      name: 'parent',
      artifacts: [{ id: 'spec', scope: 'spec', output: 'spec.md', template: 'templates/spec.md' }],
    })
    const child = minimalData({
      name: 'child',
      extends: '#parent',
      artifacts: [{ id: 'spec', scope: 'spec', output: 'spec.md', template: 'templates/spec.md' }],
    })

    const registry = makeRegistry({
      '#child': rawResult(
        child,
        '/schemas/child/schema.yaml',
        new Map([['templates/spec.md', 'Child content']]),
      ),
      '#parent': rawResult(
        parent,
        '/schemas/parent/schema.yaml',
        new Map([['templates/spec.md', 'Parent content']]),
      ),
    })

    const schema = await resolve(registry, '#child')
    expect(schema.artifact('spec')!.template).toBe('Child content')
  })

  it('parent-only templates are inherited', async () => {
    const parent = minimalData({
      name: 'parent',
      artifacts: [
        { id: 'spec', scope: 'spec', output: 'spec.md', template: 'templates/spec.md' },
        {
          id: 'proposal',
          scope: 'change',
          output: 'proposal.md',
          template: 'templates/proposal.md',
        },
      ],
    })
    const child = minimalData({
      name: 'child',
      extends: '#parent',
      artifacts: [{ id: 'spec', scope: 'spec', output: 'spec.md', template: 'templates/spec.md' }],
    })

    const registry = makeRegistry({
      '#child': rawResult(
        child,
        '/schemas/child/schema.yaml',
        new Map([['templates/spec.md', 'Child spec']]),
      ),
      '#parent': rawResult(
        parent,
        '/schemas/parent/schema.yaml',
        new Map([
          ['templates/spec.md', 'Parent spec'],
          ['templates/proposal.md', 'Parent proposal'],
        ]),
      ),
    })

    const schema = await resolve(registry, '#child')
    expect(schema.artifact('proposal')).not.toBeNull()
    expect(schema.artifact('proposal')!.template).toBe('Parent proposal')
  })
})

// ===========================================================================
// 4. Schema plugins — all five operations
// ===========================================================================

describe('ResolveSchema — plugins', () => {
  it('plugin with no operations is a no-op', async () => {
    const base = minimalData({ name: 'base' })
    const plugin: SchemaYamlData = { kind: 'schema-plugin', name: 'empty-plugin', version: 1 }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#plugin': rawResult(plugin, '/plugins/empty/schema.yaml'),
    })

    const schema = await resolve(registry, '#base', ['#plugin'])
    expect(schema.name()).toBe('base')
    expect(schema.artifacts()).toHaveLength(1)
  })

  // --- append ---

  it('plugin append — adds rules.post to existing artifact', async () => {
    const base = minimalData({
      name: 'base',
      artifacts: [
        {
          id: 'spec',
          scope: 'spec',
          output: 'spec.md',
          rules: { post: [{ id: 'normative', text: 'Use MUST/SHALL.' }] },
        },
      ],
    })
    const plugin: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'rfc-plugin',
      version: 1,
      operations: {
        append: {
          artifacts: [
            { id: 'spec', rules: { post: [{ id: 'rfc-rule', text: 'Reference RFC.' }] } },
          ],
        },
      },
    }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#plugin': rawResult(plugin, '/plugins/rfc/schema.yaml'),
    })

    const schema = await resolve(registry, '#base', ['#plugin'])
    const postIds = schema.artifact('spec')!.rules!.post.map((r) => r.id)
    expect(postIds).toEqual(['normative', 'rfc-rule'])
  })

  it('plugin append — adds new workflow step', async () => {
    const base = minimalData({
      name: 'base',
      workflow: [{ step: 'designing', requires: [], hooks: { pre: [], post: [] } }],
    })
    const plugin: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'review-plugin',
      version: 1,
      operations: {
        append: {
          workflow: [{ step: 'verifying', requires: [], hooks: { pre: [], post: [] } }],
        },
      },
    }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#plugin': rawResult(plugin, '/plugins/review/schema.yaml'),
    })

    const schema = await resolve(registry, '#base', ['#plugin'])
    const steps = schema.workflow().map((s) => s.step)
    expect(steps).toEqual(['designing', 'verifying'])
  })

  it('plugin append — adds hooks to existing workflow step', async () => {
    const base = minimalData({
      name: 'base',
      workflow: [
        {
          step: 'implementing',
          requires: [],
          hooks: {
            pre: [{ id: 'read-tasks', type: 'instruction' as const, text: 'Read tasks.' }],
            post: [],
          },
        },
      ],
    })
    const plugin: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'test-plugin',
      version: 1,
      operations: {
        append: {
          workflow: [
            {
              step: 'implementing',
              hooks: { post: [{ id: 'run-tests', type: 'run' as const, command: 'pnpm test' }] },
            },
          ],
        },
      },
    }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#plugin': rawResult(plugin, '/plugins/test/schema.yaml'),
    })

    const schema = await resolve(registry, '#base', ['#plugin'])
    const step = schema.workflowStep('implementing')!
    expect(step.hooks.pre).toHaveLength(1)
    expect(step.hooks.post).toHaveLength(1)
    expect(step.hooks.post[0]!.id).toBe('run-tests')
  })

  it('plugin append — adds validations to existing artifact', async () => {
    const base = minimalData({
      name: 'base',
      artifacts: [
        {
          id: 'spec',
          scope: 'spec',
          output: 'spec.md',
          validations: [
            { id: 'has-purpose', type: 'section', matches: '^Purpose$', required: true },
          ],
        },
      ],
    })
    const plugin: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'val-plugin',
      version: 1,
      operations: {
        append: {
          artifacts: [
            {
              id: 'spec',
              validations: [
                { id: 'has-reqs', type: 'section', matches: '^Requirements$', required: true },
              ],
            },
          ],
        },
      },
    }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#plugin': rawResult(plugin, '/plugins/val/schema.yaml'),
    })

    const schema = await resolve(registry, '#base', ['#plugin'])
    expect(schema.artifact('spec')!.validations).toHaveLength(2)
  })

  // --- prepend ---

  it('plugin prepend — adds rules.pre before existing ones', async () => {
    const base = minimalData({
      name: 'base',
      artifacts: [
        {
          id: 'spec',
          scope: 'spec',
          output: 'spec.md',
          rules: { pre: [{ id: 'existing', text: 'Existing rule.' }] },
        },
      ],
    })
    const plugin: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'pre-plugin',
      version: 1,
      operations: {
        prepend: {
          artifacts: [
            { id: 'spec', rules: { pre: [{ id: 'first-rule', text: 'Do this first.' }] } },
          ],
        },
      },
    }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#plugin': rawResult(plugin, '/plugins/pre/schema.yaml'),
    })

    const schema = await resolve(registry, '#base', ['#plugin'])
    const preIds = schema.artifact('spec')!.rules!.pre.map((r) => r.id)
    expect(preIds).toEqual(['first-rule', 'existing'])
  })

  it('plugin prepend — adds workflow step at the beginning', async () => {
    const base = minimalData({
      name: 'base',
      workflow: [{ step: 'implementing', requires: [], hooks: { pre: [], post: [] } }],
    })
    const plugin: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'plan-plugin',
      version: 1,
      operations: {
        prepend: { workflow: [{ step: 'ready', requires: [], hooks: { pre: [], post: [] } }] },
      },
    }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#plugin': rawResult(plugin, '/plugins/plan/schema.yaml'),
    })

    const schema = await resolve(registry, '#base', ['#plugin'])
    const steps = schema.workflow().map((s) => s.step)
    expect(steps).toEqual(['ready', 'implementing'])
  })

  // --- create ---

  it('plugin create — adds a new artifact', async () => {
    const base = minimalData({ name: 'base' })
    const plugin: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'adr-plugin',
      version: 1,
      operations: {
        create: {
          artifacts: [{ id: 'adr', scope: 'change', output: 'adr.md', instruction: 'Write ADR.' }],
        },
      },
    }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#plugin': rawResult(plugin, '/plugins/adr/schema.yaml'),
    })

    const schema = await resolve(registry, '#base', ['#plugin'])
    expect(schema.artifact('adr')).not.toBeNull()
    expect(schema.artifact('adr')!.instruction).toBe('Write ADR.')
    expect(schema.artifacts()).toHaveLength(2) // spec + adr
  })

  it('plugin create — collision with existing artifact throws', async () => {
    const base = minimalData({ name: 'base' })
    const plugin: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'dup-plugin',
      version: 1,
      operations: {
        create: { artifacts: [{ id: 'spec', scope: 'spec', output: 'dup.md' }] },
      },
    }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#plugin': rawResult(plugin, '/plugins/dup/schema.yaml'),
    })

    await expect(resolve(registry, '#base', ['#plugin'])).rejects.toThrow(SchemaValidationError)
  })

  it('plugin create — adds a new workflow step', async () => {
    const base = minimalData({
      name: 'base',
      workflow: [{ step: 'designing', requires: [], hooks: { pre: [], post: [] } }],
    })
    const plugin: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'deploy-plugin',
      version: 1,
      operations: {
        create: { workflow: [{ step: 'archiving', requires: [], hooks: { pre: [], post: [] } }] },
      },
    }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#plugin': rawResult(plugin, '/plugins/deploy/schema.yaml'),
    })

    const schema = await resolve(registry, '#base', ['#plugin'])
    expect(schema.workflowStep('archiving')).not.toBeNull()
  })

  it('plugin create — rejects invalid workflow step name', async () => {
    const base = minimalData({ name: 'base' })
    const plugin: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'bad-plugin',
      version: 1,
      operations: {
        create: { workflow: [{ step: 'reviewing', requires: [], hooks: { pre: [], post: [] } }] },
      },
    }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#plugin': rawResult(plugin, '/plugins/bad/schema.yaml'),
    })

    await expect(resolve(registry, '#base', ['#plugin'])).rejects.toThrow(SchemaValidationError)
  })

  // --- remove ---

  it('plugin remove — removes an entire artifact', async () => {
    const base = minimalData({
      name: 'base',
      artifacts: [
        { id: 'spec', scope: 'spec', output: 'spec.md' },
        { id: 'design', scope: 'change', output: 'design.md' },
      ],
    })
    const plugin: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'rm-plugin',
      version: 1,
      operations: { remove: { artifacts: [{ id: 'design' }] } },
    }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#plugin': rawResult(plugin, '/plugins/rm/schema.yaml'),
    })

    const schema = await resolve(registry, '#base', ['#plugin'])
    expect(schema.artifact('design')).toBeNull()
    expect(schema.artifacts()).toHaveLength(1)
  })

  it('plugin remove — removes nested validation from artifact', async () => {
    const base = minimalData({
      name: 'base',
      artifacts: [
        {
          id: 'spec',
          scope: 'spec',
          output: 'spec.md',
          validations: [
            { id: 'has-purpose', type: 'section', matches: '^Purpose$', required: true },
            { id: 'has-reqs', type: 'section', matches: '^Requirements$', required: true },
          ],
        },
      ],
    })
    const plugin: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'rm-val-plugin',
      version: 1,
      operations: {
        remove: { artifacts: [{ id: 'spec', validations: [{ id: 'has-purpose' }] }] },
      },
    }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#plugin': rawResult(plugin, '/plugins/rm-val/schema.yaml'),
    })

    const schema = await resolve(registry, '#base', ['#plugin'])
    expect(schema.artifact('spec')!.validations).toHaveLength(1)
  })

  it('plugin remove — removes rule.post entry from artifact', async () => {
    const base = minimalData({
      name: 'base',
      artifacts: [
        {
          id: 'spec',
          scope: 'spec',
          output: 'spec.md',
          rules: {
            post: [
              { id: 'normative', text: 'Use MUST/SHALL.' },
              { id: 'rfc', text: 'Reference RFC.' },
            ],
          },
        },
      ],
    })
    const plugin: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'rm-rule-plugin',
      version: 1,
      operations: {
        remove: { artifacts: [{ id: 'spec', rules: { post: [{ id: 'rfc' }] } }] },
      },
    }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#plugin': rawResult(plugin, '/plugins/rm-rule/schema.yaml'),
    })

    const schema = await resolve(registry, '#base', ['#plugin'])
    const postIds = schema.artifact('spec')!.rules!.post.map((r) => r.id)
    expect(postIds).toEqual(['normative'])
  })

  it('plugin remove — removes hook from workflow step', async () => {
    const base = minimalData({
      name: 'base',
      workflow: [
        {
          step: 'implementing',
          requires: [],
          hooks: {
            pre: [{ id: 'guidance', type: 'instruction' as const, text: 'Read tasks.' }],
            post: [{ id: 'run-tests', type: 'run' as const, command: 'pnpm test' }],
          },
        },
      ],
    })
    const plugin: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'rm-hook-plugin',
      version: 1,
      operations: {
        remove: {
          workflow: [{ step: 'implementing', hooks: { post: [{ id: 'run-tests' }] } }],
        },
      },
    }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#plugin': rawResult(plugin, '/plugins/rm-hook/schema.yaml'),
    })

    const schema = await resolve(registry, '#base', ['#plugin'])
    const step = schema.workflowStep('implementing')!
    expect(step.hooks.pre).toHaveLength(1)
    expect(step.hooks.post).toHaveLength(0)
  })

  it('plugin remove — removes entire workflow step', async () => {
    const base = minimalData({
      name: 'base',
      workflow: [
        { step: 'designing', requires: [], hooks: { pre: [], post: [] } },
        { step: 'implementing', requires: [], hooks: { pre: [], post: [] } },
      ],
    })
    const plugin: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'rm-step-plugin',
      version: 1,
      operations: { remove: { workflow: [{ step: 'designing' }] } },
    }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#plugin': rawResult(plugin, '/plugins/rm-step/schema.yaml'),
    })

    const schema = await resolve(registry, '#base', ['#plugin'])
    expect(schema.workflowStep('designing')).toBeNull()
    expect(schema.workflowStep('implementing')).not.toBeNull()
    expect(schema.workflow()).toHaveLength(1)
  })

  it('plugin remove — clears scalar field (description) from artifact', async () => {
    const base = minimalData({
      name: 'base',
      artifacts: [{ id: 'spec', scope: 'spec', output: 'spec.md', description: 'Spec artifact' }],
    })
    const plugin: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'rm-desc-plugin',
      version: 1,
      operations: {
        remove: { artifacts: [{ id: 'spec', description: null }] },
      },
    }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#plugin': rawResult(plugin, '/plugins/rm-desc/schema.yaml'),
    })

    const schema = await resolve(registry, '#base', ['#plugin'])
    expect(schema.artifact('spec')!.description).toBeUndefined()
  })

  // --- set ---

  it('plugin set — replaces artifact instruction preserving other fields', async () => {
    const base = minimalData({
      name: 'base',
      artifacts: [
        {
          id: 'spec',
          scope: 'spec',
          output: 'spec.md',
          instruction: 'Old instruction',
          description: 'Spec',
        },
      ],
    })
    const plugin: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'set-plugin',
      version: 1,
      operations: {
        set: { artifacts: [{ id: 'spec', instruction: 'New instruction' }] },
      },
    }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#plugin': rawResult(plugin, '/plugins/set/schema.yaml'),
    })

    const schema = await resolve(registry, '#base', ['#plugin'])
    expect(schema.artifact('spec')!.instruction).toBe('New instruction')
    expect(schema.artifact('spec')!.description).toBe('Spec')
  })

  it('plugin set — replaces workflow step requires', async () => {
    const base = minimalData({
      name: 'base',
      artifacts: [
        { id: 'spec', scope: 'spec', output: 'spec.md' },
        { id: 'tasks', scope: 'change', output: 'tasks.md', requires: ['spec'] },
      ],
      workflow: [
        {
          step: 'implementing',
          requires: ['tasks'],
          hooks: { pre: [], post: [] },
        },
      ],
    })
    const plugin: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'set-wf-plugin',
      version: 1,
      operations: {
        set: { workflow: [{ step: 'implementing', requires: ['spec'] }] },
      },
    }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#plugin': rawResult(plugin, '/plugins/set-wf/schema.yaml'),
    })

    const schema = await resolve(registry, '#base', ['#plugin'])
    const step = schema.workflowStep('implementing')!
    expect(step.requires).toEqual(['spec'])
  })

  // --- error cases ---

  it('throws SchemaNotFoundError when plugin not found', async () => {
    const base = minimalData()
    const registry = makeRegistry({ '#base': rawResult(base) })

    await expect(resolve(registry, '#base', ['@specd/nonexistent'])).rejects.toThrow(
      SchemaNotFoundError,
    )
  })

  it('throws SchemaValidationError when plugin has wrong kind', async () => {
    const base = minimalData()
    const wrongKind = minimalData({ kind: 'schema', name: 'not-a-plugin' })

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#wrong': rawResult(wrongKind, '/schemas/wrong/schema.yaml'),
    })

    await expect(resolve(registry, '#base', ['#wrong'])).rejects.toThrow(SchemaValidationError)
  })

  it('plugin remove — throws when removing non-existent entry', async () => {
    const base = minimalData({ name: 'base' })
    const plugin: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'bad-plugin',
      version: 1,
      operations: { remove: { artifacts: [{ id: 'nonexistent' }] } },
    }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#plugin': rawResult(plugin, '/plugins/bad/schema.yaml'),
    })

    await expect(resolve(registry, '#base', ['#plugin'])).rejects.toThrow(SchemaValidationError)
  })

  it('plugin set — throws when setting non-existent artifact', async () => {
    const base = minimalData({ name: 'base' })
    const plugin: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'bad-set-plugin',
      version: 1,
      operations: { set: { artifacts: [{ id: 'ghost', instruction: 'Boo' }] } },
    }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#plugin': rawResult(plugin, '/plugins/bad-set/schema.yaml'),
    })

    await expect(resolve(registry, '#base', ['#plugin'])).rejects.toThrow(SchemaValidationError)
  })
})

// ===========================================================================
// 5. Multiple plugins — ordering
// ===========================================================================

describe('ResolveSchema — multiple plugins in order', () => {
  it('plugins applied in declaration order — second plugin sees first plugin changes', async () => {
    const base = minimalData({
      name: 'base',
      artifacts: [{ id: 'spec', scope: 'spec', output: 'spec.md' }],
    })
    // Plugin 1: creates 'tasks' artifact
    const plugin1: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'plugin-1',
      version: 1,
      operations: {
        create: {
          artifacts: [{ id: 'tasks', scope: 'change', output: 'tasks.md', requires: ['spec'] }],
        },
      },
    }
    // Plugin 2: appends validation to 'tasks' (which only exists after plugin1)
    const plugin2: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'plugin-2',
      version: 1,
      operations: {
        append: {
          artifacts: [
            {
              id: 'tasks',
              validations: [
                { id: 'has-checkboxes', type: 'section', matches: '\\[', required: true },
              ],
            },
          ],
        },
      },
    }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#p1': rawResult(plugin1, '/plugins/p1/schema.yaml'),
      '#p2': rawResult(plugin2, '/plugins/p2/schema.yaml'),
    })

    const schema = await resolve(registry, '#base', ['#p1', '#p2'])
    expect(schema.artifact('tasks')).not.toBeNull()
    expect(schema.artifact('tasks')!.validations).toHaveLength(1)
  })

  it('first plugin appends, second plugin removes what first added', async () => {
    const base = minimalData({
      name: 'base',
      artifacts: [
        {
          id: 'spec',
          scope: 'spec',
          output: 'spec.md',
          rules: { post: [{ id: 'normative', text: 'Use MUST/SHALL.' }] },
        },
      ],
    })
    const plugin1: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'add-rfc',
      version: 1,
      operations: {
        append: {
          artifacts: [{ id: 'spec', rules: { post: [{ id: 'rfc-rule', text: 'RFC.' }] } }],
        },
      },
    }
    const plugin2: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'rm-rfc',
      version: 1,
      operations: {
        remove: { artifacts: [{ id: 'spec', rules: { post: [{ id: 'rfc-rule' }] } }] },
      },
    }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#p1': rawResult(plugin1, '/plugins/p1/schema.yaml'),
      '#p2': rawResult(plugin2, '/plugins/p2/schema.yaml'),
    })

    const schema = await resolve(registry, '#base', ['#p1', '#p2'])
    const postIds = schema.artifact('spec')!.rules!.post.map((r) => r.id)
    expect(postIds).toEqual(['normative'])
  })
})

// ===========================================================================
// 6. Schema overrides — all five operations
// ===========================================================================

describe('ResolveSchema — overrides', () => {
  it('override append — adds rules.post to artifact', async () => {
    const base = minimalData({
      name: 'base',
      artifacts: [{ id: 'spec', scope: 'spec', output: 'spec.md' }],
    })
    const registry = makeRegistry({ '#base': rawResult(base) })

    const schema = await resolve(registry, '#base', [], {
      append: {
        artifacts: [
          { id: 'spec', rules: { post: [{ id: 'team-rule', text: 'Reference Jira ticket.' }] } },
        ],
      },
    })
    const postIds = schema.artifact('spec')!.rules!.post.map((r) => r.id)
    expect(postIds).toEqual(['team-rule'])
  })

  it('override prepend — adds hooks before existing ones', async () => {
    const base = minimalData({
      name: 'base',
      workflow: [
        {
          step: 'archiving',
          requires: [],
          hooks: {
            pre: [{ id: 'review', type: 'instruction' as const, text: 'Review.' }],
            post: [],
          },
        },
      ],
    })
    const registry = makeRegistry({ '#base': rawResult(base) })

    const schema = await resolve(registry, '#base', [], {
      prepend: {
        workflow: [
          {
            step: 'archiving',
            hooks: {
              pre: [{ id: 'run-lint', type: 'run' as const, command: 'pnpm lint' }],
              post: [],
            },
          },
        ],
      },
    })
    const hookIds = schema.workflowStep('archiving')!.hooks.pre.map((h) => h.id)
    expect(hookIds).toEqual(['run-lint', 'review'])
  })

  it('override create — adds a new artifact', async () => {
    const base = minimalData({ name: 'base' })
    const registry = makeRegistry({ '#base': rawResult(base) })

    const schema = await resolve(registry, '#base', [], {
      create: {
        artifacts: [{ id: 'changelog', scope: 'change', output: 'changelog.md' }],
      },
    })
    expect(schema.artifact('changelog')).not.toBeNull()
  })

  it('override remove — removes artifact', async () => {
    const base = minimalData({
      name: 'base',
      artifacts: [
        { id: 'spec', scope: 'spec', output: 'spec.md' },
        { id: 'optional-art', scope: 'change', output: 'opt.md' },
      ],
    })
    const registry = makeRegistry({ '#base': rawResult(base) })

    const schema = await resolve(registry, '#base', [], {
      remove: { artifacts: [{ id: 'optional-art' }] },
    })
    expect(schema.artifact('optional-art')).toBeNull()
    expect(schema.artifacts()).toHaveLength(1)
  })

  it('override set — replaces artifact instruction', async () => {
    const base = minimalData({
      name: 'base',
      artifacts: [
        {
          id: 'spec',
          scope: 'spec',
          output: 'spec.md',
          instruction: 'Generic instruction',
          description: 'Spec artifact',
        },
      ],
    })
    const registry = makeRegistry({ '#base': rawResult(base) })

    const schema = await resolve(registry, '#base', [], {
      set: { artifacts: [{ id: 'spec', instruction: 'Team-specific instruction' }] },
    })
    expect(schema.artifact('spec')!.instruction).toBe('Team-specific instruction')
    expect(schema.artifact('spec')!.description).toBe('Spec artifact')
  })

  it('override set — replaces top-level scalar (description)', async () => {
    const base = minimalData({ name: 'base', description: 'Original' })
    const registry = makeRegistry({ '#base': rawResult(base) })

    // description is in SchemaYamlData but not exposed on Schema — just verify no error
    const schema = await resolve(registry, '#base', [], {
      set: { description: 'Custom' },
    })
    expect(schema.name()).toBe('base')
  })

  it('override remove then create — replaces artifact', async () => {
    const base = minimalData({
      name: 'base',
      artifacts: [{ id: 'spec', scope: 'spec', output: 'spec.md', instruction: 'Old' }],
    })
    const registry = makeRegistry({ '#base': rawResult(base) })

    const schema = await resolve(registry, '#base', [], {
      remove: { artifacts: [{ id: 'spec' }] },
      create: {
        artifacts: [{ id: 'spec', scope: 'spec', output: 'spec.md', instruction: 'Replaced' }],
      },
    })
    expect(schema.artifact('spec')!.instruction).toBe('Replaced')
  })
})

// ===========================================================================
// 7. Overrides applied AFTER plugins
// ===========================================================================

describe('ResolveSchema — override applied after plugin', () => {
  it('plugin appends rule, override removes it', async () => {
    const base = minimalData({
      name: 'base',
      artifacts: [
        {
          id: 'spec',
          scope: 'spec',
          output: 'spec.md',
          rules: { post: [{ id: 'normative', text: 'Use MUST/SHALL.' }] },
        },
      ],
    })
    const plugin: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'rfc-plugin',
      version: 1,
      operations: {
        append: { artifacts: [{ id: 'spec', rules: { post: [{ id: 'rfc', text: 'RFC.' }] } }] },
      },
    }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#plugin': rawResult(plugin, '/plugins/rfc/schema.yaml'),
    })

    const schema = await resolve(registry, '#base', ['#plugin'], {
      remove: { artifacts: [{ id: 'spec', rules: { post: [{ id: 'rfc' }] } }] },
    })
    const postIds = schema.artifact('spec')!.rules!.post.map((r) => r.id)
    expect(postIds).toEqual(['normative'])
  })

  it('plugin creates artifact, override sets its instruction', async () => {
    const base = minimalData({ name: 'base' })
    const plugin: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'adr-plugin',
      version: 1,
      operations: {
        create: {
          artifacts: [{ id: 'adr', scope: 'change', output: 'adr.md', instruction: 'Plugin ADR.' }],
        },
      },
    }

    const registry = makeRegistry({
      '#base': rawResult(base),
      '#plugin': rawResult(plugin, '/plugins/adr/schema.yaml'),
    })

    const schema = await resolve(registry, '#base', ['#plugin'], {
      set: { artifacts: [{ id: 'adr', instruction: 'Team ADR.' }] },
    })
    expect(schema.artifact('adr')!.instruction).toBe('Team ADR.')
  })
})

// ===========================================================================
// 8. Full pipeline: extends + plugins + overrides combined
// ===========================================================================

describe('ResolveSchema — extends + plugins + overrides combined', () => {
  it('full pipeline applies in correct order', async () => {
    // Parent: defines spec + tasks + designing workflow
    const parent = minimalData({
      name: 'parent',
      artifacts: [
        {
          id: 'spec',
          scope: 'spec',
          output: 'spec.md',
          instruction: 'Parent instruction',
          validations: [
            { id: 'has-purpose', type: 'section', matches: '^Purpose$', required: true },
          ],
        },
        { id: 'tasks', scope: 'change', output: 'tasks.md', requires: ['spec'] },
      ],
      workflow: [
        {
          step: 'designing',
          requires: [],
          hooks: {
            pre: [{ id: 'design-hint', type: 'instruction' as const, text: 'Design.' }],
            post: [],
          },
        },
      ],
    })

    // Child extends parent: overrides spec instruction (keeps validation), adds design artifact
    const child = minimalData({
      name: 'child',
      extends: '#parent',
      artifacts: [
        {
          id: 'spec',
          scope: 'spec',
          output: 'spec.md',
          instruction: 'Child instruction',
          validations: [
            { id: 'has-purpose', type: 'section', matches: '^Purpose$', required: true },
          ],
        },
        { id: 'design', scope: 'change', output: 'design.md' },
      ],
    })

    // Plugin: appends a rule to spec, creates implementing step
    const plugin: SchemaYamlData = {
      kind: 'schema-plugin',
      name: 'compliance',
      version: 1,
      operations: {
        append: {
          artifacts: [
            { id: 'spec', rules: { post: [{ id: 'compliance', text: 'Comply with SOC2.' }] } },
          ],
        },
        create: {
          workflow: [
            {
              step: 'implementing',
              requires: ['tasks'],
              hooks: {
                pre: [],
                post: [{ id: 'run-tests', type: 'run' as const, command: 'pnpm test' }],
              },
            },
          ],
        },
      },
    }

    // Overrides: set spec instruction to final value, remove design artifact
    const overrides = {
      set: { artifacts: [{ id: 'spec', instruction: 'Final instruction' }] },
      remove: { artifacts: [{ id: 'design' }] },
    }

    const registry = makeRegistry({
      '#child': rawResult(child, '/schemas/child/schema.yaml'),
      '#parent': rawResult(parent, '/schemas/parent/schema.yaml'),
      '#compliance': rawResult(plugin, '/plugins/compliance/schema.yaml'),
    })

    const schema = await resolve(registry, '#child', ['#compliance'], overrides)

    // spec: instruction set by override (last writer wins)
    expect(schema.artifact('spec')!.instruction).toBe('Final instruction')
    // spec: validation inherited from parent
    expect(schema.artifact('spec')!.validations).toHaveLength(1)
    // spec: rule appended by plugin
    expect(schema.artifact('spec')!.rules!.post).toHaveLength(1)
    expect(schema.artifact('spec')!.rules!.post[0]!.id).toBe('compliance')
    // tasks: inherited from parent
    expect(schema.artifact('tasks')).not.toBeNull()
    // design: removed by override
    expect(schema.artifact('design')).toBeNull()
    // workflow: designing from parent, implementing from plugin
    expect(schema.workflowStep('designing')).not.toBeNull()
    expect(schema.workflowStep('implementing')).not.toBeNull()
    expect(schema.workflowStep('implementing')!.hooks.post).toHaveLength(1)
  })
})

// ===========================================================================
// 9. Idempotency
// ===========================================================================

describe('ResolveSchema — idempotency', () => {
  it('produces equivalent schema on repeated calls', async () => {
    const data = minimalData({ name: 'stable' })
    const registry = makeRegistry({ '#stable': rawResult(data) })
    const sut = new ResolveSchema(registry, '#stable', new Map(), [], undefined)

    const first = await sut.execute()
    const second = await sut.execute()

    expect(first.name()).toBe(second.name())
    expect(first.artifacts().length).toBe(second.artifacts().length)
  })
})

// ===========================================================================
// 9. Override hook normalization — YAML format → domain format
// ===========================================================================

describe('ResolveSchema — override hook normalization', () => {
  it('normalizes YAML-format run hooks in overrides to domain format', async () => {
    const base = minimalData({
      name: 'base',
      workflow: [{ step: 'implementing', requires: [], hooks: { pre: [], post: [] } }],
    })
    const registry = makeRegistry({ '#base': rawResult(base) })

    // Override uses YAML format: { id, run } instead of { id, type, command }
    const schema = await resolve(registry, '#base', [], {
      append: {
        workflow: [
          {
            step: 'implementing',
            hooks: {
              post: [{ id: 'test', run: 'pnpm test' } as unknown as Record<string, unknown>],
            },
          },
        ],
      },
    } as unknown as SchemaOperations)

    const step = schema.workflowStep('implementing')!
    const hook = step.hooks.post.find((h) => h.id === 'test')
    expect(hook).toBeDefined()
    expect(hook!.type).toBe('run')
    expect((hook as { type: 'run'; command: string }).command).toBe('pnpm test')
  })

  it('normalizes YAML-format instruction hooks in overrides to domain format', async () => {
    const base = minimalData({
      name: 'base',
      workflow: [{ step: 'implementing', requires: [], hooks: { pre: [], post: [] } }],
    })
    const registry = makeRegistry({ '#base': rawResult(base) })

    const schema = await resolve(registry, '#base', [], {
      append: {
        workflow: [
          {
            step: 'implementing',
            hooks: {
              pre: [{ id: 'guide', instruction: 'Do X' } as unknown as Record<string, unknown>],
            },
          },
        ],
      },
    } as unknown as SchemaOperations)

    const step = schema.workflowStep('implementing')!
    const hook = step.hooks.pre.find((h) => h.id === 'guide')
    expect(hook).toBeDefined()
    expect(hook!.type).toBe('instruction')
    expect((hook as { type: 'instruction'; text: string }).text).toBe('Do X')
  })

  it('passes through hooks already in domain format', async () => {
    const base = minimalData({
      name: 'base',
      workflow: [{ step: 'implementing', requires: [], hooks: { pre: [], post: [] } }],
    })
    const registry = makeRegistry({ '#base': rawResult(base) })

    const schema = await resolve(registry, '#base', [], {
      append: {
        workflow: [
          {
            step: 'implementing',
            hooks: {
              pre: [],
              post: [{ id: 'test', type: 'run' as const, command: 'pnpm test' }],
            },
          },
        ],
      },
    })

    const step = schema.workflowStep('implementing')!
    const hook = step.hooks.post.find((h) => h.id === 'test')
    expect(hook).toBeDefined()
    expect(hook!.type).toBe('run')
    expect((hook as { type: 'run'; command: string }).command).toBe('pnpm test')
  })
})
