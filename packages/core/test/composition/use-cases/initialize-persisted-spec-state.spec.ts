import { InitializePersistedSpecState } from '../../../src/application/use-cases/initialize-persisted-spec-state.js'
import { createInitializePersistedSpecState } from '../../../src/composition/use-cases/initialize-persisted-spec-state.js'
import { describeCompositionFactorySmoke } from './composition-factory-smoke.js'

describeCompositionFactorySmoke(
  'InitializePersistedSpecState',
  createInitializePersistedSpecState,
  InitializePersistedSpecState,
  () => ({
    specRepositories: new Map(),
    listWorkspaces: {} as never,
    getActiveSchema: {} as never,
    parsers: new Map(),
    extractorTransforms: new Map(),
    contentHasher: {} as never,
  }),
)
