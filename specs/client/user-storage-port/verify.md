# Verification: User Storage Port

## Requirements

### Requirement: IUserStorage interface exists

#### Scenario: IUserStorage interface defines correct signatures

- **WHEN** the `IUserStorage` interface is inspected
- **THEN** it exposes `get<T>(key: string): T | null`, `set<T>(key: string, value: T): void`, and `remove(key: string): void`

### Requirement: LocalStorageUserStorage implementation

#### Scenario: LocalStorageUserStorage reads and writes to localStorage

- **GIVEN** a clean browser `window.localStorage`
- **WHEN** `LocalStorageUserStorage.set("profile", { name: "test" })` is called
- **THEN** `localStorage.getItem("profile")` contains the serialized JSON
- **AND** `LocalStorageUserStorage.get("profile")` returns `{ name: "test" }`

#### Scenario: LocalStorageUserStorage removes from localStorage

- **GIVEN** a value exists in `window.localStorage`
- **WHEN** `LocalStorageUserStorage.remove("profile")` is called
- **THEN** the key is removed from `window.localStorage`

### Requirement: FileUserStorage implementation

#### Scenario: FileUserStorage coordinates via preload bridge

- **GIVEN** `window.specd.storage` mock is defined in the renderer environment
- **WHEN** `FileUserStorage.set("recent", ["project1"])` is called
- **THEN** it delegates to the preloaded IPC bridge
