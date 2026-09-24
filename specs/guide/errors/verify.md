# Verification: Guide Errors

## Requirements

### Requirement: SpecdGuideError Base Class

#### Scenario: Base error has specd discriminator flag

- **GIVEN** an instance of a concrete subclass extending `SpecdGuideError`
- **WHEN** inspected as a generic object
- **THEN** `error.specd` is strictly `true`
- **AND** `error.name` matches the concrete error class name

#### Scenario: Code property is immutable and upper snake case

- **GIVEN** an instance of `SpecdGuideError`
- **WHEN** reading `error.code`
- **THEN** it matches the regular expression `^[A-Z0-9_]+$`
- **AND** attempting to reassign `error.code = 'OTHER'` in strict mode throws a TypeError

#### Scenario: Stack trace is preserved

- **GIVEN** an error thrown within `@specd/guide`
- **WHEN** caught in a `try...catch` block
- **THEN** `error.stack` is defined
- **AND** contains the call site where the error was thrown

### Requirement: GuideTopicNotFoundError

#### Scenario: Error properties populate requested topic and available topics

- **GIVEN** an attempt to lookup topic `"nonexistent-guide"`
- **WHEN** `GuideTopicNotFoundError` is thrown
- **THEN** `error.code` is strictly `'UNKNOWN_GUIDE_TOPIC'`
- **AND** `error.topic` is `'nonexistent-guide'`
- **AND** `error.availableTopics` is a non-empty array containing all registered topics
- **AND** `error.message` includes `"nonexistent-guide"` and lists available topics

#### Scenario: Requested topic with special characters or whitespace

- **GIVEN** an invalid topic query `"--malicious/path../"`
- **WHEN** `GuideTopicNotFoundError` is thrown
- **THEN** `error.topic` preserves the raw string `"--malicious/path../"` without crashing or escaping issues
- **AND** `error.availableTopics` remains unmodified

#### Scenario: Empty string topic query

- **GIVEN** an empty string `""` passed as topic
- **WHEN** `GuideTopicNotFoundError` is thrown
- **THEN** `error.code` is `'UNKNOWN_GUIDE_TOPIC'`
- **AND** `error.topic` is `""`
- **AND** `error.message` informs the caller that the topic name was empty

### Requirement: GuideSectionNotFoundError

#### Scenario: Error properties populate requested heading and guide headings

- **GIVEN** guide topic `"workflow"` with sections `["Lifecycle States", "Approvals"]`
- **WHEN** section `"NonExistentSection"` is requested
- **THEN** `GuideSectionNotFoundError` is thrown
- **AND** `error.code` is strictly `'UNKNOWN_GUIDE_SECTION'`
- **AND** `error.heading` is `'NonExistentSection'`
- **AND** `error.availableHeadings` contains `["Lifecycle States", "Approvals"]`
- **AND** `error.message` lists the available headings for guidance

#### Scenario: Section query with leading or trailing whitespace

- **GIVEN** a query with stray whitespace `"  Lifecycle States   "`
- **WHEN** section lookup does not match
- **THEN** `error.heading` preserves the queried string
- **AND** the error is catchable as `instanceof GuideSectionNotFoundError`

#### Scenario: Section query with emojis or non-ASCII characters

- **GIVEN** a section query containing emojis `"🚀 Quickstart"` on a guide without that heading
- **WHEN** `GuideSectionNotFoundError` is thrown
- **THEN** `error.heading` cleanly holds `"🚀 Quickstart"` without character corruption
- **AND** the error message formats correctly

### Requirement: GuideSectionAmbiguousError

#### Scenario: Multiple duplicate headings trigger ambiguous error with candidate details

- **GIVEN** a guide containing two sections both titled `"Overview"` at section indices 2 and 7
- **WHEN** requesting section by heading `"Overview"`
- **THEN** `GuideSectionAmbiguousError` is thrown
- **AND** `error.code` is strictly `'AMBIGUOUS_GUIDE_SECTION'`
- **AND** `error.heading` is `'Overview'`
- **AND** `error.matchingIndices` contains `[2, 7]`
- **AND** `error.matchingHeadings` contains formatted strings with indices and line spans
- **AND** `error.message` guides the user to use `--section <number>` to select the exact section

#### Scenario: Ambiguity error message specifies exact disambiguation commands

- **GIVEN** a `GuideSectionAmbiguousError` thrown for topic `"workflow"` and heading `"Commands"` with matching indices `[3, 8]`
- **WHEN** reading `error.message`
- **THEN** it explicitly mentions `--section 3` and `--section 8` as disambiguation choices
