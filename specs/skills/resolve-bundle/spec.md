# skills:resolve-bundle

## Purpose

Use case for resolving a skill bundle with structured install-time rendering and privacy-safe template variable exposure.

## Requirements

### Requirement: Output

The output MUST contain:

```typescript
interface ResolveBundleOutput {
  bundle: SkillBundle
}
```

### Requirement: Behavior

The use case MUST:

1. **Built-in Safe Variable Injection**: If `config` is provided, expose only safe built-in values inside the render context. Built-in values SHALL include:
   - `configPath`: a value suitable for deriving privacy-safe relative runtime paths
   - `schemaRef`: `config.schemaRef`
2. Inject `variables.sharedFolder` when absent, using a default relative shared skills path derived from the runtime config directory
3. Normalize `variables.sharedFolder` by removing any trailing `/`
4. Validate `variables.sharedFolder` against `projectRoot` internally and fail when the resolved absolute path escapes the project root
5. Merge those built-in values with the provided install-time render context
6. Call `SkillRepository.getBundle(input.name, mergedContext)`
7. Resolve skill template content using recursive `variables` values and capability values from the merged context
8. Use `variables.frontmatter` as the source for frontmatter composition when the `frontmatter` capability is present
9. Preserve all non-content `ResolvedFile` metadata, including whether a file is marked as shared
10. Return the resolved bundle

Agent-plugin install flows that require built-in render defaults such as `configPath`, `schemaRef`, or the default `sharedFolder` MUST route bundle resolution through this use case instead of calling the repository directly.

`projectRoot` MUST remain available only for internal validation and MUST NOT be exposed as a template variable.

### Requirement: Input

The input MUST contain:

```typescript
interface ResolveBundleInput {
  name: string
  config?: SpecdConfig
  context?: SkillTemplateContext
}
```

`context` defaults to an empty render context. `context.variables` MUST support recursive template values.

## Constraints

- Install-time rendering context is passed at invocation time.
- Built-in values are injected from `SpecdConfig` when provided.
- `projectRoot` MUST NOT be exposed as a template variable.
- The repository does not invent capability or frontmatter values that are absent from the provided context.
- `variables.frontmatter` alone does not trigger frontmatter emission; the `frontmatter` capability controls that gate.
- `variables.sharedFolder` MUST remain relative in rendered output even when internal validation uses an absolute path.

## Spec Dependencies

- [`core:config`](../../core/core/config/spec.md) — defines SpecdConfig type
- [`skills:skill-bundle`](../skill-bundle/spec.md) — return type
- [`skills:skill-repository-port`](../skill-repository-port/spec.md) — repository port
