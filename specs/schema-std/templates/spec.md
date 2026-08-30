# Artifact Templates

## Purpose

SpecD relies on standardized markdown templates to provide guided scaffolding when authoring change and spec artifacts. This spec defines the template contracts, required markdown section structures, and placeholder conventions for all templates distributed in `@specd/schema-std`.

## Requirements

### Requirement: Proposal Template Structure and Guidance

The template `templates/proposal.md` SHALL provide scaffolding for change proposals:

1. It MUST define required level-2 heading sections: `Motivation`, `Current behaviour`, `Proposed solution`, `Specs affected` (with subsections `New specs` and `Modified specs`), `Impact`, `Technical context`, and `Open questions`.
2. It MUST embed authoring guidance comments (`<!-- ... -->`) explaining how each section should be populated.

### Requirement: Specs Template Structure and Guidance

The template `templates/spec.md` SHALL provide scaffolding for capability specifications:

1. It MUST define title header `# {{spec.name}}` and required level-2 heading sections: `Purpose`, `Requirements` (with `### Requirement: {{first requirement}}` placeholder), `Constraints`, and `Spec Dependencies`.
2. It MUST instruct authors to use normative SHALL / MUST statements and omit WHEN / THEN scenarios.

### Requirement: Verify Template Structure and Guidance

The template `templates/verify.md` SHALL provide scaffolding for acceptance scenarios:

1. It MUST define title header `# Verification: {{spec.name}}` and required level-2 heading section: `Requirements`.
2. Scenarios MUST be organized under `### Requirement: {{first requirement}}` subheadings with `#### Scenario: {{scenario name}}`.
3. It MUST provide Gherkin-style structured list placeholders for `GIVEN`, `WHEN`, `THEN`, and `AND/OR` clauses.

### Requirement: Design Template Structure and Guidance

The template `templates/design.md` SHALL provide scaffolding for authoritative technical designs:

1. It MUST define title header `# Design: {{change.name}}` and sections: `Non-goals` (optional), `Affected areas`, `New constructs`, `Data models & Contracts`, `Approach & Execution flow`, `Error handling & Edge cases`, `Key decisions`, `Trade-offs`, `Spec impact`, `Dependency map` (with Mermaid and ASCII diagrams), `Migration / Rollback`, `Testing`, and `Open questions`.
2. It MUST embed clear guidance requiring self-contained, materialized contracts without indirect references.

### Requirement: Tasks Template Structure and Guidance

The template `templates/tasks.md` SHALL provide scaffolding for atomic implementation checklists:

1. It MUST define title header `# Tasks: {{change.name}}` and group headings `## 1. {{Phase or component name}}`.
2. Checklist items MUST demonstrate `- [ ] <n>.<m> <description>` format with indented target file/symbol, `Approach:`, and `(Req: ...)` lines.

### Requirement: Scaffolding Placeholders and Guidance Invariants

All templates SHALL use consistent placeholder variables (`{{change.name}}`, `{{spec.name}}`) and guidance comments (`<!-- ... -->`) that provide authoring instructions without containing hardcoded project-specific logic.

## Constraints

1. All templates MUST be valid Markdown parseable by AST tools.
2. Templates MUST NOT duplicate sections or violate standard heading hierarchies.

## Spec Dependencies

- [`schema-std:standard-schema`](../standard-schema/spec.md) — templates implement the artifact contracts defined in the standard schema
