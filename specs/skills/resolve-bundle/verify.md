# Verification: skills:resolve-bundle

## Requirements

### Requirement: Input

#### Scenario: With structured render context

- **WHEN** `ResolveBundle` use case is executed with `{ name: 'skill', context }`
- **THEN** recursive variables and capability identifiers from `context` are available to template rendering

#### Scenario: Nested variables are accepted in context.variables

- **WHEN** `ResolveBundle` receives nested data under `context.variables`
- **THEN** that nested structure is preserved when passed to repository rendering

#### Scenario: Without context

- **WHEN** `ResolveBundle` use case is executed with `{ name: 'skill' }`
- **THEN** templates render with an empty install-time context except for any built-in safe values provided through `config`

### Requirement: Output

#### Scenario: Returns resolved bundle with SkillBundle structure

- **WHEN** `ResolveBundle` completes successfully
- **THEN** the output contains a `bundle` field with the resolved `SkillBundle`

### Requirement: Behavior

#### Scenario: Built-in safe values merge with install-time context

- **GIVEN** a `SpecdConfig`
- **AND** install-time context with custom variables and capabilities
- **WHEN** `ResolveBundle` is executed
- **THEN** built-in safe values remain available in the merged render context
- **AND** install-time context values are available to template rendering

#### Scenario: sharedFolder is injected when absent

- **GIVEN** `variables.sharedFolder` is absent
- **WHEN** `ResolveBundle` is executed with `SpecdConfig`
- **THEN** a default relative shared folder value is injected into template rendering

#### Scenario: sharedFolder trailing slash is normalized away

- **GIVEN** `variables.sharedFolder` ends with `/`
- **WHEN** `ResolveBundle` is executed
- **THEN** the rendered `sharedFolder` value omits the trailing `/`

#### Scenario: sharedFolder escaping the project root is rejected

- **GIVEN** `variables.sharedFolder` resolves outside `projectRoot`
- **WHEN** `ResolveBundle` is executed
- **THEN** bundle resolution fails

#### Scenario: projectRoot is not exposed as a template variable

- **GIVEN** `SpecdConfig` includes `projectRoot`
- **WHEN** `ResolveBundle` executes
- **THEN** `projectRoot` is used only for internal validation
- **AND** it is not available as a public template variable

#### Scenario: Structured context drives frontmatter composition

- **GIVEN** a render context with `variables.frontmatter`
- **AND** the `frontmatter` capability is present
- **WHEN** `ResolveBundle` resolves a skill-local markdown template with a frontmatter insertion point
- **THEN** the resulting bundle content includes the composed frontmatter block
