# Port Changes Mutate — validateChangeAll

## Purpose

Client port method for DAG batch validation (`POST .../validate-all`).

## Requirements

### Requirement: validateChangeAll on SpecdDataPort

`SpecdDataPort` MUST declare:

```typescript
validateChangeAll(
  name: string,
  input?: { artifactId?: string },
  signal?: AbortSignal,
): Promise<ValidateBatchResultDto>
```

### Requirement: remote adapter path

`adapter-remote-specd-data` MUST `POST /changes/{name}/validate-all` with JSON body `input ?? {}`.

### Requirement: memory adapter stub

`adapter-memory-specd-data` MAY return `{ passed: true, total: 0, results: [] }` for UI tests without a kernel.

### Requirement: validateChange remains single-step

`validateChange(name, { specId?, artifactId? })` MUST continue to call `POST .../validate` only.

## Spec Dependencies

- [`api:routes-changes-mutate-validate-all`](../../api/routes-changes-mutate-validate-all/spec.md)
- [`client:dto-validate-batch-result`](../dto-validate-batch-result/spec.md)
