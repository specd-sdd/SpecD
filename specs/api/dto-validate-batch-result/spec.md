# DTO Validate Batch Result

## Purpose

Stable JSON wire shape for `POST /changes/{name}/validate-all` returned by `@specd/api` and mirrored by `@specd/client`.

## Requirements

### Requirement: ValidateBatchResultDto

MUST include `passed: boolean`, `total: number`, `results: ValidateBatchStepResultDto[]`.

### Requirement: ValidateBatchStepResultDto

Each step MUST include `spec: string | null`, `artifact: string`, `passed: boolean`, `failures` (`message`, `artifactId`, optional `path`), `warnings: string[]`, `files: string[]`.

### Requirement: parity with client DTO

[`client:dto-validate-batch-result`](../client/dto-validate-batch-result/spec.md) MUST stay structurally identical to this wire shape.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md)
- [`default:_global/conventions`](../../default/_global/conventions/spec.md)
