# @specd/schema-std

The default schema for [specd](../../README.md). Defines the standard artifact types, workflow steps, templates, and validation rules used by specd projects.

## Contents

- `schema.yaml` -- full schema definition (artifact types, workflow, selectors, validations)
- `templates/` -- Markdown templates for spec artifacts:
  - `spec.md`, `verify.md`, `tasks.md`, `proposal.md`, `design.md`
- `src/index.ts` -- exports `schemaName` and `schemaVersion` for programmatic use

## Usage

Reference this schema in your `specd.yaml`:

```yaml
schema: '@specd/schema-std'
```

To extend or override parts of the standard schema, use `schemaOverrides` in your config. See the [schema documentation](../../docs/schemas/schema-format.md) for details.

## License

MIT
