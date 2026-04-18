# skills:list-skills

## Purpose

Use case for listing all available skills in the repository.

## Requirements

### Requirement: Input

The input MUST be an empty object:

```typescript
interface ListSkillsInput {}
```

### Requirement: Output

The output MUST contain:

```typescript
interface ListSkillsOutput {
  skills: readonly Skill[]
}
```

### Requirement: Behavior

The use case MUST call `SkillRepository.list()` and return the result.

## Constraints

- No validation needed for empty input.

## Spec Dependencies

- [`skills:skill`](../skill/spec.md) — return type
- [`skills:skill-repository-port`](../skill-repository-port/spec.md) — repository port
