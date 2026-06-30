export { RegistryConflictError } from './application/errors/registry-conflict-error.js'
export { type ExternalHookRunner } from './application/ports/external-hook-runner.js'
export { createKernelBuilder, type KernelBuilder } from './composition/kernel-builder.js'
export {
  type ActorProvider,
  type ArchiveStorageFactory,
  type ChangeStorageFactory,
  type GraphStoreFactory,
  type KernelRegistryInput,
  type KernelRegistryView,
  type SchemaStorageFactory,
  type SpecStorageFactory,
  type VcsProvider,
} from './composition/kernel-registries.js'
