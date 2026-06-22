# Verification: Command Palette

## Requirements

### Requirement: palette supports global remote search

#### Scenario: Remote search aggregates symbol spec and document hits

- **GIVEN** a search query is entered
- **WHEN** results return
- **THEN** they are grouped by Spec, Code Symbol, and Document hits
- **AND** UI renders icons appropriate to each type

### Requirement: view uses SpecdDataPort hooks only

#### Scenario: Component consumes SpecdDataPort hooks only

- **WHEN** UI package dependency graph is inspected
- **THEN** `@specd/ui` does not import `@specd/core`
- **AND** components call `client:port-*` hooks

#### Scenario: Hook delegates to configured adapter

- **WHEN** component mounts and requests change data
- **THEN** calls go through `SpecdDataPort`
- **AND** no direct repository or kernel import

#### Scenario: Adding a core import fails the boundary

- **WHEN** author introduces `import` from `@specd/core` under `@specd/ui`
- **THEN** lint or build fails
- **AND** data must flow through the port surface

### Requirement: view is composed using shadcn Command and Dialog primitives

#### Scenario: CommandPalette renders CommandDialog

- **WHEN** CommandPalette is open
- **THEN** it renders shadcn `CommandDialog`
- **AND** standard shadcn structure (`CommandInput`, `CommandList`, `CommandGroup`, `CommandItem`) is present

#### Scenario: Keyboard navigation is preserved

- **GIVEN** CommandPalette is open
- **WHEN** user presses ArrowDown or ArrowUp
- **THEN** highlight moves through the list
- **WHEN** user presses Enter
- **THEN** the highlighted action is executed
- **WHEN** user presses Escape
- **THEN** the CommandPalette closes

#### Scenario: Empty state shows when no actions match

- **GIVEN** CommandPalette is open with actions
- **WHEN** user types a query that matches no actions
- **THEN** `CommandEmpty` renders "No matches found."

### Requirement: view surfaces loading and error states

#### Scenario: Hook exposes loading while port call is in flight

- **WHEN** port method is invoked from the component
- **THEN** consumers observe loading state until the promise settles

#### Scenario: Failed fetch shows human-readable error

- **GIVEN** port returns a network or HTTP error
- **WHEN** hook promise rejects
- **THEN** consumers receive an error object
- **AND** UI renders the message instead of stale data

#### Scenario: Save conflict shows HTTP 409 to the user

- **GIVEN** save returns 409 problem+json
- **WHEN** inspector save hook completes with error
- **THEN** UI shows the conflict message
- **AND** editor buffer is not silently replaced
