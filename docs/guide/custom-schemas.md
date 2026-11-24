---
title: Authoring Custom Schemas
description: Creating and publishing custom SpecD workflow schemas, extensions, and schema plugins.
sidebar_position: 12
---

# Authoring Custom Schemas

While `@specd/schema-std` fits most software engineering workflows, teams often need customized processes: adding Architecture Decision Records (ADRs), integrating security audits, enforcing database migration reviews, or custom validation rules.

SpecD provides three progressive mechanisms to customize workflows:

1. **`schemaOverrides`** in `specd.yaml` (lightweight inline customization)
2. **`schemaPlugins`** (composable schema layers)
3. **`specd schema extend` / `specd schema fork`** (custom schema packages)

---

## 1. Inline Customization with `schemaOverrides`

`schemaOverrides` allows you to modify the active schema directly in `specd.yaml` without publishing a separate package.

Supported operations:

- `create`: Add new artifact types or workflow steps.
- `append`: Add rules, hooks, or validators to existing lists.
- `prepend`: Insert rules or hooks at the start of lists.
- `set`: Replace fields or objects by key.
- `remove`: Remove entries by `id` or `step`.

### Example: Adding an ADR Artifact Type

```yaml
# specd.yaml
schema: '@specd/schema-std'

schemaOverrides:
  create:
    artifacts:
      - id: adr
        scope: spec
        output: 'specs/**/adr.md'
        optional: true
        description: 'Architecture Decision Record for significant design choices'
        requires:
          - specs
        template: |
          # ADR: {{change.name}}

          ## Context
          ## Decision
          ## Consequences
```

### Example: Adding Quality Gate Hooks

```yaml
# specd.yaml
schemaOverrides:
  append:
    workflow:
      - step: implementing
        hooks:
          post:
            - id: run-typecheck
              run: 'pnpm typecheck'
            - id: run-unit-tests
              run: 'pnpm test'
```

### Example: Making a Step Optional or Disabled

You can customize lifecycle step execution in `schemaOverrides` by setting `optional: true` (skippable if step-skip checks pass) or `disabled: true` (excluded from the active pipeline):

```yaml
# specd.yaml
schemaOverrides:
  append:
    workflow:
      - step: implementing
        optional: true # can be bypassed for spec-only or doc-only changes
      - step: verifying
        disabled: true # excludes formal verification for fast prototyping
```

Bedrock states (`drafting`, `designing`, `done`, `archivable`, `archiving`) can never be disabled or marked optional; attempting to set `optional: true` or `disabled: true` on any bedrock state fails schema validation. The `ready` delivery anchor cannot be disabled when `approvals.spec` is enabled, while signoff gate configuration skips the `approval.signoff` check on `done -> archivable` without altering topology. For full topology rules, see the [Workflow Guide](workflow.md#skippable-and-disabled-workflow-steps).

The four cases are distinct:

| Declaration      | Effective skip checks | Default route                                                                        |
| ---------------- | --------------------- | ------------------------------------------------------------------------------------ |
| neither flag     | irrelevant            | the step is mandatory                                                                |
| `optional: true` | none                  | Core recommends bypassing it unconditionally                                         |
| `optional: true` | one or more           | Core recommends bypass only when all pass; otherwise it recommends entering the step |
| `disabled: true` | none allowed          | the step is absent and cannot be entered                                             |

“Effective” includes registry bindings supplied by Core or plugins, not only inline `skipChecks`. Skills never infer the route: they execute the `nextAction` selected by Core. Explicit entry into an optional step remains available even when Core recommends the shortcut.

### Checks on the archive operation

A workflow row has three independent check surfaces:

| Field           | Evaluated when                                | Scope        |
| --------------- | --------------------------------------------- | ------------ |
| `checks`        | entering the step                             | `transition` |
| `skipChecks`    | an optional step is bypassed                  | `step-skip`  |
| `archiveChecks` | the change is archived (`archiving` row only) | `archive`    |

`archiveChecks` lets a schema tune or embed checks of the archive operation. A schema can configure, disable, or change the `skippable` permission of `spec.overlap` and `impl.linksInScope`, and of checks bound to the archive operation by a host or plugin. It cannot relax `workspace.readOnly`, `impl.filesResolved`, `deps.consistent`, or the protocol checks (`schema.nameMatch`, `archive.archivable`, `workflow.taskCompletion`, `verification.current`, `hook.pre`, `hook.post`): they are locked on archive and the schema fails to build if it tries.

```yaml
workflow:
  - step: archiving
    archiveChecks:
      - id: spec.overlap
        skippable: false # this project never archives over live overlap
      - id: '@security.code-scan'
        skippable: true
```

`archiveChecks` accepts only `id`, `skippable`, `disabled`, and `config` (there is no `onFailure`). Full reference: [Archive operation checks](../schemas/schema-format.md#archive-operation-checks).

---

## 2. Composable Schema Plugins (`schemaPlugins`)

When multiple repositories share standard additions (e.g. corporate security rules, compliance checklists), you can package them as schema plugins.

```yaml
# specd.yaml
schema: '@specd/schema-std'

schemaPlugins:
  - '@acme/specd-compliance-plugin'
  - '@acme/specd-security-plugin'

schemaOverrides:
  # Local project overrides applied on top of plugins
  append:
    workflow:
      - step: archiving
        hooks:
          pre:
            - id: notify-slack
              run: './scripts/notify.sh'
```

Plugins are applied in declaration order before `schemaOverrides`.

---

## 3. Creating Schema Packages (`extend` vs `fork`)

### Extending a Schema (`specd schema extend`)

Use `specd schema extend` when your custom workflow is based on an existing schema:

```bash
specd schema extend @specd/schema-std my-workflow-schema
```

This creates a new package where:

- The base schema is declared as parent.
- Only differences (new artifacts, modified rules) are specified.
- Upstream updates to the parent schema are inherited automatically.

### Forking a Schema (`specd schema fork`)

Use `specd schema fork` when you need a fundamentally different workflow (e.g., non-code project, hardware spec workflow, or completely renamed lifecycle steps):

```bash
specd schema fork @specd/schema-std standalone-schema
```

This copies the entire schema definition, giving you full ownership of every artifact, rule, and lifecycle transition.

---

## Choosing the Right Approach

| Use Case                                                         | Recommended Approach              |
| :--------------------------------------------------------------- | :-------------------------------- |
| Add a test hook or lint rule to your project                     | `schemaOverrides` in `specd.yaml` |
| Make a step optional or disabled (e.g. skip implementing/verify) | `schemaOverrides` in `specd.yaml` |
| Add an optional project-specific artifact (e.g. `openapi.yaml`)  | `schemaOverrides`                 |
| Share custom rules across multiple company repositories          | `schemaPlugins`                   |
| Build an organization-wide standard based on `@specd/schema-std` | `specd schema extend`             |
| Complete redesign of lifecycle states and dependencies           | `specd schema fork`               |
