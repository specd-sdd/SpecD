# Compliance: go-selectors-python-reexports (inline audit)

Specs: code-graph:go-language-adapter, python-language-adapter, symbol-model, language-adapter (+ default conventions, depth-1 deps).

## Evidence

- code-graph vitest: 1814 pass / 0 fail; guide 135 pass; cli guide-sdk 72 pass
- tsc --noEmit (strict) clean; eslint clean (exit 0)
- No `any`, `@ts-ignore`, or `console.` added in src diff
- Every verify scenario (Go selectors, qualified facts/relations, Python re-export routes, static `__all__`, symbol-model facts, language-adapter resolution) maps to a named test in go-language-adapter.spec, python-language-adapter.spec, integration/go-selectors-python-reexports.spec, qualified-reference-fact.spec
- Shadowing binding forms (range, type switch, etc.) covered at go-language-adapter.spec ~L2388+

## Findings

- Critical: 0. Major: 0.
- Minor/observation: go/python adapters are ~2.3k/2.6k lines each (pre-existing size trend); no spec limit violated.
- Spec/global consistency: no contradictions with default conventions found.
- Not independently verified: scenarios checked via test names + passing suite, not line-by-line assertion review.

Verdict: compliant.
