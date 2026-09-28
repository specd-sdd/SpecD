# change verification

Record verification evidence for an active change. These commands do not transition the lifecycle. Validity rules live in [Validity and verification](../guide/workflow.md#validity-and-verification) and in [`ReconcileChangeValidity`](../core/use-cases.md#reconcilechangevalidity).

## Usage

```bash
specd changes verification start <name> [--format text|json|toon]
specd changes verification complete <name> [--format text|json|toon]
specd changes verification invalidate <name> --reason <text> [--format text|json|toon]
```

`<name>` is the active change slug. `--format` defaults to `text`. JSON and TOON are explicit public projections, not serialization of the aggregate or raw use-case result. An invalid format, or `invalidate` without a non-empty `--reason`, fails before configuration/context resolution or any mutation and exits 1.

## Commands

### start

Refreshes implementation tracking, runs the registered implementation-file checks, and stores a new attempt baseline. It is valid in every active state. A repeated start replaces only the active attempt, even when the inputs are identical, because it is new verification work. Completed evidence stays as it is unless reconciliation has already marked it stale.

```bash
specd changes verification start add-auth-flow
```

Text reports the attempt id, the superseded attempt id when there was one, the lifecycle state, and fingerprint file counts and algorithms. It does not print source bytes or full hashes. An empty implementation `files` map means no linked files were observed. A partial fingerprint is not stored: missing, unreadable, or out-of-project inputs fail with `FingerprintInputError`.

### complete

Requires an active attempt. It records completed evidence only when a fresh fingerprint equals that attempt's baseline. It does not run tests and does not replace the baseline on mismatch.

```bash
specd changes verification complete add-auth-flow
```

Text reports the verification id, state, file counts, and algorithms. On `VerificationFingerprintMismatchError` the previous baseline is unchanged. Inspect the differences, run `start` again, repeat the verification work against the new baseline, and only then `complete`. Stay in the current lifecycle state. There is no transition restart flag. `VerificationAttemptNotFoundError` means there is no active attempt. Neither error mutates success evidence. Both exit 1.

### invalidate

Requires completed evidence. It marks that evidence stale once and makes a currently valid sign-off stale, because that consent names the verification id. It does not start an attempt or calculate a new baseline.

```bash
specd changes verification invalidate add-auth-flow --reason "Scenario no longer matches the API"
```

The first call reports `invalidated: true`. A second call against evidence that is already stale succeeds with `invalidated: false`, does not append another event, and reports the original persisted reason rather than the new request text. Text, JSON, and TOON include that reason, whether sign-off changed, any committed recovery, blockers, and the next command. `VerificationNotFoundError` means there is no completed evidence. An unfinished attempt does not qualify. That error exits 1 and writes nothing.

## Output and exit codes

| Format         | What you get                                                                                                                                                                                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`         | Ids, state, file counts, algorithms, superseded attempt, invalidation idempotence, sign-off consequence, recovery, blockers, and the next command. No source bytes and no full hashes.                                                                                             |
| `json`, `toon` | Whitelisted ids, states, fingerprint algorithms/counts, and public reconciliation fields. Unknown/private fields, source bytes, and full hashes are dropped. `start` and `complete` do not invent a next action; `invalidate` includes Core's blockers, recovery, and next action. |

Success exits 0, including an idempotent invalidate. Expected Core errors exit 1 through the normal error handler and keep `code` plus metadata.

## Retry in the current state

If completion mismatches, or status says verification is stale at `verifying → done`, sign-off, or archive:

1. Read `specd changes status <name>` and stay in the reported state.
2. Run `specd changes verification start <name>`.
3. Repeat the scenario checks against that new baseline.
4. Run `specd changes verification complete <name>`.

Do not complete with results collected against the previous baseline.
