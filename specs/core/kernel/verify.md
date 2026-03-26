# Verification: Kernel

## Requirements

### Requirement: Kernel interface groups use cases by domain area

#### Scenario: Use cases are nested under domain groups

- **WHEN** `createKernel(config)` is called with a valid `SpecdConfig`
- **THEN** the returned object has exactly three top-level keys: `changes`, `specs`, `project`
- **AND** each key contains an object with use case entries — not use cases at the root level

#### Scenario: Changes group contains all change use cases

- **WHEN** `kernel.changes` is inspected
- **THEN** it contains entries for: `create`, `status`, `transition`, `draft`, `restore`, `discard`, `archive`, `validate`, `compile`, `list`, `listDrafts`, `listDiscarded`, `edit`, `skipArtifact`, `updateSpecDeps`, `listArchived`, `getArchived`, `detectOverlap`
- **AND** it contains `repo` as the underlying `ChangeRepository`

#### Scenario: Specs group contains all spec use cases

- **WHEN** `kernel.specs` is inspected
- **THEN** it contains entries for: `approveSpec`, `approveSignoff`, `list`, `get`, `saveMetadata`, `invalidateMetadata`, `getActiveSchema`, `validate`, `generateMetadata`, `getContext`
- **AND** it contains `repos` as the `ReadonlyMap<string, SpecRepository>`

#### Scenario: Project group contains all project use cases

- **WHEN** `kernel.project` is inspected
- **THEN** it contains entries for: `init`, `recordSkillInstall`, `getSkillsManifest`, `getProjectContext`

### Requirement: Every exported use case must have a kernel entry

#### Scenario: New use case added without kernel entry

- **GIVEN** a new use case class is added to `application/use-cases/` and exported from the use cases index
- **WHEN** `createKernel` is inspected
- **THEN** the new use case must have a corresponding entry in the `Kernel` interface and be wired in `createKernel`
- **AND** omitting it is a spec violation

#### Scenario: Shared utilities are exempt

- **WHEN** `application/use-cases/_shared/` exports `checkMetadataFreshness`, `computeArtifactHash`, or `parseMetadata`
- **THEN** these do not require kernel entries — they are internal building blocks

### Requirement: Kernel entry mapping

#### Scenario: Every mapped entry exists at the documented path

- **WHEN** `createKernel(config)` is called with a valid `SpecdConfig`
- **THEN** every kernel path listed in the entry mapping table resolves to a non-undefined value
- **AND** each value is an instance of the use case class documented in the table

#### Scenario: No undocumented entries in the kernel

- **WHEN** the keys of `kernel.changes`, `kernel.specs`, and `kernel.project` are enumerated
- **THEN** every key appears in the entry mapping table — there are no undocumented entries

#### Scenario: Entry added to kernel without updating the mapping table

- **GIVEN** a new use case is wired into `createKernel` under `kernel.changes.newUseCase`
- **WHEN** the kernel spec is reviewed
- **THEN** the entry mapping table must include the new path — omitting it is a spec violation

### Requirement: Kernel entries must match use case types

#### Scenario: Kernel entry type matches use case class

- **WHEN** `kernel.changes.create` is inspected
- **THEN** it is an instance of `CreateChange`
- **AND** calling `kernel.changes.create.execute(...)` invokes the use case directly

#### Scenario: Kernel does not wrap use cases in abstractions

- **WHEN** any kernel entry is inspected
- **THEN** its type is the concrete use case class, not a wrapper, proxy, or simplified interface

### Requirement: createKernel constructs shared adapters once

#### Scenario: No duplicate adapter construction

- **GIVEN** a valid `SpecdConfig` with one workspace
- **WHEN** `createKernel(config)` is called
- **THEN** only one `ChangeRepository` instance is created
- **AND** only one `SchemaRegistry` instance is created
- **AND** only one `SchemaProvider` instance is created and shared across all use cases
- **AND** only one `RunStepHooks` instance is created

#### Scenario: SchemaProvider replaces direct SchemaRegistry usage

- **GIVEN** a valid `SpecdConfig` with `schemaOverrides` declared
- **WHEN** `createKernel(config)` is called
- **THEN** no use case constructor receives `SchemaRegistry` directly
- **AND** all use cases that need the schema receive `SchemaProvider`
- **AND** `SchemaProvider.get()` returns the schema with overrides applied
- **AND** `RunStepHooks` and `GetHookInstructions` do not receive project-level workflow hooks

### Requirement: Project-level VCS and actor adapters must use auto-detect

#### Scenario: Kernel internals use auto-detect for project VCS

- **WHEN** `createKernelInternals` constructs the project-level `VcsAdapter`
- **THEN** it calls `createVcsAdapter(config.projectRoot)` instead of constructing a specific implementation directly

#### Scenario: Kernel internals use auto-detect for project actor

- **WHEN** `createKernelInternals` constructs the project-level `ActorResolver`
- **THEN** it calls `createVcsActorResolver(config.projectRoot)` instead of constructing a specific implementation directly

#### Scenario: Standalone use-case factories use auto-detect for actor

- **WHEN** any standalone use-case factory in `composition/use-cases/` needs an `ActorResolver`
- **THEN** it calls `createVcsActorResolver()` instead of `new GitActorResolver()`

#### Scenario: Non-git project gets correct adapters

- **GIVEN** a project directory that is not a git repository
- **WHEN** `createKernelInternals` is called
- **THEN** the `vcs` field is a `NullVcsAdapter` (or the detected VCS adapter)
- **AND** the `actor` field is a `NullActorResolver` (or the detected actor resolver)
- **AND** no git-specific errors are thrown

### Requirement: Kernel exposes repository instances for adapter access

#### Scenario: ChangeRepository accessible via kernel

- **WHEN** `kernel.changes.repo` is accessed
- **THEN** it returns the `ChangeRepository` instance used by all change use cases

#### Scenario: SpecRepository map accessible via kernel

- **WHEN** `kernel.specs.repos` is accessed
- **THEN** it returns a `ReadonlyMap<string, SpecRepository>` with one entry per configured workspace

### Requirement: createKernel accepts optional KernelOptions

#### Scenario: Extra node_modules paths appended to schema search

- **GIVEN** a `KernelOptions` with `extraNodeModulesPaths: ['/usr/lib/node_modules']`
- **WHEN** `createKernel(config, options)` is called
- **THEN** the schema registry searches the project's own `node_modules` first, then `/usr/lib/node_modules`

#### Scenario: No options provided

- **WHEN** `createKernel(config)` is called without options
- **THEN** the schema registry searches only the project's own `node_modules`

### Requirement: Kernel is a plain object, not a class

#### Scenario: Kernel has no methods or lifecycle

- **WHEN** the kernel object is inspected
- **THEN** it has no `dispose()`, `shutdown()`, `initialize()`, or similar lifecycle methods
- **AND** it has no event emitter or observable properties

#### Scenario: Kernel is immutable after creation

- **WHEN** `createKernel(config)` returns
- **THEN** the kernel object and its nested groups are not expected to change — there is no `addUseCase()` or `removeUseCase()` mechanism
