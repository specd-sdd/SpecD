# skills:resolve-bundle

## Purpose

Use case for resolving a skill bundle with variable substitution.

## Requirements

### Requirement: Input

The input MUST contain:

```typescript
interface ResolveBundleInput {
  name: string
  variables?: Record<string, string>
}
```

`variables` defaults to an empty object.

### Requirement: Output

The output MUST contain:

```typescript
interface ResolveBundleOutput {
  bundle: SkillBundle
}
```

### Requirement: Behavior

The use case MUST:

1. Call `SkillRepository.getBundle(input.name, input.variables || {})`
2. Replace `{{key}}` placeholders in each template file with values from the variables map
3. Return the resolved bundle

## Constraints

- Variables are passed at invocation time.
- The repository does not define predefined variables.

## Spec Dependencies

- [`skills:skill-bundle`](../skill-bundle/spec.md) — return type
- [`skills:skill-repository-port`](../skill-repository-port/spec.md) — repository port
