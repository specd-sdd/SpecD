#!/usr/bin/env bash
# Wrapper that tolerates the tinypool ERR_IPC_CHANNEL_CLOSED rejection.
# LadybugDB's native addon keeps file handles open after close(), causing
# vitest workers to outlive their IPC channel. This is a known issue with
# native addons and tinypool — all tests pass but the exit code is 1.

set -o pipefail

output=$(npx vitest run "$@" 2>&1)
code=$?

echo "$output"

if [ $code -eq 0 ]; then
  exit 0
fi

# If the only "failure" is the Channel closed rejection, treat as success
if echo "$output" | grep -q 'ERR_IPC_CHANNEL_CLOSED' && \
   ! echo "$output" | grep -qE '(FAIL|Tests .* failed)'; then
  exit 0
fi

exit $code
