# Verification: Architecture

## Requirements

### Requirement: Layered structure for packages with business logic

#### Scenario: Domain imports from infrastructure

- **WHEN** a file in `domain/` imports from `infrastructure/`
- **THEN** the TypeScript compiler must reject the import

#### Scenario: Application imports infrastructure directly

- **WHEN** a use case imports a concrete adapter instead of the port interface
- **THEN** the TypeScript compiler must reject the import

### Requirement: Domain layer is pure

#### Scenario: Domain imports node:fs

- **WHEN** a file in `domain/` imports `node:fs` or any I/O module
- **THEN** the TypeScript compiler must reject the import

### Requirement: Application layer uses ports only

#### Scenario: Use case receives port via constructor

- **WHEN** a use case needs to read specs
- **THEN** it receives a `SpecRepository` port via its constructor, not a concrete `FsSpecRepository`

### Requirement: Rich domain entities

#### Scenario: Invalid state transition

- **WHEN** a use case attempts an invalid state transition on a domain entity
- **THEN** the entity throws a typed `SpecdError` subclass before any side effect occurs

### Requirement: Domain value objects expose behaviour, not structure

#### Scenario: Value object exposes internal array

- **WHEN** a value object in `domain/` has a `public` getter that returns its internal backing field directly
- **THEN** it must be replaced with a method or getter that exposes only the behaviour the caller needs

#### Scenario: Infrastructure adapter accesses internal segments

- **WHEN** an infrastructure adapter needs a filesystem path from a domain path object
- **THEN** it must call `domainPath.toFsPath(sep)` — it must not access a `segments` property

### Requirement: Ports with shared construction are abstract classes

#### Scenario: Port has shared construction arguments

- **WHEN** every possible implementation of a port receives the same set of constructor arguments
- **THEN** the port is an `abstract class` with those arguments in its constructor, not an `interface`

#### Scenario: Port declares a property instead of a method

- **WHEN** a port class declares `readonly scope: string` instead of `scope(): string`
- **THEN** it must be changed to the method form

### Requirement: Pure functions for stateless domain services

#### Scenario: Domain service is a function

- **WHEN** a developer adds a stateless domain operation to any package
- **THEN** it is exported as a plain function, not as a class with methods

### Requirement: Manual dependency injection

#### Scenario: Use case wired at entry point

- **WHEN** any package boots (CLI, MCP, or future entry points)
- **THEN** it constructs use cases manually, passing concrete adapters to each constructor

### Requirement: Adapter packages contain no business logic

#### Scenario: Adapter package contains business logic

- **WHEN** a command, tool, or plugin implements domain logic instead of delegating to a use case
- **THEN** the logic must be moved to the appropriate core package

### Requirement: No circular dependencies between packages

#### Scenario: Cycle introduced by new package

- **WHEN** a new package declares a `workspace:*` dependency that creates a cycle
- **THEN** pnpm must reject it
