<!-- AI guidance: explain WHY this change is needed and establish the technical scope.
     Cover motivation, current pain, proposed solution, affected areas (grounded in the real
     codebase with minimum changes required), and technical context. Do not write normative
     requirements or exhaustive implementation contracts here — those belong in specs and design. -->

# Proposal: {{change.name}}

## Motivation

<!-- What problem are we solving? Why does it need to be solved now? -->

## Current behaviour

<!-- Describe the current state. What happens today? What is missing or broken? -->

## Proposed solution

<!-- High-level description of what we want to build or change, outlining the concrete approach and the minimal necessary changes required. -->

## Specs affected

### New specs

<!-- Specs to be created. Each becomes specs/<workspace>/<capability-path>/spec.md -->

- `<workspace>:<capability-path>`: <!-- brief description of what this spec covers -->
  - Depends on: <!-- list spec IDs this spec depends on, or "none" -->

### Modified specs

<!-- Existing specs whose requirements are changing. Each needs a delta file.
     Only list if spec-level behaviour changes — not just implementation. -->

- `<workspace>:<capability-path>`: <!-- what requirement is changing and why -->
  - Depends on (added): <!-- new dependencies introduced by this change, or "none" -->
  - Depends on (removed): <!-- removed dependencies from this change, or "none" -->

## Impact

<!-- Affected code areas, APIs, data models, or external dependencies.
     Identify the real areas to touch and the minimum necessary changes, leveraging SpecD tools:
     - Impact / blast-radius analysis (callers, dependents, dependencies, risk assessment)
     - Symbol and codebase search / discovery
     - High-coupling hotspots inspection -->

## Technical context

<!-- Capture technical insights, constraints, and decisions discussed during the
     proposal conversation that should inform specs and design. Record what was
     actually discussed — if concrete structures, file paths, or interfaces came
     up, include them. Focus on:
     - Technical constraints discovered (API limitations, performance bounds, compatibility)
     - Alternatives evaluated and why they were ruled out
     - Architectural direction agreed upon (patterns, layers, boundaries)
     - Domain modelling decisions (entity vs value object, aggregate boundaries)
     - Concrete structures or interfaces discussed, even if preliminary
     This section preserves conversational context so it is not lost between
     sessions. Do not invent design details that were not discussed — only
     record what was actually agreed or explored with the user. -->

## Open questions

<!-- Any unresolved questions or decisions that need to be made before spec work begins. -->
