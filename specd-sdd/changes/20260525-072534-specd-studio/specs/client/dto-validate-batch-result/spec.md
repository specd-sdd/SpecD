# DTO Validate Batch Result

## Purpose

Typed mirror of `POST /changes/{name}/validate-all` for `@specd/client` and `@specd/api`.

## Requirements

### Requirement: ValidateBatchResultDto

MUST include `passed: boolean`, `total: number`, `results: ValidateBatchStepResultDto[]`.

### Requirement: ValidateBatchStepResultDto

Each step MUST include:

- `spec: string | null`
- `artifact: string`
- `passed: boolean`
- `failures` — same failure shape as single validate (`message`, `artifactId`, optional `path`)
- `warnings: string[]`
- `files: string[]`

API and client packages MUST keep structurally identical DTOs under `dto/validate-batch-result.ts`.

## Spec Dependencies

- [`api:dto-validate-batch-result`](../api/dto-validate-batch-result/spec.md)
- [`default:_global/architecture`](../../default/_global/architecture/spec.md)
- [`default:_global/conventions`](../../default/_global/conventions/spec.md)
