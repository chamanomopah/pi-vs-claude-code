// Types for agent-team-interactive extension

// Color palette for agents (using valid semantic theme colors)
const AGENT_COLORS = [
	"accent", "success", "warning", "error", "muted", "dim"
] as const;

export function getAgentColor(name: string): string {
	const idx = Math.abs(hashString(name)) % AGENT_COLORS.length;
	return AGENT_COLORS[idx];
}

function hashString(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash;
	}
	return hash;
}

export interface AgentDef {
	name: string;
	description: string;
	tools: string;
	systemPrompt: string;
	file: string;
	agentColor?: string;
}

export interface AgentMessage {
	role: "user" | "assistant" | "system" | "tool_result";
	content: string;
	timestamp: number;
	toolCalls?: ToolCall[];
}

export interface ToolCall {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

export interface Checkpoint {
	id: string;
	label: string;
	timestamp: number;
	messageIndex: number;
	contextSnapshot?: any;
}

export interface AgentSessionState {
	sessionId: string;
	agentName: string;
	status: "idle" | "thinking" | "working" | "error";
	currentTask: string;
	messages: AgentMessage[];
	checkpoints: Checkpoint[];
	currentCheckpointIndex: number;
	lastWork: string;
	fullContent: string;
	toolCount: number;
	elapsed: number;
	contextPct: number;
	sessionFile: string | null;
	proc?: any;
	timer?: ReturnType<typeof setInterval>;
}

export interface PanelConfig {
	agentName: string;
	position: "top" | "bottom" | "left" | "right";
	height?: number;
	width?: number;
}

export interface AgentProcess {
	proc: any;
	state: AgentSessionState;
	buffer: string;
	textChunks: string[];
	startTime: number;
}

// Collapse state tracking for feed messages
export interface MessageCollapseState {
	messageId: string;
	collapsed: boolean;
}

export class CollapseStateManager {
	private state: Map<string, boolean> = new Map();

	initialize(messageId: string, collapsed: boolean = false): void {
		if (!this.state.has(messageId)) {
			this.state.set(messageId, collapsed);
		}
	}

	isCollapsed(messageId: string): boolean {
		return this.state.get(messageId) ?? false;
	}

	toggle(messageId: string): boolean {
		const current = this.isCollapsed(messageId);
		this.state.set(messageId, !current);
		return !current;
	}

	set(messageId: string, collapsed: boolean): void {
		this.state.set(messageId, collapsed);
	}

	toggleAll(): void {
		const allCollapsed = Array.from(this.state.values()).every(v => v);
		for (const key of this.state.keys()) {
			this.state.set(key, !allCollapsed);
		}
	}

	setAll(collapsed: boolean): void {
		for (const key of this.state.keys()) {
			this.state.set(key, collapsed);
		}
	}
}
