// AgentProcessManager - Spawns and manages agent processes

import { spawn } from "child_process";
import { join } from "path";
import type { AgentDef, AgentSessionState, AgentProcess, Checkpoint } from "../types.js";
import { SessionStorage } from "../storage.js";
import { CheckpointManager } from "../checkpoints.js";
import { generateId } from "../utils.js";

export class AgentProcessManager {
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

		// Session file for this agent
		const agentKey = agentDef.name.toLowerCase().replace(/\s+/g, "-");
		const sessionDir = this.sessionStorage.getSessionDir();
		const agentSessionFile = join(sessionDir, `${agentKey}.json`);

		const state: AgentSessionState = {
			sessionId,
			agentName: agentDef.name,
			status: "thinking",
			currentTask: task,
			messages: [],
			checkpoints: [],
			currentCheckpointIndex: -1,
			lastWork: "",
			fullContent: "",
			toolCount: 0,
			elapsed: 0,
			contextPct: 0,
			sessionFile: null,
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
			"--session",
			agentSessionFile,
		];

		// Continue existing session if we have one
		if (state.sessionFile) {
			args.push("-c");
		}

		args.push(task);

		const textChunks: string[] = [];
		let lastUpdateTime = 0;
		let lastContent = "";
		let updateTimeout: NodeJS.Timeout | null = null;

		// Debounced update - limit update frequency to avoid spam
		const scheduleUpdate = (force = false) => {
			const now = Date.now();
			if (force || now - lastUpdateTime > 150) {
				if (updateTimeout) {
					clearTimeout(updateTimeout);
					updateTimeout = null;
				}
				onUpdate(state);
				lastUpdateTime = now;
			} else if (!updateTimeout) {
				updateTimeout = setTimeout(() => {
					onUpdate(state);
					lastUpdateTime = Date.now();
					updateTimeout = null;
				}, 150 - (now - lastUpdateTime));
			}
		};

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
								state.fullContent = full;
								const last = full.split("\n").filter((l: string) => l.trim()).pop() || "";

								// Only update if content changed
								if (last !== lastContent) {
									state.lastWork = last;
									lastContent = full;

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
									scheduleUpdate();
								}
							} else if (delta?.type === "thinking_delta") {
								// Show thinking progress (less frequent updates)
								const thinking = delta.delta || "";
								const thinkingMsg = `[Thinking: ${thinking.split("\n").pop() || ""}]`;
								if (thinkingMsg !== lastContent && thinkingMsg.length < 100) {
									state.lastWork = thinkingMsg;
									lastContent = thinkingMsg;
									scheduleUpdate();
								}
							}
						} else if (event.type === "tool_execution_start") {
							state.status = "working";
							state.toolCount++;
							scheduleUpdate(true);
						} else if (event.type === "message_end") {
							const msg = event.message;
							if (msg?.usage && ctx.model?.contextWindow) {
								state.contextPct = ((msg.usage.input || 0) / ctx.model.contextWindow) * 100;
							}
							scheduleUpdate(true);
						} else if (event.type === "agent_end") {
							const msgs = event.messages || [];
							const last = [...msgs].reverse().find((m: any) => m.role === "assistant");
							if (last?.usage && ctx.model?.contextWindow) {
								state.contextPct = ((last.usage.input || 0) / ctx.model.contextWindow) * 100;
							}
							scheduleUpdate(true);
						}
					} catch (err) {
						console.error(`[agent-${agentDef.name}] JSON parse error: ${err}`);
				}
			});

			proc.stderr!.setEncoding("utf-8");
			proc.stderr!.on("data", (_chunk: string) => {
				// Suppress stderr noise from agent process
			});

			proc.on("close", (code) => {
				if (updateTimeout) {
					clearTimeout(updateTimeout);
				}

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
				// Treat null/undefined as success (0) - common on Windows
				const exitCode = (code ?? 0);
				state.status = exitCode === 0 ? "idle" : "error";

				// Mark session file as available for resume
				if (exitCode === 0) {
					state.sessionFile = agentSessionFile;
				}

				const full = textChunks.join("");
				state.fullContent = full;
				state.lastWork = full.split("\n").filter((l: string) => l.trim()).pop() || "";

				// Debug: log captured content length
				console.error(`[agent-${agentDef.name}] Captured ${full.length} chars, ${textChunks.length} chunks`);
				if (full.length > 0 && full.length < 100) {
					console.error(`[agent-${agentDef.name}] Content preview: "${full.substring(0, 50)}..."`);
				}

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
					exitCode: exitCode,
					elapsed: state.elapsed,
				});
			});

			proc.on("error", (err) => {
				if (updateTimeout) {
					clearTimeout(updateTimeout);
				}

				clearInterval(state.timer);
				state.status = "error";
				state.lastWork = `Error: ${err.message}`;
				this.processes.delete(key);
				onUpdate(state);
				resolve({
					output: `Error spawning agent: ${err.message} (code: ${(err as any).code})`,
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
