// PanelManager - Manages multiple AgentPanel instances

import type { AgentSessionState, AgentDef } from "../types.js";
import { AgentPanel } from "../components/agent-panel.js";
import type { Theme } from "@mariozechner/pi-tui";

export class PanelManager {
	private panels: Map<string, AgentPanel> = new Map();
	private selectedPanel = "orchestrator";
	private layout: "horizontal" | "vertical" = "horizontal";

	createPanel(agentName: string, agentDef: AgentDef, state: AgentSessionState): void {
		const panel = new AgentPanel(state, agentDef, agentName === this.selectedPanel);
		this.panels.set(agentName, panel);
	}

	updatePanel(agentName: string, state: AgentSessionState): void {
		const panel = this.panels.get(agentName);
		if (panel) {
			panel.setState(state);
		}
	}

	selectPanel(agentName: string): void {
		this.selectedPanel = agentName;
		for (const [name, panel] of this.panels) {
			panel.setSelected(name === agentName);
		}
	}

	render(width: number, height: number, theme: Theme): string[] {
		if (this.panels.size === 0) {
			return [theme.fg("dim", "No agents active.")];
		}

		const panelCount = this.panels.size;
		const panelHeight = Math.floor((height - 2) / panelCount);
		const output: string[] = [];

		output.push(theme.fg("dim", "─".repeat(width)));
		let idx = 0;
		for (const [name, panel] of this.panels) {
			const panelLines = panel.render(width - 2, panelHeight, theme);
			output.push(...panelLines);
			if (idx < this.panels.size - 1) {
				output.push(theme.fg("dim", "─".repeat(width)));
			}
			idx++;
		}
		output.push(theme.fg("dim", "─".repeat(width)));

		return output;
	}
}
