# Partial compliance: skills protocol

Change: `versioned-approval-invalidation`
Scope: `skills:workflow-automation`, `skills:skill-templates-source`
Mode: delegated (no `changes verification start` / `complete`)
Compared: `design.md` “Skill protocol” (lines 1010–1018) against source templates and installed copies.

Sources of truth for this slice:

- `packages/skills/templates/skills/{specd-verify,specd-compliance,specd-design,specd-implement,specd-archive}/SKILL.md.tpl`
- `packages/skills/templates/shared/shared.md.tpl`
- Installed copies under `.agents/skills`, `.codex/skills`, `.claude/skills`, `.github/skills`, `.opencode/skills`, and `.specd/config/skills/shared/shared.md`

## skills:workflow-automation

Spec preview: 11 requirements, 27 verify scenarios.

### Requirement: Cross-skill artifact review and recovery

Status: conformant.

| Design / spec rule                                                                                                                                                                   | Where it lives                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lifecycle skills start from fresh canonical status and follow committed recovery                                                                                                     | `shared.md.tpl` “Canonical validity reconciliation”; step 1 status in design, implement, verify, archive; compliance “Trust fresh `specd changes status`” |
| Stale required spec consent stops work and routes through `designing` → `ready` → human `approve spec`                                                                               | verify step 1; implement step 1; design recovery bullets; compliance ownership section; archive preflight                                                 |
| `workflow: preserve` allows in-place semantic review; structural validate is not semantic review, approval, or verification renewal                                                  | shared; design; implement; verify; archive                                                                                                                |
| Standalone verify and standalone `--change` compliance: start, checks, report/hooks, complete only after success; any active state; entering `verifying` does not capture a baseline | verify §3c and §6; compliance “Standalone”; shared “Verification attempt ownership”                                                                       |
| Full verify passes attempt id plus delegated marker; delegated compliance does not start or complete; verify completes only after scenarios and audit succeed                        | verify §5b and §6; compliance “Delegated”; shared                                                                                                         |
| Existing active attempt does not imply delegation                                                                                                                                    | verify §5b; compliance standalone + mode detection                                                                                                        |
| Report-only modes (all, diff, PR, single spec, selection) do not start or complete                                                                                                   | compliance “Report-only” and Phase 0                                                                                                                      |
| Changed inputs: start again, repeat work, do not complete with the previous baseline                                                                                                 | verify §3c and fingerprint-mismatch paragraph; compliance step 5; shared                                                                                  |
| Failure or interruption leaves the attempt active                                                                                                                                    | verify §6; compliance step 4; shared                                                                                                                      |
| `verification invalidate` only withdraws completed evidence                                                                                                                          | verify §3c; compliance; shared                                                                                                                            |
| No restart-verification flag; transitions and status do not create successful evidence                                                                                               | verify (twice); compliance; archive; shared. No template contains `--restart-verification`                                                                |

Verify scenarios for this requirement (independent verify, shared full-mode attempt, standalone compliance, changed inputs) are covered by the same template text and by `template-workflow.spec.ts` (“gives verify and compliance explicit attempt ownership”, “teaches canonical reconciliation…”) and `generated-skill-protocol.spec.ts`.

### Other requirements in this spec

Not re-checked line-by-line in this partial (diagnostic priority, data extraction, spec read surfaces, outlines, repair strategy, canonical commands, command freshness, structural validation review surfaces, implementation traceability, context optimization). No discrepancy was opened for them.

## skills:skill-templates-source

Spec preview: 23 requirements, 61 verify scenarios.

### Requirement: Reconciled invalidation protocol in lifecycle templates

Status: conformant.

- Shared, design, implement, verify, compliance, and archive tell the agent to read fresh status and follow committed state / next action before change-scoped work.
- Shared states the protocol bullets in the spec: independent policies, `artifacts: none` does not waive freshness, `preserve` vs `redesign`, validation is not approval, spec consent returns to design and renews in `ready`, stale sign-off later than `done` returns to `done`, entering `verifying` does not capture a baseline, explicit start does, independent vs delegated ownership, invalidate does not start an attempt, `hasTasks` excluded from fingerprints but still completion-checked.
- Templates do not teach fingerprint calculation, hand-editing validity projections, appending invalidation events, or choosing recovery apart from core status.

Generated-copy scenario: installed bodies match a render of the source templates (see below). They are not a second source of truth.

Report-only scenario: compliance without a concrete active change (`--all`, `--diff`, `--pr`, single spec, selection) is instructed not to run verification start or complete and not to claim successful verification completion.

### Required phrases (verify and compliance templates)

| Phrase                                          | specd-verify `SKILL.md.tpl`                                                           | specd-compliance `SKILL.md.tpl`                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| verification start                              | `specd changes verification start <name> --format text`                               | same, plus report-only prohibition                                                              |
| complete                                        | `specd changes verification complete <name> --format text`                            | same                                                                                            |
| delegated attempt                               | `/specd-compliance --change <name> --delegated --attempt <attemptId>`                 | `` `--change <name> --delegated --attempt <attemptId>` `` and `mode = delegated`                |
| no restart-verification flag                    | “There is no restart-verification flag” (steps 2 and 6)                               | “There is no restart-verification flag”                                                         |
| delegated compliance must not start or complete | “Delegated compliance … must not run `verification start` or `verification complete`” | “Do not run `verification start` or `verification complete`”; “`mode = delegated` runs neither” |

The exact sentence “Delegated compliance must not start or complete that attempt” is in `shared.md.tpl`. Verify and compliance use the same prohibition with command names. No template uses a `--restart-verification` flag.

### Generated copies are not the source of truth

Body comparison after stripping runtime frontmatter, substituting `{{sharedFolder}}` / `@{{sharedFolder}}`, and rendering `{{#if capabilities.agents}}`:

- `specd-verify`, `specd-compliance`, `specd-design`, `specd-archive`: body matches the template in all five install roots.
- `specd-implement`: `.codex`, `.claude`, `.github`, `.opencode` include the agents parallel-mode block; `.agents` omits it. That matches plugin capabilities (`plugin-agent-standard` passes only `frontmatter`; Claude, Codex, Copilot, and OpenCode pass `agents`).
- `.specd/config/skills/shared/shared.md` matches `shared.md.tpl` after `{{sharedFolder}}` substitution.
- Frontmatter differs per runtime (expected injection). Protocol paragraphs are not hand-edited.

### Other requirements in this spec

Not re-checked line-by-line in this partial (template location/migration/metadata, capability rendering, graph impact/search wording, frontmatter matrix, implementation-tracking cookbook, metadata self-healing, optimizer gating, command-role surfaces, in-place approval gates, overlap vs `OVERLAP_CONFLICT`, archive `--skip-hooks pre`, design review scope, fast-track). Spot checks that overlap this change (in-place gates, overlap wording, archive preflight, verify/implement tracking) appear in the same templates and in `template-workflow.spec.ts`. No discrepancy was opened for them.

## Discrepancies

None in the assigned protocol slice.

Observation, not a defect: verify runs `verifying` post-hooks (step 5) before the delegated compliance audit (step 5b). Design lists delegation before “applicable report/hooks”. The spec only requires hooks and the report to precede completion, and completion still waits for both scenario checks and the delegated audit.

## Tests

Ran (read-only): `packages/skills/test/template-workflow.spec.ts`, `packages/skills/test/generated-skill-protocol.spec.ts`, `packages/skills/test/infrastructure/skill-repository.spec.ts`.

Result: 32 passed, 0 failed.

Those tests assert start/complete, `--delegated --attempt <attemptId>`, absence of `--restart-verification`, report-only wording, repeated work after a new start, and installed-copy phrase parity with the templates.

## Counts

| Spec                          | Requirements | Verify scenarios | Protocol requirements checked                | Discrepancies |
| ----------------------------- | ------------ | ---------------- | -------------------------------------------- | ------------- |
| skills:workflow-automation    | 11           | 27               | 1 (Cross-skill artifact review and recovery) | 0             |
| skills:skill-templates-source | 23           | 61               | 1 (Reconciled invalidation protocol)         | 0             |

Assigned slice: CONFORMANT
