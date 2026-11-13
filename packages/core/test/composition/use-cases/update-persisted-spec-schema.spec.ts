import { UpdatePersistedSpecSchema } from '../../../src/application/use-cases/update-persisted-spec-schema.js'
import {
  createUpdatePersistedSpecSchema,
  resolveUpdatePersistedSpecSchemaDeps,
} from '../../../src/composition/use-cases/update-persisted-spec-schema.js'
import { afterEach, describe, expect, it } from 'vitest'
import { createCompositionResolver } from '../../../src/composition/composition-resolver.js'
import {
  cleanupCompositionFactoryConfig,
  setupCompositionFactoryConfig,
  type CompositionFactoryFixture,
} from './helpers.js'
import { describeCompositionFactorySmoke } from './composition-factory-smoke.js'

describeCompositionFactorySmoke(
  'UpdatePersistedSpecSchema',
  createUpdatePersistedSpecSchema,
  UpdatePersistedSpecSchema,
  () => ({
    specRepositories: new Map(),
    getActiveSchema: {} as never,
    parsers: new Map(),
    extractorTransforms: new Map(),
    contentHasher: {} as never,
  }),
)

describe('resolveUpdatePersistedSpecSchemaDeps', () => {
  let fixture: CompositionFactoryFixture = { tmpDir: undefined }

  afterEach(async () => {
    await cleanupCompositionFactoryConfig(fixture)
  })

  it('resolves specRepositories and schema collaborators from the resolver', async () => {
    const setup = await setupCompositionFactoryConfig('specd-resolve-update-persisted-spec-schema')
    fixture = setup.fixture
    const resolver = createCompositionResolver(setup.config)

    const deps = resolveUpdatePersistedSpecSchemaDeps(resolver)

    expect(deps.specRepositories).toBe(resolver.getSpecRepositories())
    expect([...deps.specRepositories.keys()]).toEqual(['default'])
    expect(deps.parsers).toBe(resolver.getArtifactParserRegistry())
    expect(deps.extractorTransforms).toBe(resolver.getExtractorTransforms())
    expect(deps.contentHasher).toBe(resolver.getContentHasher())
    expect(deps.getActiveSchema).toBeDefined()
  })
})
