import { RegenerateSpecMetadata } from '../../../src/application/use-cases/regenerate-spec-metadata.js'
import { createRegenerateSpecMetadata } from '../../../src/composition/use-cases/regenerate-spec-metadata.js'
import { describeCompositionFactorySmoke } from './composition-factory-smoke.js'

describeCompositionFactorySmoke(
  'RegenerateSpecMetadata',
  createRegenerateSpecMetadata,
  RegenerateSpecMetadata,
  () => ({ materializeSpecMetadata: {} as never, listWorkspaces: {} as never }),
)
