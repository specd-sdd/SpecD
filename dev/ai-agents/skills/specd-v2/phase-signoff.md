# Phase E — Signoff gate

Mark "Signoff" task as `in_progress`.

---

## E.1 Done state hooks

Run hooks for the `done` state:

```bash
node packages/cli/dist/index.js change hook-instruction <name> done --phase pre --format text
```

Follow the guidance there.

Check if the gate is active. Run `change status <name> --format json` and read
`lifecycle.approvals.signoff` from the response. No separate `config show` call is needed.

**If `lifecycle.approvals.signoff` is `false`:**

Run done post hooks:

```bash
node packages/cli/dist/index.js change run-hooks <name> done --phase post
node packages/cli/dist/index.js change hook-instruction <name> done --phase post --format text
```

Follow the guidance there. Then transition directly:

```bash
node packages/cli/dist/index.js change transition <name> archivable --skip-hooks source.post
```

Run hooks for the `archivable` state:

```bash
node packages/cli/dist/index.js change hook-instruction <name> archivable --phase pre --format text
```

Follow the guidance there.

```bash
node packages/cli/dist/index.js change run-hooks <name> archivable --phase post
node packages/cli/dist/index.js change hook-instruction <name> archivable --phase post --format text
```

Follow the guidance there. Mark "Signoff" task as `completed`.

**Next:** Read `phase-archiving.md` and continue to Phase F.

**If `approvals.signoff: true`:** `TransitionChange` reroutes to `pending-signoff`.

Run done post hooks, then hooks for the new state:

```bash
node packages/cli/dist/index.js change run-hooks <name> done --phase post
node packages/cli/dist/index.js change hook-instruction <name> done --phase post --format text
node packages/cli/dist/index.js change hook-instruction <name> pending-signoff --phase pre --format text
```

Follow the guidance there. Inform the user:

> This change requires signoff before archiving.
> A human must run: `specd change approve signoff <name> --reason "<rationale>"`
>
> Re-invoke this skill after signing off to continue.

```bash
node packages/cli/dist/index.js change run-hooks <name> pending-signoff --phase post
node packages/cli/dist/index.js change hook-instruction <name> pending-signoff --phase post --format text
```

Follow the guidance there. Leave "Signoff" task as `in_progress` and **stop**.

**If in `pending-signoff`:** run pre hooks, remind the user, run post hooks. **Stop.**

**If in `signed-off`:** run hooks for the `signed-off` state:

```bash
node packages/cli/dist/index.js change hook-instruction <name> signed-off --phase pre --format text
```

Follow the guidance there. Run post hooks, then transition:

```bash
node packages/cli/dist/index.js change run-hooks <name> signed-off --phase post
node packages/cli/dist/index.js change hook-instruction <name> signed-off --phase post --format text
```

Follow the guidance there.

```bash
node packages/cli/dist/index.js change transition <name> archivable --skip-hooks source.post
```

```bash
node packages/cli/dist/index.js change hook-instruction <name> archivable --phase pre --format text
```

Follow the guidance there.

```bash
node packages/cli/dist/index.js change run-hooks <name> archivable --phase post
node packages/cli/dist/index.js change hook-instruction <name> archivable --phase post --format text
```

Follow the guidance there. Mark "Signoff" task as `completed`.

**Next:** Read `phase-archiving.md` and continue to Phase F.
