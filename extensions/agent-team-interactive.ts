/**
 * Agent Team Interactive — Multi-agent orchestration with live panels and checkpoint system
 *
 * A next-generation multi-agent orchestration extension that provides real-time visibility
 * into each agent's thinking process, direct communication channels, checkpoint-based session
 * management with undo/fork capabilities, and persistent session history tracking.
 *
 * Features:
 * - Live-updating TUI panels showing each agent's message stream
 * - Direct communication with individual agents via /to <agent>
 * - Checkpoint system for undo/fork of agent conversations
 * - Session persistence to .pi/agent-sessions/
 * - Timeline navigation with keyboard shortcuts
 * - Orchestrator pattern for agent coordination
 *
 * Commands:
 *   /team                 — switch active team
 *   /to <agent>           — send message directly to agent
 *   /checkpoint <label>   — create checkpoint at current state
 *   /undo                 — revert to previous checkpoint
 *   /fork <checkpoint-id> — create new session branch from checkpoint
 *   /timeline             — show checkpoint history with navigation
 *   /revert <msg-id>      — revert to specific message
 *
 * Usage: pi -e extensions/agent-team-interactive.ts -e extensions/theme-cycler.ts
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type, StringEnum } from "@sinclair/typebox";
import {
	Box,
	Text,
	Markdown,
	Container,
	Spacer,
	matchesKey,
	Key,
	truncateToWidth,
	getMarkdownTheme,
	type AutocompleteItem,
} from "@mariozechner/pi-tui";
import { DynamicBorder, getMarkdownTheme as getPiMdTheme } from "@mariozechner/pi-coding-agent";
import { spawn } from "child_process";
import {
	readdirSync,
	readFileSync,
	existsSync,
	mkdirSync,
	writeFileSync,
	unlinkSync,
	statSync,
} from "fs";
import { join, resolve, dirname } from "path";
import { applyExtensionDefaults } from "./themeMap.ts";

// ── Types ────────────────────────────────────────────────────────────────

interface AgentDef {
	name: string;
	description: string;
	tools: string;
	systemPrompt: string;
	file: string;
}

interface AgentMessage {
	role: "user" | "assistant" | "system" | "tool_result";
	content: string;
	timestamp: number;
	toolCalls?: ToolCall[];
}

interface ToolCall {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

interface Checkpoint {
	id: string;
	label: string;
	timestamp: number;
	messageIndex: number;
	contextSnapshot?: any;
}

interface AgentSessionState {
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

interface PanelConfig {
	agentName: string;
	position: "top" | "bottom" | "left" | "right";
	height?: number;
	width?: number;
}

interface AgentProcess {
	proc: any;
	state: AgentSessionState;
	buffer: string;
	textChunks: string[];
	startTime: number;
}

// ── Display Name Helper ────────────────────────────────────────────────────

function displayName(name: string): string {
	return name.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function formatTime(date: Date): string {
	return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── YAML Parser ────────────────────────────────────────────────────────────

function parseTeamsYaml(raw: string): Record<string, string[]> {
	const teams: Record<string, string[]> = {};
	let current: string | null = null;
	for (const line of raw.split("\n")) {
		const teamMatch = line.match(/^(\S[^:]*):$/);
		if (teamMatch) {
			current = teamMatch[1].trim();
			teams[current] = [];
			continue;
		}
		const itemMatch = line.match(/^\s+-\s+(.+)$/);
		if (itemMatch && current) {
			teams[current].push(itemMatch[1].trim());
		}
	}
	return teams;
}

// ── Frontmatter Parser ─────────────────────────────────────────────────────

function parseAgentFile(filePath: string): AgentDef | null {
	try {
		const raw = readFileSync(filePath, "utf-8");
		const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
		if (!match) return null;

		const frontmatter: Record<string, string> = {};
		for (const line of match[1].split("\n")) {
			const idx = line.indexOf(":");
			if (idx > 0) {
				frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
			}
		}

		if (!frontmatter.name) return null;

		return {
			name: frontmatter.name,
			description: frontmatter.description || "",
			tools: frontmatter.tools || "read,grep,find,ls",
			systemPrompt: match[2].trim(),
			file: filePath,
		};
	} catch {
		return null;
	}
}

function scanAgentDirs(cwd: string): AgentDef[] {
	const dirs = [
		join(cwd, "agents"),
		join(cwd, ".claude", "agents"),
		join(cwd, ".pi", "agents"),
	];

	const agents: AgentDef[] = [];
	const seen = new Set<string>();

	for (const dir of dirs) {
		if (!existsSync(dir)) continue;
		try {
			for (const file of readdirSync(dir)) {
				if (!file.endsWith(".md")) continue;
				const fullPath = resolve(dir, file);
				const def = parseAgentFile(fullPath);
				if (def && !seen.has(def.name.toLowerCase())) {
					seen.add(def.name.toLowerCase());
					agents.push(def);
				}
			}
		} catch {}
	}

	return agents;
}

// ── Session Storage ────────────────────────────────────────────────────────

class SessionStorage {
	private sessionDir: string;

	constructor(cwd: string) {
		this.sessionDir = join(cwd, ".pi", "agent-sessions");
		if (!existsSync(this.sessionDir)) {
			mkdirSync(this.sessionDir, { recursive: true });
		}
	}

	getAgentDir(agentName: string): string {
		const dir = join(this.sessionDir, agentName.toLowerCase().replace(/\s+/g, "-"));
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		return dir;
	}

	saveSession(agentName: string, state: AgentSessionState): void {
		const agentDir = this.getAgentDir(agentName);
		const sessionFile = join(agentDir, `${state.sessionId}.jsonl`);

		const lines = state.messages.map(msg =>
			JSON.stringify({ ...msg, __checkpoint: state.checkpoints })
		);
		writeFileSync(sessionFile, lines.join("\n") + "\n");

		// Save metadata
		const metaFile = join(agentDir, "meta.json");
		writeFileSync(metaFile, JSON.stringify({
			sessionId: state.sessionId,
			agentName,
			currentCheckpointIndex: state.currentCheckpointIndex,
			checkpoints: state.checkpoints,
		}, null, 2));
	}

	loadSession(agentName: string, sessionId: string): Partial<AgentSessionState> | null {
		const agentDir = this.getAgentDir(agentName);
		const sessionFile = join(agentDir, `${sessionId}.jsonl`);

		if (!existsSync(sessionFile)) return null;

		try {
			const content = readFileSync(sessionFile, "utf-8");
			const messages: AgentMessage[] = [];
			let checkpoints: Checkpoint[] = [];

			for (const line of content.split("\n")) {
				if (!line.trim()) continue;
				const parsed = JSON.parse(line);
				if (parsed.__checkpoint) {
					checkpoints = parsed.__checkpoint;
					delete parsed.__checkpoint;
				}
				messages.push(parsed);
			}

			return { messages, checkpoints };
		} catch {
			return null;
		}
	}

	listSessions(agentName: string): Array<{ sessionId: string; timestamp: number }>[] {
		const agentDir = this.getAgentDir(agentName);
		if (!existsSync(agentDir)) return [];

		const sessions: Array<{ sessionId: string; timestamp: number }> = [];

		try {
			for (const file of readdirSync(agentDir)) {
				if (!file.endsWith(".jsonl")) continue;
				const fullPath = join(agentDir, file);
				const stats = statSync(fullPath);
				sessions.push({
					sessionId: file.replace(".jsonl", ""),
					timestamp: stats.mtimeMs,
				});
			}
		} catch {}

		return sessions.sort((a, b) => b.timestamp - a.timestamp);
	}
}

// ── Checkpoint Manager ─────────────────────────────────────────────────────

class CheckpointManager {
	createCheckpoint(state: AgentSessionState, label: string): Checkpoint {
		const checkpoint: Checkpoint = {
			id: generateId(),
			label,
			timestamp: Date.now(),
			messageIndex: state.messages.length,
		};
		state.checkpoints.push(checkpoint);
		state.currentCheckpointIndex = state.checkpoints.length - 1;
		return checkpoint;
	}

	restoreCheckpoint(state: AgentSessionState, checkpointId: string): boolean {
		const idx = state.checkpoints.findIndex(cp => cp.id === checkpointId);
		if (idx === -1) return false;

		const checkpoint = state.checkpoints[idx];
		state.messages = state.messages.slice(0, checkpoint.messageIndex);
		state.currentCheckpointIndex = idx;
		return true;
	}

	undo(state: AgentSessionState): boolean {
		if (state.currentCheckpointIndex <= 0) return false;
		state.currentCheckpointIndex--;
		const checkpoint = state.checkpoints[state.currentCheckpointIndex];
		state.messages = state.messages.slice(0, checkpoint.messageIndex);
		return true;
	}

	listCheckpoints(state: AgentSessionState): Checkpoint[] {
		return state.checkpoints;
	}
}

// ── Agent Panel Component ──────────────────────────────────────────────────

class AgentPanel {
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

	render(width: number, height: number, theme: any): string[] {
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

// ── Timeline UI Component ───────────────────────────────────────────────────

class TimelineUI {
	private selectedIndex = 0;
	private scrollOffset = 0;

	constructor(
		private checkpoints: Checkpoint[],
		private onSelect: (checkpointId: string) => void,
		private onDone: () => void,
	) {
		this.selectedIndex = checkpoints.length - 1;
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.up)) {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
		} else if (matchesKey(data, Key.down)) {
			this.selectedIndex = Math.min(this.checkpoints.length - 1, this.selectedIndex + 1);
		} else if (matchesKey(data, Key.enter)) {
			if (this.checkpoints[this.selectedIndex]) {
				this.onSelect(this.checkpoints[this.selectedIndex].id);
			}
		} else if (matchesKey(data, Key.escape)) {
			this.onDone();
		}
	}

	render(width: number, height: number, theme: any): string[] {
		const container = new Container();

		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		container.addChild(
			new Text(
				`${theme.fg("accent", theme.bold(" TIMELINE"))} ${theme.fg("dim", "|")} ${theme.fg("success", this.checkpoints.length.toString())} checkpoints`,
				1,
				0,
			)
		);
		container.addChild(new Spacer(1));

		for (let i = 0; i < this.checkpoints.length; i++) {
			const cp = this.checkpoints[i];
			const isSelected = i === this.selectedIndex;

			const box = new Box(1, 0, (s: string) =>
				isSelected ? theme.bg("selectedBg", s) : s
			);

			const icon = isSelected ? "▸" : " ";
			const timeStr = formatTime(new Date(cp.timestamp));
			const msgStr = `msg ${cp.messageIndex}`;

			box.addChild(
				new Text(
					theme.fg("accent", icon) +
					" " +
					theme.bold(cp.label) +
					" " +
					theme.fg("dim", `[${timeStr}]`) +
					" " +
					theme.fg("muted", msgStr),
					0,
					0,
				)
			);

			container.addChild(box);
		}

		container.addChild(new Spacer(1));
		container.addChild(
			new Text(theme.fg("dim", " ↑/↓ Navigate • Enter Restore • Esc Close"), 1, 0)
		);
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

		return container.render(width);
	}
}

// ── Panel Manager ───────────────────────────────────────────────────────────

class PanelManager {
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

	render(width: number, height: number, theme: any): string[] {
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

// ── Agent Process Manager ───────────────────────────────────────────────────

class AgentProcessManager {
	private processes: Map<string, AgentProcess> = new Map();
	private sessionStorage: SessionStorage;
	private checkpointManager: CheckpointManager;

	constructor(sessionStorage: SessionStorage) {
		this.sessionStorage = sessionStorage;
		this.checkpointManager = new CheckpointManager();
	}

	spawnAgent(
		agentDef: AgentDef,
		task: string,
		ctx: any,
		onUpdate: (state: AgentSessionState) => void,
	): Promise<{ output: string; exitCode: number; elapsed: number }> {
		const key = agentDef.name.toLowerCase();

		// Kill existing process if running
		if (this.processes.has(key)) {
			this.killAgent(key);
		}

		// Create session state
		const sessionId = generateId();
		const state: AgentSessionState = {
			sessionId,
			agentName: agentDef.name,
			status: "thinking",
			currentTask: task,
			messages: [],
			checkpoints: [],
			currentCheckpointIndex: -1,
			lastWork: "",
			toolCount: 0,
			elapsed: 0,
			contextPct: 0,
		};

		// Try to load existing session
		const existing = this.sessionStorage.loadSession(agentDef.name, sessionId);
		if (existing) {
			state.messages = existing.messages || [];
			state.checkpoints = existing.checkpoints || [];
		}

		const startTime = Date.now();
		state.timer = setInterval(() => {
			state.elapsed = Date.now() - startTime;
			onUpdate(state);
		}, 1000);

		const model = ctx.model
			? `${ctx.model.provider}/${ctx.model.id}`
			: "openrouter/google/gemini-3-flash-preview";

		const args = [
			"--mode",
			"json",
			"-p",
			"--no-extensions",
			"--model",
			model,
			"--tools",
			agentDef.tools,
			"--thinking",
			"off",
			"--append-system-prompt",
			agentDef.systemPrompt,
		];

		args.push(task);

		const textChunks: string[] = [];

		return new Promise((resolve) => {
			const proc = spawn("pi", args, {
				stdio: ["ignore", "pipe", "pipe"],
				env: { ...process.env },
			});

			let buffer = "";

			proc.stdout!.setEncoding("utf-8");
			proc.stdout!.on("data", (chunk: string) => {
				buffer += chunk;
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (!line.trim()) continue;
					try {
						const event = JSON.parse(line);
						if (event.type === "message_update") {
							const delta = event.assistantMessageEvent;
							if (delta?.type === "text_delta") {
								textChunks.push(delta.delta || "");
								const full = textChunks.join("");
								const last = full.split("\n").filter((l: string) => l.trim()).pop() || "";
								state.lastWork = last;

								// Add to messages as streaming update
								if (state.messages.length === 0 ||
									state.messages[state.messages.length - 1].role !== "assistant") {
									state.messages.push({
										role: "assistant",
										content: full,
										timestamp: Date.now(),
									});
								} else {
									state.messages[state.messages.length - 1].content = full;
								}
								onUpdate(state);
							}
						} else if (event.type === "tool_execution_start") {
							state.status = "working";
							state.toolCount++;
							onUpdate(state);
						} else if (event.type === "message_end") {
							const msg = event.message;
							if (msg?.usage && ctx.model?.contextWindow) {
								state.contextPct = ((msg.usage.input || 0) / ctx.model.contextWindow) * 100;
								onUpdate(state);
							}
						} else if (event.type === "agent_end") {
							const msgs = event.messages || [];
							const last = [...msgs].reverse().find((m: any) => m.role === "assistant");
							if (last?.usage && ctx.model?.contextWindow) {
								state.contextPct = ((last.usage.input || 0) / ctx.model.contextWindow) * 100;
								onUpdate(state);
							}
						}
					} catch {}
				}
			});

			proc.stderr!.setEncoding("utf-8");
			proc.stderr!.on("data", () => {});

			proc.on("close", (code) => {
				if (buffer.trim()) {
					try {
						const event = JSON.parse(buffer);
						if (event.type === "message_update") {
							const delta = event.assistantMessageEvent;
							if (delta?.type === "text_delta") textChunks.push(delta.delta || "");
						}
					} catch {}
				}

				clearInterval(state.timer);
				state.elapsed = Date.now() - startTime;
				state.status = code === 0 ? "idle" : "error";

				const full = textChunks.join("");
				state.lastWork = full.split("\n").filter((l: string) => l.trim()).pop() || "";

				// Save final message
				if (state.messages.length > 0 && state.messages[state.messages.length - 1].role === "assistant") {
					state.messages[state.messages.length - 1].content = full;
				}

				// Save session
				this.sessionStorage.saveSession(agentDef.name, state);

				this.processes.delete(key);
				onUpdate(state);

				resolve({
					output: full,
					exitCode: code ?? 1,
					elapsed: state.elapsed,
				});
			});

			proc.on("error", (err) => {
				clearInterval(state.timer);
				state.status = "error";
				state.lastWork = `Error: ${err.message}`;
				this.processes.delete(key);
				onUpdate(state);
				resolve({
					output: `Error spawning agent: ${err.message}`,
					exitCode: 1,
					elapsed: Date.now() - startTime,
				});
			});

			this.processes.set(key, { proc, state, buffer, textChunks, startTime });
		});
	}

	killAgent(agentName: string): void {
		const key = agentName.toLowerCase();
		const procInfo = this.processes.get(key);
		if (procInfo) {
			procInfo.proc.kill();
			clearInterval(procInfo.state.timer);
			this.processes.delete(key);
		}
	}

	createCheckpoint(agentName: string, label: string): Checkpoint | null {
		const key = agentName.toLowerCase();
		const procInfo = this.processes.get(key);
		if (!procInfo) return null;

		return this.checkpointManager.createCheckpoint(procInfo.state, label);
	}

	restoreCheckpoint(agentName: string, checkpointId: string): boolean {
		const key = agentName.toLowerCase();
		const procInfo = this.processes.get(key);
		if (!procInfo) return false;

		return this.checkpointManager.restoreCheckpoint(procInfo.state, checkpointId);
	}

	undo(agentName: string): boolean {
		const key = agentName.toLowerCase();
		const procInfo = this.processes.get(key);
		if (!procInfo) return false;

		return this.checkpointManager.undo(procInfo.state);
	}

	getState(agentName: string): AgentSessionState | null {
		const key = agentName.toLowerCase();
		const procInfo = this.processes.get(key);
		return procInfo?.state || null;
	}

	listCheckpoints(agentName: string): Checkpoint[] {
		const key = agentName.toLowerCase();
		const procInfo = this.processes.get(key);
		if (!procInfo) return [];
		return this.checkpointManager.listCheckpoints(procInfo.state);
	}

	cleanup(): void {
		for (const key of this.processes.keys()) {
			this.killAgent(key);
		}
	}
}

// ── Extension ───────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	let allAgentDefs: AgentDef[] = [];
	let teams: Record<string, string[]> = {};
	let activeTeamName = "";
	let widgetCtx: any;
	let contextWindow = 0;
	let sessionStorage: SessionStorage;
	let processManager: AgentProcessManager;
	let panelManager: PanelManager;
	let orchestratorMessage = "";

	function loadAgents(cwd: string) {
		sessionStorage = new SessionStorage(cwd);
		processManager = new AgentProcessManager(sessionStorage);
		panelManager = new PanelManager();

		allAgentDefs = scanAgentDirs(cwd);

		const teamsPath = join(cwd, ".pi", "agents", "teams-interactive.yaml");
		if (existsSync(teamsPath)) {
			try {
				teams = parseTeamsYaml(readFileSync(teamsPath, "utf-8"));
			} catch {
				teams = {};
			}
		} else {
			// Fallback to regular teams.yaml
			const regularTeamsPath = join(cwd, ".pi", "agents", "teams.yaml");
			if (existsSync(regularTeamsPath)) {
				try {
					teams = parseTeamsYaml(readFileSync(regularTeamsPath, "utf-8"));
				} catch {
					teams = {};
				}
			}
		}

		if (Object.keys(teams).length === 0) {
			teams = { all: allAgentDefs.map(d => d.name) };
		}
	}

	function activateTeam(teamName: string) {
		activeTeamName = teamName;
		panelManager = new PanelManager();
		const members = teams[teamName] || [];
		const defsByName = new Map(allAgentDefs.map(d => [d.name.toLowerCase(), d]));

		for (const member of members) {
			const def = defsByName.get(member.toLowerCase());
			if (!def) continue;

			const state: AgentSessionState = {
				sessionId: generateId(),
				agentName: def.name,
				status: "idle",
				currentTask: "",
				messages: [],
				checkpoints: [],
				currentCheckpointIndex: -1,
				lastWork: "",
				toolCount: 0,
				elapsed: 0,
				contextPct: 0,
			};

			panelManager.createPanel(def.name, def, state);
		}

		updateWidget();
	}

	function updateWidget() {
		if (!widgetCtx) return;

		widgetCtx.ui.setWidget("agent-team-interactive", (_tui: any, theme: any) => {
			const text = new Text("", 0, 1);

			return {
				render(width: number, height: number): string[] {
					return panelManager.render(width, height, theme);
				},
				invalidate() {
					text.invalidate();
				},
			};
		});
	}

	// ── Tools Registration ───────────────────────────────────────────────────

	pi.registerTool({
		name: "talk_to_agent",
		label: "Talk to Agent",
		description: "Send a message directly to a specific agent bypassing the orchestrator",
		parameters: Type.Object({
			agent: Type.String({ description: "Agent name (case-insensitive)" }),
			message: Type.String({ description: "Message to send to the agent" }),
		}),

		async execute(_toolCallId, params, _signal, onUpdate, ctx) {
			const { agent, message } = params as { agent: string; message: string };

			try {
				if (onUpdate) {
					onUpdate({
						content: [{ type: "text", text: `Talking to ${agent}...` }],
						details: { agent, message, status: "talking" },
					});
				}

				const agentDef = allAgentDefs.find(d => d.name.toLowerCase() === agent.toLowerCase());
				if (!agentDef) {
					return {
						content: [{ type: "text", text: `Agent "${agent}" not found.` }],
						details: { agent, message, status: "error" },
					};
				}

				const result = await processManager.spawnAgent(
					agentDef,
					message,
					ctx,
					(state) => {
						panelManager.updatePanel(agentDef.name, state);
						updateWidget();
					},
				);

				const status = result.exitCode === 0 ? "done" : "error";
				const summary = `[${agentDef.name}] ${status} in ${Math.round(result.elapsed / 1000)}s`;

				return {
					content: [{ type: "text", text: `${summary}\n\n${result.output}` }],
					details: {
						agent,
						message,
						status,
						elapsed: result.elapsed,
						exitCode: result.exitCode,
					},
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Error talking to ${agent}: ${err?.message || err}` }],
					details: { agent, message, status: "error", elapsed: 0, exitCode: 1 },
				};
			}
		},

		renderCall(args, theme) {
			const agentName = (args as any).agent || "?";
			const message = (args as any).message || "";
			const preview = message.length > 60 ? message.slice(0, 57) + "..." : message;
			return new Text(
				theme.fg("toolTitle", theme.bold("talk_to_agent ")) +
				theme.fg("accent", agentName) +
				theme.fg("dim", " — ") +
				theme.fg("muted", preview),
				0,
				0,
			);
		},

		renderResult(result, options, theme) {
			const details = result.details as any;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			if (options.isPartial || details.status === "talking") {
				return new Text(
					theme.fg("accent", `● ${details.agent || "?"}`) +
					theme.fg("dim", " responding..."),
					0,
					0,
				);
			}

			const icon = details.status === "done" ? "✓" : "✗";
			const color = details.status === "done" ? "success" : "error";
			const elapsed = typeof details.elapsed === "number" ? Math.round(details.elapsed / 1000) : 0;
			const header = theme.fg(color, `${icon} ${details.agent}`) + theme.fg("dim", ` ${elapsed}s`);

			return new Text(header, 0, 0);
		},
	});

	pi.registerTool({
		name: "talk_to_orchestrator",
		label: "Talk to Orchestrator",
		description: "Send a message to the orchestrator from an agent",
		parameters: Type.Object({
			message: Type.String({ description: "Message to send to the orchestrator" }),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const { message } = params as { message: string };
			orchestratorMessage = message;

			return {
				content: [{ type: "text", text: `Message sent to orchestrator: ${message}` }],
				details: { message, status: "sent" },
			};
		},

		renderCall(args, theme) {
			const message = (args as any).message || "";
			const preview = message.length > 60 ? message.slice(0, 57) + "..." : message;
			return new Text(
				theme.fg("toolTitle", theme.bold("talk_to_orchestrator ")) +
				theme.fg("dim", "— ") +
				theme.fg("muted", preview),
				0,
				0,
			);
		},

		renderResult(result, options, theme) {
			const details = result.details as any;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			return new Text(
				theme.fg("success", "✓ Orchestrator notified"),
				0,
				0,
			);
		},
	});

	// ── Commands ─────────────────────────────────────────────────────────────

	pi.registerCommand("team", {
		description: "Select a team to work with",
		handler: async (_args, ctx) => {
			widgetCtx = ctx;
			const teamNames = Object.keys(teams);
			if (teamNames.length === 0) {
				ctx.ui.notify("No teams defined in .pi/agents/teams-interactive.yaml", "warning");
				return;
			}

			const options = teamNames.map(name => {
				const members = teams[name].map(m => displayName(m));
				return `${name} — ${members.join(", ")}`;
			});

			const choice = await ctx.ui.select("Select Team", options);
			if (choice === undefined) return;

			const idx = options.indexOf(choice);
			const name = teamNames[idx];
			activateTeam(name);
			ctx.ui.setStatus("agent-team-interactive", `Team: ${name}`);
			ctx.ui.notify(`Team: ${name}`, "info");
		},
	});

	pi.registerCommand("checkpoint", {
		description: "Create a checkpoint: /checkpoint <label>",
		handler: async (args, ctx) => {
			const label = args?.trim() || "checkpoint";
			const agentNames = teams[activeTeamName] || [];

			for (const agentName of agentNames) {
				const checkpoint = processManager.createCheckpoint(agentName, label);
				if (checkpoint) {
					const state = processManager.getState(agentName);
					if (state) {
						panelManager.updatePanel(agentName, state);
					}
				}
			}

			updateWidget();
			ctx.ui.notify(`Checkpoint created: ${label}`, "success");
		},
	});

	pi.registerCommand("undo", {
		description: "Revert to previous checkpoint",
		handler: async (_args, ctx) => {
			const agentNames = teams[activeTeamName] || [];
			let undone = 0;

			for (const agentName of agentNames) {
				if (processManager.undo(agentName)) {
					const state = processManager.getState(agentName);
					if (state) {
						panelManager.updatePanel(agentName, state);
					}
					undone++;
				}
			}

			updateWidget();
			ctx.ui.notify(`Undone to previous checkpoint (${undone} agents)`, "info");
		},
	});

	pi.registerCommand("timeline", {
		description: "Show checkpoint timeline with navigation",
		handler: async (_args, ctx) => {
			const agentNames = teams[activeTeamName] || [];
			const allCheckpoints: Array<{ checkpoint: Checkpoint; agent: string }> = [];

			for (const agentName of agentNames) {
				const checkpoints = processManager.listCheckpoints(agentName);
				for (const cp of checkpoints) {
					allCheckpoints.push({ checkpoint: cp, agent: agentName });
				}
			}

			if (allCheckpoints.length === 0) {
				ctx.ui.notify("No checkpoints found. Use /checkpoint to create one.", "warning");
				return;
			}

			await ctx.ui.custom((tui, theme, kb, done) => {
				const timeline = new TimelineUI(
					allCheckpoints.map(c => c.checkpoint),
					(checkpointId) => {
						const item = allCheckpoints.find(c => c.checkpoint.id === checkpointId);
						if (item) {
							processManager.restoreCheckpoint(item.agent, checkpointId);
							const state = processManager.getState(item.agent);
							if (state) {
								panelManager.updatePanel(item.agent, state);
							}
							updateWidget();
							ctx.ui.notify(`Restored checkpoint: ${item.checkpoint.label}`, "success");
						}
						done(undefined);
					},
					() => done(undefined),
				);
				return {
					render: (w) => timeline.render(w, 20, theme),
					handleInput: (data) => {
						timeline.handleInput(data);
						tui.requestRender();
					},
					invalidate: () => {},
				};
			}, {
				overlay: true,
				overlayOptions: { width: "60%", anchor: "center" },
			});
		},
	});

	pi.registerCommand("fork", {
		description: "Create new session branch from checkpoint: /fork <checkpoint-id>",
		handler: async (args, ctx) => {
			const checkpointId = args?.trim();
			if (!checkpointId) {
				ctx.ui.notify("Usage: /fork <checkpoint-id>", "error");
				return;
			}

			const agentNames = teams[activeTeamName] || [];
			let forked = 0;

			for (const agentName of agentNames) {
				if (processManager.restoreCheckpoint(agentName, checkpointId)) {
					const state = processManager.getState(agentName);
					if (state) {
						state.sessionId = generateId();
						panelManager.updatePanel(agentName, state);
						forked++;
					}
				}
			}

			updateWidget();
			ctx.ui.notify(`Forked from checkpoint (${forked} agents)`, "success");
		},
	});

	// ── Input Routing ────────────────────────────────────────────────────────

	pi.on("input", async (event, ctx) => {
		const input = event.input || "";
		const toMatch = input.match(/^\/to\s+(\S+)\s*(.*)$/);

		if (toMatch) {
			const agentName = toMatch[1];
			const message = toMatch[2] || "";

			if (!message) {
				ctx.ui.notify(`Usage: /to ${agentName} <message>`, "error");
				return;
			}

			const agentDef = allAgentDefs.find(d => d.name.toLowerCase() === agentName.toLowerCase());
			if (!agentDef) {
				ctx.ui.notify(`Agent "${agentName}" not found.`, "error");
				return;
			}

			await processManager.spawnAgent(
				agentDef,
				message,
				ctx,
				(state) => {
					panelManager.updatePanel(agentDef.name, state);
					updateWidget();
				},
			);

			return { handled: true };
		}

		return { handled: false };
	});

	// ── System Prompt Override ───────────────────────────────────────────────

	pi.on("before_agent_start", async (_event, _ctx) => {
		const agentCatalog = Array.from(teams[activeTeamName] || [])
			.map(name => {
				const def = allAgentDefs.find(d => d.name.toLowerCase() === name.toLowerCase());
				if (!def) return "";
				return `### ${displayName(def.name)}\n**Dispatch as:** \`${def.name}\`\n${def.description}\n**Tools:** ${def.tools}`;
			})
			.filter(Boolean)
			.join("\n\n");

		const teamMembers = Array.from(teams[activeTeamName] || []).map(m => displayName(m)).join(", ");

		return {
			systemPrompt: `You are a dispatcher agent. You coordinate specialist agents to accomplish tasks.

## Active Team: ${activeTeamName}
Members: ${teamMembers}

## How to Work
- Analyze the user's request and break it into clear sub-tasks
- Choose the right agent(s) for each sub-task
- Use the dispatch_agent tool to delegate work
- You can also use talk_to_agent for direct communication
- Review results and dispatch follow-up agents if needed

## Commands
- /to <agent> — Send message directly to an agent
- /checkpoint <label> — Create checkpoint
- /undo — Revert to previous checkpoint
- /timeline — Show checkpoint history

## Agents

${agentCatalog}`,
		};
	});

	// ── Session Start ────────────────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);

		if (widgetCtx) {
			widgetCtx.ui.setWidget("agent-team-interactive", undefined);
		}
		widgetCtx = ctx;
		contextWindow = ctx.model?.contextWindow || 0;

		loadAgents(ctx.cwd);

		const teamNames = Object.keys(teams);
		if (teamNames.length === 0) {
			ctx.ui.notify("No teams defined. Add agent definitions to .pi/agents/", "warning");
			return;
		}

		// Prompt for team selection
		const options = teamNames.map(name => {
			const members = teams[name].map(m => displayName(m));
			return `${name} — ${members.join(", ")}`;
		});

		const choice = await ctx.ui.select("Select Team", options);
		if (choice === undefined) {
			activateTeam(teamNames[0]);
		} else {
			const idx = options.indexOf(choice);
			activateTeam(teamNames[idx]);
		}

		ctx.ui.setStatus("agent-team-interactive", `Team: ${activeTeamName}`);
		ctx.ui.notify(
			`Team: ${activeTeamName}\n\n` +
			`/team                 Switch team\n` +
			`/to <agent>           Direct message\n` +
			`/checkpoint <label>   Create checkpoint\n` +
			`/undo                 Revert checkpoint\n` +
			`/timeline             Show checkpoints\n` +
			`/fork <id>            Fork session`,
			"info",
		);

		// Footer
		ctx.ui.setFooter((_tui, theme, _footerData) => ({
			dispose: () => {},
			invalidate() {},
			render(width: number): string[] {
				const model = ctx.model?.id || "no-model";
				const usage = ctx.getContextUsage();
				const pct = usage ? usage.percent : 0;
				const filled = Math.round(pct / 10);
				const bar = "#".repeat(filled) + "-".repeat(10 - filled);

				const left = theme.fg("dim", ` ${model}`) +
					theme.fg("muted", " · ") +
					theme.fg("accent", activeTeamName);
				const right = theme.fg("dim", `[${bar}] ${Math.round(pct)}% `);
				const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));

				return [truncateToWidth(left + pad + right, width)];
			},
		}));
	});

	// ── Session End ──────────────────────────────────────────────────────────

	pi.on("session_end", async () => {
		processManager?.cleanup();
	});
}
