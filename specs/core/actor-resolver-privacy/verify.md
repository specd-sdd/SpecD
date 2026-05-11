# Verification: Actor Resolver Privacy

## Requirements

### Requirement: Privacy modes

#### Scenario: Anonymous mode replaces all data

- **GIVEN** `privacy.mode` is `anonymous`
- **WHEN** `identity()` is called
- **THEN** it returns `{ name: "Anonymous", email: "anonymous@getspecd.dev" }`

### Requirement: HMAC hashing with salt

#### Scenario: Deterministic hashing

- **GIVEN** `privacy.mode` is `hash`
- **AND** a fixed `salt`
- **WHEN** `identity()` is called twice for the same email
- **THEN** both hashes are identical

### Requirement: Masking strategy

#### Scenario: Masking applied to email and name

- **GIVEN** `privacy.mode` is `mask`
- **AND** real identity is `{ name: "John Doe", email: "john@example.com" }`
- **WHEN** `identity()` is called
- **THEN** it returns `{ name: "J***n", email: "j***n@e***.com" }`

### Requirement: Metadata privacy

#### Scenario: providerId and metadata removed by default

- **GIVEN** privacy mode is active
- **AND** no whitelist is provided
- **WHEN** `identity()` returns identity with `providerId` and `metadata`
- **THEN** the decorator returns an object without those fields

#### Scenario: Whitelisted metadata preserved

- **GIVEN** privacy mode is active
- **AND** `allowedMetadataKeys` contains `["dept"]`
- **WHEN** identity has metadata `{ dept: "IT", ssn: "..." }`
- **THEN** only `dept` is preserved

### Requirement: Excluded actors

#### Scenario: Excluded actor keeps real data

- **GIVEN** privacy is `hash`
- **AND** `excludeActors` contains `["specd"]`
- **WHEN** current actor name is `specd`
- **THEN** no hashing is applied
