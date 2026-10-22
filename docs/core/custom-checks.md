---
title: Custom Transition Checks Guide
description: Guide for authors and integrators on implementing custom predicate checks, governance policies, and kernel composition in SpecD.
sidebar_position: 10
---

# Custom Transition Checks Guide

SpecD enforces lifecycle transitions through a unified, open verification pipeline. While **hooks** execute arbitrary shell commands or external processes during step boundaries, **checks** are first-class domain predicates evaluated in-memory before lifecycle mutations occur.

This guide details how to implement custom transition checks, configure two-tier governance policies, leverage cascading configurations, and register checks into the SpecD kernel.

---

## 1. Checks vs. Hooks: Understanding the Distinction

| Feature              | Transition Check (`Check` / `CustomCheckDefinition`)                                                                  | Transition Hook (`HookEntry`)                                                                               |
| :------------------- | :-------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------- |
| **Execution Model**  | Pure in-memory predicate function evaluated synchronously/asynchronously during transition preflight.                 | Subprocess execution (`run:`) or external runner (`external:`) dispatched before or after step persistence. |
| **Primary Intent**   | Domain invariants, safety verification, security scanning, architectural linting, and policy conformance.             | Environment provisioning, automated testing pipelines, notifications, and AI instructions.                  |
| **Namespace**        | Namespaced under `@<plugin>.<id>` (or core built-in IDs).                                                             | Identified by step-unique ID (`id:`).                                                                       |
| **Failure Handling** | Blocks transitions and throws a structured `CheckPredicateFailedError` with remediation commands and bypass guidance. | Governed by `onFailure: 'abort' \| 'warn'`. Non-fatal hook warnings collect without halting transitions.    |
| **Bypass Semantics** | Skippable checks can be bypassed explicitly via `--skip-checks <id>`.                                                 | Hook phases can be skipped via `--skip-hooks <phases>`.                                                     |

---

## 2. Implementing a Custom Check: `CustomCheckDefinition`

External plugin authors implement the ergonomic `CustomCheckDefinition` contract. Engine internals (such as `kind: 'predicate'`) and lifecycle routing policies (`skippable`) are abstracted away:

```typescript
import type { CustomCheckDefinition, CheckExecutionContext, CheckResult } from '@specd/core'

export const securityScanCheck: CustomCheckDefinition = {
  id: 'code-scan',
  label: 'Scanning code for security vulnerabilities',
  command: 'pnpm audit:fix',
  async execute(ctx: CheckExecutionContext): Promise<CheckResult> {
    const minSeverity = (ctx.config?.minSeverity as string) ?? 'high'

    // Evaluate domain facts using change and schema context
    const issues = await runSecurityAudit(ctx.change, minSeverity)

    if (issues.length > 0) {
      return {
        id: '@security.code-scan',
        label: 'Scanning code for security vulnerabilities',
        kind: 'predicate',
        outcome: 'fail',
        code: 'SECURITY_VULNERABILITIES_FOUND',
        message: `Found ${issues.length} ${minSeverity}-severity vulnerabilities.`,
        command: 'pnpm audit:fix',
        details: { issues },
      }
    }

    return {
      id: '@security.code-scan',
      label: 'Scanning code for security vulnerabilities',
      kind: 'predicate',
      outcome: 'pass',
    }
  },
}
```

### Execution Context (`CheckExecutionContext`)

The `execute` function receives `CheckExecutionContext` containing:

- `change`: The domain entity representing the active change under evaluation.
- `schema`: The active `Schema` definition governing the change.
- `attempt`: The classified lifecycle transition triple (`from`, `to`, `along`).
- `config`: Effective cascading configuration resolved for this check and step.
- `validity`: Reconciled validity snapshot for the change.
- `onCheckProgress`: Optional callback to emit granular liveness events.

---

## 3. Dual-Source Semantics of `outcome: 'skip'`

A check evaluation yields an `outcome: 'skip'` from one of two distinct paths:

1. **Self-Discarding Evaluation**: The check inspects its execution context and determines it is not applicable given current facts (e.g. `if (!ctx.config?.enabled) return { outcome: 'skip', ... }`).
2. **Orchestrator Bypass (`--skip-checks`)**: The user explicitly passed the check's ID to `--skip-checks`. If the binding specifies `skippable: true`, the orchestrator synthesizes an immediate skip result without invoking `check.execute()`. If `skippable: false`, `CheckNotSkippableError` is thrown immediately.

---

## 4. Two-Tier Governance & Configuration Cascading

SpecD enforces two tiers of governance locks to ensure that project schemas cannot compromise critical checks:

### 4.1 Governance Locks

1. **Check-Level Confinement (`allowBindingOverride: false`)**:
   When set on the check registration, the check cannot be embedded into arbitrary steps in `schema.yaml` beyond its declared default bindings. Violations throw `CheckEmbeddingForbiddenError`.
2. **Binding-Level Policy Lock (`allowBindingOverride: false`)**:
   When set on a specific coordinate binding, `schema.yaml` cannot alter `onFailure` or `skippable` for that coordinate. Violations throw `CheckBindingOverrideForbiddenError`.
3. **Configuration Override Lock (`allowConfigOverride: false`)**:
   When set, `schema.yaml` cannot override or extend `config` for the check. Violations throw `CheckConfigOverrideForbiddenError`.
4. **Disablement Governance Lock (`allowDisable: false`)**:
   When set on the check registration or a matching binding, `schema.yaml` cannot declare `disabled: true` for that check. Violations throw `CheckDisableForbiddenError`. Core protocol invariants permanently enforce `allowDisable: false`.
5. **Monotonic Governance Rule (Principle of Monotonic Governance Locks)**:
   All governance locks (`allowBindingOverride`, `allowConfigOverride`, `allowDisable`) operate strictly under monotonic restriction (principle of least privilege). Once established as locked (`false`), no schema layer merger (`merge-schema-layers`), extension layer, or identical binding redeclaration can delete, erase, or relax that lock to `true`. Schema layer mergers safely aggregate `step.checks` arrays using identity collision validation (`addToArray`), preventing accidental clobbering or erasure of existing governance locks.
6. **Three-Tier Governance Categorization of Built-in Checks**:
   Built-in checks are categorized to prevent protocol compromise while enabling schema flexibility:
   - **Category A (Protocol & State Invariants)** (`protocol.edge`, `verification.current`, `archive.archivable`, `schema.nameMatch`, `hook.pre`, `hook.post`): Enforce `allowBindingOverride: false` and `allowDisable: false`. Attempting to embed or disable them in `schema.yaml` throws `CheckEmbeddingForbiddenError` or `CheckDisableForbiddenError`.
   - **Category B (Native Step Attributes)** (`workflow.requires`, `workflow.taskCompletion`, `approval.spec`, `approval.signoff`): Controlled natively via dedicated step/workspace schema attributes (`step.requires: []`, `requiresTaskCompletion`, `approvals`).
   - **Category C (Policy & Consistency Checks)** (`impl.linksInScope`, `spec.overlap`, `deps.consistent`, `impl.filesResolved`, `workspace.readOnly`): Enforce `allowBindingOverride: true` and `allowDisable: true`. Project schemas can bind them to workflow steps, configure them, or declaratively disable them (`disabled: true`).
   - **Archive exception**: on the archive operation (`scope: 'archive'`) only, `workspace.readOnly`, `impl.filesResolved`, and `deps.consistent` are fully locked (`allowBindingOverride: false`, `allowConfigOverride: false`, `allowDisable: false`, not skippable). `workspace.readOnly` is a security boundary, and unresolved implementation or inconsistent dependencies would produce an invalid archive, so no schema declaration and no `--skip-checks` can relax them there. Their transition bindings keep the Category C policy. On archive, the only built-in checks a schema can configure, disable, or make skippable are `spec.overlap` and `impl.linksInScope`.

### 4.2 Declarative Disablement (`disabled: true`) vs. Runtime Bypass (`skippable` / `--skip-checks`)

- **Declarative Disablement (`disabled: true`)**: Configured at design time in `schema.yaml` within a step's `checks:` block. When permitted (`allowDisable !== false`), the check is cleanly excluded from matching predicate execution for that coordinate. It runs with zero runtime overhead, produces no warnings, and represents an intentional architectural decision by the schema author.
- **Runtime Bypass (`skippable: true` via `--skip-checks`)**: An operational, human-in-the-loop exception executed at runtime via the CLI. It requires `skippable: true` on the matching binding, records an audit verdict (`bypassedByUser: true`), and produces visibility in transitions. Mandatory invariants remain non-skippable.

### 4.3 Cascading Configuration Merge

For an optional workflow step, Core composes registry `step-skip` bindings with the step's inline `skipChecks`. An empty effective set passes vacuously, so bypass is unconditional by default. A non-empty set makes bypass conditional on every predicate passing. Failure does not disable the step: Core recommends entering it. Disabled steps are different—they are removed from the active pipeline and cannot declare skip checks. Lifecycle skills consume Core's `nextAction` and must not recreate this decision from tasks or YAML.

Configuration cascades across three layers, deeply merging nested configuration objects via `deepMergeConfig`:

```
┌─────────────────────────────────────────────────────────┐
│ Plugin Default Config (`options.defaultConfig`)         │
└────────────────────────────┬────────────────────────────┘
                             │ deep merge
                             ▼
┌─────────────────────────────────────────────────────────┐
│ Default Binding Config (`defaultBindings[].config`)     │
└────────────────────────────┬────────────────────────────┘
                             │ deep merge
                             ▼
┌─────────────────────────────────────────────────────────┐
│ Schema Step Declaration Config (`step.checks[].config`) │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
              Effective `ctx.config` in check
```

---

## 5. Composition & Kernel Registration

### Using `KernelBuilder` (Recommended)

Plugin authors and integrators register checks fluently using `createKernelBuilder`:

```typescript
import { createKernelBuilder } from '@specd/core'

const kernel = await createKernelBuilder(config)
  .registerCheck(
    'security',
    securityScanCheck,
    [
      {
        scope: 'transition',
        from: 'implementing',
        to: 'verifying',
        skippable: true,
      },
    ],
    {
      allowBindingOverride: true,
      allowConfigOverride: true,
      defaultConfig: { minSeverity: 'high' },
    },
  )
  .build()
```

### Using `createKernel`

Checks can also be supplied via `KernelOptions`:

```typescript
import { createKernel } from '@specd/core'

const kernel = await createKernel(config, {
  checks: [
    {
      pluginName: 'security',
      check: securityScanCheck,
      defaultBindings: [
        {
          id: '@security.code-scan',
          applicability: [
            { scope: 'transition', from: 'implementing', to: 'verifying', along: '*' },
          ],
          skippable: true,
        },
      ],
    },
  ],
})
```

---

## 6. Declarative Schema Integration (`schema.yaml`)

Custom checks can be bound to workflow steps in `schema.yaml`:

```yaml
version: 2
name: standard-workflow

workflow:
  - step: verifying
    checks:
      - id: '@security.code-scan'
        skippable: true
        config:
          minSeverity: critical
      - id: '@qa.extended-lint'
        disabled: true # Cleanly omitted from verification if allowDisable is true
    hooks:
      pre:
        - id: run-tests
          run: pnpm test
          onFailure: warn
```

### Archive checks

The archive operation is a third check surface: it has its own bindings (`{ scope: 'archive' }`), and a schema tunes them with `archiveChecks` on the `archiving` row (valid only there).

A host registers a check that runs on every archive:

```ts
const kernel = await createKernelBuilder(config)
  .registerCheck('security', securityScanCheck, [{ scope: 'archive', skippable: true }], {
    allowBindingOverride: true,
    allowConfigOverride: true,
    allowDisable: true,
    defaultConfig: { minSeverity: 'high' },
  })
  .build()
```

A schema can then tune it, or embed a registered check that has no archive binding:

```yaml
workflow:
  - step: archiving
    archiveChecks:
      - id: '@security.code-scan' # registered by the host above
        skippable: true
        config:
          minSeverity: critical # deep-merged over defaultConfig
      - id: spec.overlap
        skippable: false # never archive over a live overlap
      - id: impl.linksInScope
        disabled: true
```

`archiveChecks` entries accept only `id`, `skippable`, `disabled`, and `config`. `onFailure` is rejected: archive predicate failures have no abort/collect distinction. Governance on archive is the table in the [schema format reference](../schemas/schema-format.md#archive-operation-checks).

When a plugin or schema-embedded archive check fails, `ArchiveChange` throws `CheckPredicateFailedError` (check id, label, failure code, message, command, details, and the resolved `skippable`), like a failing transition check. Built-in archive checks keep their dedicated errors.

---

## 7. CLI Bypass and Repair Guide

When a check fails during a transition attempt, the CLI formats a structured Text Repair Guide:

```text
error: Check '@security.code-scan' failed: Found 2 high-severity vulnerabilities
! SECURITY_VULNERABILITIES_FOUND — Scanning code for security vulnerabilities: Found 2 high-severity vulnerabilities

repair guide:
  state:   implementing
  target:  verifying
  command: pnpm audit:fix
  bypass:  Retry with --skip-checks @security.code-scan if an exception is granted
```

Users can bypass skippable checks directly:

```bash
specd changes transition my-change verifying --skip-checks @security.code-scan
```

The same flag works on archive. Each id is validated against the resolved archive bindings before anything runs:

```bash
specd changes archive my-change --skip-checks spec.overlap
specd changes archive my-change --skip-checks @security.code-scan
```

An unregistered id fails with `UnknownCheckError`; a hook (`hook.pre`, `hook.post`) or a non-skippable binding fails with `CheckNotSkippableError`. `--allow-overlap` and `--allow-out-of-scope` remain as CLI aliases of `--skip-checks spec.overlap` and `--skip-checks impl.linksInScope`; the use case itself accepts only `skipChecks`.
