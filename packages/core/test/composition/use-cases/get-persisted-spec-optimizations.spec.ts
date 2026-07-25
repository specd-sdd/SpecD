import { GetPersistedSpecOptimizations } from '../../../src/application/use-cases/get-persisted-spec-optimizations.js'
import { createGetPersistedSpecOptimizations } from '../../../src/composition/use-cases/get-persisted-spec-optimizations.js'
import { describeCompositionFactorySmoke } from './composition-factory-smoke.js'

describeCompositionFactorySmoke(
  'GetPersistedSpecOptimizations',
  createGetPersistedSpecOptimizations,
  GetPersistedSpecOptimizations,
  () => ({ specRepositories: new Map(), getActiveSchema: {} as never }),
)
