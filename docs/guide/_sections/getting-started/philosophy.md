## The philosophy of spec-driven development

### The problem with the traditional workflow

Most software development follows a pattern that looks roughly like this:

> idea → rough ticket → code → hope it works → document later (maybe)

Requirements live in a chat message, a half-finished ticket, or someone's memory. A developer — or increasingly, an AI agent — receives a vague prompt and fills the gaps with assumptions. When the output does not match the intent, it is hard to say exactly why, because the intent was never formally stated.

The result is a familiar cycle: rework, misalignment, and a growing gap between what the system does and what anyone can confidently say it was meant to do. Documentation, if it exists at all, is written after the fact and describes what was built rather than what was intended.

### What spec-driven development does differently

Spec-driven development inverts the order of operations:

> idea → specify requirements → write verification scenarios → design → implement → verify against spec → archive

The specification comes first. It describes what the system SHALL do — not how. It is written in plain language, reviewed like code, and treated as a first-class artifact alongside the implementation. The verification scenarios written alongside it describe how to confirm correctness in concrete, unambiguous terms.

This is not a new idea. Engineering disciplines outside software have worked this way for decades. specd makes it practical for day-to-day software development, particularly when AI agents are involved in implementation.

### What a spec actually is

A spec is a living requirement document. It answers the question: what should this capability do?

- It is written in Markdown, in natural language, with normative language: SHALL, MUST, SHOULD.
- It is paired with a verification file that describes concrete WHEN/THEN scenarios — not vague acceptance criteria, but specific conditions and expected outcomes.
- It outlives the change that created it. Once written, a spec is a permanent record of intent. It evolves through structured delta modifications that preserve its history.
- It is the source of truth for what the system should do, independent of any particular implementation.

A spec does not describe how the code is structured. It does not name functions or modules. It says what the system shall do and what it shall not do. The implementation is a consequence of the spec, not the other way around.

### Why specs must come before code

Forcing clarity before implementation has compounding benefits.

**It makes intent explicit.** Vague requirements produce vague implementations. Writing a spec forces you to answer questions you would otherwise defer: what are the edge cases? what are the constraints? what does success actually look like?

**It creates alignment between humans and agents.** An AI agent working from a spec is working from a contract. It knows what it is supposed to produce, in what order, and against what criteria. The spec is not a suggestion — it is the acceptance test.

**It provides verifiable acceptance criteria.** "The login should work" is not a requirement. "WHEN a user submits valid credentials, THEN they receive an authenticated session token" is. Verification scenarios make it possible to determine, unambiguously, whether the implementation is correct.

**It enables governance without blocking velocity.** Approval gates become natural checkpoints when they are attached to well-defined specs. A reviewer can evaluate whether a design satisfies a spec. A compliance check can verify whether code satisfies verification scenarios. These gates carry meaning because the specs they reference carry meaning.

**It creates an audit trail of why.** Code tells you what the system does today. A commit message tells you what changed. A spec tells you why the capability exists and what it was intended to do — even after the code has been refactored, rewritten, or replaced entirely.

**Specs survive refactors. Code does not.** You can rewrite the implementation from scratch and still have a complete record of what it was supposed to do. The spec is independent of the technology, the architecture, and the team that wrote the original version.

### The key insight

There are four different things that say something about a software system, and they answer different questions:

| Artifact               | Question it answers                     |
| ---------------------- | --------------------------------------- |
| Code                   | What does the system do today?          |
| Tests                  | Does the code behave as programmed?     |
| Specs                  | What should the system do, and why?     |
| Verification scenarios | Does the code satisfy the requirements? |

Most teams have code and tests. Few have durable, structured specs. Fewer still have explicit verification scenarios that connect requirements to outcomes. specd fills that gap.

### The specd approach

specd is a platform that makes spec-driven development practical without imposing heavy process.

It provides **structure** through schemas. A schema defines what artifact types exist in your project, what files they produce, and what order they must be produced in. You cannot produce a design until a spec exists. You cannot produce tasks until a design exists. The structure enforces deliberate sequencing without requiring manual enforcement.

It provides **workflow** through a change lifecycle. A change tracks a unit of work from initial idea through implementation to completion. Each lifecycle state has a clear meaning. Optional approval gates enforce compliance checks at the transitions that matter most.

It provides **tooling** through the CLI and MCP server. You can manage the full lifecycle from the command line. AI agents can interact through the MCP interface, which exposes the same workflow as structured tool calls.

It provides **context** through compilation. At each lifecycle step, specd assembles the right set of specs, schema instructions, and lifecycle context into a single block — ready to inject into the agent. The agent gets exactly what it needs for the current step, with full detail on the specs it is directly working with and lighter summaries for broader context.

It works **with** AI agents rather than around them. Specs are the contract between human intent and agent execution. The agent reads the spec, produces artifacts against it, and is checked against it. The human defines what should be built. The agent works out how.
