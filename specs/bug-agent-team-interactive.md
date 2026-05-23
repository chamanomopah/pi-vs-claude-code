# Bug: agent-team-interactive - Wrong package imports and missing theme mapping

## Bug Description
The extension `agent-team-interactive.ts` fails to load because it imports from incorrect package names. Additionally, it's missing from the theme mapping in `themeMap.ts`.

## Problem Statement
1. The extension imports from `@mariozechner/pi-coding-agent` and `@mariozechner/pi-tui`
2. According to `docs/extensions.md`, the correct package names are `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui`
3. The `themeMap.ts` file also uses the old package names
4. No theme entry exists for `agent-team-interactive` in `THEME_MAP`

## Solution Statement
Update all import statements to use the correct package names (`@earendil-works/...`) and add a theme mapping entry for the new extension.

## Steps to Reproduce
1. Run: `pi -e extensions/agent-team-interactive.ts`
2. Expected: Extension loads successfully
3. Actual: Module not found errors for `@mariozechner/pi-coding-agent`

## Root Cause Analysis
The extension was created with outdated package names. The documentation shows that Pi changed its package scope from `@mariozechner` to `@earendil-works`, but this extension and `themeMap.ts` still reference the old packages.

Additionally, `themeMap.ts` lacks an entry for `"agent-team-interactive"`, so it will fall back to the default "synthwave" theme.

## Relevant Files
- `extensions/agent-team-interactive.ts` (lines 28, 31-43, 55)
- `extensions/themeMap.ts` (line 14, missing entry in THEME_MAP)

## Step by Step Tasks
1. Update `extensions/agent-team-interactive.ts`:
   - Line 28: Change `@mariozechner/pi-coding-agent` → `@earendil-works/pi-coding-agent`
   - Lines 31-42: Change `@mariozechner/pi-tui` → `@earendil-works/pi-tui`
   - Line 43: Change `@mariozechner/pi-coding-agent` → `@earendil-works/pi-coding-agent`

2. Update `extensions/themeMap.ts`:
   - Line 14: Change `@mariozechner/pi-coding-agent` → `@earendil-works/pi-coding-agent`
   - Add to THEME_MAP (after line 41): `"agent-team-interactive": "cyberpunk",`

## Validation Commands
```bash
# Test the extension loads
pi -e extensions/agent-team-interactive.ts

# Verify no import errors
# Should see team selection prompt, not module errors
```

## Notes
- The theme "cyberpunk" is suggested for `agent-team-interactive` because it's a multi-agent orchestration tool (similar to `subagent-widget`)
- Other extensions in the codebase may have the same import issue and should be audited
