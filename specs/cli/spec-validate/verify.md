# Spec Validate — Verification Scenarios

## Scenario: Single spec passes validation

WHEN the user runs `specd spec validate default:auth/login`
AND all required spec-scoped artifacts exist and pass structural rules
THEN stdout contains `validated default:auth/login: all artifacts pass`
AND exit code is 0

## Scenario: Single spec fails validation

WHEN the user runs `specd spec validate default:auth/login`
AND a required artifact is missing or a structural rule fails
THEN stdout contains `validation failed default:auth/login:`
AND indented error lines follow
AND exit code is 1

## Scenario: --all with all specs passing

WHEN the user runs `specd spec validate --all`
AND every spec across all workspaces passes
THEN stdout contains `validated N specs: N passed, 0 failed`
AND exit code is 0

## Scenario: --all with some specs failing

WHEN the user runs `specd spec validate --all`
AND at least one spec has a validation failure
THEN stdout contains `validated N specs: X passed, Y failed`
AND each failing spec is listed with `FAIL` prefix and indented errors
AND exit code is 1

## Scenario: --workspace filters to one workspace

WHEN the user runs `specd spec validate --workspace billing`
THEN only specs in the `billing` workspace are validated
AND output follows multi-spec format

## Scenario: Unknown spec path

WHEN the user runs `specd spec validate default:nonexistent`
AND the spec does not exist
THEN stderr contains `error: spec not found`
AND exit code is 1

## Scenario: Unknown workspace

WHEN the user runs `specd spec validate --workspace nonexistent`
AND the workspace does not exist in config
THEN stderr contains `error: unknown workspace`
AND exit code is 1

## Scenario: JSON output matches result type

WHEN the user runs `specd spec validate --all --format json`
THEN the JSON output contains `entries`, `totalSpecs`, `passed`, `failed` keys

## Scenario: No scope argument provided

WHEN the user runs `specd spec validate` without any scope argument
THEN stderr contains an error message about specifying a scope
AND exit code is 1
