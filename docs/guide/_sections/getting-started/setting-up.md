## Setting up a new project

**Step 1: Initialise the project.**

```bash
specd project init
```

This creates a `specd.yaml` with a default configuration, installs skills for your coding assistant, and sets up the storage directories.

For a non-interactive setup:

```bash
specd project init --schema @specd/schema-std --agent claude
```

**Step 2: Start working.**

Open your coding assistant and type `/specd`. That is all you need — the skill takes it from there.
