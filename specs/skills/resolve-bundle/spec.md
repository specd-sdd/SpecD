# skills:resolve-bundle

## Purpose

Use case for resolving a skill bundle with variable substitution.

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

1. **Built-in Variable Injection**: If `config` is provided, merge built-in variables with the provided `variables` map (user-provided variables override built-ins).
   Built-in variables SHALL include:
   - `{{projectRoot}}`: `config.projectRoot`
   - `{{configPath}}`: `config.configPath`
   - `{{schemaRef}}`: `config.schemaRef`
2. Call `SkillRepository.getBundle(input.name, mergedVariables)`
3. Replace `{{key}}` placeholders in each template file with values from the merged variables map
4. Return the resolved bundle

### Requirement: Input

The input MUST contain:

```typescript
interface ResolveBundleInput {
  name: string
  config?: SpecdConfig
  variables?: Record<string, string>
}
```

`variables` defaults to an empty object.

## Constraints

- Variables are passed at invocation time.
- The repository does not define predefined variables.

## Spec Dependencies

- [`core:core/config`](../../core/core/config/spec.md) — defines SpecdConfig type
- [`skills:skill-bundle`](../skill-bundle/spec.md) — return type
- [`skills:skill-repository-port`](../skill-repository-port/spec.md) — repository port
