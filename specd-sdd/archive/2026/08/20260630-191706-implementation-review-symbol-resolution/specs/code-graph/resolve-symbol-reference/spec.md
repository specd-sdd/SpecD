# Resolve Symbol Reference

## Purpose

Stored implementation links and graph selectors need one conservative way to identify
symbols through declarations, aliases, public bindings, and type hierarchies. This
spec defines the language-neutral resolution contract, its evidence requirements, and
the outcomes consumers may rely on.

## Requirements

### Requirement: Structured reference input

`ResolveSymbolReference` SHALL accept a workspace, requested symbol text, and optional
file, public surface, symbol-space, broad kind, member-form, and build-context
constraints. Structured identity fields SHALL be authoritative; rendered canonical
references MUST round-trip with escaping and MUST NOT be interpreted by ad hoc
delimiter splitting.

Identifier case and normalization SHALL follow the source language. Path and workspace
normalization SHALL remain separate from symbol normalization.

### Requirement: Logical canonical targets

The resolver SHALL return a logical symbol as the canonical target and SHALL retain
every declaration occurrence contributing to it. Language-defined overload sets,
declaration merging, and equivalent constructs SHALL resolve as one logical target
rather than false ambiguity. Genuinely competing declarations SHALL remain separate
candidates.

The target SHALL expose workspace, module or package, declaring owner, symbol space,
simple name, member form, contributing declaration locations, and a stable canonical
reference independent of line or column movement.

### Requirement: Public and local binding identity

A public export slot SHALL be selected by public surface, exported name, and symbol
space. Every proven route occupying that slot SHALL have an independently addressable
binding identity that also distinguishes its canonical target or ordered re-export
provenance. Distinct aliases, duplicate re-export routes, and competing targets exposed
through the same slot SHALL remain distinct so resolution can report ambiguity.

A local binding SHALL retain lexical scope and source-range provenance so shadowed
aliases cannot merge. Resolving a local alias SHALL NOT classify it as a public export.
Anonymous and default exports SHALL remain addressable through public binding identity
even when their target declaration has no user-written name.

### Requirement: Deterministic resolution precedence

Resolution SHALL apply this precedence:

1. an exact declaration in the explicitly addressed file or owner;
2. an exact public binding in the explicitly addressed public surface;
3. a statically proven scoped import or alias;
4. a statically proven hierarchy path using the source language's precedence rules.

A unique same-name symbol without a proven path SHALL NOT resolve the request.
Conditional or platform alternatives SHALL remain separate unless the supplied build
context deterministically selects one. Cyclic binding or hierarchy paths MUST
terminate without duplicate candidates.

### Requirement: Resolution outcomes

Every result SHALL have exactly one status:

- `resolved` when exactly one logical target is statically proven;
- `ambiguous` when multiple valid targets remain and none is selected;
- `unresolved` when proof is unsafe or unavailable; or
- `missing` only when a current and complete index proves the addressed target absent.

Non-resolved results SHALL include a stable machine-readable reason code and
deterministically ordered candidate summaries when candidates exist. Results SHALL
also expose the ordered, typed evidence path for every proven step.

### Requirement: Freshness and coverage gate

VCS ref equality alone SHALL NOT prove index freshness. Resolution SHALL consume a
batch `AssessIndexedResourceFreshness` capability for every explicitly addressed
resource and every declaration file whose evidence contributes to a candidate. An
addressed source file SHALL be assessed as a file resource. When no source file is
supplied but a public surface is addressed, the public surface SHALL be assessed as
the addressed resource so export presence or absence can be proven. One batch MUST
deduplicate shared inputs, and the resolver MUST NOT embed filesystem, repository,
hashing, or persistence logic.

An exact file-anchored resolution MAY use current targeted evidence despite unrelated
global staleness. A workspace-wide fallback, absence, uniqueness, or ambiguity
decision that requires corpus completeness SHALL remain `unresolved` whenever global
health is stale or unknown.

Unknown, dirty, stale, incompatible, excluded, unsupported, parse-failed, or partial
required evidence SHALL produce `unresolved` with a specific reason and MUST NOT
produce `missing`. Transient inability to assess freshness SHALL use
`freshness-unknown`. A current and completely indexed addressed file that proves a
requested declaration absent, or a current and completely indexed addressed public
surface that proves a requested export slot absent, SHALL produce `missing` without
persisting symbol staleness. Provider availability or generation failures that
prevent safe reads SHALL remain infrastructure errors.

### Requirement: Hierarchy-aware members

Declared or overriding members SHALL take precedence over inherited members.
Contract-qualified references SHALL resolve to the contract member, while impact may
follow implementations and overrides. Inherited, trait, mixin, embedded, promoted,
abstract, and default members SHALL follow deterministic language precedence.

When hierarchy traversal reaches an ancestor owner, the resolver SHALL query the
requested member under that owner; reaching the owner itself MUST NOT be treated as
reaching the requested member. Candidate evidence SHALL retain the owner-to-ancestor
path and the selected ancestor-member declaration.

Competing inherited members SHALL be `ambiguous`. Getter/setter or other same-name
forms SHALL require a member-form constraint when language rules do not select one.
Implicit interface satisfaction SHALL be used only when method sets prove it.
Malformed hierarchy cycles SHALL terminate safely.

### Requirement: Batch and backend-independent resolution

The capability SHALL provide batch resolution for multiple references under one
health snapshot and provider lifecycle. Implementations SHALL use indexed lookups and
cycle-safe bounded traversal rather than scan the complete graph once per reference.

Candidate ordering, provenance ordering, status, and reason codes SHALL be identical
across supported graph-store backends for equivalent graph contents.

## Constraints

- Resolution MUST NOT mutate stored implementation links or archived sidecars.
- Fuzzy matching, edit distance, and best-candidate guessing are prohibited.
- Runtime reflection, computed imports, monkey patching, and unproven interprocedural
  value flow remain unresolved.
- Adapter-specific syntax analysis belongs to language adapters, not this resolver.

## Spec Dependencies

- `code-graph:symbol-model` — logical symbols, declarations, bindings, and reference vocabulary
- `code-graph:graph-store` — indexed facts, coverage, and backend-neutral queries
- `code-graph:language-adapter` — language semantics and capability declarations
- `code-graph:workspace-integration` — workspace and package resolution boundaries

## ADRs

- [ADR-0024: Logical symbol resolution](../../../docs/adr/0024-logical-symbol-resolution.md)
