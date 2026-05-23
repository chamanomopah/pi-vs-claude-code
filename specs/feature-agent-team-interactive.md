# Feature: Agent Team Interactive

## Feature Description
A next-generation multi-agent orchestration extension that provides real-time visibility into each agent's thinking process, direct communication channels with individual agents, checkpoint-based session management with undo/fork capabilities, and persistent session history tracking. This extends the `agent-team.ts` dispatcher pattern with full interactive UI panels showing each agent's "thought stream" live, rather than static status blocks.

## User Story
As a developer working with multi-agent systems, I want to see each agent's thinking process in real-time, send messages directly to specific agents, and create checkpoints that let me undo or fork agent conversations, so that I can effectively supervise and guide collaborative AI work while maintaining full control over the conversation history.

## Problem Statement
The current `agent-team.ts` extension only shows static status blocks for each agent (idle/running/done with minimal context). Users cannot:
- See the real-time thinking process of individual agents
- Send messages directly to specific agents without going through the orchestrator
- Create checkpoints to revert agent conversations to previous states
- Fork agent sessions to explore alternative paths
- View and navigate agent session history

## Solution Statement
Build `agent-team-interactive.ts` — a multi-agent orchestration extension that:
1. Spawns dedicated Pi subprocess for each agent with JSON mode streaming
2. Creates live-updating TUI panels (above/below editor) showing each agent's message stream
3. Provides tools for direct agent communication (`talk_to_agent`, `talk_to_orchestrator`)
4. Implements checkpoint system with labels and `/checkpoint` command
5. Stores agent sessions in `.pi/agent-sessions/` with full history
6. Supports `/undo`, `/fork`, `/revert` commands at agent level
7. Shows session timeline with keybinding navigation

## Relevant Files

### New Files
- `extensions/agent-team-interactive.ts` (main extension with UI panels, tools, and session management)
- `.pi/agents/teams-interactive.yaml` (team configuration for this extension)
- `specs/feature-agent-team-interactive.md` (this specification document)

### Modified Files
- `justfile` (add recipe: `ext-agent-team-interactive`)
- `THEME.md` (optional: add color conventions for agent panels)
- `docs/extensions.md` (optional: add documentation section)

## Implementation Plan

### Foundation Phase
**Setup and infrastructure:**
1. Create extension skeleton with `agent-team-interactive.ts`
2. Define TypeScript interfaces for agent state, checkpoints, and sessions
3. Implement session storage backend (`.pi/agent-sessions/<agent-name>/`)
4. Create JSON mode subprocess wrapper for spawning agents
5. Set up event bus for agent-to-orchestrator communication
6. Add justfile recipe

**Core Data Structures:**
```typescript
interface AgentSessionState {
  sessionId: string;
  agentName: string;
  status: "idle" | "thinking" | "working" | "error";
  currentTask: string;
  messages: AgentMessage[];
  checkpoints: Checkpoint[];
  currentCheckpointIndex: number;
}

interface Checkpoint {
  id: string;
  label: string;
  timestamp: number;
  messageIndex: number; // Point in message history
  contextSnapshot?: any;
}

interface AgentMessage {
  role: "user" | "assistant" | "system" | "tool_result";
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
}
```

### Core Phase
**Main feature implementation:**

1. **Agent Process Manager**
   - Spawn Pi subprocess with `--mode json --no-extensions`
   - Parse JSON event stream for message_update, tool_call, agent_end events
   - Buffer message stream for UI rendering (last N messages)
   - Handle process lifecycle (spawn, monitor, kill, restart)
   - Implement graceful shutdown with cleanup

2. **Live UI Panel System**
   - Create `AgentPanel` component for each agent (extending `@mariozechner/pi-tui` Component)
   - Render streaming text with syntax highlighting for code blocks
   - Show status indicator (● thinking, ○ idle, ✗ error)
   - Display tool calls in collapsible sections
   - Implement panel selection via keyboard (1-9 for agents, 0 for orchestrator)
   - Add scroll support for agent message history within panel
   - Show context usage bar per agent

3. **Orchestrator Integration**
   - Main Pi agent runs as orchestrator with direct communication capability
   - Inject orchestrator system prompt via `before_agent_start`
   - Provide `dispatch_to_agent` tool (orchestrator → agent)
   - Provide `talk_to_orchestrator` tool (agent → orchestrator)
   - Route user messages based on `/to <agent>` prefix

4. **Direct Communication Tools**
   - `talk_to_agent(agent, message)` — Send message directly to specific agent
   - `talk_to_orchestrator(message)` — Send message to orchestrator
   - `broadcast(message)` — Send message to all agents
   - Add `/to <agent-name>` slash command prefix handler
   - Implement message routing in `input` event handler

5. **Checkpoint System**
   - Create checkpoint at current message index with label
   - Store checkpoint in agent session state
   - Add `/checkpoint <label>` command
   - Render checkpoint markers in timeline UI
   - Persist checkpoints to session file

6. **Session History & Navigation**
   - Store each agent's message stream to `.pi/agent-sessions/<agent>/<timestamp>.jsonl`
   - Implement `/undo` — revert to previous checkpoint
   - Implement `/fork <checkpoint-id>` — create new session branch from checkpoint
   - Implement `/revert <message-id>` — revert to specific message
   - Add `/timeline` command to show checkpoint history
   - Support keyboard navigation (Ctrl+[/] for prev/next checkpoint)

### Integration Phase
**Connecting components and polish:**

1. **UI Layout & Theme**
   - Multi-panel layout: orchestrator panel (top/left), agent panels (right/bottom)
   - Apply THEME.md color conventions per agent
   - Support panel collapsing/expanding
   - Add responsive layout for different terminal sizes

2. **Team Configuration**
   - Load team definitions from `.pi/agents/teams-interactive.yaml`
   - Support dynamic team switching via `/team` command
   - Parse agent definitions from `.pi/agents/*.md`

3. **Error Handling & Recovery**
   - Handle agent subprocess crashes gracefully
   - Auto-restart agents on failure with backoff
   - Preserve message buffers across restarts
   - Show error states in UI with recovery options

4. **Performance Optimization**
   - Limit message buffer size per agent (configurable, default 100 messages)
   - Implement lazy rendering for long message histories
   - Debounce UI updates during high-frequency events
   - Use efficient string building for panel rendering

5. **Testing & Validation**
   - Unit tests for checkpoint logic
   - Integration tests for agent spawning
   - Manual testing workflows
   - Performance benchmarks

## Step by Step Tasks

1. **Create extension skeleton** — `extensions/agent-team-interactive.ts` with imports and basic structure
2. **Define TypeScript interfaces** — AgentSessionState, Checkpoint, AgentMessage, PanelConfig
3. **Implement subprocess wrapper** — spawnAgent(), parseJsonStream(), killAgent()
4. **Create AgentPanel component** — extending TUI Component with render(), onKey handling
5. **Build panel manager** — createPanels(), updatePanel(), selectPanel(), layoutPanels()
6. **Implement orchestrator injection** — before_agent_start handler for system prompt
7. **Register communication tools** — talk_to_agent, talk_to_orchestrator, broadcast
8. **Add input routing** — handle `/to <agent>` prefix in input event
9. **Create checkpoint system** — saveCheckpoint(), listCheckpoints(), restoreCheckpoint()
10. **Implement session storage** — saveSession(), loadSession(), listSessions()
11. **Add navigation commands** — /undo, /fork, /revert, /timeline, /checkpoint
12. **Build timeline UI** — show checkpoints with keyboard navigation
13. **Add team configuration** — parse teams-interactive.yaml, support /team switching
14. **Implement error recovery** — handle crashes, auto-restart, state preservation
15. **Add justfile recipe** — `ext-agent-team-interactive` with minimal + theme-cycler
16. **Performance optimization** — buffer limits, lazy rendering, debouncing
17. **Write tests** — checkpoint logic, subprocess management, message routing
18. **Documentation** — update README.md with usage examples
19. **Manual testing** — verify all workflows work end-to-end
20. **Polish** — theme alignment, keyboard shortcuts, error messages

## Testing Strategy

### Unit Tests
1. **Checkpoint Logic**
   - Test checkpoint creation at message index
   - Test checkpoint restoration (message truncation)
   - Test fork from checkpoint (new session creation)
   - Test checkpoint label validation

2. **Message Routing**
   - Test `/to <agent>` prefix parsing
   - Test direct message to agent (bypass orchestrator)
   - Test broadcast to all agents
   - Test orchestrator message routing

3. **Session State Management**
   - Test session serialization/deserialization
   - Test session file I/O (create, read, delete)
   - Test state restoration after crash
   - Test multiple concurrent agent sessions

### Integration Tests
1. **Agent Lifecycle**
   - Spawn agent → verify JSON stream parsing
   - Send message → verify response received
   - Kill agent → verify cleanup
   - Restart agent → verify session restoration

2. **Orchestration Flow**
   - User → orchestrator → agent message chain
   - User → direct agent message
   - Agent → orchestrator response
   - Multi-agent collaboration (orchestrator coordinates)

3. **Checkpoint Workflow**
   - Create checkpoint during active agent work
   - Continue work, then undo to checkpoint
   - Fork from checkpoint, verify both sessions exist
   - Navigate timeline via keyboard

4. **Error Scenarios**
   - Agent crash during message processing
   - Network timeout (if applicable)
   - Invalid agent name in `/to` command
   - Session file corruption

### Edge Cases
1. **Terminal Size**
   - Too small for all panels (show minimal view)
   - Panel overflow (scroll within panel)
   - Resize handling (dynamic layout)

2. **Message Overflow**
   - Agent generates 1000+ messages (buffer limit)
   - Single message exceeds display (wrap/truncate)
   - Tool result larger than context (truncation)

3. **Concurrent Operations**
   - User sends message while agent is thinking
   - Checkpoint creation during tool execution
   - Fork while agent is processing

4. **State Corruption**
   - Session file deleted mid-session
   - Checkpoint index out of bounds
   - Invalid JSON in session file

## Acceptance Criteria
- [ ] Extension loads with team selection dialog
- [ ] Each agent shows live-updating panel with message stream
- [ ] Orchestrator panel shows dispatcher conversation
- [ ] `/to <agent>` sends message directly to agent
- [ ] `/checkpoint <label>` creates checkpoint at current state
- [ ] `/undo` reverts to previous checkpoint
- [ ] `/fork <checkpoint-id>` creates new session branch
- [ ] `/timeline` shows checkpoint history with navigation
- [ ] Keyboard shortcuts (1-9, 0) switch between panels
- [ ] Ctrl+[/] navigate prev/next checkpoint
- [ ] Agent sessions persist to `.pi/agent-sessions/`
- [ ] Agent crashes trigger auto-restart with state preservation
- [ ] Theme colors follow THEME.md conventions
- [ ] Justfile recipe launches extension correctly

## Validation Commands

### Manual Verification
```bash
# Launch extension
pi -e extensions/agent-team-interactive.ts -e extensions/theme-cycler.ts

# Or via just
just ext-agent-team-interactive

# Test workflows:
# 1. Select team 'plan-build' when prompted
# 2. Watch panels appear for planner, builder, reviewer
# 3. Type "Plan a simple todo app" — watch orchestrator dispatch
# 4. Type "/to builder Skip the planning, just write the code" — direct message
# 5. Type "/checkpoint before-refactor" — create checkpoint
# 6. Let agent continue, then "/undo" — verify revert
# 7. Type "/timeline" — verify checkpoint list
# 8. Press Ctrl+[ — navigate to previous checkpoint
# 9. Type "/fork before-refactor" — verify new session
# 10. Kill agent process — verify auto-restart
```

### Session File Verification
```bash
# Check session files exist
ls -la .pi/agent-sessions/

# Verify session content
cat .pi/agent-sessions/planner/*.jsonl | head -20

# Check checkpoint metadata
cat .pi/agent-sessions/planner/meta.json
```

### Automated Tests (if implemented)
```bash
# Run unit tests
bun test specs/agent-team-interactive.test.ts

# Run integration tests
bun test specs/agent-team-interactive-integration.test.ts
```

## Notes

### Future Enhancements
1. **Parallel Agent Visualization** — Show multiple agents thinking simultaneously in split-screen
2. **Agent Memory Graph** — Visualize context sharing between agents
3. **Performance Metrics** — Show token usage, cost, latency per agent
4. **Session Diff** — Compare two checkpoints side-by-side
5. **Agent Handoff** - Transfer context from one agent to another mid-task

### Technical Debt
1. **Panel Rendering** — Current approach may not scale beyond 4-5 panels; consider virtualization
2. **Session Storage** — JSONL format may become inefficient for large histories; consider SQLite
3. **Message Buffer** — In-memory buffer grows unbounded; implement circular buffer
4. **Keyboard Handling** — Keybinding conflicts with built-in Pi shortcuts need resolution

### Dependencies
- Requires Pi >= 1.3.2 for JSON mode subprocess support
- Requires `@mariozechner/pi-tui` for custom components
- Optional: `@mariozechner/pi-ai` for StringEnum in tool parameters

### Compatibility
- Works alongside `agent-team.ts` (different commands, no conflict)
- Compatible with `theme-cycler.ts` for theme switching
- Compatible with `minimal.ts` for footer customization
- May conflict with other extensions that replace the editor (use with caution)

### Migration from agent-team.ts
Users can migrate by:
1. Copy `.pi/agents/teams.yaml` to `.pi/agents/teams-interactive.yaml`
2. Update justfile recipe to use new extension
3. Learn new commands (`/to`, `/checkpoint`, `/undo`, `/fork`, `/timeline`)
4. Benefit from: live panels, direct messaging, checkpoint system
