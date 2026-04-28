---
status: accepted
date: 2026-04-28
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0021: CLI Canonical Resource Naming

## Context and Problem Statement

The specd CLI originally used a mix of singular and plural resource names for command groups (e.g., `spec` vs `drafts`). This inconsistency created friction in command discovery, made documentation examples less predictable, and led to varying conventions in AI agent skills.

We need a stable, unified naming convention for all countable resource command groups to ensure a coherent user experience and a predictable vocabulary for both humans and agents.

## Decision Drivers

- **Consistency** — all countable resource groups should follow the same naming pattern
- **Predictability** — command discovery should be intuitive across different resources
- **Backward Compatibility** — existing singular command workflows must not break
- **Documentation Clarity** — examples and help text should present a single authoritative vocabulary
- **Agent Alignment** — skills should use the same canonical forms as users and documentation

## Considered Options

1. **Keep mixed naming** — continue with current singular/plural inconsistencies
2. **Standardize on singular canonicals** — all groups move to singular (e.g., `specs` becomes `spec`)
3. **Standardize on plural canonicals with singular aliases** — all groups use plural forms as primary, keeping singulars as aliases

## Decision Outcome

Chosen option: **"Standardize on plural canonicals with singular aliases"**, because it provides a consistent, natural language feeling for resource collections while ensuring no existing workflows are broken.

### The rule

- All countable resource command groups (e.g., `changes`, `specs`, `archives`, `drafts`) use the **plural** form as the canonical invocation path.
- Every canonical plural group MUST provide the **singular** form as an alias (e.g., `change`, `spec`, `archive`, `draft`).
- Documentation, help examples, and skill instructions MUST use the canonical plural forms as the primary way to present commands.
- Singular aliases are displayed in help text only as aliases, without additional compatibility warnings, to keep the interface clean while maintaining discoverability.

### Consequences

- Good, because it establishes a consistent mental model: "I am interacting with the collection of `changes` or `specs`."
- Good, because it preserves existing singular workflows through aliases, avoiding breaking changes.
- Good, because it simplifies documentation and skill authoring by providing a single "right way" to write command examples.
- Neutral, because it slightly increases the complexity of the command registration tree.
- Bad, because it introduces two ways to invoke the same command (canonical vs alias), though this is mitigated by documentation standards.

### Confirmation

This decision is confirmed when:

- CLI command registration uses plural groups as primary parents and singulars as aliases.
- `specd --help` and subcommand help (e.g., `specd changes --help`) display the plural forms as canonical.
- Documentation under `docs/` and skill examples under `packages/skills` or `.codex/skills` use canonical plural forms.
- Tests verify that both canonical and alias paths execute the same logic with equivalent results.

## Pros and Cons of the Options

### Keep mixed naming

Continue with the status quo.

- Good, because it requires no immediate changes to CLI registration or documentation.
- Bad, because inconsistency persists and spreads as new resources are added.
- Bad, because it complicates agent training and skill development.

### Standardize on singular canonicals

Move all resource groups to singular forms.

- Good, because it creates consistency and keeps commands short.
- Bad, because it feels less natural when referring to list or management operations on a collection.
- Bad, because `drafts` was already plural, making this a breaking change for some users.

### Standardize on plural canonicals with singular aliases

The chosen approach.

- Good, because it aligns with common CLI conventions for resource management (e.g., `git branches`, `kubectl pods`).
- Good, because it provides a clear path forward for new resources without sacrificing backward compatibility.
- Bad, because it requires an initial effort to update all registration, tests, docs, and skills.

## More Information

### Spec

- [`specs/cli/cli/command-resource-naming/spec.md`](../../specs/cli/cli/command-resource-naming/spec.md)
