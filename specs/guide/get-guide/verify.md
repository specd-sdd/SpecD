# Verification: Get Guide Query

## Requirements

### Requirement: GetGuideQuery Implementation

#### Scenario: Existing topic is retrieved successfully

- **GIVEN** a catalog containing topic `"workflow"`
- **WHEN** `GetGuideQuery.execute({ topic: "workflow" })` is called
- **THEN** it resolves to the full `GuideTopic` entity
- **AND** `topic.topic` equals `"workflow"`
- **AND** `topic.content` contains the full guide Markdown

#### Scenario: Topic lookup is case-insensitive

- **GIVEN** registered topic `"getting-started"`
- **WHEN** queried with uppercase `"GETTING-STARTED"` or mixed-case `"Getting-Started"`
- **THEN** the query finds and returns the `"getting-started"` guide successfully

#### Scenario: Topic query with '.md' extension strips extension gracefully

- **GIVEN** a query where the user accidentally types `"configuration.md"` instead of `"configuration"`
- **WHEN** `GetGuideQuery.execute({ topic: "configuration.md" })` is evaluated
- **THEN** the query strips the `.md` extension and retrieves the `"configuration"` guide

#### Scenario: Topic query with surrounding whitespace

- **GIVEN** a query with leading/trailing spaces `"  schemas   "`
- **WHEN** `GetGuideQuery.execute({ topic: "  schemas   " })` is evaluated
- **THEN** whitespace is trimmed and the `"schemas"` guide is returned

### Requirement: Topic Not Found Handling

#### Scenario: Unknown topic throws GuideTopicNotFoundError

- **GIVEN** a query for `"non-existent-topic"`
- **WHEN** `GetGuideQuery.execute({ topic: "non-existent-topic" })` is called
- **THEN** it rejects with `GuideTopicNotFoundError`
- **AND** `error.code` strictly equals `'UNKNOWN_GUIDE_TOPIC'`
- **AND** `error.availableTopics` lists all valid topics currently registered

#### Scenario: Typo in topic name provides available topics in error

- **GIVEN** a query with a typo `"workflo"`
- **WHEN** `GetGuideQuery.execute({ topic: "workflo" })` rejects
- **THEN** `error.availableTopics` includes `"workflow"`
- **AND** the error message helps the caller identify the intended topic

#### Scenario: Empty or whitespace-only topic rejects with GuideTopicNotFoundError

- **GIVEN** an empty string `""` or whitespace string `"   "`
- **WHEN** `GetGuideQuery.execute({ topic: "" })` is called
- **THEN** it rejects with `GuideTopicNotFoundError`
- **AND** `error.topic` is empty
