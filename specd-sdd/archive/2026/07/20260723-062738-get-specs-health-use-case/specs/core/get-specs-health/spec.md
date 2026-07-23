# Get Specs Health

## Purpose

The `GetSpecsHealth` use case provides a lightweight summary of the project's specification validation status. By aggregating overall counts and returning only the failing or warned specifications in a consolidated format, it avoids transferring large lists of successful validations, optimizing payload sizes for clients.

## Requirements

### Requirement: Filter successful validations

The `GetSpecsHealth` usecase MUST invoke `ValidateSpecs.execute()` internally.
The resulting `GetSpecsHealthResult` SHALL exclude specifications that passed cleanly (0 failures, 0 warnings). It SHALL only report validation results for specifications that failed to validate cleanly (meaning `passed === false` or `warnings.length > 0`).

### Requirement: Health statistics aggregation

The resulting `GetSpecsHealthResult` SHALL aggregate overall validation statistics across the project:

- `totalSpecs`: The total number of specs validated.
- `passed`: The number of specs that passed cleanly (0 failures, 0 warnings).
- `failed`: The number of specs that failed validation (having one or more failures).
- `warned`: The number of specs that contain warnings but no failures.

These states SHALL be mutually exclusive, satisfying the invariant:
$$\text{totalSpecs} = \text{passed} + \text{failed} + \text{warned}$$

### Requirement: Consolidated diagnostics

For each spec that failed or has warnings, its diagnostics SHALL be consolidated into a single object under the `issues` array. Each entry in `issues` SHALL contain:

- `spec`: The canonical spec path.
- `passed`: A boolean indicating if the spec has no failures (true if it has only warnings, false if it has failures).
- `failures`: The array of validation failures.
- `warnings`: The array of validation warnings.

### Requirement: Workspace filtering

The `GetSpecsHealth` usecase SHALL support an optional `workspace` filter in its input, delegating this filter directly to the underlying `ValidateSpecs` execution.

## Spec Dependencies

- [`core:validate-specs`](../validate-specs/spec.md) — Invokes this usecase internally to validate specifications.
