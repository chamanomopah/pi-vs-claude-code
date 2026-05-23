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
import { Text, truncateToWidth, visibleWidth, type AutocompleteItem, type Theme } from "@mariozechner/pi-tui";
import { readFileSync, existsSync, join } from "fs";

import type { AgentDef, AgentSessionState, Checkpoint } from "./types.js";
import { displayName, parseTeamsYaml, generateId } from "./utils.js";
import { scanAgentDirs } from "./agent-scanner.js";
import { SessionStorage } from "./storage.js";
import { PanelManager } from "./managers/panel-manager.js";
import { AgentProcessManager } from "./managers/process-manager.js";
import { TimelineUI } from "./components/timeline-ui.js";
import { applyExtensionDefaults } from "../themeMap.js";

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

		widgetCtx.ui.setWidget("agent-team-interactive", (_tui: any, theme: Theme) => {
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
			if (!processManager || !panelManager) {
				ctx.ui.notify("Extension not initialized yet.", "error");
				return;
			}
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
			if (!processManager || !panelManager) {
				ctx.ui.notify("Extension not initialized yet.", "error");
				return;
			}
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
			if (!processManager || !panelManager) {
				ctx.ui.notify("Extension not initialized yet.", "error");
				return;
			}
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
			if (!processManager || !panelManager) {
				ctx.ui.notify("Extension not initialized yet.", "error");
				return;
			}
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


		// ── Command: /to <agent> <message> ───────────────────────────────────────

		pi.registerCommand("to", {
			description: "Send message directly to an agent: /to <agent> <message>",
			getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
				return allAgentDefs.map(agent => ({
					value: agent.name,
					label: displayName(agent.name),
				})).filter(item => item.value.toLowerCase().startsWith(prefix.toLowerCase()));
			},
			handler: async (args, ctx) => {
				if (!processManager || !panelManager) {
					ctx.ui.notify("Extension not initialized yet. Wait for session_start.", "error");
					return;
				}

				if (!args || args.trim().length === 0) {
					ctx.ui.notify("Usage: /to <agent> <message>", "error");
					return;
				}

				const parts = args.trim().split(/\s+/);
				const agentName = parts[0];
				const message = parts.slice(1).join(" ");

				if (!message) {
					ctx.ui.notify(`Usage: /to ${agentName} <message>`, "error");
					return;
				}

				const agentDef = allAgentDefs.find(d => d.name.toLowerCase() === agentName.toLowerCase());
				if (!agentDef) {
					const available = allAgentDefs.map(d => d.name).join(", ");
					ctx.ui.notify(`Agent "${agentName}" not found. Available: ${available}`, "error");
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
			},
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
- Use the talk_to_agent tool to communicate with agents
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
