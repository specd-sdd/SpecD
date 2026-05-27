# Verification: Routes Graph

## Requirements

### Requirement: GET graph status exposes freshness and stale flag

#### Scenario: Versioned API path

- **WHEN** client calls the documented route with `/v1` prefix
- **THEN** route handler is reached
- **AND** unprefixed legacy path is not registered

#### Scenario: Graph status exposes freshness

- **WHEN** `GET /v1/graph/status` is called
- **THEN** response includes fingerprint and stale flags
- **AND** sidebar can warn when graph is stale

#### Scenario: Undocumented path returns 404

- **WHEN** client requests a URL outside this routes contract
- **THEN** HTTP 404 is returned
- **AND** body is `application/problem+json`

### Requirement: POST graph index rebuilds the code graph index

#### Scenario: POST /v1/graph/index kicks off index job

- **WHEN** client posts to index endpoint
- **THEN** kernel/code-graph index runs
- **AND** HTTP 200 returns indexing summary DTO

#### Scenario: Index always rebuilds the full project graph

- **WHEN** `POST /v1/graph/index` runs
- **THEN** the index request covers all configured workspaces
- **AND** cross-workspace graph links remain in scope

#### Scenario: Force reindex recreates graph storage first

- **WHEN** client posts `{ "force": true }` to `/v1/graph/index`
- **THEN** persistent graph storage is recreated before indexing
- **AND** the response still returns the indexing summary DTO

#### Scenario: Index rejects unsupported body properties

- **WHEN** client posts `{ "workspaces": ["api", "client"] }` to `/v1/graph/index`
- **THEN** HTTP 400 is returned
- **AND** body is `application/problem+json`
- **AND** code is `INVALID_REQUEST`

#### Scenario: Index completion updates freshness

- **GIVEN** index was stale
- **WHEN** index POST completes
- **THEN** subsequent GET status shows fresh
- **AND** indexedAt updated

#### Scenario: Concurrent index requests are serialized

- **GIVEN** index already running
- **WHEN** second POST /v1/graph/index arrives
- **THEN** request rejected or queued
- **AND** corrupt index not written

### Requirement: search impact and hotspots mirror CLI graph commands

#### Scenario: Search endpoint accepts CLI-equivalent query

- **WHEN** `POST /v1/graph/search` with symbol query
- **THEN** results match `specd graph search` shape
- **AND** BM25 ordering preserved

#### Scenario: Impact dependents matches CLI direction

- **WHEN** impact endpoint called with dependents direction
- **THEN** dependent symbols returned
- **AND** same filters as CLI

#### Scenario: Hotspots endpoint exposes risk tiers

- **WHEN** `GET /v1/graph/hotspots`
- **THEN** risk labels align with CLI
- **AND** min-risk filter honored

### Requirement: graph-route inputs are schema-validated

#### Scenario: Impact rejects missing selector

- **WHEN** client calls `GET /v1/graph/impact` without `symbol` or `file`
- **THEN** HTTP 400 is returned
- **AND** body is `application/problem+json`
- **AND** code is `INVALID_REQUEST`

#### Scenario: Impact rejects unsupported direction

- **WHEN** client calls `GET /v1/graph/impact?symbol=core:test&direction=sideways`
- **THEN** HTTP 400 is returned
- **AND** body is `application/problem+json`

### Requirement: spec and change linkage endpoints compose graph with spec scope

#### Scenario: Spec linkage returns symbols for spec id

- **WHEN** `GET /v1/graph/specs/core:foo`
- **THEN** coversSymbol links included
- **AND** scoped to requested spec

#### Scenario: Change linkage limits to change spec deps

- **GIVEN** change depends on two specs
- **WHEN** change linkage endpoint runs
- **THEN** graph query restricted to those specs
- **AND** unrelated workspaces omitted

#### Scenario: Unknown spec id returns 404 problem+json

- **WHEN** linkage called with missing spec
- **THEN** HTTP 404
- **AND** problem body explains missing spec
