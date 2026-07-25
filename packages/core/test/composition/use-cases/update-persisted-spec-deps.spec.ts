import { UpdatePersistedSpecDeps } from '../../../src/application/use-cases/update-persisted-spec-deps.js'
import { createUpdatePersistedSpecDeps } from '../../../src/composition/use-cases/update-persisted-spec-deps.js'
import { describeCompositionFactorySmoke } from './composition-factory-smoke.js'

describeCompositionFactorySmoke(
  'UpdatePersistedSpecDeps',
  createUpdatePersistedSpecDeps,
  UpdatePersistedSpecDeps,
  () => ({
    specRepositories: new Map(),
    getActiveSchema: {} as never,
    parsers: new Map(),
    extractorTransforms: new Map(),
    contentHasher: {} as never,
  }),
)
