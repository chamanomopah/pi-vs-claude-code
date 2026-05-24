// AgentIcons - Minimal footer selector for agents

import type { Theme } from "@mariozechner/pi-tui";
import type { AgentDef } from "../types.js";
import { getAgentColor } from "../types.js";

export interface AgentIconState {
	name: string;
	status: "idle" | "thinking" | "working" | "error";
	selected: boolean;
}

export function renderAgentIcons(
	agents: AgentDef[],
	states: Map<string, AgentIconState>,
	width: number,
	theme: Theme
): string {
	if (agents.length === 0) return "";

	const iconSpacing = 2;
	const iconWidth = 3;

	const icons: string[] = [];
	let totalWidth = 0;

	for (const agent of agents) {
		const state = states.get(agent.name.toLowerCase());
		if (!state) continue;

		const color = getAgentColor(agent.name);
		const firstChar = agent.name.charAt(0).toUpperCase();
		const bgColor = state.selected ? "selectedBg" : undefined;

		// Status dot
		let statusDot = "●";
		let statusColor = "dim";
		if (state.status === "thinking") {
			statusColor = "accent";
		} else if (state.status === "working") {
			statusColor = "warning";
		} else if (state.status === "error") {
			statusColor = "error";
		} else if (state.status === "idle") {
			statusDot = "✓";
			statusColor = "success";
		}

		// Build icon
		let icon = "";
		if (bgColor) {
			icon = theme.bg(bgColor,
				theme.fg(statusColor, statusDot) +
				theme.fg(color, firstChar)
			);
		} else {
			icon = theme.fg(statusColor, statusDot) + theme.fg(color, firstChar);
		}

		icons.push(icon);
		totalWidth += iconWidth + iconSpacing;
	}

	// Truncate if too wide
	if (totalWidth > width) {
		const maxIcons = Math.floor((width - 10) / (iconWidth + iconSpacing));
		if (icons.length > maxIcons) {
			const visible = icons.slice(0, maxIcons);
			const remaining = icons.length - maxIcons;
			return visible.join(" ") + theme.fg("dim", ` +${remaining}`);
		}
	}

	return icons.join(" ");
}

export function renderAgentIcon(
	agent: AgentDef,
	state: AgentIconState,
	theme: Theme
): string {
	const color = getAgentColor(agent.name);
	const firstChar = agent.name.charAt(0).toUpperCase();

	let statusDot = "●";
	let statusColor = "dim";
	if (state.status === "thinking") {
		statusColor = "accent";
	} else if (state.status === "working") {
		statusColor = "warning";
	} else if (state.status === "error") {
		statusColor = "error";
	} else if (state.status === "idle") {
		statusDot = "✓";
		statusColor = "success";
	}

	if (state.selected) {
		return theme.bg("selectedBg",
			theme.fg(statusColor, statusDot) +
			theme.fg(color, firstChar)
		);
	}

	return theme.fg(statusColor, statusDot) + theme.fg(color, firstChar);
}
