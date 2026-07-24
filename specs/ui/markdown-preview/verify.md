# Verification: Markdown Preview

## Requirements

### Requirement: shared preview renderer owns Studio markdown chrome

#### Scenario: Inspector Spec context and Tasks share one renderer

- **GIVEN** markdown content is shown in inspector Preview, Spec context, and change Tasks
- **WHEN** each surface renders markdown
- **THEN** they use the shared Studio markdown preview renderer
- **AND** they do not each mount a divergent ad-hoc `react-markdown` stack

### Requirement: fenced code uses theme-aware syntax highlighting

#### Scenario: Fenced typescript has token colors in dark mode

- **GIVEN** Studio is in dark theme
- **AND** markdown contains a fenced `typescript` (or other non-mermaid) code block
- **WHEN** the preview renders
- **THEN** code tokens use distinct highlight colors from body text
- **AND** the highlight theme is GitHub Dark–aligned

#### Scenario: Fenced code uses GitHub Light in light mode

- **GIVEN** Studio is in light theme
- **AND** markdown contains a fenced non-mermaid code block
- **WHEN** the preview renders
- **THEN** tokens use a GitHub Light–aligned highlight theme
- **AND** tokens remain visually distinct from prose

#### Scenario: Highlight styles ship in the UI stylesheet

- **GIVEN** a host consumes `@specd/ui/styles.css` (or the package built stylesheet)
- **WHEN** fenced code renders with `hljs` token classes
- **THEN** token color rules are present in that stylesheet
- **AND** hosts do not need a separate highlight.js CSS import for preview colors

### Requirement: checked task checkboxes use success green without disabled greying

#### Scenario: Checked task uses success color without disabled input

- **GIVEN** markdown contains a GFM task list with a checked item
- **WHEN** the preview renders
- **THEN** the checked indicator uses Studio success color (`text-studio-success` / `--studio-success`)
- **AND** the checked appearance is not a browser-disabled native checkbox washed gray

#### Scenario: Task checks are read-only

- **GIVEN** a rendered task list in preview
- **WHEN** the user attempts to toggle a checkbox control
- **THEN** the check state does not change via an interactive toggle
- **AND** accessibility exposes checked state without requiring a focusable form control

### Requirement: mermaid fences render as diagrams with lazy load and fallback

#### Scenario: Valid mermaid fence renders a diagram

- **GIVEN** markdown contains a fenced `mermaid` block with valid diagram source
- **WHEN** the preview renders and Mermaid finishes loading
- **THEN** a diagram is shown instead of only plain highlighted code
- **AND** Mermaid was loaded via lazy/dynamic import

#### Scenario: Invalid mermaid shows source and error without blanking preview

- **GIVEN** markdown contains an invalid `mermaid` fence plus surrounding prose
- **WHEN** Mermaid fails to parse or render
- **THEN** the preview shows the original fenced source and a short error message
- **AND** surrounding markdown content remains visible

### Requirement: mermaid diagrams expose icon zoom and pan chrome

#### Scenario: Successful diagram exposes zoom controls

- **GIVEN** a valid Mermaid fence has finished rendering
- **WHEN** the diagram is shown
- **THEN** icon controls for zoom in, zoom out, and reset view are available
- **AND** activating zoom in increases the diagram scale relative to the prior view

#### Scenario: User can pan a zoomed diagram

- **GIVEN** a successfully rendered Mermaid diagram
- **WHEN** the user pans via pointer drag (or equivalent)
- **THEN** the diagram viewport translates
- **AND** the diagram remains visible within the preview container

#### Scenario: Loading and error states omit zoom chrome

- **GIVEN** a Mermaid fence is loading or has failed to render
- **WHEN** those states are shown
- **THEN** zoom/pan icon chrome is not presented
- **AND** the loading or source+error fallback remains usable

### Requirement: empty content shows an empty state

#### Scenario: Empty buffer shows empty indicator

- **GIVEN** markdown content is empty or whitespace-only
- **WHEN** the preview mounts
- **THEN** a compact empty-state indicator is shown
- **AND** no render exception escapes to the host
