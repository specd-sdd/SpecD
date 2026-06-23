# Verification: Bottom Panel Terminal

## Requirements

### Requirement: terminal cwd defaults to open project root

#### Scenario: New terminal uses project root cwd

- **GIVEN** local project is open at `/repo`
- **WHEN** user opens integrated terminal
- **THEN** PTY cwd is `/repo`
- **AND** shell prompt reflects directory

#### Scenario: Remote-only session uses sensible cwd

- **GIVEN** no local project
- **WHEN** terminal opens
- **THEN** cwd falls back to user home or app default
- **AND** does not assume project path

#### Scenario: Closing project disposes terminal sessions

- **WHEN** user closes project
- **THEN** PTY processes are terminated
- **AND** no orphaned shells
