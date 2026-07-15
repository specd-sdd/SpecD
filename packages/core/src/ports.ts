export { ContentHasher } from './application/ports/content-hasher.js'
export { Repository, type RepositoryConfig } from './application/ports/repository.js'
export {
  SpecRepository,
  type SpecRepositoryConfig,
  type ResolveFromPathResult,
  type SpecSearchMatch,
  type SpecSearchResult,
} from './application/ports/spec-repository.js'
export {
  ChangeRepository,
  type ChangeRepositoryConfig,
} from './application/ports/change-repository.js'
export {
  ArchiveRepository,
  type ArchiveRepositoryConfig,
} from './application/ports/archive-repository.js'
export {
  type SchemaRegistry,
  type SchemaEntry,
  type SchemaRawResult,
  type Schema,
} from './application/ports/schema-registry.js'
export { type SchemaRepository } from './application/ports/schema-repository.js'
export {
  type HookRunner,
  type HookResult,
  type TemplateVariables,
} from './application/ports/hook-runner.js'
export {
  type ExternalHookDefinition,
  type ExternalHookRunner,
} from './application/ports/external-hook-runner.js'
export { type ActorResolver } from './application/ports/actor-resolver.js'
export { type ImplementationDetector } from './application/ports/implementation-detector.js'
export { type VcsAdapter } from './application/ports/vcs-adapter.js'
export { type FileReader } from './application/ports/file-reader.js'
export { type DiffGenerator, type DiffGeneratorInput } from './application/ports/diff-generator.js'
export {
  type ArtifactNode,
  type ArtifactAST,
  type DeltaEntry,
  type DeltaApplicationResult,
  type NodeTypeDescriptor,
  type OutlineEntry,
  type ArtifactParser,
  type ArtifactParserRegistry,
} from './application/ports/artifact-parser.js'
export { type SchemaProvider } from './application/ports/schema-provider.js'
export { type ConfigLoader } from './application/ports/config-loader.js'
export {
  type LogDestination,
  type LogEntry,
  type LogFormat,
  type LogLevel,
  type LoggerPort,
} from './application/ports/logger.port.js'
export {
  type ConfigWriter,
  type InitProjectOptions,
  type InitProjectResult,
} from './application/ports/config-writer.js'
export { YamlSerializer } from './application/ports/yaml-serializer.js'
