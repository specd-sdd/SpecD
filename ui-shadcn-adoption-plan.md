# UI Shadcn Adoption Plan

## Purpose

This document captures the UI changes still needed in `@specd/ui` to honestly say the Studio interface is built on shadcn/ui rather than only borrowing a couple of primitives.

It is intentionally repo-root local and implementation-focused. It is not a spec artifact.

## Current State

The project is **partially aligned** with shadcn, not actually adopted end-to-end.

What exists today:

- `packages/ui/src/components/ui/button.tsx`
- `packages/ui/src/components/ui/input.tsx`
- `packages/ui/src/lib/cn.ts`
- `packages/ui/package.json` already includes `@radix-ui/react-slot`, `class-variance-authority`, and `tailwind-merge`
- design tokens live in [packages/ui/src/styles/globals.css](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/styles/globals.css:1)

What is missing today:

- no `components.json` under `packages/ui`
- no visible evidence of shadcn project initialization for `packages/ui`
- only `Button` and `Input` are imported from `components/ui`
- most UI structure is still hand-rolled with custom classes like `studio-tab-bar`, `studio-tab`, `studio-sidebar-row`, `studio-card`, `studio-badge`, `studio-scrollbar`

## Evidence

Current shadcn-style usage is narrow:

- [packages/ui/src/connect/ConnectPanel.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/connect/ConnectPanel.tsx:1)
- [packages/ui/src/change/ChangeMainView.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeMainView.tsx:1)
- [packages/ui/src/change/ChangeScopeDialog.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeScopeDialog.tsx:1)
- [packages/ui/src/change/ChangeDescriptionEditor.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeDescriptionEditor.tsx:1)
- [packages/ui/src/change/ChangeOverview.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeOverview.tsx:1)
- [packages/ui/src/change/ChangeLifecycleActions.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeLifecycleActions.tsx:1)
- [packages/ui/src/change/ChangeInvalidationPolicyEditor.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeInvalidationPolicyEditor.tsx:1)
- [packages/ui/src/shell/StudioTopBar.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/shell/StudioTopBar.tsx:1)

The broader shell is still custom:

- [packages/ui/src/tabs/ChangeTabs.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/tabs/ChangeTabs.tsx:1)
- [packages/ui/src/tabs/SpecTabs.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/tabs/SpecTabs.tsx:1)
- [packages/ui/src/sidebar/ChangesSidebar.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/sidebar/ChangesSidebar.tsx:1)
- [packages/ui/src/sidebar/WorkspacesSidebar.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/sidebar/WorkspacesSidebar.tsx:1)
- [packages/ui/src/shell/CommandPalette.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/shell/CommandPalette.tsx:1)
- [packages/ui/src/components/StudioDialog.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/components/StudioDialog.tsx:1)
- [packages/ui/src/shell/ShellLayout.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/shell/ShellLayout.tsx:1)

## Gap Summary

The UI currently uses:

- shadcn-style primitives for isolated controls
- custom CSS utility classes for almost all composition
- custom modal, tab, sidebar, badge, and command-palette implementations
- custom React components that already map to known shadcn primitives

The missing step is not “add more buttons”. The missing step is:

1. initialize `packages/ui` as a real shadcn host
2. replace custom structural primitives with shadcn composition
3. keep Studio tokens, but stop expressing layout/interaction through bespoke `studio-*` widgets where shadcn already has a canonical component

## Adoption Rule

If we already have a custom React component whose job is effectively `Tabs`, `Card`, `Accordion`, `Dialog`, `Badge`, or `Alert`, that component should not remain a bespoke widget with Studio styling.

It should become one of these:

- a thin wrapper around shadcn primitives
- a local composition of shadcn primitives
- or be deleted and replaced directly at call sites

Studio styling should live in:

- theme tokens
- class variants
- local wrapper composition

It should **not** live in parallel reimplementations of primitives that shadcn already solves.

## Required Changes

### 1. Formalize shadcn in `packages/ui`

Needed:

- add `packages/ui/components.json`
- treat `packages/ui` as the shadcn project root
- define the correct aliases for `components`, `lib`, and styles
- keep [packages/ui/src/styles/globals.css](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/styles/globals.css:1) as the single theme file

Outcome:

- shadcn stops being “copied snippets”
- future components can be added and updated consistently

### 2. Replace Custom Dialog Infrastructure

Current custom modal layer:

- [packages/ui/src/components/StudioDialog.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/components/StudioDialog.tsx:1)
- [packages/ui/src/components/UnsavedChangesDialog.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/components/UnsavedChangesDialog.tsx:1)
- [packages/ui/src/components/ValidateConfirmDialog.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/components/ValidateConfirmDialog.tsx:1)
- [packages/ui/src/change/ChangeLifecycleConfirmDialog.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeLifecycleConfirmDialog.tsx:1)
- [packages/ui/src/change/ChangeScopeDialog.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeScopeDialog.tsx:1)

Should move to:

- `Dialog`
- `AlertDialog` for destructive/confirmation flows
- `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`
- Native `overflow-y-auto` + `.studio-scrollbar` inside long dialogs (NOTE: `ScrollArea` was rejected due to flexbox height calculation bugs).

Rationale:

- current accessibility and overlay behavior are hand-maintained
- current action rows and panel chrome are duplicated manually

### 3. Replace Custom Command Palette

Current:

- [packages/ui/src/shell/CommandPalette.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/shell/CommandPalette.tsx:1)

Should move to:

- `Command`
- `CommandInput`
- `CommandList`
- `CommandGroup`
- `CommandItem`
- wrapped in `Dialog`

Rationale:

- current palette manually reimplements filtering, highlighting, keyboard navigation, and dialog chrome
- this is exactly the shadcn `Command` use case

### 4. Replace Custom Tabs

Current:

- [packages/ui/src/tabs/ChangeTabs.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/tabs/ChangeTabs.tsx:1)
- [packages/ui/src/tabs/SpecTabs.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/tabs/SpecTabs.tsx:1)
- `.studio-tab-bar`, `.studio-tab`, `.studio-tab-active` in [packages/ui/src/styles/globals.css](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/styles/globals.css:80)

Should move to:

- `Tabs`
- `TabsList`
- `TabsTrigger`
- `TabsContent` where it improves structure

Rationale:

- current tabs are a custom button strip
- they duplicate pressed/active/disabled states already solved by shadcn
- these components should become Studio-styled shadcn tab compositions, not remain custom tab widgets

### 4b. Replace Custom Accordions

Current:

- `ArtifactsAccordion` inside [packages/ui/src/change/ChangeMainView.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeMainView.tsx:436)
- `ContextAccordion` inside [packages/ui/src/spec/SpecMainView.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/spec/SpecMainView.tsx:345)

Should move to:

- `Accordion`
- `AccordionItem`
- `AccordionTrigger`
- `AccordionContent`

Rationale:

- these are custom React accordions already doing the job of a known primitive
- they should become Studio-styled shadcn accordion compositions

### 5. Replace Custom Cards, Badges, Alerts, Separators

Current custom primitives:

- `.studio-card`
- `.studio-badge`
- several ad hoc bordered sections in overview/status/spec views

Main affected files:

- [packages/ui/src/change/ChangeStatusPanel.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeStatusPanel.tsx:1)
- [packages/ui/src/change/ChangeOverview.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeOverview.tsx:1)
- [packages/ui/src/change/ChangeTabPanels.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeTabPanels.tsx:1)
- [packages/ui/src/spec/SpecMainView.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/spec/SpecMainView.tsx:1)
- [packages/ui/src/spec/SpecOverview.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/spec/SpecOverview.tsx:1)
- [packages/ui/src/sidebar/WorkspacesSidebar.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/sidebar/WorkspacesSidebar.tsx:1)
- [packages/ui/src/sidebar/ChangesSidebar.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/sidebar/ChangesSidebar.tsx:1)

Should move to:

- `Card`
- `CardHeader`
- `CardTitle`
- `CardDescription`
- `CardContent`
- `Badge`
- `Alert`
- `Separator`

Rationale:

- current panels all speak a similar visual language, but each one is manually composed
- adopting `Card` and `Badge` gives a stable shell without losing the Studio theme
- local React components like the `Card` helper in [packages/ui/src/change/ChangeOverview.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeOverview.tsx:195) should become shadcn-backed compositions instead of staying custom panel primitives

### 6. Replace Custom Sidebar Rows and Workspace Tree Chrome

Current:

- `.studio-sidebar-row`
- `.studio-sidebar-row-active`
- `.studio-card` wrappers around workspace sections
- hand-built archive/workspace section headers

Should move to:

- `Button` variants for row interactions where appropriate
- `Collapsible` for workspace section expand/collapse
- Native `overflow-y-auto` + `.studio-scrollbar` for long panes (rejected `ScrollArea` for layout stability)
- `Badge` for counts
- `Separator` between sidebar regions

Rationale:

- the tree logic itself is fine
- the interactive shell around it is still fully bespoke

### 7. Replace Custom Form Composition

Current forms are still hand-built with labels, help text, alerts, and action rows.

Main affected files:

- [packages/ui/src/connect/ConnectPanel.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/connect/ConnectPanel.tsx:1)
- [packages/ui/src/change/ChangeDescriptionEditor.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeDescriptionEditor.tsx:1)
- [packages/ui/src/change/ChangeInvalidationPolicyEditor.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeInvalidationPolicyEditor.tsx:1)
- [packages/ui/src/change/ChangeScopeDialog.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeScopeDialog.tsx:1)

Should move to:

- `Textarea`
- `Select` where policy choices are constrained
- `Popover` + `Command` where searchable spec pickers are needed
- `Alert` for inline warnings/errors
- `Card` or `Field`-style layout once the component set is installed

Rationale:

- current forms mix custom labels, custom warning boxes, and custom action bars
- they look coherent, but they are not composed from the target component system

### 8. Custom Scroll Containers Retained

Current:

- `.studio-scrollbar` is reused all over the app

Decision: **Retain Native Scroll**

- `ScrollArea` (Radix) was evaluated but rejected.
- When placed deeply within complex flexbox and grid layouts (especially `DialogContent` and multi-pane shell layouts), Radix `ScrollArea` frequently failed to correctly calculate its viewport height, resulting in clipped content without scrollbars.
- The project has reverted to using native `overflow-y-auto` coupled with the `.studio-scrollbar` utility class for reliable scrolling across all panels and dialogs.

Keep:

- Theme-level scrollbar styling remains in CSS.

Rationale:

- Native `overflow-auto` provides superior flexbox reliability in dense IDE layouts compared to custom DOM-measuring scroll components.

### 9. Top Bar Needs Real shadcn Composition

Current:

- [packages/ui/src/shell/StudioTopBar.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/shell/StudioTopBar.tsx:1)

Issues:

- search trigger is custom button-like markup
- icon buttons are raw `<button>` elements using sidebar row classes
- no `Tooltip`, `DropdownMenu`, or command-trigger composition

Should move to:

- `Button`
- `Tooltip`
- `DropdownMenu` where those icons become real actions
- command trigger styled as a composed control, not a custom one-off element

### 10. Keep Theme Tokens, Reduce Custom Widget Classes

The theme tokens in [packages/ui/src/styles/globals.css](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/styles/globals.css:1) are not the problem.

Keep:

- color tokens
- typography tokens
- Studio-specific semantic variables

Reduce or delete over time:

- `.studio-tab-bar`
- `.studio-tab`
- `.studio-tab-active`
- `.studio-sidebar-row`
- `.studio-sidebar-row-active`
- `.studio-card`
- `.studio-badge`

These should become:

- theme support classes
- not the primary implementation of widgets that shadcn already provides

## Suggested Component Additions

Minimum shadcn component set to add in `packages/ui`:

- `dialog`
- `alert-dialog`
- `accordion`
- `command`
- `tabs`
- `card`
- `badge`
- `alert`
- `separator`
- `scroll-area`
- `textarea`
- `select`
- `tooltip`
- `dropdown-menu`
- `collapsible`

Optional, depending on how far the migration goes:

- `sheet`
- `popover`
- `skeleton`
- `table`

## Migration Matrix

| Current custom React component / primitive | Current file                                                                                                                                                                              | shadcn target                         | Suggested migration shape                                            | Priority |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------- | -------- |
| `StudioDialog`                             | [packages/ui/src/components/StudioDialog.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/components/StudioDialog.tsx:1)                         | `Dialog` / `AlertDialog`              | replace implementation, keep local Studio wrapper API only if needed | P0       |
| `UnsavedChangesDialog`                     | [packages/ui/src/components/UnsavedChangesDialog.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/components/UnsavedChangesDialog.tsx:1)         | `AlertDialog`                         | compose directly from shadcn confirmation primitives                 | P0       |
| `ValidateConfirmDialog`                    | [packages/ui/src/components/ValidateConfirmDialog.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/components/ValidateConfirmDialog.tsx:1)       | `Dialog` or `AlertDialog`             | move to shadcn-backed modal composition                              | P0       |
| `ChangeLifecycleConfirmDialog`             | [packages/ui/src/change/ChangeLifecycleConfirmDialog.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeLifecycleConfirmDialog.tsx:1) | `AlertDialog`                         | convert destructive lifecycle confirmations to alert-dialog flow     | P0       |
| `ChangeScopeDialog`                        | [packages/ui/src/change/ChangeScopeDialog.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeScopeDialog.tsx:1)                       | `Dialog`, `Alert`                     | keep behavior, replace shell and warning box composition             | P0       |
| `CommandPalette`                           | [packages/ui/src/shell/CommandPalette.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/shell/CommandPalette.tsx:1)                               | `Command` + `Dialog`                  | replace custom search list with shadcn command stack                 | P0       |
| `ChangeTabs`                               | [packages/ui/src/tabs/ChangeTabs.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/tabs/ChangeTabs.tsx:1)                                         | `Tabs`                                | thin Studio wrapper around `TabsList` / `TabsTrigger`                | P1       |
| `SpecTabs`                                 | [packages/ui/src/tabs/SpecTabs.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/tabs/SpecTabs.tsx:1)                                             | `Tabs`                                | thin Studio wrapper around `TabsList` / `TabsTrigger`                | P1       |
| `ArtifactsAccordion`                       | [packages/ui/src/change/ChangeMainView.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeMainView.tsx:436)                           | `Accordion`                           | replace open-state and trigger/content shell with shadcn accordion   | P1       |
| `ContextAccordion`                         | [packages/ui/src/spec/SpecMainView.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/spec/SpecMainView.tsx:345)                                   | `Accordion`                           | replace native `<details>` pattern with shadcn accordion             | P1       |
| `Card` helper                              | [packages/ui/src/change/ChangeOverview.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeOverview.tsx:195)                           | `Card`                                | delete local primitive, recompose with `CardHeader` / `CardContent`  | P1       |
| `.studio-card` as panel primitive          | [packages/ui/src/styles/globals.css](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/styles/globals.css:109)                                         | `Card`                                | demote to helper class or remove after migration                     | P1       |
| `.studio-badge` as count/status primitive  | [packages/ui/src/styles/globals.css](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/styles/globals.css:113)                                         | `Badge`                               | convert counts/status pills to Badge variants                        | P1       |
| `ChangesSidebar` row shell                 | [packages/ui/src/sidebar/ChangesSidebar.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/sidebar/ChangesSidebar.tsx:1)                           | `Button`, `Badge`, `Separator`        | keep list logic, replace row/header/count composition                | P2       |
| `WorkspacesSidebar` section shell          | [packages/ui/src/sidebar/WorkspacesSidebar.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/sidebar/WorkspacesSidebar.tsx:1)                     | `Collapsible`, `Button`, `Badge`      | keep tree logic, replace section chrome and disclosure shell         | P2       |
| `GraphSidebarEntry`                        | [packages/ui/src/sidebar/WorkspacesSidebar.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/sidebar/WorkspacesSidebar.tsx:44)                    | `Button` + `Badge`                    | recompose as shadcn action row                                       | P2       |
| `StudioTopBar` custom triggers             | [packages/ui/src/shell/StudioTopBar.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/shell/StudioTopBar.tsx:1)                                   | `Button`, `Tooltip`, `DropdownMenu`   | replace raw buttons and custom search trigger                        | P2       |
| `ConnectPanel` shell                       | [packages/ui/src/connect/ConnectPanel.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/connect/ConnectPanel.tsx:1)                               | `Card`, `Alert`, `Input`, `Button`    | keep logic, migrate the form shell and feedback blocks               | P2       |
| `ChangeStatusPanel` sections               | [packages/ui/src/change/ChangeStatusPanel.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeStatusPanel.tsx:1)                       | `Card`, `Alert`, `Separator`, `Badge` | replace plain bordered sections with shadcn status composition       | P2       |
| `.studio-scrollbar` overflow regions       | [packages/ui/src/styles/globals.css](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/styles/globals.css:125)                                         | Native `overflow-y-auto`              | keep token styling, rejected `ScrollArea` due to flexbox bugs        | P3       |

Priority legend:

- `P0`: high-leverage primitive reimplementation; should move first
- `P1`: major structural primitive; broad visual payoff
- `P2`: local shell/composition cleanup after primitives exist
- `P3`: polish and consistency sweep

## Migration Order

Recommended order:

1. initialize shadcn properly in `packages/ui`
2. migrate dialogs
3. migrate command palette
4. migrate tabs
5. migrate cards/badges/alerts/separators
6. migrate forms
7. migrate sidebar composition
8. migrate scroll regions
9. clean up obsolete `studio-*` component classes

This order minimizes churn because it starts with the most isolated high-value primitives.

## Definition Of Done

We can say the UI has adopted shadcn when all of the following are true:

- `packages/ui` has a real shadcn config (`components.json`)
- the app shell is composed mostly from shadcn structural primitives, not only `Button` and `Input`
- dialogs, tabs, palette, badges, alerts, and cards are no longer custom one-offs
- `studio-*` classes are theme helpers, not the main widget implementation
- new UI work defaults to checking shadcn components first instead of adding another bespoke primitive

## Short Version

Right now the Studio UI is **styled like a custom design system with two shadcn primitives inside it**.

To finish the migration, we need to:

- formalize shadcn in `packages/ui`
- replace custom dialog/tab/palette/sidebar/card/badge infrastructure
- keep the Studio visual language, but express it through shadcn composition instead of bespoke widgets
