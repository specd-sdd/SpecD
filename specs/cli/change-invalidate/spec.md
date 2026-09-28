# Change Invalidate

## Purpose

Users need an explicit CLI command to reopen a change for semantic review without pretending that every invalidation is physical drift. The command must make the lifecycle consequence obvious, validate targeting and policy combinations before mutating anything, and clearly report the final affected artifact/file set.

This spec defines `specd changes invalidate <name>` as the manual invalidation surface. It covers command arguments, policy-dependent targeting rules, approval guards, and reporting.

## Requirements

### Requirement: Command signature

```text
specd changes invalidate <name> --reason <text>
  [--artifact-policy none|surgical|downstream|global]
  [--workflow-policy preserve|redesign]
  [--target <artifactId>[@<specId>] ...]
  [--force]
  [--format text|json|toon]
```

Artifact policy values are `none`, `surgical`, `downstream`, and `global`; workflow policy values are `preserve` and `redesign`. Targets are valid only where required by the effective artifact policy. The CLI SHALL map these flags to the structured `InvalidateChange` input and MUST NOT implement recovery locally.

### Requirement: Effective policy resolution

The CLI SHALL obtain the persisted structured policy and compatibility-adapted project configuration through core. Overrides apply only to this invocation. The CLI MUST NOT interpret the deprecated configuration key independently or silently combine old and new shapes.

### Requirement: Target syntax

`--target` is the only targeting surface.

Supported forms:

- `<artifactId>`
- `<artifactId>@<specId>`

Semantics:

- `<artifactId>` targets the whole artifact
- for `scope: spec` artifacts, `<artifactId>` means all files for that artifact across specs in the change
- `<artifactId>@<specId>` targets a single file of a `scope: spec` artifact
- `<artifactId>@<specId>` against a `scope: change` artifact is invalid

### Requirement: Policy-dependent target requirements

After resolving the effective policy:

- `surgical` and `downstream` REQUIRE at least one `--target`
- `none` and `global` MUST reject any `--target`

The command MUST validate these rules before any mutation or approval confirmation.

### Requirement: Target normalization and validation

When targets are permitted, the command MUST:

1. Normalize all requested targets
2. Validate all of them against artifact scope and change membership
3. Deduplicate the normalized target set
4. Fail atomically if any target is invalid

Validation errors MUST accumulate across the full requested set and report every invalid target combination found.

### Requirement: Approval guard

When the requested operation would revoke a currently valid spec approval or sign-off, the command SHALL stop without mutation unless `--force` is present. The warning SHALL identify each affected gate and its canonical recovery target from the Core result; it MUST NOT always promise a return to `designing` or choose a target in CLI code.

Stale evidence does not require confirmation merely because its historical approval event exists. This guard applies independently of artifact policy, including `none`.

### Requirement: Change-level invalidation

Once validation and guards pass, the command delegates invalidation and recovery to core. Artifact reopening follows the effective artifact policy; lifecycle movement follows the effective workflow policy and mandatory gate precedence. The CLI MUST NOT always return the change to `designing`.

### Requirement: none semantics

Artifact policy `none` reopens no additional artifact/file state. It does not clear existing drift, waive forward-progress blockers, restore stale evidence, or determine lifecycle recovery. Output SHALL state those facts together with the independently effective workflow policy and any gate-driven return.

### Requirement: Reporting

Success output SHALL report the recorded `reason`, both effective policy dimensions, affected artifact/file targets, approval or verification status changes, canonical blockers, next action, and any automatic return committed by the reconciler in text, JSON, and TOON. JSON and TOON SHALL expose `reason` as a named field rather than only embedding it in prose. When `--force` is required because valid consent would be revoked, the refusal SHALL render the exact affected gates and Core-selected recovery targets.

Output MUST NOT claim that `preserve` permits forward progress with drift. It means only that artifact drift itself did not move the current lifecycle state.

### Requirement: Error handling

The command exits with code `1` for invalid user/domain input, including:

- missing required `--reason`
- missing `--target` for effective `surgical` or `downstream`
- forbidden `--target` for effective `none` or `global`
- malformed or scope-incompatible targets
- missing `--force` when approvals/signoff are active

## Constraints

- The command MUST NOT expose `artifact-drift` as a manual cause.
- The command is a CLI adapter over the manual invalidation use case; it MUST NOT re-implement policy semantics independently.
- The command MUST report the final affected set, not the raw pre-normalized user input.

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — CLI discovery, formatting, and exit-code conventions.
- [`core:invalidate-change`](../../core/invalidate-change/spec.md) — authoritative manual invalidation behavior.
- [`core:get-status`](../../core/get-status/spec.md) — status/reporting conventions that the CLI output must remain compatible with.
- [`default:_global/docs`](../../_global/docs/spec.md) — user-facing command documentation conventions.
