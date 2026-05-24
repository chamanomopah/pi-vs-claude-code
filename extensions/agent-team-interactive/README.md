# Agent Team Interactive

Multi-agent orchestration extension for Pi with real-time feed UI and checkpoint management.

## Features

- Inline feed messages showing each agent's output (fully expanded by default)
- Direct communication with individual agents via `/to <agent>`
- Checkpoint system for undo/fork of agent conversations
- Session persistence to `.pi/agent-sessions/`
- Timeline navigation with keyboard shortcuts
- Color-coded agent messages in feed
- Minimal agent icons in footer
- Collapse/expand for all agent messages (`Alt+A`)
- Collapse/expand for specific agent (`Alt+1`, `Alt+2`...)

## Commands

| Command | Description |
|---------|-------------|
| `/team` | Switch active team |
| `/to <agent> <message>` | Send message directly to agent |
| `/checkpoint <label>` | Create checkpoint at current state |
| `/undo` | Revert to previous checkpoint |
| `/fork <checkpoint-id>` | Create new session branch from checkpoint |
| `/timeline` | Show checkpoint history with navigation |
| `/revert <msg-id>` | Revert to specific message |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+A` | Toggle all agent messages |
| `Alt+1`, `Alt+2`, ... | Toggle specific agent message |

## Setup

1. Create agent definitions in `.pi/agents/` directory
2. Define teams in `.pi/agents/teams-interactive.yaml`:

```yaml
frontend:
  - frontend-dev
  - ui-designer
backend:
  - api-dev
  - db-admin
```

3. Run: `pi -e extensions/agent-team-interactive.ts`

## Structure

```
agent-team-interactive/
├── index.ts              # Main extension entry
├── types.ts              # Type definitions
├── utils.ts              # Helper functions
├── agent-scanner.ts      # Agent discovery
├── storage.ts            # Session persistence
├── components/
│   ├── agent-panel.ts
│   ├── timeline-ui.ts
│   ├── agent-icons.ts
│   └── feed-message.ts
└── managers/
    ├── process-manager.ts
    └── message-manager.ts
```
