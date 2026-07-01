# Verification: Design System

## Requirements

### Requirement: visual identity is serious technical and high-density

#### Scenario: Root layout uses panel chrome not marketing cards

- **WHEN** `SpecdApp` renders the main workspace
- **THEN** primary structure is sidebar + tab editor + inspector + bottom host
- **AND** no hero or KPI card grid is the main layout

#### Scenario: Default density is IDE-tight

- **WHEN** shell sidebars and tab strip are measured in Storybook or screenshot test
- **THEN** vertical rhythm matches compact IDE spacing
- **AND** whitespace is not marketing-loose

#### Scenario: Playful dashboard motifs are absent

- **WHEN** UI surfaces are reviewed against design-system anti-patterns
- **THEN** no oversized rounded cards dominate the home view
- **AND** no cartoon illustration set is used for navigation

### Requirement: layout is panel-based IDE chrome not card dashboards

#### Scenario: Resizable split regions use react-resizable-panels

- **WHEN** user adjusts sidebar or inspector width
- **THEN** `PanelGroup` / `PanelResizeHandle` from `react-resizable-panels` (via shadcn `Resizable`) drives the split
- **AND** layout remains panel-based

#### Scenario: Bottom panel is a tool window host

- **WHEN** shell mounts with bottom panel visible
- **THEN** bottom region uses IDE tool-window chrome
- **AND** default tab is Output
- **AND** layout is not a floating marketing modal

#### Scenario: Status bar is a thin strip

- **WHEN** shell is fully mounted
- **THEN** a bottom status bar is visible
- **AND** height is thin (IDE-style, not a footer section)

### Requirement: color tokens use the Studio dark palette

#### Scenario: Theme module exports primary background token

- **WHEN** theme tokens are read from `@specd/ui` theme module
- **THEN** `background.primary` resolves to `#0D1117`
- **AND** components reference the token not a divergent hex

#### Scenario: Semantic colors match spec table

- **WHEN** success warning error lifecycle info tokens are inspected
- **THEN** values are `#3FB950`, `#D29922`, `#F85149`, `#A371F7`, `#39C5CF` respectively

#### Scenario: Glass and neumorphism styles are not applied

- **WHEN** global styles are scanned
- **THEN** no `backdrop-filter` glass panels are required for chrome
- **AND** no inset neumorphic shadows on primary panels

### Requirement: spacing is tight and border radius is small

#### Scenario: Interactive controls use at most 8px radius

- **WHEN** buttons tabs and panel corners are inspected
- **THEN** border-radius is between 4px and 8px
- **AND** no default 16px+ card radius on chrome

#### Scenario: Padding follows compact scale

- **WHEN** sidebar row and tab strip padding are measured
- **THEN** values align with documented compact spacing scale
- **AND** not desktop-marketing loose padding

#### Scenario: Adding pill-card radius fails review

- **WHEN** contributor sets 24px radius on shell panels
- **THEN** visual regression or design review flags the change
- **AND** tokens must be used instead

### Requirement: typography is technical and compact

#### Scenario: UI font stack is technical sans

- **WHEN** shell typography CSS is inspected
- **THEN** sans family is Inter Geist SF Pro or IBM Plex Sans stack
- **AND** body size is compact not hero-sized

#### Scenario: Editor surfaces use monospace

- **WHEN** artifact raw editor mounts
- **THEN** font family includes JetBrains Mono or equivalent
- **AND** line height suits code density

#### Scenario: Headings do not dominate viewport

- **WHEN** change overview tab renders
- **THEN** heading scale stays within compact hierarchy
- **AND** no marketing H1 dominates the pane

### Requirement: icons are minimal outline style

#### Scenario: Navigation uses lucide-react icons

- **WHEN** sidebar and command palette icons render
- **THEN** icons import from `lucide-react`
- **AND** not filled cartoon sets

#### Scenario: Icon size is compact

- **WHEN** tree rows render icons
- **THEN** icon box matches IDE density (~16px class)
- **AND** not oversized decorative glyphs

#### Scenario: Replacing icons with emoji nav fails guideline

- **WHEN** contributor uses emoji as primary nav icons
- **THEN** change is rejected in review
- **AND** Lucide equivalents must be used

### Requirement: elevation uses borders and contrast not heavy shadows

#### Scenario: Panels separate with border color

- **WHEN** sidebar meets editor area
- **THEN** separator uses `#30363D` border token
- **AND** not a heavy drop shadow gutter

#### Scenario: Active pane uses elevated background

- **WHEN** user focuses editor pane
- **THEN** background may use `#1C2128`
- **AND** shadow if any is subtle

#### Scenario: Heavy shadow cards are not default

- **WHEN** inspector panel styles are inspected
- **THEN** `box-shadow` is none or minimal on static chrome
- **AND** structure does not rely on 24px blur cards

### Requirement: hover and selection states are subtle IDE-like

#### Scenario: Tree selection uses left accent

- **WHEN** user selects a change in sidebar
- **THEN** row shows elevated background or left border accent
- **AND** not neon outer glow

#### Scenario: Hover lightens panel slightly

- **WHEN** pointer hovers sidebar row
- **THEN** background shifts one elevation step
- **AND** no scale-bounce animation

#### Scenario: Focus ring uses focus blue token

- **WHEN** keyboard focus moves to a control
- **THEN** focus indicator may use `#1F6FEB`
- **AND** remains visible without glow bloom

### Requirement: motion is minimal and fast

#### Scenario: Default transition duration within 150-200ms

- **WHEN** theme motion tokens are read
- **THEN** standard UI transition is 150ms–200ms
- **AND** not 500ms+ decorative easing by default

#### Scenario: Tab switch does not bounce

- **WHEN** user changes editor tab
- **THEN** content swap has no bounce animation
- **AND** optional fade is ≤200ms

#### Scenario: Long playful motion is opt-out of defaults

- **WHEN** global animation stylesheet is scanned
- **THEN** no `bounce` or `spring` keyframes on shell chrome by default
- **AND** IDE-fast transitions only

### Requirement: tabs follow compact IDE horizontal chrome

#### Scenario: Tab strip is horizontal and compact

- **WHEN** multiple artifacts are open
- **THEN** tabs render in a horizontal strip
- **AND** height matches IDE tab bar not browser pill tabs

#### Scenario: Active tab uses elevated background

- **WHEN** a tab is selected
- **THEN** active tab background uses elevated token
- **AND** inactive tabs sit on secondary background

#### Scenario: Closable tabs show close affordance

- **WHEN** tab is closable per shell rules
- **THEN** close control is compact on the tab row
- **AND** not a large floating chip

### Requirement: sidebar follows VS Code Cursor tree patterns

#### Scenario: Tree nodes collapse and expand via shared Studio tree composition

- **WHEN** workspace tree has nested specs
- **THEN** tree renders through the shared Studio tree wrapper
- **AND** chevron toggles collapse state and children hide when collapsed

#### Scenario: Selected row is clearly highlighted

- **WHEN** user selects a tree item
- **THEN** highlight matches design-system selection rules
- **AND** persists while selected

#### Scenario: Row actions appear on hover

- **WHEN** pointer hovers a tree row with actions
- **THEN** secondary actions may reveal
- **AND** default row stays dense without always-on buttons

### Requirement: titlebar respects platform window-control safe zones

#### Scenario: Windows applies right safe zone padding

- **GIVEN** root `data-platform="win32"`
- **WHEN** titlebar layout is measured
- **THEN** right padding reserves ~138px for window controls
- **AND** interactive controls sit left of that zone

#### Scenario: macOS applies left traffic-light inset

- **GIVEN** root `data-platform="darwin"`
- **WHEN** titlebar layout is measured
- **THEN** left traffic slot reserves ~96px for traffic lights and gap before toggle

#### Scenario: Sidebar background matches panel tokens

- **WHEN** sidebar renders in dark or light theme
- **THEN** `--sidebar-background` resolves to the same palette as `--panel`

### Requirement: activity rail and titlebar use IDE-native density

#### Scenario: Collapsed shadcn sidebar icon rail is 48px wide

- **WHEN** sidebar is collapsed (`collapsible="icon"`)
- **THEN** `--sidebar-width-icon` resolves to 48px

#### Scenario: Sidebar rail tooltips are opaque

- **GIVEN** sidebar collapsed
- **WHEN** user hovers a rail icon with tooltip
- **THEN** tooltip background is opaque (uses popover or panel tokens)

### Requirement: artifact and inspector surfaces feel like code tooling

#### Scenario: Raw editor uses dark code background

- **WHEN** artifact opens in raw mode
- **THEN** editor background is `#0D1117` or `#111827`
- **AND** Monaco-like chrome is used

#### Scenario: Markdown preview uses GitHub dark styling

- **WHEN** markdown preview renders
- **THEN** prose colors match GitHub dark markdown aesthetic
- **AND** not a bright blog theme

#### Scenario: Diff mode uses split diff layout

- **WHEN** delta full diff is shown
- **THEN** split diff presentation is available
- **AND** aligns with Git diff visual language

### Requirement: bottom panel and status bar are IDE-native

#### Scenario: Bottom panel tabs match tool window style

- **WHEN** user inspects the bottom tab strip on mount
- **THEN** tab order is Output, Problems, Logs
- **AND** Output is selected by default
- **AND** bottom chrome uses IDE tab strip styling from design tokens

#### Scenario: Status bar shows workspace and connection fields

- **WHEN** project is connected
- **THEN** status bar shows workspace label
- **AND** API or server status indicator

#### Scenario: Status bar shows authentication and loading activity

- **WHEN** project connection requires auth or a background task runs
- **THEN** status bar reflects authentication type for remote sessions
- **AND** shows active loading status with spinner when loading is active

### Requirement: semantic colors map to workflow states

#### Scenario: Error state uses error red token

- **WHEN** validation reports blocking error
- **THEN** UI accent for error is `#F85149`
- **AND** not an off-palette pink

#### Scenario: Lifecycle state uses purple accent

- **WHEN** change state badge renders designing or ready
- **THEN** lifecycle accent may use `#A371F7`
- **AND** consistent across sidebars and tabs

#### Scenario: Success toast or badge uses green token

- **WHEN** save succeeds
- **THEN** success feedback uses `#3FB950`
- **AND** not arbitrary teal unless info semantic

### Requirement: theme is centralized and mandatory for UI package

#### Scenario: SpecdApp imports theme at root

- **WHEN** application bundle loads
- **THEN** theme module is imported once at `SpecdApp` root
- **AND** CSS variables apply to `document` or app root

#### Scenario: Feature components use tokens not stray hex

- **WHEN** a random UI component stylesheet is sampled
- **THEN** colors reference `var(--studio-*)` or exported token constants
- **AND** raw hex duplicates are limited to theme definition files

#### Scenario: Theme module has no core dependency

- **WHEN** `@specd/ui` dependency graph is inspected
- **THEN** theme module does not import `@specd/core`
- **AND** remains presentation-only

### Requirement: UI stack uses Tailwind Radix shadcn and named libraries

#### Scenario: package.json declares the v1 UI stack

- **WHEN** `@specd/ui` dependencies are inspected
- **THEN** `tailwindcss`, `class-variance-authority`, `tailwind-merge`, `lucide-react`, `react-resizable-panels` (via shadcn `Resizable`), and `@monaco-editor/react` are present
- **AND** tree composition is implemented either with `react-arborist` or shared shadcn/Radix-backed wrappers
- **AND** Radix packages required by shadcn components are present

#### Scenario: shadcn components live under components ui

- **WHEN** repository layout is inspected
- **THEN** shadcn primitives exist under `packages/ui/src/components/ui/`
- **AND** `lib/utils.ts` exports `cn()` using `tailwind-merge`

#### Scenario: shadcn chrome is re-themed to IDE tokens

- **WHEN** Button Tabs and Dialog samples are rendered
- **THEN** Tailwind classes resolve to Studio dark palette density
- **AND** default shadcn card-dashboard marketing layout is not used for shell

### Requirement: confirmation modals use StudioDialog chrome

#### Scenario: StudioDialog backdrop dims but does not fully hide the shell

- **WHEN** a blocking confirmation modal (unsaved or validate) is open
- **THEN** the scrim uses semi-transparent black (e.g. `bg-black/50`)
- **AND** underlying sidebar or editor remains visibly dimmed, not replaced by a solid black sheet

#### Scenario: StudioDialog panel is opaque

- **WHEN** the confirmation panel renders
- **THEN** panel background is solid `bg-background` (or elevated token)
- **AND** not `bg-background/40` or other translucent card styling on the panel itself

#### Scenario: Feature modals reuse StudioDialog

- **WHEN** `ValidateConfirmDialog` or `UnsavedChangesDialog` mounts
- **THEN** both compose `StudioDialog` for chrome
- **AND** do not implement a separate translucent panel shell

### Requirement: flat spec id lists sort ascending

#### Scenario: sortSpecIds orders workspace-qualified ids

- **WHEN** `sortSpecIds(['ui:z', 'core:a', 'api:m'])` is called
- **THEN** result is `['api:m', 'core:a', 'ui:z']`

#### Scenario: sortSpecIds does not mutate input

- **GIVEN** input array `['b', 'a']`
- **WHEN** `sortSpecIds` runs
- **THEN** input remains `['b', 'a']` and output is `['a', 'b']`

#### Scenario: Overview scope list follows design-system order

- **GIVEN** `ChangeSpecsReadonlyPanel` with `specIds` `['ui:z', 'core:a']`
- **WHEN** panel renders
- **THEN** rows appear as `core:a` then `ui:z`

#### Scenario: Scope dialog cards follow design-system order

- **GIVEN** draft scope `['ui:z', 'api:m', 'core:a']` in `studio-change-scope-spec-cards`
- **WHEN** dialog shows the edit step
- **THEN** card headers appear `api:m`, `core:a`, `ui:z`

### Requirement: top bar exposes docs, notifications, and theme controls

#### Scenario: Docs button links to getting-started guide

- **WHEN** user clicks on Docs button
- **THEN** app redirects or opens default browser to `https://getspecd.dev/docs/guide/getting-started`

#### Scenario: Notifications popover displays health checks and conflicts

- **GIVEN** stale graph index is true, fingerprint mismatch is true, or change overlaps are detected
- **WHEN** user clicks on Notifications button
- **THEN** popover renders distinct cards for each active graph warning type when present in `graph.warnings` or boolean fallbacks
- **AND** indicator badge is visible on notifications button

#### Scenario: Appearance button toggles theme between light and dark

- **WHEN** user clicks on Appearance button
- **THEN** visual theme toggles between light and dark modes
- **AND** preference is persisted in user storage

#### Scenario: Stored theme preference is applied synchronously at startup

- **GIVEN** a stored theme preference (e.g. `light`) in user storage
- **WHEN** the host application bootstraps (web or desktop)
- **THEN** the stored theme class (e.g. `light`) is applied to `document.documentElement` immediately
- **AND** UI elements like the loading screen and project dialog render in the correct theme without a flash

#### Scenario: Background validation checks are deferred at startup

- **GIVEN** the top bar is rendered during project loading or initial startup
- **WHEN** the component mounts
- **THEN** overlaps and closed-spec validations are not invoked immediately
- **AND** the checks remain disabled until the loading phase completes and a 3-second delay has elapsed
