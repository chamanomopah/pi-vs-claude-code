// MessageManager - Posts agent messages to the feed instead of widgets

import type { AgentSessionState, AgentDef, CollapseStateManager } from "../types.js";
import type { Theme, TUI } from "@mariozechner/pi-tui";
import { formatAgentMessageForPrint } from "../components/feed-message.js";
import { getAgentColor } from "../types.js";

export class MessageManager {
	private collapseManager: CollapseStateManager;
	private messageIds: Map<string, string> = new Map();
	private tui: TUI | null = null;
	private theme: Theme | null = null;

	constructor(collapseManager: CollapseStateManager) {
		this.collapseManager = collapseManager;
	}

	setContext(tui: TUI, theme: Theme): void {
		this.tui = tui;
		this.theme = theme;
	}

	postMessage(agentName: string, agentDef: AgentDef, state: AgentSessionState): void {
		if (!this.tui || !this.theme) {
			return;
		}

		const messageId = this.getMessageId(agentName);
		const collapsed = this.collapseManager.isCollapsed(messageId);

		const formatted = formatAgentMessageForPrint(agentDef, state, collapsed, this.theme);
		this.tui.log(formatted);
	}

	postStreamingUpdate(agentName: string, agentDef: AgentDef, state: AgentSessionState): void {
		const color = getAgentColor(agentDef.name);
		const name = agentDef.name;
		const timestamp = new Date().toLocaleTimeString();

		let statusIcon = "●";
		let statusColor = "accent";
		if (state.status === "working") {
			statusIcon = "⚙";
			statusColor = "warning";
		}

		const content = state.lastWork || "";

		// Skip if TUI not available
		if (!this.tui || !this.theme) {
			return;
		}

		const messageId = this.getMessageId(agentName);
		const collapsed = this.collapseManager.isCollapsed(messageId);
		const collapseIndicator = collapsed ? "▸" : "▾";

		if (collapsed && content) {
			const lines = content.split("\n").filter(l => l.trim());
			const lineCount = lines.length;
			const preview = lines[0]?.substring(0, 60) || "";

			this.tui.log(
				`${this.theme.fg(color, this.theme.bold(name))} ${this.theme.fg(statusColor, statusIcon)} ${this.theme.fg("dim", collapseIndicator)} ${this.theme.fg("dim", timestamp)}\n${this.theme.fg("dim", `${preview}... [${lineCount} lines]`)}`
			);
		} else if (content) {
			this.tui.log(
				`${this.theme.fg(color, this.theme.bold(name))} ${this.theme.fg(statusColor, statusIcon)} ${this.theme.fg("dim", collapseIndicator)} ${this.theme.fg("dim", timestamp)}\n${content}`
			);
		}
	}

	toggleCollapse(agentName: string): boolean {
		const messageId = this.getMessageId(agentName);
		return this.collapseManager.toggle(messageId);
	}

	toggleAllCollapse(): void {
		this.collapseManager.toggleAll();
	}

	setCollapse(agentName: string, collapsed: boolean): void {
		const messageId = this.getMessageId(agentName);
		this.collapseManager.set(messageId, collapsed);
	}

	private getMessageId(agentName: string): string {
		let id = this.messageIds.get(agentName);
		if (!id) {
			id = `${agentName}-${Date.now()}`;
			this.messageIds.set(agentName, id);
			// Initialize collapse state to expanded (false) for new messages
			this.collapseManager.initialize(id, false);
		}
		return id;
	}

	getAgentStates(agents: AgentDef[]): Map<string, { status: string; selected: boolean }> {
		return new Map();
	}
}
