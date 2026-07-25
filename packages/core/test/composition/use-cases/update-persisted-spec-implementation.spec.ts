import { UpdatePersistedSpecImplementation } from '../../../src/application/use-cases/update-persisted-spec-implementation.js'
import { createUpdatePersistedSpecImplementation } from '../../../src/composition/use-cases/update-persisted-spec-implementation.js'
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
