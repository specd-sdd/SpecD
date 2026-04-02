# External Hook Runner Port

## Purpose

Workflow hooks that dispatch to external execution backends such as Docker or HTTP cannot be forced through the internal shell-oriented `HookRunner` without conflating two different execution models. `ExternalHookRunner` defines the application-layer contract for runners that execute explicit external hook entries, declare which external hook types they accept, and return deterministic hook results for the workflow runtime.

## Requirements

### Requirement: External hook runners declare accepted types

An `ExternalHookRunner` SHALL declare which explicit external hook types it accepts. The declaration SHALL be machine-readable so the runtime can determine whether a given runner can handle a hook entry before dispatching it.

The accepted-type declaration MUST be treated as the source of truth for dispatch. Runtime dispatch MUST NOT guess based solely on registration name or implementation class.

### Requirement: External hook runners execute explicit external hooks

An `ExternalHookRunner` SHALL execute explicit external hook entries using:

- the nested `external.type`
- the nested `external.config` payload
- the workflow template variables for the current execution context

The runner contract SHALL be separate from `HookRunner`, which remains responsible for shell `run:` hooks only.

### Requirement: Unknown external hook types are errors

If no registered external hook runner declares support for a given external hook type, the runtime MUST fail with a clear error. Unknown external hook types are not ignored and are not treated as no-ops.

### Requirement: Runner results are workflow-compatible

External hook execution SHALL produce results compatible with workflow hook execution semantics so that pre-phase failures, post-phase reporting, and CLI/user-facing behavior can be handled consistently alongside shell hook execution.

## Constraints

- `ExternalHookRunner` is an application-layer port
- The port is separate from `HookRunner`; the two contracts must not be conflated
- Accepted external hook types must be declared explicitly
- Unknown external hook types are hard errors

## Spec Dependencies

- [`specs/core/hook-execution-model/spec.md`](../hook-execution-model/spec.md) — execution semantics for explicit external hooks
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — workflow representation of explicit external hook entries
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — application-port placement and composition boundaries
