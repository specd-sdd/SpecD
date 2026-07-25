import { GetPersistedSpecImplementation } from '../../../src/application/use-cases/get-persisted-spec-implementation.js'
import { createGetPersistedSpecImplementation } from '../../../src/composition/use-cases/get-persisted-spec-implementation.js'
import { describeCompositionFactorySmoke } from './composition-factory-smoke.js'

describeCompositionFactorySmoke(
  'GetPersistedSpecImplementation',
  createGetPersistedSpecImplementation,
  GetPersistedSpecImplementation,
  () => ({ specRepositories: new Map() }),
)
