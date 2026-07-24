# Proposal: markdown-preview-code-and-checkboxes

## Motivation

Studio markdown preview is hard to scan: fenced code blends into body text, checked GFM task items look gray instead of success green, and Mermaid fenced blocks show as plain code instead of diagrams. Large diagrams are also hard to inspect without zoom and pan. Fixing these makes artifact Preview, Spec context, and Tasks reads feel like IDE tooling rather than plain prose.

## Current behaviour

Markdown is rendered with `react-markdown` + `remark-gfm` under `.studio-markdown-preview` (inspector Preview, Spec context sections, Tasks tab). Code uses flat `text-foreground` with no token colors. GFM task lists use disabled native checkboxes, which browsers grey out even when checked—so CSS color alone cannot show a clear green checked state. Fenced `mermaid` blocks either were plain code or (in the in-progress implementation) render as static diagrams without zoom/pan chrome.

## Proposed solution

Define and implement a shared Studio markdown preview contract:

1. Theme-aware syntax highlighting for fenced code (non-Mermaid).
2. Custom (non–disabled-native) presentation for task checkboxes so checked items use semantic success green.
3. Read-only Mermaid rendering for fenced `mermaid` blocks, with lazy-loaded `mermaid`, Studio dark/light theme alignment, a readable fallback when parsing/rendering fails, and **compact zoom/pan chrome** (icon controls for zoom in, zoom out, reset, and pan) so large diagrams remain inspectable in preview.

Align lightly with the existing design-system “GitHub-dark markdown preview” expectation without changing Monaco edit mode. Change name stays `markdown-preview-code-and-checkboxes`.

## Specs affected

### New specs

- `ui:markdown-preview`: Requirements for the shared Studio markdown preview renderer—syntax-colored fenced code in dark and light themes; read-only GFM task checkboxes whose checked state is visibly success green without relying on styling disabled native inputs; and read-only Mermaid diagrams for fenced `mermaid` blocks with theme-aware styling, graceful failure fallback, and icon-based zoom/pan chrome.
  - Depends on: `ui:design-system`

### Modified specs

- `ui:design-system`: Clarify that rendered markdown preview MUST use GitHub-aligned syntax colors for fenced code, MUST use `semantic.success` for checked task indicators, and MUST render Mermaid fenced blocks as diagrams consistent with IDE-grade inspector surfaces (including lightweight zoom/pan chrome). Exact wording in delta.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- Package: `@specd/ui` (`packages/ui`)
- Likely surfaces: shared markdown preview component(s), `MermaidBlock` chrome, `ArtifactMarkdownPreview`, Spec context markdown sections, Tasks markdown cards, `.studio-markdown-preview` styles in `globals.css`
- New UI dependencies: `rehype-highlight` (+ highlight.js styles), `mermaid` (lazy-loaded)
- No API, kernel, or Monaco editor contract changes
- Out of scope: live Mermaid editing, PNG/SVG export, other diagram languages (PlantUML, etc.)

## Technical context

- Preview only (read-only); not interactive checkbox toggling; not Monaco highlighting.
- User constraint: checked green MUST NOT be attempted solely by coloring `input[type=checkbox]:disabled`—browsers wash those out; custom `react-markdown` component (or equivalent non-disabled visual) is required.
- Success green SHOULD map to design-system `semantic.success` / `--studio-success` (`#3FB950` dark / `#1a7f37` light).
- Existing stack: `react-markdown`, `remark-gfm`, `lucide-react`; highlighter + Mermaid added in this change.
- Prefer one shared renderer so inspector, Spec context, and Tasks stay consistent.
- Mermaid MUST be loaded lazily (dynamic import) because the package is large; until loaded, show a compact loading state or leave the fenced source visible briefly without blocking the rest of the document.
- Mermaid theme follows Studio theme (dark/light). On render/parse failure, show the original fenced source plus a short error message—never blank the whole preview.
- Highlight theme CSS MUST ship in the built `@specd/ui` stylesheet (Tailwind CLI does not resolve nested `@import` without `postcss-import`; prefer inlined scoped GitHub Dark/Light token rules in `globals.css`).
- **Mermaid zoom/pan (added 2026-07-24 after user feedback):** Successful diagrams MUST expose compact icon controls (zoom in, zoom out, reset view) and pan (drag or equivalent) over the rendered SVG. Keep chrome IDE-grade and lightweight—no floating marketing badges. Failure/loading states do not need zoom chrome.

### Resolved decisions (2026-07-24)

1. **Highlighter:** `rehype-highlight` + highlight.js (lighter than Shiki; enough for artifact preview).
2. **Task checkboxes:** Lucide icons (`Square` / `SquareCheck` or equivalent) with `text-studio-success` when checked; read-only a11y (`role="checkbox"` + `aria-checked`, not a focusable/togglable control).
3. **Code themes:** GitHub Dark in Studio dark mode, GitHub Light in Studio light mode (matches design-system “GitHub-dark markdown preview”; not remapped to Studio CSS variables).
4. **Mermaid:** Support fenced `mermaid` in the shared preview; lazy-load `mermaid`; dark/light theme; parse/render failure → source + error fallback. Keep change name. No live editor / PNG-SVG export / other diagram languages.
5. **Mermaid zoom/pan:** In scope after preview feedback—icon toolbar (zoom in / out / reset) plus pan of the rendered diagram. (Previously listed as out of scope; superseded by this decision.)

## Open questions

None — decisions above are settled for specs and design.
