# Bug: Agent Messages Always Collapsed by Default

## Status: NEW

## Bug Description
Agent messages appear with truncated content (showing "..." preview) even when they should be fully expanded. Despite the spec stating messages should be "fully expanded by default", the `CollapseStateManager` may not be properly initialized or there's a logic error in the collapse state handling.

## User Story
As a user, I want agent messages to appear fully expanded by default so that I can read the complete response without manually expanding each message.

## Problem Statement
Messages are showing collapsed with "..." preview even though:
1. The `CollapseStateManager.isCollapsed()` returns `false` by default for unknown messageIds
2. The spec clearly states messages should be "fully expanded by default"
3. Keyboard shortcuts (Alt+A, Alt+1,2,3) exist to toggle collapse state

## Solution Statement
Investigate and fix the root cause of why messages appear collapsed. Possible issues:
1. Initial collapse state not being set correctly on first message
2. Streaming updates using different messageIds than final messages
3. `CollapseStateManager` not persisting state across message lifecycle
4. Preview logic incorrectly triggered even when `collapsed=false`

## Relevant Files

### New Files
- None (bug fix only)

### Modified Files
- `extensions/agent-team-interactive/managers/message-manager.ts` — investigate postMessage/postStreamingUpdate logic
- `extensions/agent-team-interactive/types.ts` — verify CollapseStateManager default behavior
- `extensions/agent-team-interactive/components/feed-message.ts` — verify render logic

## Implementation Plan

### Foundation Phase
1. Add debug logging to trace collapse state through message lifecycle
2. Verify messageId consistency between streaming and final messages
3. Check if `CollapseStateManager` state is being initialized correctly

### Core Phase
1. Fix any logic errors in collapse state handling
2. Ensure messages default to expanded state (`collapsed=false`)
3. Ensure messageId remains consistent through streaming → final message transition

### Integration Phase
1. Test with various message types (short, long, multiline)
2. Verify Alt+A and Alt+1,2,3 toggle shortcuts work correctly
3. Confirm messages stay expanded after first agent spawn

## Step by Step Tasks
1. **Add debug logging** — Trace collapse state in `message-manager.ts`
   - Log messageId when generated
   - Log collapse state when posting messages
   - Log when toggle methods are called

2. **Verify messageId consistency** — Check streaming → final transition
   - Ensure `getMessageId()` returns same ID throughout agent session
   - Verify `CollapseStateManager` uses consistent IDs

3. **Fix initialization** — Ensure messages start expanded
   - Explicitly set `collapsed=false` on first message
   - Add `initializeMessage(messageId)` method to `CollapseStateManager`

4. **Fix rendering logic** — Ensure expanded content is shown
   - Verify `feed-message.ts` logic for `collapsed=false`
   - Ensure full content is displayed, not preview

## Testing Strategy

### Unit Tests
- `CollapseStateManager.isCollapsed()` returns `false` for unknown IDs
- `getMessageId()` returns consistent ID across calls
- `postMessage()` displays full content when `collapsed=false`
- `postStreamingUpdate()` respects collapse state

### Integration Tests
- First agent message appears fully expanded
- Long messages display complete content without truncation
- Alt+A toggles all messages between collapsed/expanded
- Alt+1,2,3 toggles individual agent messages
- Collapse state persists across streaming updates

### Edge Cases
- Empty agent state (no content)
- Single-line messages
- Multi-line messages with special characters
- Rapid streaming updates
- Multiple agents responding simultaneously

## Acceptance Criteria
- [ ] Agent messages appear fully expanded by default
- [ ] Full message content is visible (no "..." preview)
- [ ] Alt+A correctly toggles all messages
- [ ] Alt+1,2,3 correctly toggles specific agent messages
- [ ] Collapse state persists during streaming updates
- [ ] Message with no content shows appropriate placeholder

## Validation Commands
```bash
# Run the extension
pi -e extensions/agent-team-interactive.ts

# Test 1: Send simple message
# Run: /to scout hello world
# Expected: Full message "hello world" visible, not truncated

# Test 2: Send long message
# Run: /to scout Write a detailed explanation of how agents work
# Expected: Full response visible, no "... [N lines]" preview

# Test 3: Toggle collapse
# Press: Alt+A
# Expected: All messages collapse to preview

# Test 4: Toggle back
# Press: Alt+A
# Expected: All messages expand to full content

# Test 5: Toggle specific agent
# Press: Alt+1
# Expected: Only first agent's message toggles
```

## Notes
- Related to `feature-agent-feed-ui.md` spec which states messages should be "fully expanded by default"
- May need to add explicit `collapsed=false` initialization in `MessageManager.postMessage()`
- Consider adding `/expand-all` command as workaround if needed
- Debug output should be removable after fix is confirmed
