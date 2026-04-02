# Verification: External Hook Runner Port

## Requirements

### Requirement: External hook runners declare accepted types

#### Scenario: Accepted types are exposed for dispatch

- **GIVEN** a runner implementation that supports `docker` and `http`
- **WHEN** the runtime inspects the runner before dispatch
- **THEN** it can read those accepted types directly from the runner
- **AND** dispatch decisions do not depend only on the runner's registration name

### Requirement: External hook runners execute explicit external hooks

#### Scenario: Runner receives the full external hook payload

- **GIVEN** an explicit external hook entry with `external.type` set to `docker`, nested opaque config, and template variables
- **WHEN** the external runner executes it
- **THEN** the runner receives the hook type, the nested opaque config payload, and the resolved workflow variables
- **AND** shell-only `HookRunner` responsibilities are not reused for that call

### Requirement: Unknown external hook types are errors

#### Scenario: No runner accepts the hook type

- **GIVEN** an explicit external hook entry of type `webhook`
- **AND** no registered external hook runner declares support for `webhook`
- **WHEN** the runtime attempts dispatch
- **THEN** execution fails with a clear unknown external hook type error
- **AND** the hook is not ignored

### Requirement: Runner results are workflow-compatible

#### Scenario: External runner result can be reported like other hook results

- **GIVEN** an external hook execution that produces success status, exit code, stdout, and stderr
- **WHEN** the workflow runtime records the result
- **THEN** pre-phase failure handling and post-phase reporting can use it without a separate result model
