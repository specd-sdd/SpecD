# skills:get-skill

## Purpose

Use case for retrieving a single skill by name.

## Requirements

### Requirement: Input

The input MUST contain:

```typescript
interface GetSkillInput {
  name: string
}
```

### Requirement: Output

The output MUST be a discriminated union:

```typescript
type GetSkillOutput = { skill: Skill } | { error: 'NOT_FOUND' }
```

### Requirement: Behavior

The use case MUST call `SkillRepository.get(input.name)`:

- If the skill exists, return `{ skill: Skill }`
- If the skill does not exist, return `{ error: 'NOT_FOUND' }`

## Constraints

- The `name` parameter MUST be validated as non-empty.

## Spec Dependencies

- [`skills:skill`](../skill/spec.md) — return type
- [`skills:skill-repository-port`](../skill-repository-port/spec.md) — repository port
