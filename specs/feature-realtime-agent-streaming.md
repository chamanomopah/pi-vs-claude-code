# Feature: Real-time Agent Streaming in Tool Feed

## Feature Description
The `talk_to_agent` tool should display the agent's thinking process and response expanding in real-time in the feed, similar to how orchestrator responses stream. Currently it shows a static indicator like `✗ scout 8s` without expanding content.

## User Story
As a user, I want to see agent responses streaming in real-time when I use `/to <agent>` so that I can watch the agent's thinking process and see the response build up progressively.

## Problem Statement
The current implementation posts streaming updates via `messageManager.postStreamingUpdate()` to the TUI log, but these appear as separate log entries rather than updating the tool call result in the feed. The user sees:
- `talk_to_agent scout — Oi! Tá aí?` → `✗ scout 8s` (static, no expansion)

Expected behavior:
- `talk_to_agent scout — Oi! Tá aí?` → Result expands with agent's thinking and response in real-time

## Solution Statement
Modify the `talk_to_agent` tool to use `onUpdate` callback properly for streaming the agent's output. The `onUpdate` callback should return `content` that accumulates the agent's response, causing the tool result to expand in the feed.

## Relevant Files

### New Files
- None

### Modified Files
- `extensions/agent-team-interactive/index.ts` — fix `talk_to_agent` tool's streaming logic
- `extensions/agent-team-interactive/managers/process-manager.ts` — ensure state updates properly propagate
- `extensions/agent-team-interactive/managers/message-manager.ts` — simplify to focus on final messages

## Implementation Plan

### Foundation Phase
1. Analyze how other tools implement streaming (e.g., tool execution in main agent)
2. Verify `onUpdate` callback contract for streaming content
3. Add accumulator for streaming text content in tool execution

### Core Phase
1. Modify `talk_to_agent` execute to accumulate streamed text
2. Call `onUpdate` with accumulated `content` on each state change
3. Update `renderResult` to show proper streaming state
4. Handle thinking delta vs text delta appropriately

### Integration Phase
1. Test with simple message (quick response)
2. Test with long message (verify streaming)
3. Verify error states display correctly
4. Ensure final message is complete and readable

## Step by Step Tasks

1. **Modify `talk_to_agent` execute function** (`index.ts` line ~112)
   - Add `accumulatedContent: string[] = []` accumulator before spawn
   - In `onUpdate` callback, append new content to accumulator
   - Call `onUpdate({ content: [{ type: "text", text: accumulatedContent.join("") }] })`
   - Handle both thinking and text deltas appropriately

2. **Update process-manager state handling** (`process-manager.ts` line ~95)
   - Ensure `state.lastWork` contains the latest content
   - Add `state.fullContent` that accumulates all content (not just last line)
   - Separate thinking from text content

3. **Update renderResult for streaming** (`index.ts` line ~165)
   - When `isPartial` is true, show accumulated content with agent header
   - Use agent color for visual distinction
   - Show thinking indicator when in "thinking" status

4. **Simplify message-manager** (`message-manager.ts`)
   - Remove `postStreamingUpdate` (redundant with onUpdate)
   - Keep `postMessage` for final formatted message

## Testing Strategy

### Unit Tests
- `onUpdate` callback is called with accumulating content
- Content grows monotonically (no duplication)
- Final content matches agent output
- Error states preserve accumulated content before failure

### Integration Tests
- Short message: displays complete response quickly
- Long message: shows progressive streaming
- Thinking process: visible during "thinking" status
- Tool execution: visible during "working" status

### Edge Cases
- Agent errors mid-response
- Agent returns empty response
- Agent returns very long response
- Concurrent agent spawns
- Agent killed mid-stream

## Acceptance Criteria
- [ ] `/to scout hello` shows agent response streaming in real-time
- [ ] Tool result expands progressively in feed (not just footer updates)
- [ ] Thinking phase shows "● scout thinking..."
- [ ] Tool execution shows "⚙ scout using tool..."
- [ ] Final result shows complete response with "✓ scout 3s"
- [ ] Error states show "✗ scout" with error message
- [ ] Agent color is preserved in streaming display

## Validation Commands
```bash
# Run the extension
pi -e extensions/agent-team-interactive.ts

# Test 1: Simple message (should stream response)
/to scout hello world
# Expected: Tool result expands with "Hello! I'm here..." progressively

# Test 2: Math question (quick response)
/to scout what is 123 * 456?
# Expected: Response streams in, final shows answer

# Test 3: Code generation (longer response)
/to scout write a function to reverse a string
# Expected: See thinking, then code generation streaming in

# Test 4: Error handling
/to scout nonexistent-command-test
# Expected: Error message displayed properly
```

## Notes
- The `onUpdate` callback key is `{ content: [{ type: "text", text: string }] }`
- `isPartial` in `renderResult` indicates streaming is active
- Agent color from `agentDef.agentColor` or `getAgentColor()`
- May need to format thinking differently from text content (dim/italics)
- Current `postStreamingUpdate` creates duplicate log entries - should be removed or kept as debug option
