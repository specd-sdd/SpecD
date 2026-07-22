# Tasks: host-controlled-list-limits

## 1. Core pagination contract

- [x] 1.1 Update `ListOptions` / `ListMeta` JSDoc on repository port
      `packages/core/src/application/ports/repository.ts`: `ListOptions` — document no default limit, page-requires-limit, after-without-limit, unpaginated `meta.limit === total`
      Approach: replace “defaults to 100” comments with host-controlled semantics from design
      (Req: Shared list pagination types)

- [x] 1.2 Rewrite `paginateList` for host-controlled limits
      `packages/core/src/infrastructure/fs/list-pagination.ts`: `paginateList` — omit default 100; throw `InvalidInputError` when `page` without `limit` (`page requires an explicit limit`) or `page` + `after` (`page and after are mutually exclusive`); after without limit returns remainder; set `meta.limit === total` when unpaginated
      Approach: branch matrix from design Approach §1; import `InvalidInputError` from domain errors; keep cursor comparison helpers
      (Req: Shared list pagination types)

- [x] 1.3 Update `paginateList` unit tests
      `packages/core/test/infrastructure/fs/list-pagination.spec.ts` — cover omitted limit, `page` without limit → `InvalidInputError` / `INVALID_INPUT`, `page` + `after` → same, after-without-limit, explicit limit, empty unpaginated `meta.limit === 0`
      Approach: replace default-100 assertions with new scenarios; assert `.code === 'INVALID_INPUT'` where applicable
      (Req: Shared list pagination types)

- [x] 1.4 Tighten `repository-port` verify delta for error type
      `specd-sdd/changes/20260722-174650-host-controlled-list-limits/deltas/core/repository-port/verify.md.delta.yaml` — “Page without limit is rejected” and “Page and after are mutually exclusive” assert `InvalidInputError` with code `INVALID_INPUT`
      Approach: add AND clauses to existing scenarios; CLI verify deltas updated for `CliValidationError` / `CLI_VALIDATION_ERROR`
      (Req: Shared list pagination types)

## 2. Use cases and internal callers

- [x] 2.1 Remove default limit aggregation in `ListSpecs`
      `packages/core/src/application/use-cases/list-specs.ts`: `execute` — stop using `limit ?? 100`; forward options as provided
      Approach: only include `limit` in forwarded options when defined; aggregate meta from repo results
      (Req: Enumerate specs across all workspaces)

- [x] 2.2 Drop `MAX_SAFE_INTEGER` in `FsSpecRepository.search`
      `packages/core/src/infrastructure/fs/spec-repository.ts`: `search` — call `list()` without artificial unlimited limit
      Approach: `await this.list(undefined)` or `list(undefined, {})`
      (Req: Shared list pagination types)

- [x] 2.3 Drop unlimited-limit hacks in pattern matching / validate-specs
      `packages/core/src/application/use-cases/_shared/spec-pattern-matching.ts` and `validate-specs.ts` — call `list` without `Number.MAX_SAFE_INTEGER`
      Approach: omit `limit` so ports return full catalogs
      (Req: Shared list pagination types)

- [x] 2.4 Drop unlimited-limit hack in code-graph indexer
      `packages/code-graph/src/application/use-cases/index-code-graph.ts` — list specs without magic limit
      Approach: same as 2.3
      (Req: Shared list pagination types)

- [x] 2.5 Confirm change list use cases do not invent defaults
      `ListChanges` / `ListDrafts` / `ListDiscarded` / `ListArchived` execute paths — verify forward-only; fix if any apply `?? 100`
      Approach: grep/read execute methods; remove accidental defaults
      (Req: Shared list pagination types)

## 3. CLI host pagination

- [x] 3.1 Extend CLI `list-pagination` helper for `all` and `defaultLimit`
      `packages/cli/src/helpers/list-pagination.ts`: `parseListPaginationFlags` / `addListPaginationOptions` — accept `--limit all`; optional `defaultLimit`; throw `CliValidationError` (`CLI_VALIDATION_ERROR`) when `page` without numeric limit or `page` + `all` (`--page requires a numeric --limit`); keep existing mutual-exclusion errors for `page` + `--after-key`
      Approach: implement `ParsedLimit` / options from design New constructs; update option help strings
      (Req: cli change-list / drafts / archive / discarded / spec-list Command signature)

- [x] 3.2 Wire change-bucket list commands to host default 100
      `packages/cli/src/commands/change/list.ts`, `drafts/list.ts`, `discarded/list.ts`, `archive/list.ts` — pass `{ defaultLimit: 100 }`
      Approach: call updated helper; ensure `--limit all` omits limit to use case
      (Req: List options forwarding)

- [x] 3.3 Wire `spec list` with no default limit
      `packages/cli/src/commands/spec/list.ts` — parse without `defaultLimit`; truncation hint only when numeric limit truncated
      Approach: keep `allowAfterId: false`; accept `--limit all` as omit
      (Req: cli:spec-list List options forwarding, Output format)

- [x] 3.4 Update CLI list command tests
      `packages/cli/test/commands/change-list.spec.ts`, `drafts-list.spec.ts`, `archive-list.spec.ts`, `discarded-list.spec.ts`, `spec-list.spec.ts` — match verify scenarios for default/`all`/hints; assert `CliValidationError` / `CLI_VALIDATION_ERROR` for `--page` without numeric limit and `--page` + `--limit all`
      Approach: adjust mocks expecting default 100 on specs; add `--limit all` and error-code cases
      (Req: verify scenarios for CLI lists)

## 4. Docs

- [x] 4.1 Update CLI reference for list limits
      `docs/cli/cli-reference.md` — document default 100 for change lists, no default for specs, `--limit all`
      Approach: edit each list command’s flag table/sections
      (Req: CLI command signatures)

- [x] 4.2 Update core use-case docs for host-controlled limits
      `docs/core/use-cases.md` — remove repository/use-case default limit 100 wording; note host injects limit
      Approach: search “limit” / “100” in list-related sections and rewrite
      (Req: Shared list pagination types)

## 5. Core FS / composition regression coverage

- [x] 5.1 Align empty-list and pagination expectations in FS repository tests
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`, `archive-repository.spec.ts`, and related list tests — `meta.limit === 0` when empty without limit; full list when omitted
      Approach: update expected envelopes only where they hard-coded limit 100 for unpaginated calls
      (Req: list returns … / Shared list pagination types)

- [x] 5.2 Align `list-specs` unit/composition tests
      `packages/core/test/application/use-cases/list-specs.spec.ts`, `packages/core/test/composition/use-cases/list-specs.spec.ts` — omitted limit forwards without inventing 100
      Approach: assert repo mock called without limit when execute omits it
      (Req: Enumerate specs across all workspaces)

## 6. Manual verification

- [x] 6.1 Manual E2E checklist from design
      Run `specs list --workspace core --format json`, `changes list --format json`, `changes list --limit all`, and `changes list --limit all --page 2` via `node packages/cli/dist/index.js`
      Approach: compare outputs to Design Testing § Manual / E2E expectations after build
      (Req: CLI verify scenarios)
