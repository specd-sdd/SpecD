# UI Shadcn Migration Checklist

## Goal

Replace custom React UI primitives in `@specd/ui` with shadcn-based composition while preserving the Studio visual identity through tokens, variants, and local wrappers.

Full migration info at: @ui-shadcn-adoption-plan.md

This checklist tracks both:

- implementation work
- artifact work in the active `specd-studio` change

## Recommended Execution Order

This is the recommended order to minimize churn and avoid restyling the same surfaces twice.

1. **Phase 0 + Phase 1 first**
   Why:
   formalizes `packages/ui` as a shadcn host and installs the primitives everything else depends on.

2. **Phase 2 + Phase 3 next**
   Why:
   dialogs and command palette are isolated, high-value, and currently the clearest bespoke primitive reimplementations.

3. **Phase 4 + Phase 5 next**
   Why:
   tabs and accordions are structural primitives reused across the shell; migrating them early prevents duplicate rewrites in later screens.

4. **Phase 6 after that**
   Why:
   once `Card`, `Badge`, `Alert`, and `Separator` exist, overview/status/spec surfaces can be normalized in one pass.

5. **Phase 7 + Phase 8 next**
   Why:
   sidebar chrome and forms become much easier once the shell primitives are already migrated.

6. **Phase 9 after major primitives stabilize**
   Why:
   top bar and shell cleanup should happen after the underlying reusable pieces exist, otherwise it becomes a temporary rewrite.

7. **Phase 10 and Verify/Test follow-up continuously, then close**
   Why:
   the change artifacts should be updated as reality moves, but final normalization of `proposal.md`, `design.md`, `tasks.md`, specs, and verify files should happen once the implementation shape is settled.

## Suggested Work Packages

These are the practical phases we should execute, not just the thematic buckets below.

### Package A — Foundation

- [x] Finish Phase 0
- [x] Finish Phase 1
- [x] Capture the chosen wrapper policy:
      when we keep a local component name like `StudioDialog`, it must become a thin shadcn-backed wrapper, not remain a custom primitive

### Package B — Modal and Palette Primitives

- [x] Finish Phase 2
- [x] Finish Phase 3
- [x] Update affected artifacts in `ui:design-system`, `ui:change-scope-dialog`, `ui:validate-confirm-dialog`, and `ui:command-palette`

### Package C — Navigation Primitives

- [x] Finish Phase 4
- [x] Finish Phase 5
- [x] Revisit `ui:shell-layout`, `ui:change-tab-*`, and `ui:spec-tab-*` artifacts after the new tab/accordion structure is real

### Package D — Shared Surface Primitives

- [x] Finish Phase 6
- [x] Remove or demote `.studio-card` and `.studio-badge` as primary widget implementations
- [x] Update `proposal.md` and `design.md` to describe the new shadcn-backed shell language

### Package E — Sidebar and Form Surfaces

- [x] Finish Phase 7
- [x] Finish Phase 8
- [ ] Review whether `datalist` should stay or be replaced by `Popover` + `Command` for spec/dependency picking

### Package F — Shell Cleanup and Artifact Closure

- [x] Finish Phase 9
- [x] Finish Phase 10
- [ ] Run the verify/test/manual smoke checklist
- [ ] Re-mark only the truly completed tasks in the active change artifacts

## What To Do First

If we want the highest leverage first step, do this:

- [ ] Start with `packages/ui/components.json` and install the missing shadcn primitives
- [ ] Immediately migrate `StudioDialog` and `CommandPalette`

Reason:

- these two migrations establish the real shadcn adoption pattern
- they are isolated enough to do without destabilizing the full shell
- they create the wrapper/composition conventions that the rest of the migration can copy

## Dependency Notes

- Tabs should not be migrated before shadcn `Tabs` is installed and themed
- Accordions should not be migrated before shadcn `Accordion` is installed
- Overview/spec/status panels should not be normalized before `Card`, `Badge`, and `Alert` are ready
- Sidebar cleanup should wait until `Badge`, `Separator`, `Collapsible`, and `ScrollArea` are available
- Artifact cleanup in `proposal.md`, `design.md`, and `tasks.md` should happen incrementally, but the final wording pass should wait until the implementation direction stops moving

## Phase 0 — Baseline

- [x] Confirm `packages/ui` will be treated as the shadcn project root
- [x] Add `packages/ui/components.json`
- [x] Document the exact shadcn aliases for `components`, `lib`, and styles
- [x] Keep [packages/ui/src/styles/globals.css](packages/ui/src/styles/globals.css) as the single theme source
- [x] Decide whether existing custom wrappers stay as thin shadcn-backed adapters or are removed entirely

## Phase 1 — Install Missing shadcn Primitives

- [x] Add `dialog`
- [x] Add `alert-dialog`
- [x] Add `accordion`
- [x] Add `command`
- [x] Add `tabs`
- [x] Add `card`
- [x] Add `badge`
- [x] Add `alert`
- [x] Add `separator`
- [x] Add `scroll-area`
- [x] Add `textarea`
- [x] Add `select`
- [x] Add `tooltip`
- [x] Add `dropdown-menu`
- [x] Add `collapsible`
- [x] Decide if `popover` is also required for scope/dependency pickers
- [x] Decide if `skeleton` should replace current loading placeholders

## Phase 2 — Dialog Migration

### Implementation

- [x] Replace [packages/ui/src/components/StudioDialog.tsx](packages/ui/src/components/StudioDialog.tsx) internals with shadcn `Dialog` or `AlertDialog`
- [x] Migrate [packages/ui/src/components/UnsavedChangesDialog.tsx](packages/ui/src/components/UnsavedChangesDialog.tsx)
- [x] Migrate [packages/ui/src/components/ValidateConfirmDialog.tsx](packages/ui/src/components/ValidateConfirmDialog.tsx)
- [x] Migrate [packages/ui/src/change/ChangeLifecycleConfirmDialog.tsx](packages/ui/src/change/ChangeLifecycleConfirmDialog.tsx)
- [x] Migrate [packages/ui/src/change/ChangeScopeDialog.tsx](packages/ui/src/change/ChangeScopeDialog.tsx)
- [x] Replace long dialog body scrolling with `ScrollArea` where needed

### Artifacts

- [x] Update `ui:design-system` if `StudioDialog` should become a thin shadcn-backed wrapper instead of a custom shell
- [x] Update `ui:change-scope-dialog` spec text if composition rules change
- [x] Update `ui:scope-change-confirm-dialog` if confirm flow markup changes materially
- [x] Review `ui:validate-confirm-dialog` spec/verify against the new shadcn-backed dialog structure
- [x] Update `design.md` to state dialogs are shadcn-backed Studio wrappers, not custom overlays

## Phase 3 — Command Palette Migration

### Implementation

- [x] Replace [packages/ui/src/shell/CommandPalette.tsx](packages/ui/src/shell/CommandPalette.tsx) with `Command` + `Dialog`
- [x] Replace the custom search input with `CommandInput`
- [x] Replace the custom results list with `CommandList` / `CommandGroup` / `CommandItem`
- [x] Preserve existing keyboard shortcuts and action dispatch behavior

### Artifacts

- [x] Expand `ui:command-palette` spec beyond the current minimal placeholder if we want shadcn composition explicitly captured
- [x] Add/adjust verify scenarios for keyboard navigation, empty state, and action selection if missing
- [x] Update `tasks.md` if command-palette work needs to be reopened explicitly

## Phase 4 — Tabs Migration

### Implementation

- [x] Replace [packages/ui/src/tabs/ChangeTabs.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/tabs/ChangeTabs.tsx:1) with a shadcn-backed tabs wrapper
- [x] Replace [packages/ui/src/tabs/SpecTabs.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/tabs/SpecTabs.tsx:1) with a shadcn-backed tabs wrapper
- [x] Remove reliance on `.studio-tab-bar`, `.studio-tab`, `.studio-tab-active` as primary widget implementation
- [ ] Keep Studio density and palette via variants and theme tokens

### Artifacts

- [x] Update `ui:design-system` to say compact horizontal tabs are implemented through shadcn `Tabs`
- [x] Update `ui:shell-layout` if shell composition language should explicitly mention shadcn tabs
- [x] Review `ui:change-tab-*` specs for assumptions tied to custom tab chrome
- [x] Review `ui:spec-tab-*` specs for assumptions tied to custom tab chrome
- [x] Update `proposal.md` and `design.md` to remove any implication that tabs are still bespoke primitives

## Phase 5 — Accordion Migration

### Implementation

- [x] Replace `ArtifactsAccordion` in [packages/ui/src/change/ChangeMainView.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeMainView.tsx:436) with shadcn `Accordion`
- [x] Replace `ContextAccordion` in [packages/ui/src/spec/SpecMainView.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/spec/SpecMainView.tsx:345) with shadcn `Accordion`
- [ ] Decide whether other collapsible regions should use `Accordion` or `Collapsible`

### Artifacts

- [x] Update `ui:design-system` to mention accordion/collapsible composition if we want it codified
- [x] Review `ui:change-tab-artifacts` spec against the new accordion structure
- [x] Review `ui:spec-tab-context` and adjacent spec panels for new accordion semantics
- [x] Add verify coverage for open/close behavior if current scenarios are too loose

## Phase 6 — Card / Badge / Alert / Separator Migration

### Implementation

- [x] Replace the local `Card` helper in [packages/ui/src/change/ChangeOverview.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeOverview.tsx:195) with shadcn `Card`
- [x] Replace `.studio-card` usage in overview/spec/sidebar/panel surfaces with `Card` composition
- [x] Replace `.studio-badge` with `Badge`
- [x] Replace ad hoc bordered warning/error/status blocks with `Alert`
- [x] Replace hand-built section dividers with `Separator`

### Artifacts

- [x] Update `ui:design-system` to state shared shell surfaces use shadcn `Card`/`Badge`/`Alert` primitives customized to Studio density
- [x] Review `ui:change-tab-overview`
- [x] Review `ui:change-tab-validation`
- [x] Review `ui:change-tab-impact`
- [x] Review `ui:spec-tab-overview`
- [x] Review `ui:spec-tab-graph`
- [x] Update `design.md` sections that still describe card-like panels as custom Studio primitives

## Phase 7 — Sidebar and Tree Chrome Migration

### Implementation

- [x] Recompose [packages/ui/src/sidebar/ChangesSidebar.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/sidebar/ChangesSidebar.tsx:1) rows with shadcn-backed `Button` / `Badge`
- [x] Recompose [packages/ui/src/sidebar/WorkspacesSidebar.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/sidebar/WorkspacesSidebar.tsx:1) sections with shared `Card` / `Badge` chrome
- [x] Recompose `GraphSidebarEntry` with shadcn-backed primitives
- [x] Keep the underlying tree logic and selection behavior intact

### Artifacts

- [x] Review `ui:sidebar-changes-in-progress`
- [x] Review `ui:sidebar-changes-drafts`
- [x] Review `ui:sidebar-changes-archive`
- [x] Review `ui:sidebar-changes-discarded`
- [x] Review `ui:sidebar-workspaces-tree`
- [x] Review `ui:sidebar-graph-entry`
- [x] Update any verify scenarios that assume the current custom sidebar shell

## Phase 8 — Form Composition Migration

### Implementation

- [x] Rework [packages/ui/src/connect/ConnectPanel.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/connect/ConnectPanel.tsx:1) around `Card`, `Alert`, `Input`, `Button`
- [x] Replace custom textareas and warning boxes in [packages/ui/src/change/ChangeDescriptionEditor.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeDescriptionEditor.tsx:1)
- [x] Rework [packages/ui/src/change/ChangeInvalidationPolicyEditor.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeInvalidationPolicyEditor.tsx:1) around `Select` if appropriate
- [ ] Rework [packages/ui/src/change/ChangeScopeDialog.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeScopeDialog.tsx:1) form internals with shadcn-friendly composition
- [ ] Decide whether the spec/dependency picker should move from `datalist` to `Popover` + `Command`

### Artifacts

- [x] Review `ui:connect-panel`
- [x] Review `ui:change-description-editor`
- [x] Review `ui:change-invalidation-policy-editor`
- [x] Review `ui:change-scope-dialog`
- [x] Review `ui:hooks-change-scope-patch`
- [x] Update verify files where form semantics, warnings, or picker interactions change

## Phase 9 — Top Bar and Shell Cleanup

### Implementation

- [x] Replace raw top-bar icon buttons in [packages/ui/src/shell/StudioTopBar.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/shell/StudioTopBar.tsx:1) with shadcn-backed `Button`
- [x] Add `Tooltip` to icon-only actions where appropriate
- [x] Add `DropdownMenu` if top-bar utility actions become real menus (not needed for current placeholders)
- [x] Replace semantic scroll panes in [packages/ui/src/shell/ShellLayout.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/shell/ShellLayout.tsx:1) with `ScrollArea` where useful
- [x] Reduce remaining dependency on `studio-*` widget classes

### Artifacts

- [x] Review `ui:shell-layout`
- [x] Review `ui:design-system`
- [x] Review `ui:bottom-panel-output`
- [x] Review `ui:bottom-panel-problems`
- [x] Review `ui:bottom-panel-logs`
- [x] Update `design.md` to describe the final shell as shadcn-composed Studio chrome

## Phase 10 — Artifact Corrections In The Change

- [x] Update `proposal.md` to explicitly state partial shadcn adoption is being replaced by full shadcn-backed composition
- [x] Update `design.md` to list the migration from custom primitives to shadcn-backed Studio wrappers
- [x] Reopen or add tasks in `tasks.md` for each major migration phase above
- [x] Mark only the truly verified tasks as complete
- [x] Decide which existing “complete” UI tasks need to be reopened because implementation does not match the intended shadcn adoption
- [x] If the UI specs are too generic, split or amend them so the shadcn-backed implementation is part of the contract

## Candidate Specs To Review / Amend

- [ ] `ui:design-system`
- [ ] `ui:shell-layout`
- [ ] `ui:command-palette`
- [ ] `ui:connect-panel`
- [ ] `ui:change-tab-artifacts`
- [ ] `ui:change-tab-overview`
- [ ] `ui:change-tab-validation`
- [ ] `ui:change-scope-dialog`
- [ ] `ui:validate-confirm-dialog`
- [ ] `ui:sidebar-changes-in-progress`
- [ ] `ui:sidebar-workspaces-tree`
- [ ] `ui:sidebar-graph-entry`
- [ ] `ui:spec-tab-context`
- [ ] `ui:spec-tab-overview`

## Verify / Test Follow-up

- [ ] Add or update component tests for tabs, dialogs, command palette, and accordions
- [ ] Add or update verify scenarios where new shadcn interactions matter
- [x] Re-run `packages/ui` typecheck and tests
- [ ] Re-run any affected `@specd/api` / `@specd/client` tests if UI contracts changed
- [x] Run a manual smoke for `specd ui serve`
- [ ] Run a manual smoke for change artifact save / conflict flow
- [ ] Run a manual smoke for spec navigation and inspector behavior
- [ ] Run a manual smoke for desktop/web host shells if those surfaces were touched

## Completion Criteria

- [ ] `packages/ui` is a real shadcn host, not just a place with copied button/input files
- [ ] custom React primitives equivalent to `Dialog`, `Tabs`, `Accordion`, `Card`, and related shadcn components have been replaced or reduced to thin shadcn-backed wrappers
- [ ] Studio styling still comes from local theme tokens and variants
- [ ] specs, verify files, proposal, design, and tasks all describe the shadcn-backed reality instead of the previous custom-primitive implementation
