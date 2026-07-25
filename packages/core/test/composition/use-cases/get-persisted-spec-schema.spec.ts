import { GetPersistedSpecSchema } from '../../../src/application/use-cases/get-persisted-spec-schema.js'
import { createGetPersistedSpecSchema } from '../../../src/composition/use-cases/get-persisted-spec-schema.js'
import { describeCompositionFactorySmoke } from './composition-factory-smoke.js'

describeCompositionFactorySmoke(
  'GetPersistedSpecSchema',
  createGetPersistedSpecSchema,
  GetPersistedSpecSchema,
  () => ({ specRepositories: new Map() }),
)
