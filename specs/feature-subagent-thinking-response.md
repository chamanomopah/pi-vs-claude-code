# Feature: Fix Subagent Thinking and Response Display

## Feature Description
Fix the agent-team-interactive extension to properly display agent thinking process and final responses. Currently, thinking deltas are truncated/suppressed and responses may not appear correctly in the feed.

## User Story
As a user, I want to see the agent's thinking process and complete response so that I can understand what the agent is doing and verify its work.

## Problem Statement
The extension has three related issues:

1. **Thinking not displayed**: In `process-manager.ts` lines 164-172, thinking deltas are truncated to <100 chars and shown as `[Thinking: ...]` which is hard to read and often gets overwritten.

2. **Responses may not appear**: Due to session handling issues and potential JSON parsing problems, agents may not complete properly.

3. **Messages always collapsed**: Despite spec saying "fully expanded by default", messages show truncated preview.

## Solution Statement

### 1. Fix Thinking Display
- Create a dedicated `thinking` field in `AgentSessionState` to accumulate thinking content
- Display thinking separately from the main response content
- Show full thinking, not truncated preview
- Use visual separator between thinking and response

### 2. Fix Response Display
- Ensure session file handling is correct (already fixed in process-manager.ts)
- Verify JSON parsing handles all event types correctly
- Make sure `lastWork` accumulates full content properly

### 3. Fix Default Expanded State
- Ensure `CollapseStateManager` initializes with `collapsed=false`
- Verify `getMessageId()` generates consistent IDs
- Fix any logic that incorrectly shows preview when `collapsed=false`

## Relevant Files

### New Files
- `extensions/agent-team-interactive/components/thinking-display.ts` — dedicated thinking display component

### Modified Files
- `extensions/agent-team-interactive/types.ts` — add `thinking` field to `AgentSessionState`
- `extensions/agent-team-interactive/managers/process-manager.ts` — accumulate thinking separately
- `extensions/agent-team-interactive/managers/message-manager.ts` — display thinking and full response
- `extensions/agent-team-interactive/components/feed-message.ts` — update format functions

## Implementation Plan

### Foundation Phase
1. Add `thinking: string` field to `AgentSessionState`
2. Create `ThinkingDisplay` component for formatted thinking output
3. Update `CollapseStateManager` to ensure proper initialization

### Core Phase
1. In `process-manager.ts`, accumulate thinking deltas into `state.thinking`
2. Separate thinking from response content in state
3. Update `postStreamingUpdate` to show thinking progress
4. Update `postMessage` to show thinking + final response

### Integration Phase
1. Test with agents that produce thinking output
2. Verify thinking appears before and separate from response
3. Ensure responses are fully expanded by default
4. Verify collapse/expand toggle works correctly

## Step by Step Tasks

1. **Update types.ts**
   - Add `thinking: string` to `AgentSessionState` (initialize to empty string)
   - Add `thinkingHistory: string[]` to track thinking updates

2. **Update process-manager.ts**
   - Initialize `state.thinking = ""` and `state.thinkingHistory = []`
   - In `message_update` handler for `thinking_delta`:
     - Accumulate full thinking content (don't truncate)
     - Store in `state.thinking`
     - Add to `state.thinkingHistory`
   - Keep text deltas separate in `lastWork` and `messages`

3. **Create thinking-display.ts**
   - `formatThinkingForPrint(thinking, theme, agentColor)` — format thinking for log output
   - `renderThinking(thinking, collapsed, theme)` — render thinking component
   - Use distinct visual style (dim, italic, or boxed)
   - Show "Thinking..." label with agent color

4. **Update message-manager.ts**
   - In `postStreamingUpdate`:
     - Show thinking preview if available
     - Show response preview if available
     - Separate thinking from response visually
   - In `postMessage`:
     - Show full thinking section (if any)
     - Show full response section
     - Use clear separator

5. **Update feed-message.ts**
   - Add `thinking` parameter to `renderAgentMessage`
   - Add `thinking` parameter to `formatAgentMessageForPrint`
   - Display thinking section above response section
   - Use visual separator (e.g., `───` or blank line)

6. **Fix collapse state initialization**
   - In `getMessageId()`, ensure `initialize(id, false)` is called
   - In `CollapseStateManager.isCollapsed()`, return `false` for unknown IDs (already does)
   - Add explicit `setAll(false)` in `session_start` to reset state

## Testing Strategy

### Unit Tests
- `AgentSessionState.thinking` accumulates correctly
- `formatThinkingForPrint()` formats thinking with proper styling
- Thinking deltas are stored separately from text deltas
- Collapse state initializes to expanded (false)

### Integration Tests
- Agent thinking appears in feed before response
- Thinking is visually distinct from response
- Response is fully expanded by default
- Alt+A and Alt+1,2,3 toggle correctly

### Edge Cases
- Agent produces no thinking (only response)
- Agent produces only thinking (no response)
- Thinking with multiline content
- Thinking with special characters
- Very long thinking content
- Rapid thinking updates during streaming

## Acceptance Criteria
- [ ] Agent thinking appears in feed with clear "Thinking:" label
- [ ] Thinking is fully visible (not truncated to 100 chars)
- [ ] Thinking appears separately from response content
- [ ] Response is fully expanded by default
- [ ] Visual separator between thinking and response
- [ ] Alt+A toggles both thinking and response together
- [ ] Alt+1,2,3 toggles specific agent's messages
- [ ] Messages without thinking still work correctly

## Validation Commands
```bash
# Run the extension
pi -e extensions/agent-team-interactive.ts

# Test 1: Agent with thinking
# Run: /to <agent-with-thinking> Explain how recursion works
# Expected: See "Thinking:" section followed by full response

# Test 2: Agent without thinking
# Run: /to <agent-no-thinking> hello
# Expected: See response only, no thinking section

# Test 3: Verify expanded by default
# Run: /to scout Write a long explanation
# Expected: Full content visible, not "..." preview

# Test 4: Toggle collapse
# Press: Alt+A
# Expected: All messages show preview only

# Press: Alt+A again
# Expected: All messages show full content

# Test 5: Specific agent toggle
# Press: Alt+1
# Expected: Only first agent's message toggles
```

## Notes
- Related specs: `specs/bug-agent-no-response.md`, `specs/bug-messages-always-collapsed.md`
- Thinking display should be subtle (dim color) to not distract from response
- Consider adding `/thinking` command to show/hide thinking globally
- Consider adding thinking to session persistence for replay
