import { describe, expect, it, vi } from 'vitest'
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
})
