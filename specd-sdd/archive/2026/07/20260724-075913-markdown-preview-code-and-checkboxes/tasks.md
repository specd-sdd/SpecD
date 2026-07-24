# Tasks: markdown-preview-code-and-checkboxes

## 1. Dependencies and styles

- [x] 1.1 Add highlight and Mermaid dependencies to `@specd/ui`
      `packages/ui/package.json` — add `rehype-highlight`, `highlight.js`, and `mermaid` with version ranges consistent with the monorepo
      Approach: run workspace install after editing package.json so lockfile updates; no host package changes required
      (Req: fenced code uses theme-aware syntax highlighting, mermaid fences render as diagrams with lazy load and fallback)

- [x] 1.2 Scope GitHub Dark/Light highlight CSS under Studio markdown preview
      `packages/ui/src/styles/globals.css` — inline GitHub Dark/Light `.hljs-*` token colors under `.studio-markdown-preview--dark` / `--light` (do not rely on Tailwind `@import` of highlight.js CSS)
      Approach: restrict flat `text-foreground` to `:not(pre) > code`; rebuild `build:css` so `dist/styles.css` contains token colors
      (Req: fenced code uses theme-aware syntax highlighting)

- [x] 1.3 Add task-list and Mermaid chrome rules
      `packages/ui/src/styles/globals.css` — `.studio-markdown-preview` task-list spacing; hide leftover native checkbox; Mermaid container overflow/spacing
      Approach: keep existing heading/paragraph/table rules; additive CSS only
      (Req: checked task checkboxes use success green without disabled greying, mermaid fences render as diagrams with lazy load and fallback)

## 2. Shared renderer

- [x] 2.1 Add `useStudioDocumentTheme` helper
      `packages/ui/src/editor/studio-markdown-theme.ts`: `useStudioDocumentTheme` — return `'light' | 'dark'` from `document.documentElement.classList`, observe class mutations
      Approach: default to `'dark'` when `light` class absent; matches SpecdApp/ShellLayout theme application
      (Req: fenced code uses theme-aware syntax highlighting, mermaid fences render as diagrams with lazy load and fallback)

- [x] 2.2 Implement `MarkdownTaskCheckbox`
      `packages/ui/src/editor/StudioMarkdownPreview.tsx`: `MarkdownTaskCheckbox` — Lucide `Square` / `SquareCheck` with `text-studio-success` when checked
      Approach: `role="checkbox"`, `aria-checked`, `aria-disabled="true"`; no focusable disabled native input; no toggle handler
      (Req: checked task checkboxes use success green without disabled greying)

- [x] 2.3 Implement `MermaidBlock` with lazy import and fallback
      `packages/ui/src/editor/MermaidBlock.tsx`: `MermaidBlock` — dynamic `import('mermaid')`, theme from props, render SVG; on error show source + short error
      Approach: unique render ids; `securityLevel: 'strict'`; loading placeholder; never blank sibling content
      (Req: mermaid fences render as diagrams with lazy load and fallback)

- [x] 2.4 Implement `StudioMarkdownPreview`
      `packages/ui/src/editor/StudioMarkdownPreview.tsx`: `StudioMarkdownPreview` — empty state; `react-markdown` + `remark-gfm` + `rehype-highlight`; custom components for task checkbox and mermaid `pre`
      Approach: short-circuit `language-mermaid` before highlight-only output; apply `.studio-markdown-preview` + optional `compact` classes; JSDoc on export
      (Req: shared preview renderer owns Studio markdown chrome, empty content shows an empty state)

## 3. Call-site wiring

- [x] 3.1 Thin-wrap `ArtifactMarkdownPreview`
      `packages/ui/src/editor/ArtifactMarkdownPreview.tsx`: `ArtifactMarkdownPreview` — delegate to `StudioMarkdownPreview`
      Approach: preserve public export name and props `{ content: string }`; empty handling may live in shared component
      (Req: shared preview renderer owns Studio markdown chrome)

- [x] 3.2 Replace Spec context `MarkdownSection` renderer
      `packages/ui/src/spec/SpecMainView.tsx`: `MarkdownSection` — use `StudioMarkdownPreview` with `compact`
      Approach: remove local `ReactMarkdown` / `remarkGfm` usage from this helper
      (Req: shared preview renderer owns Studio markdown chrome)

- [x] 3.3 Replace Tasks tab markdown renderer
      `packages/ui/src/change/ChangeTabPanels.tsx`: `ChangeTasksTab` — use `StudioMarkdownPreview` for markdown artifact content
      Approach: keep non-markdown `pre` fallback for non-md filenames unchanged
      (Req: shared preview renderer owns Studio markdown chrome)

- [x] 3.4 Confirm package exports remain stable
      `packages/ui/src/index.ts` — keep exporting `ArtifactMarkdownPreview`; optionally export `StudioMarkdownPreview` only if needed by hosts
      Approach: do not remove existing named exports
      (Req: shared preview renderer owns Studio markdown chrome)

## 4. Tests and verification (original)

- [x] 4.1 Add unit tests for `StudioMarkdownPreview` behaviors
      `packages/ui/test/studio-markdown-preview.spec.tsx` — empty state; highlighted fence; success-green Lucide check without disabled input; Mermaid success (mocked dynamic import); Mermaid failure keeps sibling prose
      Approach: `@testing-library/react` + vitest; mock `mermaid` module for success/failure paths
      (Req: all original `ui:markdown-preview` verify scenarios)

- [x] 4.2 Run `@specd/ui` test suite
      `packages/ui` — `pnpm --filter @specd/ui test`
      Approach: ensure new tests pass and no unrelated regressions
      (Req: testing plan from design)

- [x] 4.3 Manual Studio check of preview chrome
      Studio web or desktop — open Preview/Spec/Tasks with TS fence, `- [x]` task, valid and invalid `mermaid` fences; toggle Appearance
      Approach: confirm token colors (after CSS rebuild), green checks, diagram, theme switch, and failure fallback without blanking the document
      (Req: design manual / E2E verification)

## 5. Follow-up: Mermaid zoom/pan (added after design reopen)

- [x] 5.1 Add Mermaid viewport transform state and CSS
      `packages/ui/src/editor/MermaidBlock.tsx` + `packages/ui/src/styles/globals.css`: success branch — local `scale` / `translate` state; clipped viewport; CSS `transform: translate(...) scale(...)`
      Approach: clamp scale ~0.5–3; factor 1.25; reset restores identity; relative container for toolbar
      (Req: mermaid diagrams expose icon zoom and pan chrome)

- [x] 5.2 Add Lucide zoom toolbar and pointer pan
      `packages/ui/src/editor/MermaidBlock.tsx`: `MermaidBlock` success UI — `ZoomIn` / `ZoomOut` / `RotateCcw` (or equivalent) icon buttons with `aria-label`; pointer-drag pan with `setPointerCapture` when available
      Approach: toolbar only on success; loading/error omit chrome; stopPropagation on buttons; grab/grabbing cursor on viewport
      (Req: mermaid diagrams expose icon zoom and pan chrome)

- [x] 5.3 Extend unit tests for zoom/pan chrome
      `packages/ui/test/studio-markdown-preview.spec.tsx` — after mocked Mermaid success: zoom controls present; zoom in changes transform; reset restores; loading/error have no zoom toolbar
      Approach: `@testing-library/react` + userEvent/fireEvent; assert transform style or computed scale
      (Req: mermaid diagrams expose icon zoom and pan chrome — verify scenarios)

- [x] 5.4 Re-run `@specd/ui` tests and CSS rebuild
      `packages/ui` — `pnpm --filter @specd/ui test` and `pnpm --filter @specd/ui build:css`
      Approach: confirm token colors remain in `dist/styles.css` and zoom tests pass
      (Req: testing plan from design)

- [x] 5.5 Manual Studio check of Mermaid zoom/pan
      Studio web or desktop — valid Mermaid fence: zoom in/out, pan, reset; invalid fence: no zoom chrome; Appearance toggle still works
      Approach: confirm IDE-grade compact chrome without promo badges
      (Req: design manual / E2E verification)
