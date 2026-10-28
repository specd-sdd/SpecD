export { RegistryConflictError } from './application/errors/registry-conflict-error.js'
export { InvalidDisposerError } from './application/errors/invalid-disposer-error.js'
export { DisposerFailedError } from './application/errors/disposer-failed-error.js'
export { type ExternalHookRunner } from './application/ports/external-hook-runner.js'
export { createKernelBuilder, type KernelBuilder } from './composition/kernel-builder.js'
export { type KernelDisposer } from './composition/kernel-disposal.js'
export {
  type ActorProvider,
  type ArchiveStorageFactory,
  type ChangeStorageFactory,
  type CompositionRegistryInput,
  type CompositionRegistryView,
  type SchemaStorageFactory,
  type SpecStorageFactory,
  type VcsProvider,
} from './composition/composition-registries.js'
