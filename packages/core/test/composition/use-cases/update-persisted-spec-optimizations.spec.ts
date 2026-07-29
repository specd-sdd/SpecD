import { describe, expect, it, vi } from 'vitest'
import { UpdatePersistedSpecOptimizations } from '../../../src/application/use-cases/update-persisted-spec-optimizations.js'
import {
  createUpdatePersistedSpecOptimizations,
  resolveUpdatePersistedSpecOptimizationsDeps,
} from '../../../src/composition/use-cases/update-persisted-spec-optimizations.js'
import { GetActiveSchema } from '../../../src/application/use-cases/get-active-schema.js'
import { type CompositionResolver } from '../../../src/composition/composition-resolver.js'
import { describeCompositionFactorySmoke } from './composition-factory-smoke.js'

describeCompositionFactorySmoke(
  'UpdatePersistedSpecOptimizations',
  createUpdatePersistedSpecOptimizations,
  UpdatePersistedSpecOptimizations,
  () => ({
    specRepositories: new Map(),
    getActiveSchema: {} as never,
    parsers: new Map(),
    extractorTransforms: new Map(),
    contentHasher: {} as never,
  }),
)

describe('resolveUpdatePersistedSpecOptimizationsDeps', () => {
  it('derives the exact dependency contract from the composition resolver', () => {
    const specRepositories = new Map()
    const parserRegistry = new Map()
    const extractorTransforms = new Map()
    const contentHasher = {} as never
    const resolveSchema = {} as never
    const schemaRegistry = {} as never

    const resolver = {
      config: { schemaRef: '@specd/schema-std' },
      getSpecRepositories: vi.fn(() => specRepositories),
      getResolveSchema: vi.fn(() => resolveSchema),
      getSchemaRegistry: vi.fn(() => schemaRegistry),
      getArtifactParserRegistry: vi.fn(() => parserRegistry),
      getExtractorTransforms: vi.fn(() => extractorTransforms),
      getContentHasher: vi.fn(() => contentHasher),
    } as unknown as CompositionResolver

    const deps = resolveUpdatePersistedSpecOptimizationsDeps(resolver)

    expect(Object.keys(deps).sort()).toEqual([
      'contentHasher',
      'extractorTransforms',
      'getActiveSchema',
      'parsers',
      'specRepositories',
    ])
    expect(deps.specRepositories).toBe(specRepositories)
    expect(deps.parsers).toBe(parserRegistry)
    expect(deps.extractorTransforms).toBe(extractorTransforms)
    expect(deps.contentHasher).toBe(contentHasher)
    expect(deps.getActiveSchema).toBeInstanceOf(GetActiveSchema)
    expect(resolver.getSpecRepositories).toHaveBeenCalledTimes(1)
    expect(resolver.getResolveSchema).toHaveBeenCalledTimes(1)
    expect(resolver.getSchemaRegistry).toHaveBeenCalledTimes(1)
    expect(resolver.getArtifactParserRegistry).toHaveBeenCalledTimes(1)
    expect(resolver.getExtractorTransforms).toHaveBeenCalledTimes(1)
    expect(resolver.getContentHasher).toHaveBeenCalledTimes(1)
  })
})
