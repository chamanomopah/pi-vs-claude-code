// Types for agent-team-interactive extension

export interface AgentDef {
	name: string;
	description: string;
	tools: string;
	systemPrompt: string;
	file: string;
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
	toolCount: number;
	elapsed: number;
	contextPct: number;
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
