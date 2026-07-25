import { GetPersistedSpecDeps } from '../../../src/application/use-cases/get-persisted-spec-deps.js'
import { createGetPersistedSpecDeps } from '../../../src/composition/use-cases/get-persisted-spec-deps.js'
import { describeCompositionFactorySmoke } from './composition-factory-smoke.js'

describeCompositionFactorySmoke(
  'GetPersistedSpecDeps',
  createGetPersistedSpecDeps,
  GetPersistedSpecDeps,
  () => ({ specRepositories: new Map() }),
)
