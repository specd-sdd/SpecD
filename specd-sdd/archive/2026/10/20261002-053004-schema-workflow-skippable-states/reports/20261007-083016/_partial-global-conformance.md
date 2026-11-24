# Compliance Audit Partial: Global Conformance & Direct Dependencies

## Scope

- `default:_global/continuous-integration`
- `default:_global/conventions`
- `default:_global/docs`
- `default:_global/eslint`
- `default:_global/testing`
- `default:_global/error-handling-conventions`
- Direct dependencies: `core:change`, `core:schema-merge`, `core:resolve-schema`, `core:hook-execution-model`, `core:diff-generator`, `core:kernel`, `core:spec-lock`

## Requirements Summary & Implementation Status

### 1. Hexagonal Architecture & Conventions

- Pure domain services (`WorkflowTopology`, `CheckRegistry`, `LifecycleEngine`) have zero dependencies on I/O, Node.js filesystem, or CLI layers.
- Application use cases rely only on domain entities and input/output ports.
- Infrastructure and composition layers handle dependency injection and adapter instantiation.
- Named exports, ESM modules, kebab-case filenames, strict TypeScript typing maintained.
- Error handling extends `SpecdError` with canonical UPPER_SNAKE_CASE codes and actionable messages.

### 2. Testing Conventions

- All tests are written with Vitest, POSIX/Windows safe paths, no snapshot testing.
- 100% of tests pass across all packages in the workspace.

### 3. Direct Dependencies Compatibility

- No breaking changes or regressions introduced to direct dependent specs (`core:change`, `core:schema-merge`, `core:kernel`, etc.).
- Manifest schema metadata additions are backwards-compatible.

## Discrepancies

- None detected.

## Test Coverage

- Full CI test and lint rules verified.
