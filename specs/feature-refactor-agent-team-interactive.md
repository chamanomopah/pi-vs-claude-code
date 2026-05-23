# Feature: Refactor agent-team-interactive.ts into Modular Components

## Feature Description
Refactor the monolithic `agent-team-interactive.ts` (1415 lines) into an organized module structure for better maintainability, debugging, and extensibility.

## User Story
As a **developer**, I want **modular component organization** so that **debugging and adding features is easier**.

## Problem Statement
The `agent-team-interactive.ts` file is too large (~1400 lines) with multiple concerns mixed together:
- UI components, business logic, storage, and process management all in one file
- Difficult to debug - hard to locate specific functionality
- Difficult to extend - adding features requires navigating a massive file
- Poor code organization despite having clear logical sections

## Solution Statement
Create a modular folder structure under `extensions/agent-team-interactive/` while maintaining the main `agent-team-interactive.ts` as a thin entry point for backward compatibility.

## Relevant Files

### New Files
- `extensions/agent-team-interactive/index.ts` — Main extension entry point with tool/command registration
- `extensions/agent-team-interactive/types.ts` — All TypeScript interfaces and types
- `extensions/agent-team-interactive/utils.ts` — Helper functions (displayName, formatTime, generateId, parseTeamsYaml)
- `extensions/agent-team-interactive/agent-scanner.ts` — Agent file parsing and scanning (parseAgentFile, scanAgentDirs)
- `extensions/agent-team-interactive/storage.ts` — SessionStorage class for persistence
- `extensions/agent-team-interactive/checkpoints.ts` — CheckpointManager class
- `extensions/agent-team-interactive/components/agent-panel.ts` — AgentPanel UI component
- `extensions/agent-team-interactive/components/timeline-ui.ts` — TimelineUI component
- `extensions/agent-team-interactive/managers/panel-manager.ts` — PanelManager class
- `extensions/agent-team-interactive/managers/process-manager.ts` — AgentProcessManager class

### Modified Files
- `extensions/agent-team-interactive.ts` — Convert to thin re-export of index.ts for compatibility

## Implementation Plan

### Foundation Phase
1. Create folder structure: `extensions/agent-team-interactive/` with `components/` and `managers/` subfolders
2. Extract and test `types.ts` — all interfaces (AgentDef, AgentMessage, Checkpoint, etc.)
3. Extract and test `utils.ts` — pure functions (displayName, formatTime, generateId, parseTeamsYaml)

### Core Phase
4. Extract `agent-scanner.ts` — parseAgentFile and scanAgentDirs functions
5. Extract `storage.ts` — SessionStorage class
6. Extract `checkpoints.ts` — CheckpointManager class
7. Extract UI components to `components/` folder (agent-panel.ts, timeline-ui.ts)
8. Extract managers to `managers/` folder (panel-manager.ts, process-manager.ts)

### Integration Phase
9. Create `index.ts` — main extension logic importing all modules
10. Update `agent-team-interactive.ts` to re-export from index.ts
11. Test extension loading and all commands functionality

## Step by Step Tasks

1. **Create folder structure**
   - Create `extensions/agent-team-interactive/`
   - Create `extensions/agent-team-interactive/components/`
   - Create `extensions/agent-team-interactive/managers/`

2. **Extract types** → `extensions/agent-team-interactive/types.ts`
   - Move all interfaces (lines 59-118)
   - Verify no circular dependencies

3. **Extract utils** → `extensions/agent-team-interactive/utils.ts`
   - Move displayName, generateId, formatTime (lines 121-131)
   - Move parseTeamsYaml (lines 135-151)

4. **Extract agent scanner** → `extensions/agent-team-interactive/agent-scanner.ts`
   - Move parseAgentFile, scanAgentDirs (lines 155-217)
   - Import types from types.ts
   - Import fs/path modules

5. **Extract storage** → `extensions/agent-team-interactive/storage.ts`
   - Move SessionStorage class (lines 221-305)
   - Import types, fs/path

6. **Extract checkpoints** → `extensions/agent-team-interactive/checkpoints.ts`
   - Move CheckpointManager class (lines 309-343)
   - Import types, utils

7. **Extract AgentPanel** → `extensions/agent-team-interactive/components/agent-panel.ts`
   - Move AgentPanel class (lines 347-472)
   - Import types, TUI components

8. **Extract TimelineUI** → `extensions/agent-team-interactive/components/timeline-ui.ts`
   - Move TimelineUI class (lines 476-552)
   - Import types, TUI components

9. **Extract PanelManager** → `extensions/agent-team-interactive/managers/panel-manager.ts`
   - Move PanelManager class (lines 556-603)
   - Import AgentPanel from components

10. **Extract ProcessManager** → `extensions/agent-team-interactive/managers/process-manager.ts`
    - Move AgentProcessManager class (lines 607-851)
    - Import types, storage, checkpoints

11. **Create index.ts** → `extensions/agent-team-interactive/index.ts`
    - Import all modules
    - Create main extension function with tool/command registration
    - Wire up all components

12. **Update main file** → `extensions/agent-team-interactive.ts`
    - Replace content with re-export: `export { default } from "./agent-team-interactive/index.js"`

13. **Test all functionality**
    - Test extension loads via `pi -e extensions/agent-team-interactive.ts`
    - Test /team command
    - Test /to command
    - Test /checkpoint command
    - Test /undo command
    - Test /timeline command
    - Test /fork command

## Testing Strategy

### Unit Tests
- Verify each extracted module imports correctly
- Test utils functions return expected values
- Test agent scanner parses YAML correctly

### Integration Tests
- Test extension loads without errors
- Test all commands work end-to-end
- Test agent spawning and communication
- Test checkpoint creation and restoration

### Edge Cases
- Missing agent directories
- Invalid YAML in teams file
- Empty checkpoint list
- Agent process failures

## Acceptance Criteria
- [ ] `extensions/agent-team-interactive.ts` still executes via `pi -e extensions/agent-team-interactive.ts`
- [ ] All components in separate files under `extensions/agent-team-interactive/`
- [ ] Folder structure: `components/` for UI, `managers/` for business logic
- [ ] All commands work: /team, /to, /checkpoint, /undo, /timeline, /fork
- [ ] No circular dependencies
- [ ] File sizes under 200 lines per module (where applicable)

## Validation Commands
```bash
# Test extension loads
pi -e extensions/agent-team-interactive.ts --version

# Test file structure
ls extensions/agent-team-interactive/
ls extensions/agent-team-interactive/components/
ls extensions/agent-team-interactive/managers/

# Test commands work (in interactive session)
/team
/to <agent> test message
/checkpoint test
/undo
/timeline
```

## Notes
- Keep imports using `.js` extension for ESM compatibility (TypeScript compiles to .js)
- Theme map import needs special handling: `./themeMap.ts` is sibling to main file
- After refactoring, each file should have a single clear responsibility
