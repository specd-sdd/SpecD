import { UpdatePersistedSpecOptimizations } from '../../../src/application/use-cases/update-persisted-spec-optimizations.js'
import { createUpdatePersistedSpecOptimizations } from '../../../src/composition/use-cases/update-persisted-spec-optimizations.js'
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
