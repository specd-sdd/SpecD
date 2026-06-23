# Hooks Change Validate

## Purpose

Studio validation orchestration in `packages/ui/src/hooks/use-change-validate.ts`: one HTTP batch for **Validate All**, one single-step call for the open artifact.

## Requirements

### Requirement: runChangeValidation uses server batch for Validate All

When `filename` is omitted, MUST call `port.validateChangeAll(changeName, { artifactId? })` once and flatten with `flattenBatchValidateResult`. MUST NOT loop `change.specIds` with `validateChange`.

When `filename` is set, MUST call `port.validateChange` with derived `specId` and `artifactId`.

### Requirement: flattenBatchValidateResult for shell output

MUST merge batch step failures, warnings, and files into `ValidateResultDto` so the shell can append lines to [`ui:bottom-panel-output`](../bottom-panel-output/spec.md) with appropriate levels; [`ui:bottom-panel-problems`](../bottom-panel-problems/spec.md) derives warn/error lines from that stream.

## Spec Dependencies

- [`client:port-changes-mutate-validate-all`](../../client/port-changes-mutate-validate-all/spec.md) — `validateChangeAll`
- [`client:port-changes-mutate`](../../client/port-changes-mutate/spec.md) — `validateChange`
- [`ui:validate-confirm-dialog`](../validate-confirm-dialog/spec.md) — confirmation before invoke
- [`core:validate-change-batch`](../../core/validate-change-batch/spec.md) — server DAG driver (change `feat-user-interface`)
