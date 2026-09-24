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
| Add an optional project-specific artifact (e.g. `openapi.yaml`)  | `schemaOverrides`                 |
| Share custom rules across multiple company repositories          | `schemaPlugins`                   |
| Build an organization-wide standard based on `@specd/schema-std` | `specd schema extend`             |
| Complete redesign of lifecycle states and dependencies           | `specd schema fork`               |
