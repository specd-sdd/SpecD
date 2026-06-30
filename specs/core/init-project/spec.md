# InitProject

## Purpose

**Retired.** The `InitProject` application use case is removed. Project initialisation requirements now live in [`core:config-writer-port`](../config-writer-port/spec.md) (`initProject` operation) and [`core:composition`](../composition/spec.md) (`createConfigWriter()` factory). Delivery mechanisms call `createConfigWriter().initProject(...)`.

## Requirements

### Requirement: InitProject use case removed

The `InitProject` application use case class MUST NOT be exported from `@specd/core`. Callers that previously used `createInitProject()` or `kernel.project.init` MUST migrate to `createConfigWriter().initProject(...)`.

## Spec Dependencies

- [`core:config`](../config/spec.md) — defines `ConfigWriter` port contract, `InitProjectOptions`, and `InitProjectResult`
- [`default:_global/architecture`](../../_global/architecture/spec.md) — port/adapter design constraints
