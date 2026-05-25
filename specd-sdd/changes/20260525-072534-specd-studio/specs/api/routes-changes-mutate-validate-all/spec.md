# Routes Changes Mutate — validate-all

## Purpose

HTTP batch validation for Studio and agents: one request walks the change artifact DAG (parity with `specd changes validate --all`).

## Requirements

### Requirement: POST validate-all delegates to ValidateChangeBatch

`POST /v1/changes/{name}/validate-all` MUST accept optional JSON/query `{ artifactId?: string }` and invoke `kernel.changes.validateBatch.execute({ name, artifactId? })`.

The handler MUST NOT loop `specIds` or call `validate` per spec.

### Requirement: response shape

The response MUST be `ValidateBatchResultDto`:

```json
{
  "passed": false,
  "total": 12,
  "results": [
    {
      "spec": null,
      "artifact": "proposal",
      "passed": true,
      "failures": [],
      "warnings": [],
      "files": ["proposal.md"]
    }
  ]
}
```

Failures MUST map `description` → `message` and include optional `path` from filename metadata.

### Requirement: single-step validate unchanged

`POST /v1/changes/{name}/validate` remains the **single-step** endpoint (`specId` / `artifactId` → one `ValidateArtifacts` pass, flat `ValidateResultDto`). Batch and single-step MUST NOT share the same response DTO.

## Spec Dependencies

- [`core:validate-change-batch`](../core/validate-change-batch/spec.md)
- [`api:routes-changes-mutate`](../../../../specs/api/routes-changes-mutate/spec.md) — sibling mutate routes (canonical)
- [`api:dto-validate-batch-result`](../dto-validate-batch-result/spec.md)
