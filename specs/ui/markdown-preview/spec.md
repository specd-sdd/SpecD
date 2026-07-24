# Markdown Preview

## Purpose

Studio renders the same markdown in inspector Preview, Spec context panels, and change Tasks. Without a shared contract, syntax colors, task checkboxes, and Mermaid diagrams drift or look broken (flat code color, gray disabled checkboxes, raw `mermaid` fences, or static diagrams that cannot be inspected at scale). This spec defines the shared Studio markdown preview renderer for those surfaces.

## Requirements

### Requirement: shared preview renderer owns Studio markdown chrome

`@specd/ui` MUST expose a single shared markdown preview renderer used by inspector Preview, Spec context markdown sections, and change Tasks markdown. Call sites MUST NOT reimplement divergent `react-markdown` stacks for those surfaces. The renderer MUST use `react-markdown` with GFM enabled (`remark-gfm` or equivalent) and MUST apply the shared `.studio-markdown-preview` (or successor) chrome styles.

### Requirement: fenced code uses theme-aware syntax highlighting

Fenced code blocks that are not Mermaid MUST render with syntax highlighting so tokens use distinct colors from body text in both Studio dark and light themes. Highlighting MUST use `rehype-highlight` with highlight.js (or an equivalent approved stack that preserves this contract). Dark mode MUST use a GitHub Dark–aligned highlight theme; light mode MUST use a GitHub Light–aligned highlight theme. Highlight theme CSS MUST ship in the built `@specd/ui` stylesheet so hosts that consume `@specd/ui/styles.css` receive token colors without separate highlight CSS wiring. Inline `code` MAY remain unhighlighted but MUST remain visually distinct from surrounding prose.

### Requirement: checked task checkboxes use success green without disabled greying

GFM task-list items MUST present checked and unchecked states visually. Checked items MUST use the Studio success color (`semantic.success` / `--studio-success` / `text-studio-success`). The preview MUST NOT rely on styling a native `input[type=checkbox]:disabled` (or otherwise browser-disabled checkbox) for the checked color—browsers wash those controls gray. The renderer MUST use a custom read-only presentation (Lucide `Square` / `SquareCheck` or equivalent) with appropriate read-only accessibility (`role="checkbox"` and `aria-checked`; not a focusable toggle control). Unchecked items MUST remain neutrally styled. Task checkboxes MUST NOT be interactive toggles in preview.

### Requirement: mermaid fences render as diagrams with lazy load and fallback

Fenced code blocks with language `mermaid` MUST render as read-only Mermaid diagrams. The `mermaid` library MUST be loaded lazily (dynamic import) so the rest of the document remains usable while the module loads. Diagram theme MUST follow the active Studio theme (dark vs light). When Mermaid fails to parse or render, the preview MUST show the original fenced source plus a short human-readable error and MUST NOT blank the rest of the markdown document. Preview MUST NOT provide live Mermaid editing, PNG/SVG export, or other diagram languages.

### Requirement: mermaid diagrams expose icon zoom and pan chrome

When a Mermaid diagram renders successfully, the preview MUST provide compact IDE-grade chrome with icon controls for zoom in, zoom out, and reset view, and MUST allow panning the diagram (pointer drag or equivalent). Zoom/pan chrome MUST NOT appear on loading or failure fallback states. Controls MUST use the shared Lucide (or equivalent outline) icon stack and MUST remain visually secondary to the diagram (no floating promo badges or marketing stickers).

### Requirement: empty content shows an empty state

When markdown content is empty or whitespace-only, the preview MUST show a compact empty-state indicator and MUST NOT throw.

## Constraints

- Monaco raw edit mode is out of scope; this spec covers rendered preview only.
- Feature code MUST consume Studio theme tokens for success color; MUST NOT hard-code ad hoc greens for checked tasks.
- Mermaid and highlight dependencies MAY be added to `@specd/ui`; hosts MUST continue to build without requiring separate Mermaid wiring.
- Zoom/pan is limited to read-only inspection chrome; it MUST NOT become a Mermaid authoring surface.

## Spec Dependencies

- [`ui:design-system`](../design-system/spec.md) — palette tokens (`semantic.success`), GitHub-dark IDE chrome expectations, lucide icon stack, light/dark theme
