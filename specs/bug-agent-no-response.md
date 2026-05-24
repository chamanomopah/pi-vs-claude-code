# Bug: Agent Does Not Respond When Spawned

## Status: NEW

## Bug Description
When sending a message to an agent via `/to <agent>` or the `talk_to_agent` tool, the agent shows "● responding..." but never completes. The process hangs indefinitely and the agent never returns output.

## User Story
As a user, I want agents to respond to my messages so that I can interact with them directly.

## Problem Statement
Comparing `agent-team-interactive/managers/process-manager.ts` (broken) with `agent-team.ts` (working), the `spawnAgent()` function is missing critical parts:

1. **Missing `--session` flag**: The working version passes `--session <agentSessionFile>` to enable session persistence. Without this, the agent subprocess cannot maintain state across invocations.

2. **Missing `-c` flag for resume**: When a session file exists, the working version adds `-c` to continue the existing session.

3. **Wrong spawn command on Windows**: Uses `pi.cmd` with `shell: true` which may cause JSON parsing issues.

4. **Session file not created**: The agent session file path is never passed to the subprocess.

## Solution Statement
Fix `process-manager.ts` to match the working spawn pattern from `agent-team.ts`:

1. Add session file path calculation and `--session` flag
2. Add `-c` flag when resuming existing sessions
3. Use consistent spawn command (`pi` not `pi.cmd`)
4. Properly track session file availability for resume

## Relevant Files

### New Files
- None (bug fix only)

### Modified Files
- `extensions/agent-team-interactive/managers/process-manager.ts` — fix spawnAgent() args and session handling

## Implementation Plan

### Foundation Phase
1. Compare spawn args between working and broken versions
2. Verify session file storage location exists

### Core Phase
1. Calculate session file path for each agent: `.pi/agent-sessions/<agent-key>.json`
2. Add `--session` flag to args with session file path
3. Track session file availability in `AgentSessionState`
4. Add `-c` flag when session file exists

### Integration Phase
1. Test agent spawn on Windows
2. Verify session persistence across multiple invocations
3. Confirm agent responds and completes

## Step by Step Tasks

1. **Add sessionFile tracking to state**
   - Add `sessionFile: string | null` to `AgentSessionState` interface in `types.ts`
   - Initialize to `null` on first spawn, set to path after successful run

2. **Calculate session file path in spawnAgent()**
   - Generate agent key: `agentDef.name.toLowerCase().replace(/\s+/g, "-")`
   - Build path: `join(sessionStorage.sessionDir, `${agentKey}.json`)`
   - Check if file exists with `existsSync()`

3. **Add `--session` flag to spawn args**
   - After `--append-system-prompt`, add `--session` with session file path
   - Example: `args.push("--session", sessionFilePath)`

4. **Add `-c` flag for resume**
   - If session file exists, push `-c` to args before task
   - This tells Pi to continue existing session

5. **Update state after successful completion**
   - Set `state.sessionFile = sessionFilePath` when exitCode === 0
   - Save session to disk

## Testing Strategy

### Unit Tests
- Session file path is calculated correctly
- `--session` flag is present in spawn args
- `-c` flag is added when session file exists
- Session file is not created on error

### Integration Tests
- Agent responds to first message (creates new session)
- Agent responds to second message (resumes session)
- Agent state persists across invocations

### Edge Cases
- Session directory doesn't exist (should create)
- Session file is corrupted (should start fresh)
- Concurrent spawns of same agent (should kill previous)

## Acceptance Criteria
- [ ] Agent responds to `/to <agent> <message>` with output
- [ ] Agent doesn't hang at "● responding..."
- [ ] Session file created in `.pi/agent-sessions/<agent>.json`
- [ ] Subsequent messages to same agent resume session
- [ ] Works on Windows without shell issues

## Validation Commands
```bash
# Run the extension
pi -e extensions/agent-team-interactive.ts

# Test 1: Simple message
# Run: /to scout hello
# Expected: Agent responds with greeting, not hanging

# Test 2: Second message (resume)
# Run: /to scout what's 2+2?
# Expected: Agent responds, remembers previous context

# Test 3: Verify session file
# Run: type .pi\agent-sessions\scout.json
# Expected: Valid JSON session data exists
```

## Notes
- The working `agent-team.ts` line 344-361 shows the correct pattern
- Session files stored in `.pi/agent-sessions/` directory (already created by SessionStorage)
- On Windows, using `shell: true` with `pi.cmd` may break JSON event stream - use direct `pi` command
