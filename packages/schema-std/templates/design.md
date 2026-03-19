<!-- AI guidance: analyse what needs to change and how. Identify affected files, symbols,
     and modules. Document the implementation approach so tasks can be derived from it
     without ambiguity. Be concrete — specify file paths, class names, method signatures.
     Reference spec requirements — do not repeat them.
     Always write this artifact, even for non-code changes. -->

# Design: {{change.name}}

## Non-goals

<!-- What this design explicitly excludes. Scope boundaries prevent creep.
     Delete this section if the change is small enough that non-goals are obvious. -->

## Affected areas

<!-- List every EXISTING file, module, symbol, document, or resource that will be
     modified or removed. For each, explain what changes and why.
     Use the codebase and tooling to discover these — do not guess. -->

## New constructs

<!-- List every new file, class, interface, value object, factory, service, function,
     or type that will be created. For each one, specify:
     - **Location**: full file path
     - **Shape**: interface signatures, constructor params, method signatures, key
       properties, return types (TypeScript notation)
     - **Responsibility**: one sentence — what it does and what it does not do
     - **Relationships**: dependencies, dependents, layer, injection point

     Delete this section only when the change creates no new symbols. -->

## Approach

<!-- The chosen strategy and why. How do the pieces fit together?
     What is the order of operations?
     Reference spec requirements to ensure full coverage. -->

## Key decisions

<!-- Each significant technical choice with its rationale.
     For each: **Decision** → rationale. **Alternatives rejected** → why. -->

## Trade-offs

<!-- Known limitations or things that could go wrong.
     Format: [Risk] → Mitigation.
     Omit this section if genuinely not applicable. -->

## Migration / Rollback

<!-- Steps to deploy and roll back safely. Include when the change affects runtime
     state, APIs, data models, or external dependencies.
     Delete this section for purely additive internal changes. -->

## Testing

<!-- Two layers — both are required when applicable:

     **Automated tests** (when a test suite exists):
     List every new test file or describe block to create. Each scenario in verify.md
     must map to at least one test. Add tests for edge cases, error paths, and anything
     that could reasonably break. Specify file paths and what each test asserts.

     **Manual / E2E verification** (always):
     Describe steps to confirm the change works end-to-end. Include commands to run,
     expected output, and how to tell if something is wrong.

     Also note which linting rules or documentation sources apply. -->

## Open questions

<!-- Outstanding unknowns to resolve during implementation.
     Delete this section if there are none. -->
