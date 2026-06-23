# Spec Tab Context

## Purpose

Studio UI for **Spec Tab Context**: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Studio UI component: **Spec Tab Context**.

## Requirements

### Requirement: spec tab polls metadata while visible

While the spec tab is visible, the view MUST refresh spec metadata for that path on a light interval. New specs in the tree are already discovered by the global workspace poll.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors (including HTTP 409 on save conflicts where applicable).

### Requirement: view renders structured spec context entries

The spec context tab MUST render the structured `getSpecContext()` payload for the selected spec.

It MUST show:

- each context entry identity (`spec`, source, mode, stale state)
- entry metadata sections such as title/description
- grouped rules, constraints, scenarios, and optimized content when present
- advisory warnings separately from the entry bodies

Structured entry fields beyond the identity header MUST be rendered in separate collapsible sections using shadcn **`Accordion`** (type multiple) so the user can inspect one field at a time instead of reading a single long body.

For the Studio default presentation:
...

- the optimized-content section appears before description, rules, constraints, and scenarios
- all field sections start expanded
- when a field is absent, the section still appears and explicitly states that the field is unavailable

Structured content fields in spec context are Markdown-authored content. The tab SHOULD render them as Markdown rather than plain preformatted text so lists, emphasis, headings, and links remain readable.

This applies not only to freeform description/content fields, but also to grouped rule text, constraint text, scenario names, scenario requirement labels, and scenario clause lines.

Grouped rule headings and scenario headings SHOULD be visually emphasized relative to body text. Constraint entries SHOULD appear as a Markdown-rendered list, without wrapping each item in a separate card-like panel.

It MUST NOT assume spec context arrives as a single markdown `content` string.

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
