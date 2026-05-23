// Session persistence storage

import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from "fs";
import { join } from "path";
import type { AgentSessionState, AgentMessage, Checkpoint } from "./types.js";

export class SessionStorage {
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
