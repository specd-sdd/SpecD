# Design System

## Purpose

SpecD Studio must look and behave like a premium dark IDE for senior engineers and spec-driven workflows—not a marketing SaaS dashboard. This spec defines the shared visual language (tokens, layout model, typography, motion, and component chrome) that every `@specd/ui` surface MUST consume so shell, sidebars, editors, inspectors, and status chrome stay consistent across web and desktop hosts.

## Requirements

### Requirement: visual identity is serious technical and high-density

The product mood MUST be serious, technical, focused, dense, and professional. The UI MUST NOT use playful startup dashboard aesthetics, cartoon visuals, oversized cards, hero sections, large KPI tiles, or excessive whitespace. Inspiration is IDE-grade tooling (Cursor, VS Code, JetBrains) with GitHub-dark surfaces and Linear-dark polish for refinement only—not Linear’s marketing layout patterns.

### Requirement: layout is panel-based IDE chrome not card dashboards

Structure MUST use editor chrome: split panes, resizable panels, dense side navigation, tool windows, inspectors, compact tabs, and a thin status bar. Shell splits (sidebar, editor, inspector, bottom panel) MUST use **`react-resizable-panels` (via shadcn `Resizable`)**. The UI MUST NOT rely on big rounded SaaS widgets, marketing tiles, or card-dashboard composition as the primary layout model.

### Requirement: color tokens use the Studio dark palette

`@specd/ui` MUST expose theme tokens (CSS custom properties or equivalent) with at least these values:

| Token role             | Hex                    |
| ---------------------- | ---------------------- |
| `background.primary`   | `#0D1117`              |
| `background.secondary` | `#161B22`              |
| `background.elevated`  | `#1C2128`              |
| `border.default`       | `#30363D`              |
| `text.primary`         | `#E6EDF3`              |
| `text.secondary`       | `#8B949E`              |
| `text.disabled`        | `#6E7681`              |
| `accent.selection`     | `#58A6FF`              |
| `accent.focus`         | `#1F6FEB`              |
| `semantic.success`     | `#3FB950`              |
| `semantic.warning`     | `#D29922`              |
| `semantic.error`       | `#F85149`              |
| `semantic.lifecycle`   | `#A371F7`              |
| `semantic.info`        | `#39C5CF`              |
| `editor.background`    | `#0D1117` or `#111827` |

Surfaces MUST be dark matte. Glassmorphism and neumorphism MUST NOT be used.

### Requirement: spacing is tight and border radius is small

Padding and gaps MUST be tight but readable (IDE density). Border radius on controls, tabs, and panels MUST be between **4px and 8px** maximum. Large soft rounded corners (pill cards, 16px+ marketing radii) MUST NOT be the default.

### Requirement: typography is technical and compact

UI chrome MUST use a sharp sans stack (Inter, Geist, SF Pro, or IBM Plex Sans). Code and artifact editors MUST use a monospace stack (JetBrains Mono preferred). Type hierarchy MUST be clear and compact—not oversized marketing headings.

### Requirement: icons are minimal outline style

Icons MUST use **`lucide-react`** (outline Lucide set). Decorative or filled cartoon icon sets MUST NOT be used for primary navigation.

### Requirement: elevation uses borders and contrast not heavy shadows

Depth MUST come from border color `#30363D` and background elevation steps (`#161B22`, `#1C2128`). Box shadows MUST be very subtle when present; heavy drop shadows MUST NOT define structure.

### Requirement: hover and selection states are subtle IDE-like

Hover MUST lighten panel backgrounds slightly without flashy animation. Selected list/tree items MUST use clear left-border accent and/or elevated background—not neon glow. Focus rings MAY use `accent.focus` (`#1F6FEB`).

### Requirement: motion is minimal and fast

Transitions MUST be minimal, fast, and IDE-like (**150ms–200ms**). Playful bounce, long easing, or decorative motion MUST NOT be default.

### Requirement: tabs follow compact IDE horizontal chrome

Editor area tabs MUST be compact horizontal IDE tabs (closable when appropriate). Tab chrome MUST use elevated/active background (`#1C2128`) and border separators—not oversized pill tabs.

### Requirement: sidebar follows VS Code Cursor tree patterns

Sidebars MUST implement workspace and change trees using a shared Studio tree composition in `@specd/ui`. The implementation MAY be backed by **`react-arborist`** or by shadcn/Radix-backed collapsible tree rows when a lighter hierarchy is sufficient. In both cases, trees MUST support collapsible nodes, optional status badges, selected-row highlight, and hover/active row chrome consistent with VS Code / Cursor file-tree behaviour.

### Requirement: artifact and inspector surfaces feel like code tooling

Artifact and inspector panes MUST feel like a code editor / inspector: **`@monaco-editor/react`** for raw editing (`#0D1117` / `#111827`), GitHub-dark markdown preview for rendered markdown, and Git-style split diff for delta diff mode. These surfaces MUST NOT look like rich-text blog editors.

### Requirement: bottom panel and status bar are IDE-native

The bottom panel (output, problems, logs, desktop terminal) MUST match IDE tool-window density and borders. Web shell bottom tabs MUST appear left-to-right as **Output**, **Problems**, **Logs**, with **Output** selected by default on mount. A thin status bar MUST show at minimum: workspace, branch (when available), API/server connection status, validation summary, and active runtime profile (local vs remote).

### Requirement: semantic colors map to workflow states

Lifecycle and validation states MUST use the semantic palette: success green, warning amber, error red, lifecycle purple, info cyan—never ad hoc rainbow accents outside the token table.

### Requirement: theme is centralized and mandatory for UI package

`packages/ui` MUST define a single theme module (e.g. `theme/tokens.css`, `globals.css`, Tailwind theme extension) imported at the application root (`SpecdApp`). Feature components MUST consume tokens via Tailwind utilities and CSS variables—not ad hoc hex in feature code.

### Requirement: UI stack uses Tailwind Radix shadcn and named libraries

`@specd/ui` MUST build Studio chrome on this **v1 stack** (no alternate component library):

| Concern            | Library                                                          | Usage                                                                                                  |
| ------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Utility CSS        | **Tailwind CSS**                                                 | Layout, spacing, colors mapped to Studio tokens                                                        |
| Primitives         | **Radix UI** / **Base UI**                                       | Accessible primitives via shadcn components (Dialog, Popover, Combobox, Tabs, etc.)                    |
| Component kit      | **shadcn/ui**                                                    | Copied into `packages/ui/src/components/ui/`; re-themed to IDE density (not default marketing spacing) |
| Variants           | **class-variance-authority** (`cva`)                             | Variant props on shared components                                                                     |
| Class merging      | **tailwind-merge** (+ `clsx` or equivalent)                      | `cn()` helper in `lib/utils.ts`                                                                        |
| Split layout       | **react-resizable-panels**                                       | Sidebar / editor / inspector / bottom splits                                                           |
| Selection & Lists  | **cmdk** / **Base UI**                                           | Command palettes and advanced Combobox implementations                                                 |
| Trees              | **`react-arborist`** or shadcn/Radix-backed tree wrappers        | Changes and workspace sidebars                                                                         |
| Code editor        | **@monaco-editor/react** + **monaco-editor**                     | `ui:artifact-editor` and read-only inspectors                                                          |
| Icons              | **lucide-react**                                                 | Navigation and toolbars                                                                                |
| Terminal (desktop) | **xterm** (+ fit addon as needed) + **node-pty** in main process | `studio-desktop:bottom-panel-terminal` only                                                            |

shadcn components MUST be customized (Tailwind theme + `cva`) to match this spec’s palette, radius, and density. Local names such as `StudioDialog` or sidebar/tree wrappers MUST be thin shadcn/Radix-backed adapters, not reimplemented primitives. Default shadcn “card dashboard” layouts MUST NOT be used for the shell.

Hosts (`studio-web`, `studio-desktop`) MUST configure Tailwind to scan `@specd/ui` sources (or consume a prebuilt UI stylesheet) so utilities compile correctly.

### Requirement: confirmation modals use StudioDialog chrome

Blocking confirmations (unsaved edits, validate drift, save conflicts, and similar Studio modals) MUST use the shared **`StudioDialog`** shell in `@specd/ui` (`packages/ui/src/components/StudioDialog.tsx`), not ad hoc card overlays. `StudioDialog` MUST be implemented as a thin shadcn-backed wrapper around the `Dialog` primitive.

- The viewport **backdrop** MUST **dim** the shell underneath with a semi-transparent scrim (e.g. `bg-black/50` or the shadcn `DialogOverlay` default). The scrim MUST NOT be a solid opaque layer that hides the workspace entirely.
- The **dialog panel** MUST be **fully opaque**: solid `bg-background` (or `background.elevated` token) with `border.default`. The panel MUST NOT use `bg-background/40`, legacy `studio-card` translucency, or glassmorphism—only the panel is solid; the mask stays dimmed.
- Feature specs (e.g. `ui:validate-confirm-dialog`, `ui:inspector-unsaved-draft`) define copy, buttons, and workflow; **presentation** MUST conform to this split.

Radix/shadcn `Dialog` and `AlertDialog` primitives MUST be the underlying implementation for Studio confirmation flows, with `StudioDialog` enforcing consistent composition and density across the application.

## Constraints

- v1 ships **dark theme only**; light theme is out of scope unless a future change adds it.
- Theme tokens are presentation-only; they MUST NOT import `@specd/core`.
- Reference draft `specd-studio-api-and-ui.md` MAY illustrate layouts; this spec wins on colors, density, and anti-patterns.

## Examples

**`packages/ui/package.json` dependencies (illustrative):** `tailwindcss`, `class-variance-authority`, `tailwind-merge`, `clsx`, `lucide-react`, `react-resizable-panels` (via shadcn `Resizable`), `react-arborist`, `@monaco-editor/react`, `monaco-editor`, and Radix packages as required by installed shadcn components.

**Theme + `cn()`:**

```ts
// lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

```css
:root {
  --studio-bg-primary: #0d1117;
  --studio-bg-secondary: #161b22;
  --studio-bg-elevated: #1c2128;
  --studio-border: #30363d;
  --studio-text: #e6edf3;
  --studio-text-muted: #8b949e;
  --studio-accent: #58a6ff;
  --studio-radius-sm: 4px;
  --studio-radius-md: 8px;
  --studio-motion-fast: 150ms;
}
```

### Requirement: flat spec id lists sort ascending

Studio MUST present every **flat** list of qualified spec ids (`workspace:capability-path`) in stable ascending order using `localeCompare`. Implementation is centralized in `packages/ui/src/lib/sort-spec-ids.ts`:

```typescript
export function sortSpecIds(ids: readonly string[]): string[]
```

All consumers MUST call `sortSpecIds` (or an API that delegates to it) before render—no ad hoc `.sort()` on spec ids in feature components.

**In scope (alphabetical):**

| Surface                                                          | Location                                             |
| ---------------------------------------------------------------- | ---------------------------------------------------- |
| Overview read-only scope + deps                                  | `ui:change-specs-readonly-panel`                     |
| Scope dialog cards, dep chips, centralized picker                | `ui:change-scope-dialog`, `ui:spec-picker-dialog`    |
| Scope confirm Add/Remove lines                                   | `ui:hooks-change-scope-patch`                        |
| Artifacts accordion — scope (change/spec), DAG types, spec cards | `ui:change-tab-artifacts` / `group-change-artifacts` |
| Impact tab spec cards                                            | `ui:change-tab-impact` / `merge-impact-view`         |

**Out of scope:** workspace sidebar tree hierarchy (folder structure keeps repository order).

## Spec Dependencies

_none — foundational presentation spec for `@specd/ui`_
