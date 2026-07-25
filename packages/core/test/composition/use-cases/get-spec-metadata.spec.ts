import { GetSpecMetadata } from '../../../src/application/use-cases/get-spec-metadata.js'
import { createGetSpecMetadata } from '../../../src/composition/use-cases/get-spec-metadata.js'
import { describeCompositionFactorySmoke } from './composition-factory-smoke.js'

describeCompositionFactorySmoke('GetSpecMetadata', createGetSpecMetadata, GetSpecMetadata, () => ({
  materializeSpecMetadata: {} as never,
}))
