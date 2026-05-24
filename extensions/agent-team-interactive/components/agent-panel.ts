// AgentPanel UI component

import { Box, Text, Container, Spacer, matchesKey, Key, type Theme } from "@mariozechner/pi-tui";
import { getMarkdownTheme as getPiMdTheme, DynamicBorder } from "@mariozechner/pi-coding-agent";
import type { AgentSessionState, AgentDef } from "../types.js";
import { displayName, formatTime } from "../utils.js";

export class AgentPanel {
	private scrollOffset = 0;
	private expandedToolCall: string | null = null;

	constructor(
		private state: AgentSessionState,
		private agentDef: AgentDef,
		private selected: boolean,
	) {}

	setState(state: AgentSessionState): void {
		this.state = state;
	}

	setSelected(selected: boolean): void {
		this.selected = selected;
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.up)) {
			this.scrollOffset = Math.max(0, this.scrollOffset - 1);
		} else if (matchesKey(data, Key.down)) {
			this.scrollOffset += 1;
		}
	}

	render(width: number, height: number, theme: Theme): string[] {
		const container = new Container();
		const mdTheme = getPiMdTheme();
		const panelHeight = height || 10;

		// Status indicator
		let statusIcon = "○";
		let statusColor = "dim";
		if (this.state.status === "thinking") {
			statusIcon = "●";
			statusColor = "accent";
		} else if (this.state.status === "working") {
			statusIcon = "⚙";
			statusColor = "warning";
		} else if (this.state.status === "error") {
			statusIcon = "✗";
			statusColor = "error";
		} else if (this.state.status === "idle") {
			statusIcon = "✓";
			statusColor = "success";
		}

		// Header
		const headerBg = this.selected ? "selectedBg" : undefined;
		const headerBox = new Box(1, 0, (s: string) =>
			this.selected ? theme.bg(headerBg, s) : s
		);

		const name = displayName(this.agentDef.name);
		const headerStr =
			theme.fg(statusColor, statusIcon) +
			" " +
			theme.bold(name) +
			" " +
			theme.fg("dim", `[${this.state.status}]`);

		headerBox.addChild(new Text(headerStr, 0, 0));
		container.addChild(headerBox);
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		container.addChild(new Spacer(1));

		// Context bar
		if (this.state.contextPct > 0) {
			const filled = Math.ceil(this.state.contextPct / 20);
			const bar = "#".repeat(filled) + "-".repeat(5 - filled);
			const ctxStr = theme.fg("dim", `[${bar}] ${Math.ceil(this.state.contextPct)}%`);
			container.addChild(new Text(ctxStr, 0, 0));
			container.addChild(new Spacer(1));
		}

		// Messages (last N visible)
		const maxMessages = Math.min(panelHeight - 4, this.state.messages.length);
		const visibleMessages = this.state.messages.slice(-maxMessages);

		for (const msg of visibleMessages) {
			const isTool = msg.role === "tool_result";
			const icon = isTool ? "⚡" : msg.role === "user" ? "👤" : "🤖";
			const iconColor = isTool ? "warning" : msg.role === "user" ? "success" : "accent";

			const msgBox = new Box(1, 0);
			const timestamp = formatTime(new Date(msg.timestamp));
			const timeStr = theme.fg("dim", `[${timestamp}]`);
			const content = msg.content.replace(/\n/g, " ").substring(0, width - 15);

			msgBox.addChild(
				new Text(
					theme.fg(iconColor, icon) +
					" " +
					timeStr +
					" " +
					theme.fg("muted", content),
					0,
					0,
				)
			);
			container.addChild(msgBox);
		}

		// Current work in progress
		if (this.state.lastWork && (this.state.status === "thinking" || this.state.status === "working")) {
			container.addChild(new Spacer(1));
			const workPreview = this.state.lastWork.replace(/\n/g, " ").substring(0, width - 10);
			container.addChild(
				new Text(theme.fg("accent", "▸ ") + theme.fg("muted", workPreview + "..."), 0, 0)
			);
		}

		// Footer with checkpoint info
		if (this.state.checkpoints.length > 0) {
			container.addChild(new Spacer(1));
			const cp = this.state.checkpoints[this.state.currentCheckpointIndex];
			if (cp) {
				const cpStr = theme.fg("dim", `Checkpoint: ${cp.label} (${this.state.checkpoints.length} total)`);
				container.addChild(new Text(cpStr, 0, 0));
			}
		}

		return container.render(width);
	}
}
