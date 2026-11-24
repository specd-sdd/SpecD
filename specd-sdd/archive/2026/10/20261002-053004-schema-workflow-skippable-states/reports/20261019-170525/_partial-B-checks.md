# Batch B (checks) - partial report 20261019-170525

Delta audit against attempt 14 (reports/20261019-114015/\_partial-B-checks.md). Code unchanged in compliance terms (no HIGH/MEDIUM code defects then; none found now). Focused vitest run (check-registry, build-schema, transition-checks, test/composition, execute-matching-predicates, transition-change specs): PASS 531 / FAIL 0.

## core:check-registry

### Requirements Summary

Open registry; built-in immutability and `@plugin.id` namespacing; register()/duplicates; CustomCheckDefinition adaptation; binding coordinate identity; two-tier governance (placement lock, policy lock, config lock, disable lock, monotonic, schema-owned bindings belong to the schema, categories A/B/C, composition fidelity incl. step-skip, executable instances); cascade computed once.

### Implementation Status

All 8 requirements remain implemented as in attempt 14 (check-registry.ts, build-schema.ts own-coordinate rule, composition-registries.ts forwarding, workflow-check-registry.ts). No code regression detected; tests green.

### Discrepancies

- D1 LOW (own-coordinate match for `checks` w/o `from` is conservative; design-conformant). D2 LOW (stale JSDoc grammar; test title "uppercase" at check-registry.spec.ts ~224). D3 LOW (runner merges default+binding config for unresolved/archive bindings; spec wording could carve out). D4 LOW (merge-schema-layers cannot "remove" a schema-owned check except via set.workflow). Unchanged, non-blocking.

### Test Coverage - previous gaps

1. Layered schema-owned override (merge then build): RESOLVED. build-schema.spec.ts:992-1047 `layered schema-owned declarations`: mergeSchemaLayers(set.workflow) -> buildSchema, asserts merged `onFailure:'collect', skippable:false` (L1017) and no CheckBindingOverrideForbiddenError; second test asserts check-level `allowConfigOverride:false` still throws CheckConfigOverrideForbiddenError on a later layer (L1022-1046). Uses `set.workflow` only (extends/schemaOverrides route is the same merge function) - acceptable.
2. Composition forwarding of allowSchemaEmbedding: RESOLVED. composition-registries.spec.ts:67-95 asserts governance of top-level and `options` forms, default false with bindings, and build-time enforcement via buildSchema. allowBindingOverride/allowConfigOverride/defaultConfig forwarding still not individually asserted (LOW; spec item 7 lists them; code at composition-registries.ts L226-243 forwards verbatim).
3. Plugin step-skip default binding failing shortcut end to end: RESOLVED. transition-change.spec.ts:3791-3860 registers `@qa.freeze` with `step-skip implementing`, fails -> CheckPredicateFailedError(checkId `@qa.freeze`), state stays `ready`; passing variant reaches `verifying`. Uses registry.bindings() fed into transitionBindings (mirrors composition path; composition inclusion itself covered in workflow-check-registry.spec.ts:297).
4. list() length 18: RESOLVED. check-registry.spec.ts:423 (16 built-ins) and :434 (18 after two plugins).

### Remaining weak (not blocking; no new/changed scenario lacks evidence)

- Composition forwarding of allowBindingOverride/allowConfigOverride/defaultConfig not asserted individually (LOW).
- Layered test covers `set.workflow` replacement only, not extends/schemaOverrides sources explicitly (LOW).
- "Omitted binding allowConfigOverride inherits" covered at applyBindingSpecs level (check-bindings.spec.ts:96), not via register() (LOW).

### Summary

8/8 requirements implemented; all scenarios now have test evidence; 0 HIGH, 0 MEDIUM.

## core:transition-checks

### Requirements Summary / Implementation Status

Unchanged from attempt 14: resolveEffectiveBindings (overlay, coordinate isolation, single cascade, from/along applicability, concrete step-skip clones, executable synthesis with governance), evaluateTransitionCandidate (protocol.edge first, per-bypassed-step pass), runner executes only resolved bindings, bypass check-done, policy derived from resolved bindings. All OK.

### Discrepancies

D5-D7 LOW unchanged (first-binding `find` order; extra skip rows per bypassed step; user-bypass emits check-done without check-start per design S3).

### Test Coverage - previously weak items

- Wildcard step-skip narrowing: IMPROVED/adequate. transition-checks.spec.ts:1060-1105 declares one of two bypassed steps with extra config and asserts the declared step gets a concrete clone with merged config `{base:1, extra:2}`, undeclared step keeps `{base:1}`, and no `step: '*'` row remains. Remaining weak: two steps both declaring different configs and runner-level execution once each (LOW; scenario's core invariant is asserted at resolver level).
- "Runner executes only resolved bindings" with empty bindings: execute-matching-predicates.spec.ts:616 unchanged. Still does not model a claimed-but-non-matching overlay row (WEAK, LOW: behavior is structurally guaranteed because the runner has no declaration handling and resolver test transition-checks.spec.ts "unmatched decl leaves base untouched" covers the resolver half).
- from/along matrix: transition-checks.spec.ts:1009/1030 plus 419-453 step-skip from/to variants; `ready -> verifying` shortcut with `{strict:true}` still not explicit (WEAK, LOW). The new transition-change e2e test also exercises ready->verifying shortcut with a plugin step-skip binding.
- Everything else as in attempt 14: COVERED.

### Summary

0 HIGH, 0 MEDIUM code defects; 3 weak LOW test items remain, none a new/changed scenario lacking all evidence.

## Cross-spec consistency

architecture (pure domain services, executable instances via composition), error-handling (typed errors), conventions: no change from attempt 14; only cosmetic stale JSDoc (D2).

BATCH VERDICT: PASS
