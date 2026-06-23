# Verification: Hooks Project

## Requirements

### Requirement: hooks expose getProject and getProjectStatus

#### Scenario: getProject returns project DTO

- **WHEN** `hooks-project` mounts
- **THEN** `getProject()` invoked
- **AND** data rendered in shell

#### Scenario: getProjectStatus returns status DTO

- **WHEN** `getProjectStatus()` invoked
- **THEN** counts and graph flags available to UI

#### Scenario: Hooks expose loading and error tuple

- **WHEN** port call fails
- **THEN** `error` populated
- **AND** loading clears

### Requirement: hooks participate in the global project poll

#### Scenario: Project hooks refetch on global poll

- **GIVEN** window focused
- **WHEN** global poll fires
- **THEN** `getProject` and `getProjectStatus` refetch
- **AND** header counts update

#### Scenario: Poll shares dedupe cache with manual refresh

- **WHEN** user triggers manual refresh during poll
- **THEN** single in-flight project request
- **AND** both callers receive result

#### Scenario: Blur pauses project poll

- **GIVEN** window blurred
- **WHEN** poll interval elapses
- **THEN** project hooks not called
- **AND** stale banner may show until focus

### Requirement: hooks dedupe concurrent fetches

#### Scenario: Parallel mounts share in-flight request

- **WHEN** two components mount same hook key
- **THEN** one network call
- **AND** both receive result

#### Scenario: Cache key separates changes

- **WHEN** hooks for change `a` and `b` mount
- **THEN** distinct in-flight keys
- **AND** no cross-change data leak

#### Scenario: Unmount does not cancel shared in-flight

- **GIVEN** request still needed by sibling mount
- **WHEN** one component unmounts
- **THEN** in-flight completes for remaining mount
