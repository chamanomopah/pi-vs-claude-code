# Feature: Fix Agent Message Truncation

## Feature Description
Fix the issue where agent messages are being truncated to show only the last line instead of the full content during streaming and final display.

## User Story
As a user, I want to see the complete agent response instead of just the last line, so that I can understand the full context of the agent's output.

## Problem Statement
In the agent-team-interactive extension, agent messages are being truncated/minimized. Currently only the last line of the agent's response is displayed to the user, making it difficult to follow the agent's complete reasoning or output.

Looking at the code:
- `process-manager.ts` line 146: `state.lastWork = full.split("\n").filter(...).pop() || ""` - takes only last line
- `process-manager.ts` line 231: Same issue - takes only last line
- `message-manager.ts` line 47: Uses `state.lastWork` for display content
- `state.fullContent` exists and contains the complete content but is not being used

## Solution Statement
Modify `message-manager.ts` to use `state.fullContent` instead of `state.lastWork` for displaying agent messages. The `fullContent` field already contains the complete accumulated response, we just need to use it.

## Relevant Files

### Modified Files
- `extensions/agent-team-interactive/managers/message-manager.ts` - Use `fullContent` instead of `lastWork`

### Files Referenced (No Changes)
- `extensions/agent-team-interactive/managers/process-manager.ts` - Already stores `fullContent` correctly

## Implementation Plan

### Foundation Phase
- Read and understand current code structure
- Identify all locations where `lastWork` is used for display

### Core Phase
- Modify `postStreamingUpdate()` in `message-manager.ts` to use `state.fullContent` instead of `state.lastWork`
- Ensure collapsed state still shows preview correctly (first 60 chars of full content)

### Integration Phase
- Test with the example: `talk_to_agent scout — Gere um número aleatório entre 1 e 100 e me diga qual é.`
- Verify full multi-line responses display completely

## Step by Step Tasks
1. In `message-manager.ts`, line 47: Change `const content = state.lastWork || "";` to `const content = state.fullContent || "";`
2. In `message-manager.ts`, line 61: Update preview logic to use `fullContent` instead of `content` (which was `lastWork`)

## Testing Strategy

### Unit Tests
- Not applicable - this is UI output fix

### Integration Tests
- Test with single-line agent responses
- Test with multi-line agent responses
- Test with collapsed state (Alt+1, Alt+2...)
- Test with expanded state

### Edge Cases
- Empty agent response
- Very long agent response (100+ lines)
- Response with special characters
- Response during streaming (partial updates)

## Acceptance Criteria
- [ ] Full agent response is displayed, not just the last line
- [ ] Multi-line responses show all lines
- [ ] Collapsed state shows correct preview
- [ ] Streaming updates show accumulating content, not just latest line
- [ ] No regression in other functionality

## Validation Commands
- Run `pi -e extensions/agent-team-interactive.ts`
- Use `/to scout Gere um número aleatório entre 1 e 100 e me diga qual é.`
- Verify full response is visible, not truncated

## Notes
- `state.fullContent` is already being populated correctly in `process-manager.ts` (line 145, 230)
- `state.lastWork` can remain for backward compatibility but should not be used for display
- The fix is straightforward - use the existing `fullContent` field instead of `lastWork`
