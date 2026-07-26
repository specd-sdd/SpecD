# Exploration: Skill for branch merges under specd

> Status: investigation only — no implementation, no change created.
> Date: 2026-07-20
> Goal: design considerations for a skill in `@specd/skills` that helps merge
> git branches in repos that use specd, where specs, deltas, code, and active
> changes can all collide and force a reconciliation loop.

---

## Verdict

Today there is **no** skill and **no** use case for “merge git branches”.

**Scope of this exploration:** VCS **branch** merge (git/hg/svn native merge),
not specd’s archive-time delta “merge”. Naming in the skill should prefer
`specd-branch-merge` (or similar) to avoid that collision.

In product language, “merge” usually means `ArchiveChange`. Here we mean
integrating two branches with the **standard VCS merge** so history and
traceability between branches stay intact. The skill must **not** invent a
parallel integration path (cherry-pick-all, manual copy of trees, etc.) as the
default — use the VCS merge, then overlay specd-aware reconciliation.

The merge must **not be blind**: native merge for traceability, plus a
mandatory **spec contract inventory** (before → after) so agents can see which
requirements moved and adjust code/specs deliberately.

A branch-merge skill must be an **orchestrator** on top of the host VCS + the
existing lifecycle skills (`new → design → implement → verify → archive`), not
a replacement for `git merge` and not a second archive path.

The target loop is first-class in the skill:

1. **Before any VCS merge:** inventory what _will_ be touched; present plan; get
   confirmation (dry-run / preview of the merge impact)
2. Only then run the **standard VCS merge** (preserve branch topology / merge commit)
3. Resolve conflicts with eyes open (specs + code + change storage)
4. Diff contracts before vs after; adapt code when contracts changed
5. Those adaptations often require changing already-merged (or incoming) specs
6. Materialize that work as one or more **changes**, then implement / verify / archive

**Hard gate:** do not invoke the host merge until Phase 0–1 completed and the
user accepted the inventory / cluster plan (or explicitly chose inventory-only
/ abort).

**Persistence:** the pre-merge analysis of what the source branch brings is not
chat-only. It becomes source material for the reconciliation change(s)’
proposal / exploration artifacts (see “Branch intake analysis”).

---

## What exists today (and what it does _not_ cover)

| Piece                                                                                  | Relevant to branch merge?                                                                                                                           |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skills `specd-new`, `specd-design`, `specd-implement`, `specd-verify`, `specd-archive` | Yes — as reconciliation phases to invoke                                                                                                            |
| Deltas + `spec-preview` / `validate`                                                   | Yes — re-apply intent against a new base                                                                                                            |
| `DetectOverlap` / `OVERLAP_CONFLICT`                                                   | Only concurrent **active** changes                                                                                                                  |
| `ArchiveChange`                                                                        | Spec-delta merge into permanent specs (lifecycle end), not git                                                                                      |
| `VcsAdapter`                                                                           | Read-only: `branch`, `isClean`, `show`, `modifiedFiles`, `ref`, `identity` — **no** merge/rebase                                                    |
| Direct writes to `specs/`                                                              | Forbidden by the agent/workflow model — strong tension with resolving git conflicts in specs                                                        |
| Skill templates under `packages/skills/templates/skills/`                              | `specd`, `specd-new`, `specd-design`, `specd-implement`, `specd-verify`, `specd-archive`, `specd-compliance`, `specd-metadata` — **no merge skill** |

### Important terminology collisions

- **specd merge** = archive-time delta application onto base artifacts (**out of scope** as the primary operation here)
- **branch merge / VCS merge** = integrate commits from another branch via the VCS’s normal merge (**in scope**)
- **delta conflict** = two operations in one delta targeting the same AST node
- **artifact conflict / drift** = content hash mismatch vs last validated hash
- **spec overlap** = two active changes share a `specId`

None of the product “conflict” terms above is “two git branches both changed the
same requirement”. That case is what this skill is for.

### Platform facts that shape the skill

- Permanent specs live under workspace `specsPath` and are git-tracked like code.
- Active changes live under storage (`changesPath`, often also in-repo, e.g. `specd-sdd/`).
- Existing specs are modified via **deltas** (`deltas/<ws>/<path>/<file>.delta.yaml`);
  new specs are full files under the change’s `specs/`.
- `ValidateArtifacts` / `ArchiveChange` call `ArtifactParser.apply(baseAST, deltaEntries)`.
  If a selector no longer resolves against the post-merge base → `DeltaApplicationError`
  (hard fail, no partial apply).
- `spec-preview` is the read-only way to see merged outcome before archive.
- Overlap is checked at archive; `allowOverlap` can proceed but invalidates
  overlapping active changes.
- Constraints noted in `core:spec-overlap`: severity beyond info and
  sync/baseline features are still out of scope / incomplete historically.

---

## The real problem (beyond `<<<<<<<`)

A typical branch merge in a specd repo collides on **several layers**:

1. **Specs already archived on both branches**
   - Git text conflicts in `specs/**`
   - Or worse: clean auto-merge that is **semantically** wrong

2. **Active changes in storage**
   - Same change directory / name on both sides
   - Overlapping `specIds`
   - Deltas whose selectors target headings/nodes that the other branch renamed or removed

3. **Code**
   - Classic conflicts, plus “no conflict markers but contracts disagree”

4. **Adaptation loop**
   - Fixing code/contracts forces touching specs that were just merged
   - That must become a **change** (or several), not an ad-hoc patch to `specs/`

5. **Sidecars / tooling state**
   - Spec metadata, implementation links, graph index freshness
   - Easy to leave inconsistent after a messy merge

6. **Specs (or whole workspaces) not in the same VCS as the branch**
   - Native merge does not carry spec content
   - Intake must still discover contracts via the **incoming branch’s config**
   - See “Problem: specs outside VCS / config from source branch”

The skill’s job is to make that multi-layer reconciliation **explicit, ordered,
and lifecycle-native**.

---

## Problem: specs outside VCS / config from the source branch

Not every workspace keeps permanent specs inside the git tree that is being
merged. In specd this is already a supported shape:

- `specs.adapter.config.path` may point **outside** the project repo root
- the loader then sets `RepositoryConfig.isExternal = true`
- v1 specs adapter is still **`fs`** — content lives on disk, not necessarily
  versioned with the branch tip
- `codeRoot` and even change/archive storage can similarly sit outside the
  merged repo

So a “successful” VCS merge of the code repo can leave contracts untouched on
disk while the **incoming `specd.yaml` (and related config)** describes a
different world.

### What breaks if we ignore this

| Assumption                                           | Failure mode                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| “Touched specs = git diff of `specs/**`”             | Misses all external / non-tracked specs the source branch relied on |
| “base/ours/theirs from git show”                     | No VCS revisions for those files — inventory is incomplete or lying |
| “Clean merge ⇒ contracts unchanged”                  | Config on source may retarget paths, ownership, workspaces, storage |
| “Merge then open specs with current config”          | You may read the **target** workspace map while the source branch’s |
| deltas/changes were authored against **another** map |

### What the skill must do

1. **Always load config from both tips (read-only), not only the working tree.**
   - Target: current `specd.yaml` (and resolved workspaces)
   - Source: `git show <source>:specd.yaml` (or VCS equivalent) — even when
     specs themselves are not in git
   - Diff the two configs: workspace names, `specs.path`, `codeRoot`,
     `ownership`, storage paths, schema ref, plugins

2. **Classify each workspace for the merge:**

   | Class                 | Meaning                                                         | Contract inventory                                                 |
   | --------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
   | **In-VCS specs**      | `specsPath` inside the merged repo                              | Normal base/ours/theirs via VCS                                    |
   | **External fs specs** | path outside repo / not tracked                                 | No git three-way; see below                                        |
   | **Config-only drift** | same path, but source config metadata differs (ownership, etc.) | Treat as risk even if files “look” unchanged                       |
   | **Retargeted path**   | source config points specs elsewhere than target                | Hard stop or explicit user plan — do not silently use target paths |

3. **For external / non-VCS specs, “tirar del config de la rama que viene”:**
   - Use the **source branch’s** workspace map to know which paths/names the
     incoming work assumed
   - Use the **target** map for what the current tree will use after merging
     config
   - Present a **config reconciliation** section in the intake analysis before
     any VCS merge of `specd.yaml` itself
   - Do **not** assume disk content at an external path is “theirs” or “ours”
     in a branch sense — it is whatever is on disk **now** (shared mutable
     store)

4. **Honest limits in the intake / proposal:**
   - Mark contracts under external paths as `inventory: incomplete` unless the
     project has another agreed source of truth (second repo, pinned ref,
     mirror, export)
   - If the source branch’s archived changes or deltas refer to specs that
     only exist under the source config’s paths, say so explicitly
   - Prefer stopping for user direction over inventing a fake three-way

### Practical strategies (skill policy options)

Document in the skill; user picks per merge (default = safest):

- **S0 — Block:** if any owned workspace has external/non-tracked specs and
  source config differs, stop after intake until the user provides how to
  obtain source-side contract snapshots.
- **S1 — Config-first merge plan:** reconcile `specd.yaml` (and workspace
  bindings) deliberately as part of intake; only then merge the code repo;
  external specs handled by a separate agreed process (manual sync, other
  VCS, publish step).
- **S2 — Dual-config read:** while still on target tip, parse source
  `specd.yaml` via VCS show; if source paths are readable on this machine,
  snapshot those directories **as files on disk right now** labeled
  `source-config-path@now` (not `@source-commit`) — never pretend they are
  historical branch content.
- **S3 — Side repo / worktree:** if external specs actually live in another
  git repo, the skill should say so and require a coordinated merge/checkout
  there; branch-merge of the app repo alone is insufficient.

**Recommended default:** S0 when owned external specs + config drift; S2 only
as an explicit, labeled “disk snapshot” aid; never call a disk snapshot
“theirs from commit”.

### Mechanism: mount the source branch and compare under both configs

Yes — for a reliable intake we need a way to **mount the incoming branch**
somewhere, load **its** `specd.yaml`, read specs through **that** resolved
workspace map, and compare against **ours** (current tip / target config).

A config diff alone is not enough: paths, ownership, and even which specs
exist can only be trusted after resolving each side with its own loader.

#### What “mount” means (v1 recommendation)

Prefer a **VCS worktree** (git: `git worktree add <path> <source>`) over
destructive checkout of the main working tree:

| Approach                     | Pros                                                                                                    | Cons                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Worktree mount (default)** | Target tree stays clean; real files + real config; can run `specd` with `--cwd` / project root at mount | Disk space; need cleanup; still doesn’t version _external_ fs paths |
| Temporary clone              | Isolated                                                                                                | Heavier; remotes/auth                                               |
| `git show` per file          | No mount                                                                                                | Only in-VCS paths; no full config resolution / multi-file discovery |
| Switch current branch        | Simple                                                                                                  | Destroys in-progress merge posture; fights the pre-merge gate       |

**Default skill mechanism:** create a disposable worktree at a known temp
location (e.g. under `specdPath/tmp/branch-merge/<source-sanitized>/` or OS
temp), pointing at the source ref. Always remove it in skill cleanup / on abort.

#### Dual-root comparison model

```text
TARGET_ROOT  = current project (ours)     → load config_T → SpecRepos_T
SOURCE_MOUNT = worktree at source ref     → load config_S → SpecRepos_S

compare:
  config_T vs config_S
  for each workspace name in union(config_T, config_S):
    classify in-VCS / external / missing-on-one-side / retargeted
    list specs from each side’s repository
    for intersecting specIds: diff artifact content (and outlines)
```

Operationally (today, without new core APIs):

1. Mount source worktree.
2. Run read-only discovery against **target** root (`specs list`, path
   inventory, `VcsAdapter.show` as needed).
3. Run the same against **source mount** as project root (separate process /
   cwd), so its `specd.yaml` resolves its own `specs.path` / `codeRoot`.
4. Join results in the intake analysis (proposal seed).
5. Unmount / `worktree remove`.

Optional later platform help (not required for skill v1): a CLI like
`specd project compare --against <ref>` that encapsulates mount + dual list +
diff. Until then the skill owns the orchestration.

#### What the mount fixes vs what it does not

**Fixes:**

- Reading specs **as the source branch configured them** (workspace names,
  relative paths, schema binding as declared on that tip)
- Discovering specs added only on source under in-repo `specsPath`
- Honest config_T vs config_S before merging `specd.yaml`
- Feeding proposal with real “what the branch brings” for in-VCS contracts

**Does not fix by itself:**

- **External / shared fs specs:** both mounts may resolve to the **same**
  absolute path on disk → content is `@now`, not `@source`. Mount still helps
  detect that aliasing; it does not create historical theirs.
- Specs that live only in another repo: mount of _this_ repo is insufficient
  → strategy S3 (coordinate that other VCS).
- Active change storage if it is also external/shared — same aliasing caveat.

When `config_S.specs.path` and `config_T.specs.path` canonicalize to the same
absolute directory, the intake must mark:

`shared-mutable-store: true` — dual-root content diff is meaningless for
history; only config metadata + in-repo deltas/changes still differ.

#### Skill rules around the mount

1. Mount is **read-only intent** — do not create changes, archive, or write
   specs from inside the source mount.
2. Mount happens in **Phase 1** (pre-merge), after refs are known; before user
   go/no-go.
3. Intake/proposal must record: mount path, source ref, how each workspace was
   read (target root vs source mount vs shared external).
4. Cleanup is mandatory (success, abort, or failure after mount).
5. If worktree creation fails, stop — do not fall back to blind merge; falling
   back to `git show` is allowed only for **in-VCS** paths and must be labeled
   degraded inventory.

#### Relation to strategies S0–S3

- **S0:** mount + config diff still run; block merge if owned external + drift.
- **S1:** mount informs how to reconcile config before merging the main tree.
- **S2:** mount for config; disk snapshot of external paths labeled `@now`.
- **S3:** mount this repo **and** require the sibling repo’s equivalent mount.

### Can we load the other branch’s config without materializing git?

**Reading `specd.yaml` via `git show` is possible — but without a kernel it does
not get you specs. For intake that matters, that alone is not enough.**

| Need                                                                                       | Without worktree? | Notes                                                                         |
| ------------------------------------------------------------------------------------------ | ----------------- | ----------------------------------------------------------------------------- |
| `specd.yaml` bytes + parse declared fields                                                 | **Yes**           | `VcsAdapter.show` / `git show`                                                |
| `createKernel` / `SpecRepository` / `specs list` / hashes on **in-repo** specs at that tip | **No (today)**    | Loader + repos are filesystem-rooted; relative `specs.path` needs a real tree |
| External specs declared by that config                                                     | Disk `@now` only  | Mount still doesn’t give historical theirs                                    |

#### So what is config-without-kernel actually worth?

Only as a **cheap triage / preflight**, not as the compare:

- Spot **retarget / ownership / schema / external** drift before paying for a worktree
- Decide strategy S0–S3 / whether mount is mandatory
- Seed a thin `configDiff` sketch in the proposal

It does **not**:

- List which specs changed
- Hash artifacts
- Produce `candidates` or `contractDiff`
- Replace `project compare`

```text
git show source:specd.yaml  →  triage only (maybe block early)
worktree + ConfigLoader + kernel on both roots  →  real intake
```

If triage says “owned external + retarget, inventory incomplete”, you may
**stop without mounting**. If triage says “in-VCS specs likely churned”, you
**must** materialize (or build a future VCS-backed kernel) — staring at YAML
doesn’t help further.

**Product rule:** `project compare` always aims at **two kernels** (ours root +
theirs root). Worktree exists so theirs can load a real kernel. A
show-only config path is an optional **fast-fail prelude**, not the feature.

Future: VCS-backed config/spec repos parameterized by ref could remove the
worktree for in-repo layouts; until then, no kernel ⇒ no honest spec compare.

#### Future `SpecRepository` over VCS — narrow replacement only

If we ever add a VCS-backed specs repository (read via `VcsAdapter.show(ref,
path)` instead of `fs`):

- It **only** replaces `fs` when `specs.path` (resolved) lies **inside** that
  same VCS root — i.e. in-repo specs versioned with the branch tip.
- It does **not** replace `fs` for `isExternal` / outside-repo paths: those
  have no historical blob at `ref`; disk remains `@now` (shared mutable or
  unrelated store).
- Same rule for metadata under a path derived from an external specs root.
- Kernel on “theirs” would then be: config resolved for `ref` + VCS repo for
  in-VCS workspaces + fs repo (with honesty flags) for external ones.

```text
specs.path inside repo  →  VCS-backed read at ref   (can avoid worktree)
specs.path outside repo →  fs only @now            (VCS repo cannot help)
```

#### External fs specs with relative paths + worktree

Common layout:

```text
/mono/app/          ← git root, specd.yaml
/mono/shared-specs/ ← outside repo, config says specs.path: ../shared-specs
```

Relative paths resolve from the **directory containing `specd.yaml`**, not from
the VCS root as a special case.

If `project compare` puts the source worktree **nested** under the repo:

```text
/mono/app/.specd/tmp/branch-merge/feature-x/specd.yaml
  specs.path: ../shared-specs
→ resolves to /mono/app/.specd/tmp/branch-merge/shared-specs   ❌ wrong
```

Same relative string, different anchor → kernel on the worktree **does not**
see `/mono/shared-specs`. Compare would lie or see an empty/missing store.

**Content note:** even when resolution is fixed, that external store is still
`@now` (not historical for `feature-x`). The issue here is only “can the
worktree kernel open the same store ours uses?”

##### Ways to keep reading the same external fs path

1. **Sibling worktree (preferred v1 layout)**  
   Create the worktree next to the main project root, same depth:

   ```text
   /mono/app          ← ours
   /mono/app-wt-…     ← theirs worktree
   /mono/shared-specs ← ../shared-specs from either root → same abs path ✅
   ```

   Preserves `../…` relatives without rewriting config.

2. **Remap on load inside `project compare`**  
   After loading source `specd.yaml` from the worktree, for every
   `specs.path` / `codeRoot` / metadata path that is relative and whose
   resolution **escapes the worktree / VCS root** (external):
   - re-resolve it against the **primary project root** (ours.root), or
   - rewrite to the **absolute** path already computed on the ours side when
     `sameAbsoluteStore` is the intent  
     Then build the theirs kernel with those overridden absolute paths.  
     Do this only for paths classified external; do **not** remap in-repo
     relative paths (those must stay relative to the worktree tree).

3. **Project convention: absolute (or stable) external paths**  
   Document that external specs should use absolute paths (or env-based) in
   `specd.yaml` so worktree depth cannot break them. Soft mitigation, not
   sufficient alone for existing repos.

4. **Do not use nested `.specd/tmp/...` worktrees** when any workspace has
   external relative paths — detect in triage and force sibling layout or
   remap (1 or 2).

##### What `project compare` should do

```text
if any workspace has external relative specs.path:
  prefer sibling worktree
  OR apply external-path remap to abs against ours.root / canonical abs
  assert canonical(theirs.specsPath) == expected store (usually same as ours)
  set sharedMutable / completeness flags as today
```

##### External path on theirs ≠ ours (different store / different specs branch)

`@now` already means “disk bytes, not commit history”. A further trap:

The source tip’s `specs.path` **does not have to name the same store as ours**.

Examples:

- ours: `../shared-specs` → `/mono/shared-specs` (checked out on `main`)
- theirs: `../shared-specs-feature` or `../shared-specs` but that clone is on
  **another git branch** of an external specs repo
- theirs retargets to an absolute path we don’t have on this machine

So “remap theirs relative path to ours.root” is **wrong** if their config
intentionally points elsewhere. Remap-to-same-store is only valid when compare
proves both sides canonicalize to the **same** absolute directory (or the user
explicitly opts into “treat as shared store”).

```text
same relative string  ⇏  same store
same store @now       ⇏  same external-specs git branch
different path on theirs → different @now tree (if it exists here at all)
```

What `project compare` must do:

1. Resolve `specsPathOurs` and `specsPathTheirs` **independently** (theirs from
   worktree anchor + their relative string, or absolute as declared).
2. Report both paths; set `sameAbsoluteStore` only if canonical abs equal.
3. If different:
   - `status: retargeted` / candidates may be `unknown` until the user
     supplies how to read _their_ external tree (path exists here? which
     checkout? which branch of the external repo?).
   - Do **not** silently read ours’ external store and call it theirs.
4. If same abs path: `sharedMutable: true`, content `@now` — still unknown
   which external-repo branch anyone meant historically.
5. Strategy S3 applies when external specs are themselves a VCS: coordinate
   that repo’s branch/ref; app-repo worktree alone is not enough.

##### Same store ⇒ cannot know content diff between branches

If `sameAbsoluteStore` is true, **stop pretending compare can answer “what
changed in these specs between ours and theirs.”**

There is only one filesystem tree. You cannot derive:

- spec bytes at ours tip vs theirs tip
- which requirements each branch intended
- a hashOurs ≠ hashTheirs that means branch divergence

Both kernels would hash the **same files** and report `unchanged` even when
each branch’s _intent_ for that store differed (or when someone else mutated
the store since).

What you can still learn from the **app** repo alone:

- both tips _declare_ that path (configDiff)
- path/code churn **inside the app repo** that _references_ those specs
  (covering, deltas in changes/, implementation links)
- that inventory for those specs is **`unknown-content` / incomplete**

What you cannot do: candidate `modified` based on artifact hashes of that
shared store as a branch-vs-branch signal.

```text
sameAbsoluteStore + fs external
  → completeness: unknown-content (or config-only)
  → do not emit fake contractDiff from hashing the store twice
  → risk: SHARED_MUTABLE_SPEC_STORE (block or warn — prefer block for owned)
  → need S3 (external VCS compare) or human-provided snapshots — else skip
  → OR use archived changes on each tip as intent signal (see below)
```

##### Can archived changes fill the gap?

**Partially yes** — when archives live **in the app VCS** (or otherwise differ
per tip), they are often the best signal we have for external/shared stores.

Each tip’s archive records which deltas were promoted into specs. Diffing
“archives that touched `specId` on ours since merge-base” vs “on theirs”
answers: **what contract edits each branch authored through specd**, without
needing historical bytes in the external store.

| Helps                                                                   | Does not replace                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Candidate set for shared/external specs (`whyCandidate: archive-delta`) | Full tree of permanent specs at theirs tip if edits bypassed specd |
| Intent / requirement-level narrative from archived deltas               | Out-of-band edits to the external store                            |
| Rough “both sides touched same specId via archive” overlap              | Correct `@now` store that already applied neither, one, or both    |
| Seeding proposal decision matrix                                        | Proof of current disk state matching either tip                    |

Preconditions:

1. `storage.archive` (or equivalent) is **in-repo** (or tip-specific), so ours
   and theirs archives can differ — if archive is itself a shared external
   path, same `@now` problem.
2. Only work that went through **archive** is visible; ad-hoc writes to
   external specs are invisible.
3. Replaying or summarizing archived deltas needs care: base at archive time
   may not equal current shared store; treat as **intent**, not as “apply both
   and you’re done”.
4. Still emit `SHARED_MUTABLE_SPEC_STORE` / `unknown-content` for hash-based
   content compare; add an `archiveIntent[]` (or similar) section instead of
   fake `artifacts.hashOurs/hashTheirs` diffs.

```text
for shared/external specIds:
  archiveChurnOurs    = archived changes since merge-base on ours tip touching id
  archiveChurnTheirs  = same on theirs tip (worktree)
  → candidates + proposal narrative from those deltas
  → do NOT claim disk hash compare between branches
```

So: archives **serve** for intake on shared stores; they do **not** make the
external tree branch-versioned. Prefer combining archive-intent with S3 when
the external specs repo has real branches.

##### Should two branches touch shared external specs at all?

**Usually no — it’s a bad idea**, not just a compare edge case.

Shared `@now` specs + parallel app branches means:

- no branch-isolated contract history for that store
- lost updates / silent overwrite on disk
- `project compare` cannot tell ours vs theirs from content
- archive-intent is a recovery signal, not a healthy workflow

**Prefer:**

1. **Don’t share a mutable store across concurrent branches** — give the
   external specs their own VCS and merge that repo deliberately (S3), or
2. Keep shared specs **in the app repo** (in-VCS) so branch tips diverge for
   real, or
3. Serialise: only one branch may archive/write that shared store at a time
   (weak; still fragile)

**Compare / skill stance:** treat “two tips both churned archive-intent or
config toward the same shared store” as a **process smell** — surface a
strong risk (`SHARED_MUTABLE_CROSS_BRANCH` / block or warn). The skill may
still help _recover_ via archives + reconciliation changes, but the docs
should say: **avoid this layout for parallel work**.

##### Engineering: should stores “support branches”?

**Do not** teach every storage adapter a generic “branch” concept (especially
not `fs`). That reinvents a VCS inside the store and lies for plain
directories.

Branch isolation already has a home: **version control**. Specd should
**select adapters**, not fake history on disk.

| Approach                                                                  | Verdict                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `fs` store grows `branch` / `ref` APIs                                    | **No** — `@now` only; cannot honor refs                                        |
| Specs live **inside** the app git repo                                    | **Yes** — free branch tips; compare/worktree/VCS-repo work                     |
| Specs in a **separate git repo** + coordinated merges (S3)                | **Yes** — real branches for contracts                                          |
| Named specs adapter e.g. `git` / `vcs` with `{ path, ref? }`              | **Maybe later** — read (and maybe write) blobs at a ref for in-repo paths only |
| Multi-root “logical branch” overlay in fs (copy-on-write dirs per branch) | **Avoid v1** — high complexity, easy to desync from real VCS                   |

**Recommended direction:**

1. **v1 compare/skill:** worktree + honesty flags + archive-intent; document
   that shared external `fs` + parallel branches is unsupported as a happy
   path.
2. **v1.x / v2 platform:** optional **VCS-backed `SpecRepository`** (and
   config load-at-ref) **only** when `specs.path ⊂ repo`. That is “store
   supports ref”, not “fs supports branches”.
3. **Multi-repo products:** treat external contract repos as first-class VCS
   citizens (merge those branches too); `project compare` may later accept
   multiple `--against` roots or a manifest of paired refs.
4. Keep **ports dumb about branch policy**: `SpecRepository` reads/writes a
   resolved root (or root+ref for VCS adapter). Branch _policy_ stays in
   project-compare / skill / human process.

```text
fs adapter     → always @now, no branches
vcs adapter    → optional ref, in-repo paths only
compare/skill  → chooses roots/refs, never asks fs to pretend
```

##### Product concept: “edits stay on this branch’s store, not main’s”

That’s the real ask — **isolation of published specs per branch**, not a
generic `fs.branch` flag.

**What specd already gives you:**

| Mechanism                                                                 | Isolation?                                                                       |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Active **change** deltas (in change dir, usually in git)                  | **Yes** — only that tip’s commits see them until merged                          |
| **Archive** into specs **inside** the app git repo + commit on the branch | **Yes** — main does not see those files until git merge                          |
| **Archive** into **shared external `fs`** path                            | **No** — write hits `@now` global store; every branch/kernel sees it immediately |

So the bug is not “stores lack branches”. It’s **publishing (archive) to a
store that is not branch-scoped**.

**Ways to get the product behavior:**

1. **Prefer in-VCS permanent specs (simplest)**  
   Archive on `feature/x` → files change in that branch’s tree → commit →
   main untouched until merge. No new store concept.

2. **External contracts must be their own VCS (S3)**  
   Archive/commit on the specs repo’s `feature/x` (or paired branch), not into
   a bare shared folder. Same semantics as (1), second repo.

3. **Process: don’t archive to shared `fs` from feature branches**  
   Keep work in deltas until the integrating branch; archive only when
   integrating to main (or only from a release branch). Weak discipline, but
   zero platform work.

4. **Future specd: branch-scoped publish overlay (optional, heavy)**  
   e.g. publish target = `baseStore + overlay(branch|change)` until an
   explicit promote/merge. Reads on that branch see overlay; main sees base.
   This is a real product feature — essentially a mini working tree for specs —
   and must not be bolted onto naive `fs` as “branch=”. Better as:
   - overlay rooted under `specdPath` / branch name, or
   - require VCS adapter for any publish target that needs isolation

**Recommendation:** aim for the **product guarantee** (“feature work doesn’t
mutate main’s visible contracts until integration”) via **(1) or (2)**, not
by making every store branch-aware. Use compare/skill to **detect and block**
archives/config that publish to shared `@now` under parallel tips. Consider
(4) only if many customers need external non-git specs _and_ parallel
branches — high cost.

```text
want:  feature edits invisible to main until integrate
get it from:  git-scoped permanent specs (app or specs repo)
not from:     fs.sharedFolder + archive from every branch
```

##### Archive gate: only on certain branches?

**Yes as a safety valve — but gate on publish risk, not a blind “main only”.**

A global “archive only on `main`” would break the healthy path: in-VCS specs
_should_ be archived (and committed) on feature branches so git isolates them.

| Publish target                                            | Archive from feature branch?                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Specs **in app VCS** (or tip-scoped)                      | **Allow** — commit keeps main clean until merge                               |
| Specs **external shared `fs`** (`@now` / `sharedMutable`) | **Block by default** on non-integration branches                              |
| Specs in **separate specs VCS**                           | Allow if writing that repo’s matching branch; else block / require paired ref |

**Suggested product shape (config + `ArchiveChange` guard):**

Important: the gate is about **where permanent specs are written** when a
change is archived — i.e. workspace `specs` publish targets — **not** about
`storage.archive` (that path only stores the archived _change directory_).

Putting `allowedBranches` under `storage.archive` would be the wrong knob:
it would sound like “may move change folders into the archive on these
branches”, which is a different concern.

Prefer one of these (sketch — not implemented):

```yaml
# Option A — project default for all external spec workspaces
publish:
  external:
    allowedBranches: ['main', 'release/*'] # omit = deny all feature archives to external
    # or: policy: integration-only | any-branch
```

```yaml
# Option B — per workspace (finer)
workspaces:
  billing:
    specs:
      adapter:
        type: fs
        config:
          path: ../billing/specs
    ownership: shared
    publish:
      allowedBranches: ['main', 'release/*'] # only consulted when isExternal
```

Behaviour:

1. Before archive, for each **spec publish** target workspace in the change:
   - if **not** `isExternal` → no branch allow-list check (in-VCS; git isolates)
   - if `isExternal` → current branch must match `publish.external.allowedBranches`
     (project default) and/or workspace `publish.allowedBranches` if set
2. Mismatch → hard error (`ArchiveBranchNotAllowedError` or similar) with
   repair guide: stay on deltas, integrate first, or move specs in-VCS /
   use a specs-repo branch.
3. Optional `--force` / explicit break-glass (audited).
4. Refinement later: tighten from bare `isExternal` to
   `isExternal && sharedMutable` / “same store as default tip” if some
   external paths are intentionally private per clone — v1 using `isExternal`
   alone is a reasonable blunt gate.

Skill / compare: if intake sees archive-intent on feature tips toward a shared
store, warn that those archives may have already violated the gate (legacy) or
that the gate would have blocked them.

**Verdict:** yes to an allow-list, triggered when publishing to **`isExternal`
workspaces**; wire it next to **publish/specs**, not under `storage.archive`.

##### Where in `ArchiveChange`: last guard

Put the branch allow-list check in **`ArchiveChange` as the last guard
before any publish/write of permanent specs** — after prior guards have
already passed (archivable state, schema, readOnly, overlap, pre-archive
hooks/preflight as today’s order requires). Rationale: only run the
policy check when the change is otherwise ready to publish; the error then
means “you’re clear to archive _except_ for branch/publish policy.”

Order sketch:

```text
… existing guards (archivable → readOnly → overlap → … preflight) …
→ publish-branch allow-list (NEW, last)
→ apply deltas / write SpecRepository / move to archive …
```

Do **not** start writing specs and then fail the branch check mid-batch.

**Error message (tone):** technical + process repair, e.g.:

> Cannot archive `<name>`: workspace(s) `<billing>` publish to external
> specs (`isExternal`) and branch `<feature/x>` is not in
> `publish.external.allowedBranches` (`main`, `release/*`).
>
> External specs are not isolated per git branch — archiving now would
> mutate the shared store for everyone.
>
> Repair: keep this change open, get the PR accepted/merged onto an
> allowed integration branch, check out that branch, then archive.
> Or move these specs in-repo / use a versioned specs repo.
> Break-glass: `<explicit force flag>` (audited).

Avoid implying the PR merge _is_ the archive. Clear sequence: **merge PR →
archive from allowed branch**.

Sibling worktree only preserves “same relative → same abs” **when both tips
declare the same relative string and mean the same store**. It does not fix
“they were on another branch of the external specs repo”. And when it _is_
the same store, it also does **not** create a content history between app
branches — unless you reconstruct **intent** from per-tip archives (or an
external VCS).

---

### Intake / proposal implications

Add mandatory sections when this case applies:

- **Config diff (target tip vs source tip)**
- **Workspace class table** (in-VCS / external / retargeted)
- **Spec inventory completeness** per workspace
- **Chosen strategy** (S0–S3) and what is _not_ proven about contracts

Reconciliation changes that only fix in-repo code while external contracts
were never inventoried must be called out as **partial**.

### Relation to native VCS merge

Native merge remains correct for **traceability of the repo that contains
config + code**. It is **insufficient** as the sole integration mechanism when
contracts live elsewhere. The skill’s job is to detect that gap in Phase 0–1
and refuse a blind “merge and adapt code” path.

---

## Decision: native VCS merge, not blind merge

**Use the standard VCS merge** (e.g. `git merge <source>` into the target
branch, producing a normal merge commit / recorded parentage). Reasons:

- Branch topology and bisect/blame remain honest
- Review tools, CI, and humans already understand merge commits
- Avoids a second “specd-only integration” history that diverges from VCS truth

**Sequence is fixed:**

```text
preflight + inventory + user OK  →  native VCS merge  →  after-report + reconcile
```

Never:

```text
merge first  →  then figure out what happened
```

**Do not treat a clean VCS merge as success.** Auto-merged markdown/YAML specs
can still be semantically wrong. The skill’s value is everything **around** the
native merge:

1. Pre-merge contract inventory (**blocking** — must finish before merge)
2. Conflict / clean-merge review with spec semantics
3. Post-merge before→after contract check
4. Reconciliation change(s) when contracts or code must be adjusted

If the host is not git, same principle: use that VCS’s standard merge
mechanism; do not reimplement merge in `@specd/core` for v1.

---

## Decision: yes — inventory specs that will be touched (before / after)

**Yes.** Inventariar los specs (y artefactos) que el merge va a tocar es
**obligatorio** en el skill, no opcional. Sin eso no hay forma fiable de
ajustar contratos: el agente solo ve conflictos locales o un tree ya mezclado.

### Why

- Contracts live in specs; code must follow them. A branch merge can change
  contracts without any code conflict markers.
- “Clean merge” is the dangerous case: no `<<<<<<<`, but a requirement was
  rewritten on both sides in compatible text regions or adjacent sections.
- Reconciliation changes need an explicit list of `specIds` — the inventory is
  that list’s source of truth.
- Before/after gives a review surface analogous to `spec-preview --diff`, but
  across **branches**, not across a single change’s deltas.

### What “before / after” means (four views, not two)

For each touched permanent spec artifact, the skill should be able to show:

| View                | Meaning                                          |
| ------------------- | ------------------------------------------------ |
| **merge-base**      | Shared ancestor content (contract baseline)      |
| **ours** (target)   | Spec on the branch we merge into                 |
| **theirs** (source) | Spec on the branch we merge from                 |
| **result**          | Tree after VCS merge (+ any conflict resolution) |

Useful derived diffs:

- `base → ours` — what this branch intended
- `base → theirs` — what the other branch intended
- `ours → theirs` — direct divergence
- `base → result` / `ours → result` / `theirs → result` — **what the merge did
  to contracts** (the adjustment surface)

The skill should persist or present this inventory as a checklist the
reconciliation change can attach to (decision matrix rows).

### What to inventory (minimum)

**Candidate set first** (differential — never “all specs in the project”):

0. Path churn on both tips since merge-base; map through `config_T` / `config_S`
   into candidate `specId`s. This is the primary input.
1. **Config from both tips** — flag external paths, retargets, ownership,
   storage/schema drift (may add candidates even with empty path churn).
2. Within candidates: which artifacts differ (added / modified / deleted).
3. One-sided vs both-sided candidates.
4. Covering specs for diverged **code** (even if those spec files did not
   appear in path churn).
5. Specs targeted by active/archived changes present on either tip.
6. For **external / non-VCS** workspaces in the candidate/config set:
   completeness markers + strategy S0–S3; no fake base/ours/theirs from git.

Only after the candidate set is known: selective content/outline/semantic
inspection. Do not start from `specs list` of the whole monorepo.

### When to capture snapshots

1. **Pre-merge (mandatory, blocking):** build the touched-spec set + capture
   base/ours/theirs content or hashes **before** calling the VCS merge. Prefer
   read-only (`git show`, worktree, `VcsAdapter.show`) so the working tree stays
   clean. Present the predicted impact (what _will_ be touched, likely conflict
   paths, semantic-risk flags). **Stop** for user confirmation or abort.
2. **Immediately post-merge (mandatory):** re-diff result against the three
   pre-merge views; mark each spec as:
   - unchanged contract
   - one-sided win (only ours or only theirs landed)
   - combined / conflict-resolved
   - clean-auto-merge — **needs semantic review** (highest caution flag)
3. **During reconciliation (as needed):** after design/implement iterations,
   re-check that intended contracts still match the change’s deltas/preview.

A dry-run / inventory-only mode of the skill ends after step 1 (no VCS merge).
The same analysis can still be kept for later, or seeded into a draft/change
if the user already wants reconciliation work tracked.

### Branch intake analysis → change exploration artifacts

Beyond a flat path list, Phase 1 should produce a **branch intake analysis**:
what the source branch _brings_ into the target — intent, contract shifts,
code surface, and active-change baggage. That write-up is how the team (and
later skills) work the merge without rediscovering context.

**Where it lives:** in the reconciliation **change(s)**, not only in the
skill transcript and not only in a root `EXPLORATION_*.md` scratch file.

Under `schema-std` today that maps primarily to:

| Artifact                | Role for branch-merge                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **`proposal.md`**       | Exploration / “why”: what the source branch brings, why we integrate it, predicted impact, clusters, risks, go/no-go rationale |
| **`design.md`**         | How we reconcile: decision matrix, before→after contract outcomes, code adaptation approach                                    |
| **`tasks.md`**          | Checklist derived from clusters + decisions                                                                                    |
| Spec deltas / new specs | Contract adjustments that follow from the above                                                                                |

If multiple reconciliation changes are created (policy C), **split the intake
analysis by cluster**: each change’s proposal carries only the intake relevant
to its `specIds`, plus a short pointer to sibling changes.

**Suggested proposal sections** (skill guidance; may later become template
hints):

1. **Source / target / merge-base** refs
2. **Config diff** (target tip vs source tip `specd.yaml` / workspaces) —
   especially external `specs.path`, retargets, ownership, storage
3. **What the source branch brings** (features, fixes, contract changes —
   narrative, not only file list)
4. **Touched specs** (checklist with base/ours/theirs risk flags **or**
   `inventory: incomplete` for external/non-VCS workspaces)
5. **Workspace class table** + strategy S0–S3 when applicable
6. **Code / covering-spec blast radius**
7. **Active changes / deltas on either side** that may go stale
8. **Proposed clusters** and which cluster this change owns
9. **Open risks** (clean-auto-merge candidates, overlap, readOnly, external
   contract gaps, etc.)

After the VCS merge, **update** the same change artifacts (usually design, and
amend proposal only if intent changed) with the before→after contract report —
do not leave the intake analysis stranded in chat.

**Timing options** (skill may support both; default TBD):

- **A (recommended lean):** finish Phase 1 → user OK → create change(s) and
  write proposal from intake analysis → then VCS merge → refresh design with
  after-report → continue lifecycle.
- **B:** Phase 1 → user OK → VCS merge → create change(s) with proposal that
  already includes intake + first after-report.

Option A keeps exploration in the change _before_ the tree is dirty, which
matches “work better” with a durable brief. Option B is fine when the user
refuses to open a change until merge has started.

### How this feeds contract adjustment

```text
preflight
  → branch intake analysis + touched-spec inventory + user OK   ← gate
  → (default) create reconciliation change(s); write proposal from intake
  → native VCS merge
  → before/after contract report → update design (and proposal if needed)
  → for each changed or “clean-auto-merged” contract:
       decide keep / rewrite / split into reconciliation delta
  → adapt code to the decided contracts
  → if code forces another contract tweak → back into a change (not silent edit)
```

Without the **pre-merge** intake analysis, later design/implement rediscovers
scope from a dirty tree. Without **persisting** it into change artifacts, the
analysis evaporates when the skill session ends.

### What not to over-inventory

- Do not dump every spec in the monorepo — only **touched** + **covering**
  specs for diverged code.
- Do not block the merge on perfect structured 3-way AST merge tooling (not
  available yet); text/VCS three-way + human/agent semantic review is enough
  for skill v1.
- Do not skip inventory because “there were no conflict markers”.

---

## Design tension #1 (most important)

Resolving git conflicts by **editing** permanent `specs/**` conflicts with the
binding rule: never write directly to specs; changes go through change →
validate → archive.

The skill must pick an explicit policy (document it in the skill; do not leave
it to agent improvisation):

### Option A — Prefer model purity (recommended default)

1. Choose a temporary winner for conflicted permanent specs (ours or theirs) at
   the git layer, **or** leave one side and discard the other’s committed text.
2. Re-express the losing side’s **intent** as deltas (and design artifacts) inside
   a reconciliation change against the post-merge base.
3. Implement / verify / archive so the permanent tree only changes via archive.

Pros: respects “specs are source of truth via workflow”.
Cons: more work; agents must reconstruct intent from the discarded side.

### Option B — Mechanical git resolution + formalizing change

1. Resolve conflict markers in `specs/**` as a documented **merge exception**.
2. Immediately create a change whose job is to **review, adjust, and own** the
   reconciled outcome (deltas may be `no-op` plus targeted fixes, or further
   modifications discovered during code adaptation).

Pros: matches how humans already merge.
Cons: base is already “contaminated”; risk that agents stop after git resolve
and skip the change.

### Option C — Multiple changes by cluster

Same as A or B, but split work by workspace / dependency cluster / conflict
group instead of one mega-change.

**Recommendation:** skill default = **A + C**. Allow B only when the user
explicitly opts in, and still require a reconciliation change before calling
the merge “done”.

---

## Skill flow: `specd-branch-merge`

End-to-end sequence the skill must follow. Orchestrator only — delegates
compare to CLI, merge to host VCS, lifecycle to existing skills. Many **stop**
points; never skip user go/no-go.

### Happy path (default timing A)

```text
0. Bootstrap
   read shared.md · project status --context --graph
        │
1. Preflight (read-only)
   confirm source/target · tree clean? · classify intent
   changes check-overlap (current tip)
        │
2. Intake = project compare          ← CLI owns worktree + dual config + churn/hash
   specd project compare --against <source> --since <base> --semantic --format toon
   store fingerprint · summarize summary + risks
        │
   STOP  present intake · ask user:
         [inventory-only] [abort] [proceed]
         if risksBlock → default refuse proceed until strategy chosen (S0–S3)
        │
3. Seed reconciliation change(s)     ← only if user proceeds (timing A)
   STOP  confirm cluster split + change names
   /specd-new (or create) per cluster
   write proposal.md from compare report (slice per change)
   primary change: add merge bookkeeping tasks (skill will execute merge)
        │
4. Native VCS merge
   git merge <source>   (skill-executed; documented on primary change only)
   resolve conflicts with policy A/B (STOP if ambiguous)
   mark primary merge tasks done · record merge SHA in proposal/design
   do NOT treat clean merge as contract-ok
        │
5. After-report
   refresh vs fingerprint (compare again / status of candidates on result tree)
   flag clean-auto-merged candidates · update design.md decision matrix
   STOP  confirm resolutions / contract decisions
        │
6. Per-change lifecycle loop
   /specd-design  → deltas on post-merge base (spec-preview)
   /specd-implement → adapt code; bounce to design if contracts wrong
   /specd-verify → /specd-archive
   next cluster
        │
7. Hygiene
   metadata · implementation review · graph reindex · overlap recheck
        │
8. Done
   report merged ref + archived change names + leftover risks
```

### Alternate timing B (merge before opening changes)

Same through step 2 STOP. Then: step 4 merge → step 5 after-report → step 3
create changes with proposal = intake + after-report → step 6–8.

Default remains **A** so exploration lives in the change while the tree is
still clean.

### Inventory-only / abort

After step 2, user may stop. Tree unchanged. Prefer persisting the compare
toon (or a short summary) somewhere the user can reuse — ideally still offer
to create a draft/change with proposal only; if they refuse, paste path to
the compare output / fingerprint in the chat.

### When compare says “only theirs” (one-sided incoming)

Common for a fix/PR: all candidate churn is on the source tip; ours had no
path/archive-intent changes on those specs since merge-base.

**Default: no reconciliation change.** Native VCS merge is enough — the
incoming commits already carry the paired specs + code. Creating a change
would be ceremony without a contract decision to own.

```text
compare summary:
  only theirs modified/added (ours side empty for candidates)
  risksBlock = 0
  no overlapping active changes that need coordination
  → recommend: merge-only path (step 4 + light after-check)
  → skip step 3 (seed changes) unless user wants an audit proposal anyway
```

**Still create / continue a change when:**

| Signal                                              | Why                                                           |
| --------------------------------------------------- | ------------------------------------------------------------- |
| Text or semantic conflicts                          | Need decision matrix + maybe policy A/B                       |
| `risksBlock` / `unknown-content` / shared mutable   | Honesty gap — human strategy, not blind merge                 |
| Ours code must adapt but wasn’t in their commits    | Rare if only theirs; post-merge breakage → then open a change |
| Overlapping active changes on ours                  | Coordination / overlap                                        |
| User asks for a tracked reconciliation/audit change | Optional proposal-only                                        |

**After merge-only:** still do a cheap after-check (status/tests / optional
compare refresh). If something breaks → escalate to a reconciliation change
then; don’t invent one up front “por si acaso.”

Rule of thumb:

> Reconciliation changes exist to **decide and adapt**. If the incoming branch
> already decided and ours didn’t diverge, **just merge**.

---

### What each step owns

| Step           | Who                                           | Does                                           | Does not                     |
| -------------- | --------------------------------------------- | ---------------------------------------------- | ---------------------------- |
| 0 Bootstrap    | Skill                                         | shared context, status                         | merge                        |
| 1 Preflight    | Skill                                         | refs, cleanliness, intent, overlap peek        | full spec diff               |
| 2 Intake       | **`project compare`**                         | mount, two configs, churn→hash→semantic, risks | merge, write specs           |
| 3 Seed changes | Skill → `specd-new`                           | proposal from report, cluster split            | implement                    |
| 4 Native merge | Skill + host VCS                              | standard merge + conflict resolve              | archive                      |
| 5 After-report | Skill + compare/refresh                       | clean-auto-merge flags, design updates         | silent accept                |
| 6 Lifecycle    | `design` / `implement` / `verify` / `archive` | reconcile contracts+code                       | invent second merge path     |
| 7 Hygiene      | Skill + CLI                                   | metadata, graph, links                         | skip if “merge looked clean” |

### Stop points (mandatory)

1. After preflight if tree dirty / intent unclear / external strategy needed
2. After `project compare` — go / inventory-only / abort
3. Before creating each reconciliation change (name, specIds, cluster)
4. Before/during conflict resolution when policy A vs B or requirement choice is unclear
5. After after-report — confirm decision matrix
6. Normal lifecycle stops inside design / verify / archive skills

### User-visible prompts (sketch)

After compare:

> **Branch intake ready** (`fingerprint: …`)
>
> - Candidates: N modified, A added, U unknown
> - Risks: W warn, B block
> - Overlapping active changes: …
>
> Proceed with native merge of `<source>` into `<target>` and create
> reconciliation change(s)?  
> Or inventory-only / abort?

After merge + after-report:

> **Merge applied.** Clean-auto-merged specs needing review: …  
> Decision matrix draft in `design.md`. Continue with `/specd-design`?

### Anti-patterns the skill must forbid

- Calling `git merge` before `project compare` + user OK
- Diffing the full spec catalog
- Editing permanent `specs/` as the “done” state without a reconciliation change
- Ignoring `risksBlock` / `unknown` candidates
- Owning worktree cleanup in the skill when compare already does
- Skipping design when implement discovers contract mismatch
- Modeling the native **`git merge` itself as a specd change** (see below)

### Is `git merge` another change? Part of a change?

**Not a separate change.** And **not** something the change lifecycle
_executes_ (no “implement = run git merge”, no archive-of-the-merge).

It **may** appear **inside** one reconciliation change as bookkeeping — usually
the primary / first cluster change when timing A is used.

#### Recommended model

```text
skill owns:   when to call git merge, conflict policy stop points
one change:   may *record* the merge (proposal + tasks) for narrative/trace
N changes:   reconcile contracts/code after the tree has merged
```

| Approach                                                                   | Verdict                                    |
| -------------------------------------------------------------------------- | ------------------------------------------ |
| Separate change whose only job is `git merge`                              | **No**                                     |
| Merge only in the skill, never mentioned in any change                     | OK, but weaker audit trail                 |
| Merge **recorded** as tasks/notes in **one** primary reconciliation change | **Yes — preferred when any change exists** |
| Every cluster change “owns” the merge                                      | **No** — only one merge; duplicates lie    |
| `implementing` / `archive` _means_ performing the merge                    | **No** — wrong lifecycle semantics         |

#### How it looks in the primary change (timing A)

1. Create primary reconciliation change; seed `proposal.md` from `project compare`.
2. In `tasks.md` (or design checklist), include explicit items such as:
   - `[ ] Native VCS merge of <source> into <target> (skill-executed)`
   - `[ ] Record merge commit SHA in proposal/design`
   - `[ ] Refresh after-report / decision matrix`
3. Skill runs `git merge` at the agreed stop (user OK) — **not** because a
   lifecycle transition required it.
4. Mark those tasks done; write the merge SHA into proposal/design.
5. Continue `/specd-design` → implement → … on the **post-merge** base.
6. Sibling cluster changes **assume the merge already happened**; their
   proposals say “depends on merge recorded in `<primary-change>` @ `<sha>`”
   and do **not** repeat the merge task.

#### Why “part of a change” is bookkeeping, not ownership

- The merge commit lives in **git history**, not in archived spec deltas.
- Validating/archiving the primary change does not re-apply the merge.
- If the primary change is later discarded, the merge commit is **not**
  automatically undone — proposal should say so.
- Mid-merge conflicts are skill stop points; leaving the change stuck in
  `implementing` solely because of conflict markers couples the wrong states.

#### When there is no reconciliation change

Clean merge, zero candidates, zero block risks → skill may merge and finish
**without** creating a change. No need to invent a change just to hold a
merge task.

#### Short rule

> One native merge, skill-executed. At most **one** change _documents_ it.
> Other changes only reconcile. Never archive “the merge” as if it were a spec.

```text
WRONG:  change "do-the-git-merge" → archive magic
WRONG:  each cluster change runs git merge
RIGHT:  project compare → [primary change documents merge] → skill git merge
        → primary + sibling changes reconcile
```

---

## What the skill should cover

Suggested name: **`specd-branch-merge`** (preferred over `specd-merge` to avoid
confusion with archive-time merge).  
Package home: `packages/skills/templates/skills/...`  
Nature: **orchestrator** with many “Present and stop” points; delegates to
existing lifecycle skills; does not reimplement them; shells out to the host
VCS for the actual branch merge.

### Inputs (sketch)

- `target` branch (usually current)
- `source` branch
- optional: dry-run / inventory-only (must still produce the touched-spec set)
- optional: conflict policy `A|B`
- optional: prefer one change vs auto-split clusters

### Outputs (sketch)

- Touched-spec inventory with base / ours / theirs references (and hashes)
- Post-merge before→after contract report (including clean-auto-merge flags)
- Decision matrix (per touched spec / requirement — not only conflicted files)
- 1..N reconciliation changes created or continued
- Clear next skill routing per change

---

### Phase 0 — Preconditions

- Confirm source/target refs.
- Working tree policy: clean preferred; if dirty, stop and ask.
- Resolve merge-base (read-only).
- **Load and diff project config from both tips** (working-tree / target tip
  vs `VCS show` of source `specd.yaml`). Detect external `specsPath`,
  retargeted workspaces, ownership/storage/schema drift.
- Inventory active changes on **both** sides (today: compare via git /
  temporary checkout / worktree; VCS port does not merge).
- Run `changes check-overlap` on the current side.
- Classify intent:
  - integrating already-archived spec work only
  - integrating unfinished active changes
  - both
- If owned external/non-VCS specs + config drift → apply strategy gate
  (default S0: stop until user chooses S1–S3 or supplies contract snapshots).

**Stop** if classification, dirty-tree policy, or external-spec strategy is
unclear.
**Do not** start the VCS merge in this phase.

---

### Phase 1 — Intake via `project compare` (before any VCS merge)

**Mandatory and blocking.** Prefer a single call instead of hand-rolled mount:

```bash
specd project compare --against <source> --since <merge-base> --semantic --format toon
```

(Until that command exists: DIY worktree + churn + selective reads, labeled
degraded.)

From the report: `summary`, `risks`, `configDiff`, `candidates`, `changes`,
`fingerprint`. Build the branch intake narrative for the user (and later
proposal).

Present intake + explicit ask (go / inventory-only / abort). **Stop.**

- If abort / inventory-only → end (tree unchanged).
- If proceed with timing A → Phase 3 seed, then Phase 2 merge.
- If proceed with timing B → Phase 2 merge, then Phase 3.

---

### Phase 2 — Native VCS merge execution policy

**Only after Phase 1 user OK** (and after proposal seeding if timing A).

- Orchestrate the **standard** host merge (e.g. `git merge <source>`), skill +
  shell — not `@specd/core`, not a custom history rewrite as default.
- Preserve normal merge traceability (merge commit / recorded parents).
- Partition conflicted paths:
  - permanent `specs/**`
  - change storage (`changes/`, drafts, maybe archive index)
  - application code / tests
  - metadata / locks / implementation sidecars
  - generated caches (graph DB, etc.) — usually regenerate, don’t hand-merge

Rules of thumb:

- Do **not** blindly `ours`/`theirs` on specs.
- Decide per **requirement / section**, not per file when possible.
- For active deltas after base moved: expect selector failures; plan to
  **rewrite deltas** against the new base (`validate`, `spec-preview --diff`).
- Do not treat successful text merge of markdown as semantic success.
- After the VCS merge completes (or conflicts are resolved), run the
  **before→after contract report** against the Phase 1 inventory; flag
  clean-auto-merged specs for review.

Present remaining conflicts + contract report + proposed resolutions.
**Stop** before mass resolution unless user already approved the plan.

---

### Phase 3 — Create reconciliation change(s)

For each confirmed cluster:

1. Create a change whose intent is explicitly branch-merge reconciliation
   (“integrate `<source>` into `<target>` preserving …”).
2. Include `specIds` from the **touched-spec inventory** (not only files that
   had conflict markers):
   - every conflicted / semantically disputed / clean-auto-merged spec
   - every covering spec for diverged code that may break satisfaction
   - every spec that must change because code adaptation requires contract updates
3. **Seed `proposal.md` from the branch intake analysis** (exploration of what
   the source brings, impact, risks, cluster ownership). This is mandatory
   content for the change — not optional chat context.
4. **`design.md`** holds the reconciliation plan:
   - decision matrix (ours / theirs / combined + why)
   - before→after contract notes (filled/refreshed post-merge)
   - code adaptation approach tied to those contracts
5. Prefer several small changes over one giant change when clusters are
   independent; each change gets the **slice** of intake that it owns.

Route via `/specd-new` then `/specd-design` as appropriate. **Do not**
auto-create without confirmation (specd stop rule).

If timing A already created the change before merge, Phase 3 here means
**refresh** proposal/design rather than create from scratch.

---

### Phase 4 — Adaptive loop (heart of the skill)

Ordered cycle with stop points:

1. Finish VCS-layer resolution for the cluster (policy A or B).
2. Re-run / refresh before→after for that cluster’s specs.
3. `/specd-design` — deltas/specs coherent with **post-merge** base.
   - Mandatory review via `spec-preview` / validate inline diff when overlap,
     drift, or stale-base risk exists.
4. `/specd-implement` — adapt code to the **decided** contracts from the report.
5. If implementation discovers the merged contract is wrong:
   - **invalidate / return to design**
   - do **not** “fix code only” and leave specs lying
6. `/specd-verify` → `/specd-archive`.
7. Next cluster.

The branch-merge skill **invokes** these skills; it does not replace their guards
(review required, ownership/readOnly, overlap, implementation links, etc.).

---

### Phase 5 — Post-merge hygiene

- Regenerate / update spec metadata for touched specs.
- `changes implementation review` before archive.
- Re-index code graph if stale after large merges.
- Re-run overlap checks if other active changes remain.
- Ensure archive index / storage ignore hygiene still sane if archive paths
  were touched (usually they shouldn’t be hand-merged).

---

## Cases the skill must call out explicitly

| Case                                            | Risk                                         | Skill handling                                                              |
| ----------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------- |
| Same spec archived on both branches             | Git conflict or silent semantic loss         | Reconciliation change; no “edit permanent specs and done”                   |
| Active delta vs base changed by other branch    | `apply` fails / preview lies                 | Rewrite deltas on new base; require `spec-preview --diff`                   |
| Same change name on both branches               | Broken manifest/deltas                       | Policy: rename, discard one side, or fold into a new change                 |
| Overlap with other local active changes         | Archive blocked / invalidations              | Resolve overlap first; `allowOverlap` only with eyes open                   |
| Metadata / locks / implementation links         | Post-merge drift                             | Regenerate + review before archive                                          |
| Graph stale                                     | Blind impact analysis                        | Reindex after resolving specs+code                                          |
| readOnly / external workspaces                  | Cannot write                                 | Same guards as `specd-implement` / archive                                  |
| Mixed new-spec files + deltas for same new spec | Validation failure                           | Follow existing validate rules; don’t invent hybrid layouts                 |
| Specs outside VCS / `isExternal` paths          | No git three-way for contracts               | Diff source vs target **config**; strategy S0–S3; mark inventory incomplete |
| Source `specd.yaml` retargets `specs.path`      | Reading target paths misattributes contracts | Hard stop or explicit config reconciliation before merge                    |
| External path is shared mutable disk            | “theirs” is not branch-historical            | Label snapshots `@now` under source-config paths; never fake `@source`      |

---

## Composition with existing skills

```text
specd-branch-merge (orchestrator)
  ├─ Phase 0–1: preflight + `project compare` (mount+diff owned by CLI) / STOP
  ├─ (timing A) create change(s) + write proposal from compare report
  ├─ Phase 2: native VCS merge (skill/host) + optional compare refresh / stop
  ├─ Phase 3: create or refresh change artifacts (proposal/design)
  ├─ for each cluster change:
  │    ├─ specd-design
  │    ├─ specd-implement
  │    ├─ specd-verify
  │    └─ specd-archive
  └─ hygiene (metadata, graph, overlap recheck)
```

Also reuse:

- `workflow-automation` policies (text for diagnostics, toon for extraction,
  validate ≠ semantic approval, preview when overlap/drift risk).
- Graph-first exploration for blast radius.
- Shared skill bootstrap (`shared.md`), fingerprint/context rules, stop rules.

---

## What we need to know which contracts / specs changed (and what we lack today)

Goal of the intake: answer, before merging:

1. Which **specs** (ids / paths / artifacts) differ between target and source?
2. Which **contracts** inside those specs changed (requirements, scenarios,
   constraints — not only “file bytes differ”)?
3. Which differences are **one-sided**, **both-sided**, or **clean-auto-merge
   risk** after a VCS merge?
4. Which of that is **unknowable** with current tooling (external stores)?

### Hard constraint: differential intake — not “compare all specs”

This is **not** “load 200 specs and diff them one-by-one”.

A full pairwise catalog compare is:

- Too expensive for agents and humans
- Mostly noise (unchanged contracts)
- The wrong question for a branch merge

The right question is: **what did each side change since the merge-base?**
Then resolve those paths through each side’s config into `specId`s and only
then inspect contracts on that **small candidate set**.

```text
merge-base
  → VCS path churn on target tip (ours)
  → VCS path churn on source tip (theirs)
  → intersect/union → candidate paths
  → map paths → specIds via config_T / config_S
  → (+ covering specs for churned code)
  → only THEN content / outline / semantic diff on that set
```

Typical size should be “specs touched by this integration”, not “every spec
in the monorepo”.

Also pull in candidates that are **not** in the path diff but are required
for safety:

- covering specs for diverged **code** (graph / implementation links)
- specs targeted by active/archived **changes** present on either tip
- workspaces whose **config** retargeted (even if file churn is empty — may
  still be `unknown` / shared-mutable)

`project compare` (if built) must be **churn-driven** by default
(`--since merge-base` / against ref), with an explicit opt-in if anyone ever
wants a full catalog walk (should be discouraged / non-default).

### What we already have (usable building blocks)

| Capability                                    | What it gives                                                             | Limit for branch merge                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `VcsAdapter.show(ref, path)` / `git show`     | File bytes at a ref                                                       | Path must be in that repo; no workspace resolution                                    |
| `VcsAdapter.modifiedFiles(baseRef)`           | **Path churn since baseline** — the right _start_ for differential intake | Repo-relative only; not specIds; not semantic; needs config mapping                   |
| `specs list` / `specs show` / `specs outline` | Discovery + content + structure **for one project root**                  | Bound to **current** cwd/config; no `--against <ref>`; must not be used as “diff all” |
| `changes spec-preview` / validate diff        | Contract view **inside one change** vs current base                       | Not branch↔branch                                                                     |
| `DetectOverlap`                               | Active changes sharing `specIds`                                          | Not branches                                                                          |
| Graph search / impact / covering              | Code↔spec links on **indexed** tree                                       | Index is for one checkout; source mount needs its own or is stale                     |
| Config load from a root                       | Resolved workspaces, `isExternal`, paths                                  | No first-class “load config from other ref” API                                       |

A skill **can** approximate intake today by: worktree mount +
`modifiedFiles(merge-base)` on both tips + map to specIds + selective
`specs show`/`outline`. That is the intended shape — **not** listing the whole
catalog twice.

### What we do **not** have now (gaps)

#### A. Churn-driven dual-ref comparison API (not full catalog)

Missing something like:

```text
specd project compare --against <ref> [--since <merge-base>]
  → driven by VCS path churn (+ covering + change-targeted specs)
  → configDiff
  → workspaces[] { name, class, specsPathT, specsPathS, sharedMutable }
  → specs[] { specId, status: added|removed|modified|unchanged|unknown,
              whyCandidate: path-churn|covering|change-delta|config-retarget,
              artifactDiffs[], inventoryCompleteness }
```

Default MUST be differential. A “compare every spec” mode MUST NOT be the
default and ideally should not exist in v1.

Or lower-level building blocks:

- path churn → `spec resolve-path` in bulk under two roots
- `specd specs diff <specId> --ours <root> --theirs <root|ref>` **only for
  candidates**

**Without this:** the skill hand-rolls churn + mount + mapping; risk that
agents fall back to “list all specs and read them”.

#### B. Spec identity join across two configs

Even with two lists, we need a defined join key:

- Same `workspace:capability-path`?
- What if source renamed workspace or moved capability path but kept content?
- What if `specs.path` retargets so the same relative path is a different store?

**Missing:** documented join rules + “retargeted / ambiguous identity” status
in the compare result.

#### C. Contract-level (semantic) diff, not only file diff

File hash / unified diff says “bytes changed”. For merge decisions we need
closer to:

- outline / section-level diff (`Requirement: …` added/removed/renamed/modified)
- optionally scenario-level under verify artifacts
- stable IDs where possible (heading selectors already used by deltas)

**Partially present:** `specs outline`, delta selectors, `spec-preview --diff`
(change-scoped).

**Missing:** `specs diff --semantic` (or compare mode) that emits
requirement/scenario churn between two resolved artifact contents, suitable
for the decision matrix.

#### D. Three-way contract view (base / ours / theirs)

For in-VCS specs:

```text
merge-base content → ours → theirs → (later) result
```

**Missing:** packaged three-way report per `specId`+artifact. Today: three
manual `git show` / mount reads.

#### E. Mount lifecycle as a supported operation

**Missing:** official “open project view at ref” helper (worktree under
`specdPath/tmp/…`, cwd-safe, cleanup, read-only guard). Skill can shell
`git worktree`, but there is no specd-owned contract for it.

#### F. External / shared-store honesty

**Missing:** compare result fields such as:

- `inventoryCompleteness: complete | config-only | unknown-content`
- `sharedMutableStore: true` when both configs canonicalize to the same path
- explicit refusal to claim `theirs@source` for non-VCS content

Without this, agents will invent false before/after contracts.

#### G. “What will the VCS merge do to specs?” preview

**Missing:** predicted merge outcomes per path (conflict / ours / theirs /
combine) **before** running merge — e.g. using merge-tree / dry-merge.

Git has `git merge-tree`; specd has no wrapper that maps results back to
`specId`s via each side’s config.

#### H. Post-merge contract report tied to pre-merge inventory

**Missing:** a command that takes the Phase 1 inventory fingerprint and diffs
the working tree **result** into the same checklist (including
`clean-auto-merged` flags). Today the skill must re-derive ad hoc.

#### I. Branch-aware change / delta inventory

**Missing:** list active/archived change dirs and their `specIds`/deltas **as
they exist on the source tip** (mount helps; no first-class report). Important
to know which contracts changed via **archived deltas on the branch** vs ad
hoc edits — especially when permanent specs are external/shared (`@now`) and
disk hash compare is meaningless.

### Minimum bar to answer “what contracts changed?”

| Question                                         | Minimum capability                           | Have it?                            |
| ------------------------------------------------ | -------------------------------------------- | ----------------------------------- |
| What paths changed on each tip since merge-base? | `modifiedFiles` / git diff --name-only       | Yes (DIY)                           |
| Which of those paths are specs (specIds)?        | Bulk path→specId under config_T and config_S | Partial (`resolve-path` one-by-one) |
| Candidate set size kept small?                   | Churn + covering + change-targeted only      | Skill discipline only               |
| Which candidate artifacts changed bytes?         | Hash/diff on candidates                      | DIY                                 |
| Which requirements/scenarios changed?            | Semantic/outline diff on candidates          | No                                  |
| Did both sides touch the same requirement?       | Three-way section join on candidates         | No                                  |
| Is inventory trustworthy for this workspace?     | Completeness + shared-mutable detection      | No                                  |
| What did source’s config assume?                 | Load config from mount/ref                   | DIY                                 |
| What will merge do before we merge?              | merge-tree → candidate specIds               | No                                  |
| What changed after merge vs inventory?           | After-report against fingerprint             | No                                  |

### Suggested build order (if we invest beyond a pure skill)

1. **P0 — Churn-driven compare under two configs:** `CompareProjects` /
   `project compare --against --since`; path churn → specIds; **hash filter**
   via live/`contentHashes`; completeness flags. Answers **which specs**
   changed without catalog walk or full-body reads.
2. **P1 — Semantic contract diff on hash-mismatch candidates only:**
   outline/requirement/scenario churn.
3. **P2 — Three-way + merge-tree preview** on the same candidate set.
4. **P3 — Delta retarget / post-merge checklist** tied to the same inventory ids.

Until P0 exists, the skill must document a **degraded DIY differential
procedure** and forbid “diff all specs” as a strategy.

### Implication for the skill v1 vs platform

- **Skill-only v1:** possible but constrained — **churn-first** path inventory
  via worktree + git; selective reads; weak on semantic contracts; must stop
  loudly on external shared stores; **must not** enumerate the full spec
  catalog as the comparison strategy.
- **Useful product answer to “what contracts changed?”:** needs at least P0+P1
  on the **candidate set**; otherwise agents guess from unified diffs.

---

## Platform design options: how specd should find differences

Yes — the right place to improve this is **inside specd**, with a churn-driven
compare that takes two project views (two configs / two roots), not an agent
looping `specs show` by hand.

### Already in the product (reuse, don’t reinvent)

| Existing piece                                          | Role in compare                                        |
| ------------------------------------------------------- | ------------------------------------------------------ |
| `metadata.json` → `contentHashes` per artifact filename | Fast “did this artifact change?” without reading prose |
| Metadata freshness / live SHA-256 of artifact files     | Same check when metadata missing/stale                 |
| `SpecRepository.specHash`                               | Stable whole-spec fingerprint where available          |
| `VcsAdapter.modifiedFiles(baseRef)`                     | Cheap candidate path set since merge-base              |
| `specs outline` / artifact AST / delta selectors        | Deeper contract diff **only after** hash mismatch      |
| `spec resolve-path`                                     | Map churned paths → `specId` under a given config      |

So **hash-per-spec (really hash-per-artifact, already partly there)** is the
right _filter_, not the whole answer. Hashes tell **inequality**; they do not
tell **which requirement** changed.

### Proposed shape: `CompareProjects` / `project compare`

Pass **two configs** (two resolved project roots), not two naked folder lists:

```text
CompareProjects.execute({
  ours:   { root | config },      // target tip / current tree
  theirs: { root | config },      // source mount / other tip
  since?: mergeBaseRef,           // default: required for branch-merge mode
  include?: { coveringFromCode?, changesOnTips? }
})
```

`theirs.root` is typically the worktree mount; `ours` is the current project.
Each side loads **its own** `specd.yaml` → workspace map → `SpecRepository`s.

#### Pipeline (cheap → expensive)

```text
1. configDiff(ours, theirs)
     workspace class, path retarget, sharedMutable, ownership…

2. candidatePaths =
     modifiedFiles(ours, since) ∪ modifiedFiles(theirs, since)
     (+ optional: paths from change manifests on either tip)

3. candidateSpecIds =
     resolve-path under config_ours ∪ resolve-path under config_theirs
     (+ covering specs for churned code)
     (+ specs referenced by deltas on either tip)
     NEVER full specs list

4. for each candidateSpecId:
     hashOurs   = contentHashes or live hash under ours repos
     hashTheirs = contentHashes or live hash under theirs repos
     if both missing → status unknown (external / incomplete)
     if equal       → unchanged (stop — no content read)
     if differ / one-sided → status modified|added|removed

5. only for hash-differing candidates:
     optional --semantic: outline / requirement / scenario diff
```

That is how we avoid “200 specs one-by-one”: step 2–3 shrink the set; step 4
skips reads; step 5 is rare.

### Hash strategy (recommended)

Prefer **artifact-level hashes** aligned with existing metadata:

- Key: `specId` + artifact filename (`spec.md`, `verify.md`, …)
- Value: same `sha256:…` scheme as `contentHashes`
- Whole-spec hash (`specHash`) as a secondary rollup to skip per-artifact work
  when the rollup matches

Rules:

1. **Prefer live hash of resolved artifact bytes** when comparing two roots
   (truth for that tip). Use stored `contentHashes` as optimization when
   freshness is proven fresh on that root.
2. Equal hashes ⇒ do not load outline/body.
3. Unequal hashes ⇒ enqueue for semantic diff if requested.
4. External/shared-mutable paths: if both configs point at the same absolute
   store, hashes cannot mean ours-vs-theirs@commit — emit `unknown` /
   `sharedMutable`, don’t fake a branch diff.
5. Do not require metadata to exist to compare; missing metadata falls back to
   live hashing of candidates only.

Optional later: a **compare cache** under `specdPath/tmp/` keyed by
`(rootFingerprint, specId, artifact)` to speed repeated intakes — not needed
for v1 of the use case.

### Why “pass two configs” is the right API

- Spec identity and paths are **config-relative** (`isExternal`, per-workspace
  `specs.path`, ownership).
- Source tip may retarget workspaces; comparing files under the target config
  alone misattributes contracts.
- One use case owns: mount assumptions, join rules, completeness flags, and
  output shape for the skill’s proposal.

CLI sketch:

```bash
specd project compare --against <ref-or-path> --since <merge-base> --format toon
specd project compare --against <ref> --since <merge-base> --semantic --format toon
```

### Ownership: `project compare` owns mount + compare

**Yes.** For the product shape we want, `specd project compare` (backed by
`CompareProjects`) is the **single entry point** that:

1. Resolves `--against` (ref vs already-checked-out path)
2. If given a **ref**: creates the disposable worktree/mount, loads `config_S`
   from that root, runs the pipeline, then **cleans up** (success or failure)
3. If given a **path**: treats it as an already-mounted / alternate root (no
   worktree lifecycle) — useful for tests and advanced hosts
4. Loads `config_T` from the current project root
5. Runs churn → candidates → hash filter → optional semantic diff
6. Emits the structured report (`--format toon` for skills)

The **skill does not** shell out to `git worktree` itself in the happy path.
It calls compare, writes the report into proposal/design, and later runs the
**native VCS merge** (still host/skill — merge is not `project compare`).

```text
specd-branch-merge skill
  ├─ project compare --against <source> --since <base>   ← mount+diff owned here
  ├─ present intake / stop
  ├─ (optional) create change(s), seed proposal from report
  ├─ git merge <source>                                  ← native merge, not compare
  ├─ project compare again / after-report                ← optional refresh
  └─ lifecycle skills…
```

#### Boundaries (keep sharp)

| Concern                                         | Owner                          |
| ----------------------------------------------- | ------------------------------ |
| Worktree create/cleanup for `--against <ref>`   | `project compare`              |
| Dual config load + churn + hash + semantic diff | `project compare`              |
| Native branch merge / merge commit              | Skill + host VCS (not compare) |
| Conflict marker resolution policy A/B           | Skill                          |
| Writing proposal / creating changes             | Skill (+ `specd-new` / design) |
| Archive / deltas apply                          | Existing lifecycle             |

#### Flags worth baking in early

- `--against <ref\|path>` — required
- `--since <ref>` — merge-base; required in branch-merge mode (or auto-detected)
- `--semantic` — outline/requirement diff on hash mismatches only
- `--keep-worktree` — debug only; default always cleanup
- `--format toon\|text`

Auto-detect merge-base when `--since` omitted and `--against` is a ref is a
nice default; still show the resolved base in the report.

### Output contract: what `project compare` should emit

Formats follow existing CLI rules:

- **`--format toon`** (default for skills / data extraction) — full structured report
- **`--format text`** — human summary: counts, risks, candidate table; no full
  hash dumps unless `--verbose`

The report must be **self-contained enough to seed `proposal.md`** without
re-running discovery. It must **not** dump every spec in the project.

#### Top-level fields

```text
compare:
  ours:
    root: <abs>
    ref: <ref|null>          # current tip if known
  theirs:
    against: <ref|path>      # as passed
    root: <abs>              # mount or given path
    ref: <ref|null>
  since: <merge-base-ref>    # resolved; always present in branch mode
  mode: branch               # vs path-path later if needed
  semantic: false|true
  fingerprint: <stable-hash-of-inputs+result-ids>   # for after-report / proposal
```

#### `configDiff`

Enough for intake without pasting whole yaml files:

```text
configDiff:
  schemaRef: { ours, theirs, changed: bool }
  workspaces[N]{name, status, class, ownershipOurs, ownershipTheirs,
                specsPathOurs, specsPathTheirs, sameAbsoluteStore,
                sharedMutable, notes}:
    # status: unchanged | added | removed | modified | retargeted
    # class: in-vcs | external | mixed | missing-on-one-side
  storage: { changed: bool, summary: ... }   # optional short
  riskFlags[M]: ...                          # e.g. owned-external-drift
```

#### Churn summary (cheap context)

```text
churn:
  pathCountOurs: N
  pathCountTheirs: N
  pathCountUnion: N
  # NOT the full path list by default — only in --verbose or --include-paths
```

#### `candidates` (the core payload)

Only the differential set. Each row is one `specId` (or a path that failed to
resolve, as an error candidate).

```text
candidates[K]{specId, status, whyCandidate, completeness, sharedMutable,
              titleOurs, titleTheirs, artifacts}:
```

Per candidate:

| Field                       | Meaning                                                                 |
| --------------------------- | ----------------------------------------------------------------------- |
| `specId`                    | Joined id under ours and/or theirs (null if unresolvable path)          |
| `status`                    | `added` \| `removed` \| `modified` \| `unchanged` \| `unknown`          |
| `whyCandidate`              | list: `path-churn` \| `covering` \| `change-delta` \| `config-retarget` |
| `completeness`              | `complete` \| `config-only` \| `unknown-content`                        |
| `sharedMutable`             | both configs hit same abs store → branch content diff untrustworthy     |
| `titleOurs` / `titleTheirs` | if cheap from metadata                                                  |
| `artifacts[]`               | per-file hash compare (see below)                                       |
| `contractDiff`              | only if `--semantic` and status is interesting                          |
| `unresolvedPaths[]`         | optional when path churn did not map cleanly                            |

Per artifact inside a candidate:

```text
artifacts[A]{filename, status, hashOurs, hashTheirs}:
  # status: added | removed | modified | unchanged | missing-both | unknown
  # hashes: sha256:… or null
```

Default: include artifact hash rows for **non-unchanged** candidates only.
`--unchanged` / verbose may include unchanged candidates with equal hashes
(usually omitted to keep output small).

#### `contractDiff` (only with `--semantic`)

Still per candidate, only where hashes differed (or one-sided add/remove):

```text
contractDiff:
  requirements[R]{idOrHeading, change: added|removed|renamed|modified,
                  from, to}:
  scenarios[S]{…}:            # verify artifacts when present
  notes[T]: ...               # e.g. rename confidence low
```

No full prose bodies by default. `--content` may add unified diff snippets or
paths to temp diff files — opt-in, never default.

#### `changes` (optional section, when detectable on either tip)

```text
changes:
  oursActive[…]: { name, specIds }
  theirsActive[…]: { name, specIds }
  overlappingSpecIds[…]: ...
```

Adds candidates via `whyCandidate: change-delta` when relevant; listing every
archived change on the branch is out of scope for default output.

#### `risks` / `blockers` (skill routing)

Machine-friendly flags the skill must surface before merge go/no-go:

```text
risks[R]{code, severity: info|warn|block, message, relatedSpecIds[]}:
  # examples:
  # OWNED_EXTERNAL_CONFIG_DRIFT
  # SHARED_MUTABLE_SPEC_STORE
  # UNRESOLVED_CHURN_PATH
  # INCOMPLETE_INVENTORY
  # BOTH_SIDES_TOUCHED_SPEC
```

`blockers` can be the subset with `severity: block` (or a boolean
`readyForMergeRecommendation: false` plus reasons). Compare does **not**
perform the merge; it only advises.

#### Counts (always)

```text
summary:
  candidates: K
  added: a
  removed: r
  modified: m
  unchanged: u      # usually 0 in default output if omitted from list
  unknown: x
  risksWarn: …
  risksBlock: …
```

#### Example (`--format toon`)

Command:

```bash
specd project compare --against feature/dashboard --since abcdef0 --semantic --format toon
```

```toon
compare:
  ours:
    root: /Users/monki/Documents/Proyectos/specd
    ref: main
  theirs:
    against: feature/dashboard
    root: /Users/monki/Documents/Proyectos/specd/.specd/tmp/branch-merge/feature-dashboard
    ref: feature/dashboard
  since: abcdef012345
  mode: branch
  semantic: true
  fingerprint: "sha256:9f3c2a1b…"

configDiff:
  schemaRef: { ours: "@specd/schema-std", theirs: "@specd/schema-std", changed: false }
  workspaces[3]{name,status,class,ownershipOurs,ownershipTheirs,specsPathOurs,specsPathTheirs,sameAbsoluteStore,sharedMutable}:
    default,unchanged,in-vcs,owned,owned,specs,specs,true,false
    cli,unchanged,in-vcs,owned,owned,packages/cli/specs,packages/cli/specs,true,false
    billing,retargeted,external,readOnly,owned,../billing/specs,/data/billing/specs,false,false
  riskFlags[1]: owned-external-path-on-source

churn:
  pathCountOurs: 8
  pathCountTheirs: 23
  pathCountUnion: 27

summary:
  candidates: 4
  added: 1
  removed: 0
  modified: 2
  unchanged: 0
  unknown: 1
  risksWarn: 1
  risksBlock: 1
  readyForMergeRecommendation: false

risks[2]{code,severity,message,relatedSpecIds}:
  BOTH_SIDES_TOUCHED_SPEC,warn,"core:compile-context changed on both tips since merge-base",["core:compile-context"]
  INCOMPLETE_INVENTORY,block,"billing workspace retargeted on source; content compare not trustworthy without S1–S3",["billing:invoices"]

changes:
  oursActive[1]{name,specIds}:
    fix-project-dashboard-snapshot,["cli:project-dashboard"]
  theirsActive[1]{name,specIds}:
    dashboard-snapshot-refactor,["cli:project-dashboard","core:compile-context"]
  overlappingSpecIds[1]: cli:project-dashboard

candidates[4]:
  - specId: cli:project-dashboard
    status: modified
    whyCandidate[2]: path-churn,change-delta
    completeness: complete
    sharedMutable: false
    titleOurs: Project Dashboard
    titleTheirs: Project Dashboard
    artifacts[2]{filename,status,hashOurs,hashTheirs}:
      spec.md,modified,"sha256:aaa…","sha256:bbb…"
      verify.md,unchanged,"sha256:ccc…","sha256:ccc…"
    contractDiff:
      requirements[2]{idOrHeading,change,from,to}:
        "Requirement: Dashboard uses status snapshot",modified,null,null
        "Requirement: TUI wrapping for workspaces",added,null,null
      scenarios[1]{idOrHeading,change}:
        "Scenario: long workspace names wrap",added

  - specId: core:compile-context
    status: modified
    whyCandidate[2]: path-churn,covering
    completeness: complete
    sharedMutable: false
    titleOurs: Compile Context
    titleTheirs: Compile Context
    artifacts[1]{filename,status,hashOurs,hashTheirs}:
      spec.md,modified,"sha256:ddd…","sha256:eee…"
    contractDiff:
      requirements[1]{idOrHeading,change}:
        "Requirement: Lifecycle fields in context",removed

  - specId: cli:graph-impact
    status: added
    whyCandidate[1]: path-churn
    completeness: complete
    sharedMutable: false
    titleOurs: null
    titleTheirs: Graph Impact
    artifacts[2]{filename,status,hashOurs,hashTheirs}:
      spec.md,added,null,"sha256:fff…"
      verify.md,added,null,"sha256:111…"
    contractDiff:
      requirements[1]{idOrHeading,change}:
        "Requirement: File impact includes covering specs",added

  - specId: billing:invoices
    status: unknown
    whyCandidate[1]: config-retarget
    completeness: unknown-content
    sharedMutable: false
    titleOurs: null
    titleTheirs: null
    artifacts[0]:
    contractDiff: null
```

#### Field glossary

##### `compare` — identity of this run

| Field            | Meaning                                                                          |
| ---------------- | -------------------------------------------------------------------------------- |
| `ours.root`      | Absolute project root used as target (“our” side)                                |
| `ours.ref`       | VCS ref at that root if known (`main`, commit, …); `null` if detached/unknown    |
| `theirs.against` | Exact `--against` argument (ref name or path)                                    |
| `theirs.root`    | Absolute root where source config/specs were read (worktree mount or given path) |
| `theirs.ref`     | Resolved source tip ref when `--against` was a ref                               |
| `since`          | Merge-base (or `--since`) used for path churn — the differential baseline        |
| `mode`           | `branch` when comparing tips for a merge intake; other modes later if needed     |
| `semantic`       | Whether `--semantic` ran (outline/requirement diff on hash mismatches)           |
| `fingerprint`    | Stable hash of inputs + candidate ids; skill stores it to refresh after merge    |

##### `configDiff` — what each side’s `specd.yaml` implies

| Field                                             | Meaning                                                                                  |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `schemaRef.ours` / `.theirs`                      | Schema package/ref on each tip                                                           |
| `schemaRef.changed`                               | `true` if schema binding differs                                                         |
| `workspaces[].name`                               | Workspace id                                                                             |
| `workspaces[].status`                             | `unchanged` \| `added` \| `removed` \| `modified` \| `retargeted` (path/ownership drift) |
| `workspaces[].class`                              | `in-vcs` \| `external` \| `mixed` \| `missing-on-one-side`                               |
| `workspaces[].ownershipOurs` / `.ownershipTheirs` | `owned` \| `shared` \| `readOnly` per tip                                                |
| `workspaces[].specsPathOurs` / `.specsPathTheirs` | Configured specs path strings (as resolved for display)                                  |
| `workspaces[].sameAbsoluteStore`                  | Both sides canonicalize to the same absolute directory                                   |
| `workspaces[].sharedMutable`                      | Same abs store ⇒ cannot treat disk content as branch-historical theirs/ours              |
| `riskFlags[]`                                     | Short config-level warning codes (before per-spec `risks`)                               |

##### `churn` — size of the VCS path diff (not the path list)

| Field             | Meaning                                                  |
| ----------------- | -------------------------------------------------------- |
| `pathCountOurs`   | Paths changed on ours since `since`                      |
| `pathCountTheirs` | Paths changed on theirs since `since`                    |
| `pathCountUnion`  | Union size (candidate path pool before mapping to specs) |

Full path lists are **not** default output (`--verbose` / `--include-paths` only).

##### `summary` — counters for go/no-go

| Field                                                      | Meaning                                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| `candidates`                                               | Number of rows in `candidates`                                             |
| `added` / `removed` / `modified` / `unchanged` / `unknown` | Counts by `candidates[].status`                                            |
| `risksWarn` / `risksBlock`                                 | Counts by `risks[].severity`                                               |
| `readyForMergeRecommendation`                              | Advisory only: `false` if any `block` risk (skill must still ask the user) |

##### `risks[]` — machine-readable issues for the skill

| Field              | Meaning                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `code`             | Stable code (`BOTH_SIDES_TOUCHED_SPEC`, `INCOMPLETE_INVENTORY`, `SHARED_MUTABLE_SPEC_STORE`, …) |
| `severity`         | `info` \| `warn` \| `block`                                                                     |
| `message`          | Human-readable explanation                                                                      |
| `relatedSpecIds[]` | Specs implicated (may be empty for pure config risks)                                           |

##### `changes` — active-change context on either tip (optional but useful)

| Field                  | Meaning                                                                   |
| ---------------------- | ------------------------------------------------------------------------- |
| `oursActive[]`         | Active changes on target tip: `name` + `specIds`                          |
| `theirsActive[]`       | Active changes visible on source mount/tip                                |
| `overlappingSpecIds[]` | Specs targeted by active work on **both** sides (merge coordination risk) |

##### `candidates[]` — the differential set (core payload)

| Field                       | Meaning                                                                                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `specId`                    | Qualified id (`workspace:capability-path`); may be absent only for unresolvable churn paths (prefer explicit error rows)                                                                  |
| `status`                    | `added` (only on theirs) \| `removed` (only on ours) \| `modified` (both exist, hashes differ) \| `unchanged` (equal hashes; usually omitted) \| `unknown` (cannot trust content compare) |
| `whyCandidate[]`            | Why this id is in the set: `path-churn` \| `covering` \| `change-delta` \| `config-retarget` (can be several)                                                                             |
| `completeness`              | `complete` (both sides’ artifact bytes/hashes trustworthy) \| `config-only` \| `unknown-content`                                                                                          |
| `sharedMutable`             | Candidate lives on a shared abs store — treat status carefully                                                                                                                            |
| `titleOurs` / `titleTheirs` | Titles from metadata/content if cheap; `null` if missing on that side                                                                                                                     |
| `artifacts[]`               | Per-artifact hash comparison (see below)                                                                                                                                                  |
| `contractDiff`              | Present only with `--semantic` and when useful; else `null`                                                                                                                               |

##### `candidates[].artifacts[]` — hash gate per file

| Field                     | Meaning                                                        |
| ------------------------- | -------------------------------------------------------------- |
| `filename`                | Artifact basename (`spec.md`, `verify.md`, …)                  |
| `status`                  | `added` \| `removed` \| `modified` \| `unchanged` \| `unknown` |
| `hashOurs` / `hashTheirs` | `sha256:…` or `null` if absent on that side                    |

Equal hashes ⇒ no body read and usually no `contractDiff` for that file.

##### `candidates[].contractDiff` — semantic churn (`--semantic`)

| Field                         | Meaning                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `requirements[].idOrHeading`  | Stable-ish label (requirement heading / id)                                        |
| `requirements[].change`       | `added` \| `removed` \| `renamed` \| `modified`                                    |
| `requirements[].from` / `.to` | Optional rename endpoints or short notes; often `null` if only change type matters |
| `scenarios[]`                 | Same shape for verify scenarios when applicable                                    |
| `notes[]`                     | Free-form caveats (low rename confidence, etc.)                                    |

Does **not** include full requirement prose by default (`--content` opt-in).

#### How to read the example above

- `readyForMergeRecommendation: false` because `INCOMPLETE_INVENTORY` is `block` (billing retarget).
- Real reconciliation focus: `cli:project-dashboard`, `core:compile-context`, `cli:graph-impact`.
- `overlappingSpecIds` shows both tips have active changes on `cli:project-dashboard`.
- `billing:invoices` is `unknown` — listed so the skill does not pretend contracts were compared.

#### What it must **not** output by default

- Full `specs list` of the monorepo
- Full file contents / full unified diffs of every candidate
- Worktree path as something the skill must clean up (CLI cleans unless
  `--keep-worktree`)
- A merge decision that replaces user go/no-go (only risks + recommendation)

#### How the skill uses it

1. Print/summarize `summary` + `risks` (text or from toon)
2. Seed proposal sections from `configDiff`, `candidates`, `risks`
3. Cluster `modified`/`added`/`unknown` candidates into reconciliation changes
4. If `risksBlock` > 0 → stop (e.g. S0) before native merge
5. Store `fingerprint` to refresh after merge later

### Relation to skill vs platform

| Layer                                 | Responsibility                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Skill                                 | Call `project compare`, go/no-go, proposal, **native VCS merge**, lifecycle                               |
| `project compare` / `CompareProjects` | Worktree mount (when `--against` is a ref), two configs, churn → hash → optional semantic report, cleanup |
| Host VCS                              | Underlying worktree + merge implementation used by CLI/skill                                              |
| Metadata hashes                       | Acceleration inside compare, not source of semantic truth                                                 |

### Answer to the two ideas

1. **¿Hash por spec?**  
   Yes — use **per-artifact content hashes** (already the metadata model), with
   optional whole-spec rollup. Hashes are the **gate** after churn, not a
   replacement for churn and not a full-catalog scan.

2. **¿Que specd busque diferencias pasándole 2 configs?**  
   Yes — that’s the core use case: **two resolved configs/roots + `--since`
   merge-base**, churn-driven candidate set, hash filter, optional semantic
   diff. The skill consumes that report instead of reinventing it.

---

## Platform gaps (summary list)

A v1 skill can approximate with git worktree + existing CLI. To know contracts
reliably we still lack:

1. **Churn-driven `project compare`** (P0) — path churn → specIds; never
   default to full catalog walk
2. **Semantic/outline contract diff on candidates** (P1)
3. **Three-way + merge-tree → specId preview** (P2) on the same set
4. **Mount lifecycle** helper (worktree under specd tmp, cleanup, read-only)
5. **Inventory completeness / shared-mutable** markers for external specs
6. **Post-merge report** vs pre-merge inventory fingerprint
7. **Delta retarget / replay** onto a new base (structured selectors)
8. Branch-aware **change/delta inventory** on a mounted tip (adds candidates)
9. Global conventions / ADR: merge-time edits to permanent `specs/`
10. Whether any of this belongs on `VcsAdapter` (likely not — compare/mount
    as project-level use cases; VCS stays read/query + host merge in skill)

---

## Proposed specd changes (work breakdown)

Given everything in this exploration, these are the **changes** (or change
clusters) we would need. Order is dependency-aware; each can be one or more
specd changes in practice.

### Must-have for a credible branch-merge skill

| #      | Change (suggested name)                | Packages / specs                                                                       | What ships                                                                                                                                                                                                                                                               |
| ------ | -------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **C1** | `publish-external-archive-branch-gate` | `core` (`ArchiveChange`, config), `cli` (archive error UX), maybe `schema`/config docs | `publish.external.allowedBranches` (and/or per-workspace); last guard before spec publish when `isExternal`; clear repair message (PR → integrate → archive)                                                                                                             |
| **C2** | `project-compare-churn` (P0)           | `core` (`CompareProjects`), `cli` (`project compare`), config/tmp worktree helpers     | `--against` / `--since`; sibling worktree + cleanup; dual kernels; path churn → specIds; hash filter; `configDiff`; risks; toon output contract (no full catalog); external remap / `sameAbsoluteStore` / `unknown-content`; archive-intent candidates when shared store |
| **C3** | `specd-branch-merge-skill`             | `skills` (template + `workflow-automation`), docs                                      | Skill flow: compare → stop → seed change(s) → native merge → after-report → design/implement/verify/archive; proposal seeding; merge bookkeeping on primary change only                                                                                                  |

**C1** can ship **before** compare/skill — protects shared external stores immediately.  
**C3** without **C2** is possible only as degraded DIY (document as temporary). Prefer **C2 then C3**, or **C2+C3** in parallel once C2 API shape is stable.

### Should-have next

| #      | Change                           | What                                                                                                                              |
| ------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **C4** | `project-compare-semantic` (P1)  | `--semantic` outline/requirement/scenario diff on hash-mismatch candidates only                                                   |
| **C5** | `project-compare-archive-intent` | First-class section: archived changes per tip since merge-base touching candidate/external specIds (shared-store recovery signal) |
| **C6** | `project-compare-after-report`   | Refresh vs `fingerprint` post-merge; `clean-auto-merged` flags                                                                    |

### Nice-to-have / later

| #       | Change                            | What                                                                                                             |
| ------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **C7**  | `project-compare-merge-tree` (P2) | Predict conflicts → map to specIds before native merge                                                           |
| **C8**  | `vcs-spec-repository`             | Specs adapter read-at-ref for paths ⊂ repo (optional worktree avoidance)                                         |
| **C9**  | `delta-retarget` (P3)             | Replay/rewrite deltas onto new base after merge                                                                  |
| **C10** | Branch-scoped publish overlay     | Only if customers need external non-git + parallel branches (expensive; prefer C1 + in-VCS / specs-repo instead) |

### Explicit non-changes (out of scope unless revisited)

- Making `fs` “branch-aware”
- `allowedBranches` under `storage.archive` (wrong locus — use `publish.*`)
- A change whose job is “run `git merge`”
- Full-catalog spec compare
- Universal “archive only on `main`” for in-VCS workspaces

### Suggested delivery sequence

```text
C1  publish gate (external archive branches)
    ↓
C2  project compare P0 (churn + hash + risks + mount)
    ↓
C3  specd-branch-merge skill (consumes C2; documents C1 in repair paths)
    ↓
C4 → C5 → C6   semantic / archive-intent / after-report
    ↓
C7…C10         as needed
```

### Minimal slice if we start tomorrow

1. **C1** alone — stops the worst shared-store footgun.
2. Or **C2+C3** if the priority is agent-assisted branch merges (accept degraded honesty on external until C1/C5).
3. Best minimal product: **C1 + C2 + C3**.

---

## Recommended skill principles (summary)

1. **This is VCS branch merge**, not archive-time spec merge — name and docs
   must say so.
2. **Use the standard VCS merge** for traceability; do not invent a parallel
   integration history as the default.
3. **Pre-merge gate:** branch intake analysis + **config diff both tips** +
   inventory + impact preview + user OK **before** any VCS merge;
   inventory-only mode must be able to exit without merging.
4. **Persist intake into change artifacts** (`proposal.md` exploration of what
   the source brings; `design.md` for reconciliation decisions) — do not leave
   it only in the skill chat.
5. **External/non-VCS specs:** never fake git three-way; load source config via
   mounted source root (and/or VCS show); choose S0–S3 explicitly; label disk
   snapshots honestly (`@now`); detect shared-mutable path aliasing.
6. **Mount/compare via `project compare`** in Phase 1 (CLI owns worktree when
   `--against` is a ref); skill consumes the report; always cleanup by default.
7. **Never blind:** native merge ≠ contract review complete.
8. **Inventory is differential:** path churn → candidates → selective contract
   inspection. Never “compare every spec in the repo”.
9. **Inventory touched specs before merge**; refresh before→after after merge
   (include clean-auto-merge as high-risk) — on the **candidate set**.
10. **Cluster the blast radius**; prefer multiple changes when independent;
    slice intake analysis per change.
11. **VCS resolves files; changes resolve meaning.**
12. **Default: don’t leave permanent specs edited outside archive** (policy A).
13. **Expect delta rewrite** when the other branch moved the base.
14. **Code ↔ spec feedback loop is normal**, not an error path.
15. **Stop for user decisions** at classification, inventory/cluster plan,
    external-spec strategy, merge go/no-go, change creation, conflict +
    contract matrix, and archive.
16. **Delegate lifecycle** to existing skills; this skill only sequences them
    for the branch-merge scenario.

---

## Open questions for a future design session

1. Confirm default conflict policy: A (purity) vs B (mechanical + formalize)?
2. Should the skill refuse to run if unrelated active changes overlap the
   merge cluster, or only warn?
3. Canonical read-only method for base/ours/theirs spec snapshots and the other
   branch’s active changes (git worktree vs `git show` vs temporary checkout)?
4. ~~Naming~~ → leaning **`specd-branch-merge`**; confirm.
5. Is integrating **unfinished** changes from another branch in scope for v1,
   or only “both sides already archived + code conflicts”?
6. Should reconciliation changes use dedicated proposal/design template
   sections (branch intake + decision matrix + before/after checklist)
   enforced by validate rules?
7. Persist the pre-merge inventory where inside the change — proposal only,
   proposal + design, or also a non-schema scratch file under the change dir?
8. Minimum bar for “contract review done” on clean-auto-merged specs — full
   read, outline-only, or requirement-level diff?
9. Default timing: create change(s) and write proposal **before** VCS merge
   (A) vs after (B)?
10. Is “exploration” only a writing style inside `proposal.md`, or do we want
    a schema-level optional artifact later?
11. Default strategy when owned specs are external and source config drifts
    (S0 block vs S1 config-first vs S2 disk snapshot vs S3 side-repo)?
12. Should merging `specd.yaml` itself always be called out as its own cluster /
    change when workspace paths or ownership change?
13. Canonical mount location + cleanup guarantees (under `specdPath/tmp/…` vs
    OS temp)? Require worktree, or allow degraded `git show` mode?
14. Worth a future core/CLI `project compare --against <ref>` so the skill does
    not shell-orchestrate worktrees by hand?

---

## Related existing specs / symbols (research anchors)

- `core:archive-change`, `cli:change-archive`
- `core:delta-format`, `core:preview-spec`, `cli:change-spec-preview`
- `core:validate-artifacts`, `cli:change-validate`
- `core:spec-overlap`, `cli:change-check-overlap`, `detectSpecOverlap`
- `core:vcs-adapter-port`, `VcsAdapter` (read-only)
- `core:change-layout` (specs/ vs deltas/ in change dirs)
- `core:config` / `RepositoryConfig.isExternal` (specs path outside git root)
- `core:vcs-adapter-port`, `VcsAdapter` (read-only — `show` source `specd.yaml`)
- `skills:workflow-automation`
- Existing skill templates under `packages/skills/templates/skills/`

---

## Non-goals (for skill v1)

- Full-catalog “diff every spec against every spec” as the intake strategy
- Silent acceptance of clean auto-merges on candidate specs without contract review
- Replacing git / inventing a parallel integration history as the default
- Automatic silent resolution of semantic spec conflicts
- Teaching agents that permanent `specs/` are free to edit after a merge
- A new archive pipeline
- Multi-VCS merge orchestration beyond what the host already uses (git first)
  )
