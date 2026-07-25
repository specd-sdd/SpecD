import { UpdatePersistedSpecSchema } from '../../../src/application/use-cases/update-persisted-spec-schema.js'
import { createUpdatePersistedSpecSchema } from '../../../src/composition/use-cases/update-persisted-spec-schema.js'
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
