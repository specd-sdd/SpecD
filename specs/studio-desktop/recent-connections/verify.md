# Verification: Recent Connections

## Requirements

### Requirement: recents are stored in app user data

#### Scenario: Successful remote connect appends recent

- **WHEN** user connects to remote URL
- **THEN** entry persisted under app userData
- **AND** welcome list shows host

#### Scenario: Recents dedupe by normalized URL

- **GIVEN** recent already contains host
- **WHEN** user reconnects same URL
- **THEN** single entry updated
- **AND** most recent moves to top

#### Scenario: Clear recents removes file entries

- **WHEN** user clears recent connections
- **THEN** storage file updated
- **AND** welcome no longer lists removed hosts

### Requirement: tokens are stored with explicit user consent

#### Scenario: Remember token checkbox gates persistence

- **WHEN** user connects without remember checked
- **THEN** token kept in memory only
- **AND** not written to disk

#### Scenario: Remember checked stores encrypted or scoped secret

- **WHEN** user enables remember on connect
- **THEN** token saved in userData vault
- **AND** next connect prefills host only or token per policy

#### Scenario: Revoke clears stored token

- **WHEN** user removes recent with stored token
- **THEN** token deleted from storage
- **AND** subsequent connect requires re-entry
