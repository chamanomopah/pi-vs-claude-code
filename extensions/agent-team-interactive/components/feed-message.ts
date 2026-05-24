// FeedMessage - Render agent messages in the main feed with collapse support

import { Text, type Theme } from "@mariozechner/pi-tui";
import type { AgentSessionState, AgentDef } from "../types.js";
import { displayName, formatTime } from "../utils.js";
import { getAgentColor } from "../types.js";

export interface FeedMessageOptions {
	messageId: string;
	agentDef: AgentDef;
	state: AgentSessionState;
	collapsed: boolean;
	isStreaming?: boolean;
}

export function renderAgentMessage(options: FeedMessageOptions, theme: Theme): Text {
	const { messageId, agentDef, state, collapsed, isStreaming = false } = options;

	const color = getAgentColor(agentDef.name);
	const name = displayName(agentDef.name);
	const timestamp = formatTime(new Date(Date.now()));

	// Status indicator
	let statusIcon = "○";
	let statusColor = "dim";
	if (state.status === "thinking") {
		statusIcon = "●";
		statusColor = "accent";
	} else if (state.status === "working") {
		statusIcon = "⚙";
		statusColor = "warning";
	} else if (state.status === "error") {
		statusIcon = "✗";
		statusColor = "error";
	} else if (state.status === "idle") {
		statusIcon = "✓";
		statusColor = "success";
	}

	// Collapse toggle indicator
	const collapseIndicator = collapsed ? "▸" : "▾";

	// Header (always visible)
	const header = theme.fg(color, theme.bold(name)) +
		" " +
		theme.fg(statusColor, statusIcon) +
		" " +
		theme.fg("dim", `[${state.status}]`) +
		" " +
		theme.fg("dim", collapseIndicator) +
		" " +
		theme.fg("dim", timestamp);

	if (isStreaming) {
		return new Text(
			header + "\n" +
			theme.fg("accent", "⏳ "),
			0,
			0
		);
	}

	// Get message content
	const content = state.messages.length > 0
		? state.messages[state.messages.length - 1].content
		: state.lastWork || "";

	if (!content) {
		return new Text(
			header + "\n" +
			theme.fg("dim", "No content yet..."),
			0,
			0
		);
	}

	if (collapsed) {
		// Count lines for preview
		const lines = content.split("\n").filter(l => l.trim());
		const lineCount = lines.length;
		const preview = lines[0]?.substring(0, 60) || "";

		return new Text(
			header + "\n" +
			theme.fg("dim", `${preview}... [${lineCount} lines]`),
			0,
			0
		);
	}

	// Expanded - show full content
	return new Text(
		header + "\n" +
		content,
		0,
		0
	);
}

export function formatAgentMessageForPrint(
	agentDef: AgentDef,
	state: AgentSessionState,
	collapsed: boolean,
	theme: Theme
): string {
	const color = getAgentColor(agentDef.name);
	const name = displayName(agentDef.name);
	const timestamp = formatTime(new Date(Date.now()));

	// Status indicator
	let statusIcon = "○";
	let statusColor = "dim";
	if (state.status === "thinking") {
		statusIcon = "●";
		statusColor = "accent";
	} else if (state.status === "working") {
		statusIcon = "⚙";
		statusColor = "warning";
	} else if (state.status === "error") {
		statusIcon = "✗";
		statusColor = "error";
	} else if (state.status === "idle") {
		statusIcon = "✓";
		statusColor = "success";
	}

	// Collapse toggle indicator
	const collapseIndicator = collapsed ? "▸" : "▾";

	// Get message content
	const content = state.messages.length > 0
		? state.messages[state.messages.length - 1].content
		: state.lastWork || "";

	if (!content) {
		return `${theme.fg(color, theme.bold(name))} ${theme.fg(statusColor, statusIcon)} ${theme.fg("dim", `[${state.status}]`)} ${theme.fg("dim", collapseIndicator)} ${theme.fg("dim", timestamp)}\n${theme.fg("dim", "No content yet...")}`;
	}

	if (collapsed) {
		const lines = content.split("\n").filter(l => l.trim());
		const lineCount = lines.length;
		const preview = lines[0]?.substring(0, 60) || "";

		return `${theme.fg(color, theme.bold(name))} ${theme.fg(statusColor, statusIcon)} ${theme.fg("dim", `[${state.status}]`)} ${theme.fg("dim", collapseIndicator)} ${theme.fg("dim", timestamp)}\n${theme.fg("dim", `${preview}... [${lineCount} lines]`)}`;
	}

	// Expanded - show full content
	return `${theme.fg(color, theme.bold(name))} ${theme.fg(statusColor, statusIcon)} ${theme.fg("dim", `[${state.status}]`)} ${theme.fg("dim", collapseIndicator)} ${theme.fg("dim", timestamp)}\n${content}`;
}
