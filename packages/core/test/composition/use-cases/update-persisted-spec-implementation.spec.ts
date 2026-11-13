import { UpdatePersistedSpecImplementation } from '../../../src/application/use-cases/update-persisted-spec-implementation.js'
import {
  createUpdatePersistedSpecImplementation,
  resolveUpdatePersistedSpecImplementationDeps,
} from '../../../src/composition/use-cases/update-persisted-spec-implementation.js'
import { afterEach, describe, expect, it } from 'vitest'
import { createCompositionResolver } from '../../../src/composition/composition-resolver.js'
import {
  cleanupCompositionFactoryConfig,
  setupCompositionFactoryConfig,
  type CompositionFactoryFixture,
} from './helpers.js'
import { describeCompositionFactorySmoke } from './composition-factory-smoke.js'

describeCompositionFactorySmoke(
  'UpdatePersistedSpecImplementation',
  createUpdatePersistedSpecImplementation,
  UpdatePersistedSpecImplementation,
  () => ({
    specRepositories: new Map(),
    listWorkspaces: {} as never,
    files: {} as never,
    getActiveSchema: {} as never,
    parsers: new Map(),
    extractorTransforms: new Map(),
    contentHasher: {} as never,
  }),
)

describe('resolveUpdatePersistedSpecImplementationDeps', () => {
  let fixture: CompositionFactoryFixture = { tmpDir: undefined }

  afterEach(async () => {
    await cleanupCompositionFactoryConfig(fixture)
  })

  it('resolves specRepositories, files, and initial-dependsOn collaborators from the resolver', async () => {
    const setup = await setupCompositionFactoryConfig(
      'specd-resolve-update-persisted-spec-implementation',
    )
    fixture = setup.fixture
    const resolver = createCompositionResolver(setup.config)

    const deps = resolveUpdatePersistedSpecImplementationDeps(resolver)

    expect(deps.specRepositories).toBe(resolver.getSpecRepositories())
    expect([...deps.specRepositories.keys()]).toEqual(['default'])
    expect(deps.files).toBe(resolver.getFileReader())
    expect(deps.parsers).toBe(resolver.getArtifactParserRegistry())
    expect(deps.extractorTransforms).toBe(resolver.getExtractorTransforms())
    expect(deps.contentHasher).toBe(resolver.getContentHasher())
    expect(deps.listWorkspaces).toBeDefined()
    expect(deps.getActiveSchema).toBeDefined()
  })
})
