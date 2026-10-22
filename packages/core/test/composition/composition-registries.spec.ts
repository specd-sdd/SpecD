import { describe, expect, it, vi } from 'vitest'
import { buildSchema } from '../../src/domain/services/build-schema.js'
import { CheckEmbeddingForbiddenError } from '../../src/domain/errors/check-registry-errors.js'
import { type ArtifactParser } from '../../src/application/ports/artifact-parser.js'
import {
  createBuiltinCompositionRegistry,
  createCompositionRegistryView,
} from '../../src/composition/composition-registries.js'

/** Minimal no-op parser used for registry tests. */
const TOML_PARSER: ArtifactParser = {
  fileExtensions: ['.toml'],
  parse: () => ({ root: { type: 'document', children: [] } }),
  apply: (ast) => ({ ast, warnings: [] }),
  serialize: () => '',
  renderSubtree: () => '',
  nodeTypes: () => [],
  outline: () => [],
  selectorHints: () => ({}),
  deltaInstructions: () => '',
  parseDelta: () => [],
}

describe('createCompositionRegistryView', () => {
  it('merges built-in and additive composition capabilities through one shared registry layer', () => {
    const remoteSpecFactory = { create: vi.fn() }
    const registry = createCompositionRegistryView(createBuiltinCompositionRegistry(), {
      specStorageFactories: { remote: remoteSpecFactory },
      parsers: { toml: TOML_PARSER },
    })

    expect(registry.storages.specs.get('fs')).toBeDefined()
    expect(registry.storages.specs.get('remote')).toBe(remoteSpecFactory)
    expect(registry.parsers.get('markdown')).toBeDefined()
    expect(registry.parsers.get('toml')).toBe(TOML_PARSER)
  })

  it('does not expose graph-store composition on the core registry view', () => {
    const registry = createCompositionRegistryView(createBuiltinCompositionRegistry())

    expect('graphStores' in registry).toBe(false)
  })

  it('forwards plugin allowDisable into check governance', () => {
    const check = {
      id: 'audit',
      label: 'Auditing',
      execute: async () => ({
        id: '@qa.audit',
        label: 'Auditing',
        kind: 'predicate' as const,
        outcome: 'pass' as const,
      }),
    }
    const view = createCompositionRegistryView(createBuiltinCompositionRegistry(), {
      checks: [
        { pluginName: 'qa', check, allowDisable: false },
        { pluginName: 'qb', check, options: { allowDisable: false } },
        { pluginName: 'qc', check },
      ],
    })

    expect(view.checks.getGovernance('@qa.audit')?.allowDisable).toBe(false)
    expect(view.checks.getGovernance('@qb.audit')?.allowDisable).toBe(false)
    expect(view.checks.getGovernance('@qc.audit')?.allowDisable).toBe(true)
  })
  it('exposes the archive bindings with the archive locks and accepts a plugin archive binding', () => {
    const check = {
      id: 'scan',
      label: 'Scanning',
      execute: async () => ({
        id: '@sec.scan',
        label: 'Scanning',
        kind: 'predicate' as const,
        outcome: 'pass' as const,
      }),
    }
    const view = createCompositionRegistryView(createBuiltinCompositionRegistry(), {
      checks: [
        { pluginName: 'sec', check, defaultBindings: [{ scope: 'archive', skippable: true }] },
      ],
    })

    for (const id of ['workspace.readOnly', 'deps.consistent', 'impl.filesResolved']) {
      const archive = view.checks
        .getBindings(id)
        .find((binding) => binding.applicability.some((row) => row.scope === 'archive'))
      expect(archive?.allowDisable, id).toBe(false)
      expect(archive?.allowBindingOverride, id).toBe(false)
    }
    const plugin = view.checks.getBindings('@sec.scan')[0]
    expect(plugin?.applicability).toEqual([{ scope: 'archive' }])
    expect(plugin?.skippable).toBe(true)
  })

  it('forwards plugin allowSchemaEmbedding into check governance and enforces it at build time', () => {
    const check = {
      id: 'gate',
      label: 'Gating',
      execute: async () => ({
        id: '@qa.gate',
        label: 'Gating',
        kind: 'predicate' as const,
        outcome: 'pass' as const,
      }),
    }
    const bound = [{ scope: 'transition', to: 'ready', along: 'forward' }]
    const view = createCompositionRegistryView(createBuiltinCompositionRegistry(), {
      checks: [
        { pluginName: 'qa', check, defaultBindings: bound, allowSchemaEmbedding: true },
        {
          pluginName: 'qb',
          check,
          defaultBindings: bound,
          options: { allowSchemaEmbedding: true },
        },
        { pluginName: 'qc', check, defaultBindings: bound },
      ],
    })

    expect(view.checks.getGovernance('@qa.gate')?.allowSchemaEmbedding).toBe(true)
    expect(view.checks.getGovernance('@qb.gate')?.allowSchemaEmbedding).toBe(true)
    // Default bindings without an explicit lock make the check non-embeddable.
    expect(view.checks.getGovernance('@qc.gate')?.allowSchemaEmbedding).toBe(false)

    const build = (id: string) =>
      buildSchema(
        '#t',
        {
          kind: 'schema',
          name: 'test',
          version: 1,
          artifacts: [{ id: 'spec', scope: 'spec', output: 'spec.md' }],
          workflow: [
            {
              step: 'implementing',
              requires: [],
              requiresTaskCompletion: [],
              hooks: { pre: [], post: [] },
              checks: [{ id }],
            },
          ],
        } as never,
        new Map(),
        view.checks,
      )
    expect(() => build('@qa.gate')).not.toThrow()
    expect(() => build('@qc.gate')).toThrow(CheckEmbeddingForbiddenError)
  })
})
