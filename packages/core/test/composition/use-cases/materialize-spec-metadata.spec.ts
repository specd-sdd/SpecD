import { MaterializeSpecMetadata } from '../../../src/application/use-cases/materialize-spec-metadata.js'
import { createMaterializeSpecMetadata } from '../../../src/composition/use-cases/materialize-spec-metadata.js'
import { describeCompositionFactorySmoke } from './composition-factory-smoke.js'

describeCompositionFactorySmoke(
  'MaterializeSpecMetadata',
  createMaterializeSpecMetadata,
  MaterializeSpecMetadata,
  () => ({
    specRepositories: new Map(),
    generateSpecMetadata: {} as never,
    contentHasher: {} as never,
  }),
)
