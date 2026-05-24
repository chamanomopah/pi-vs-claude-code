// Agent file parsing and scanning

import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve } from "path";
import type { AgentDef } from "./types.js";

export function parseAgentFile(filePath: string): AgentDef | null {
	try {
		const raw = readFileSync(filePath, "utf-8");
		const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
		if (!match) return null;

		const frontmatter: Record<string, string> = {};
		for (const line of match[1].split(/\r?\n/)) {
			const idx = line.indexOf(":");
			if (idx > 0) {
				frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
			}
		}

		if (!frontmatter.name) return null;

		// Map frontmatter color to valid theme color
		const agentColor = mapColorToTheme(frontmatter.color);

		return {
			name: frontmatter.name,
			description: frontmatter.description || "",
			tools: frontmatter.tools || "read,grep,find,ls",
			systemPrompt: match[2].trim(),
			file: filePath,
			agentColor,
		};
	} catch {
		return null;
	}
}

// Map agent frontmatter colors to valid theme semantic colors
function mapColorToTheme(color?: string): string | undefined {
	if (!color) return undefined;

	// Map common color names to valid semantic theme colors
	const colorMap: Record<string, string> = {
		"orange": "warning",
		"purple": "accent",
		"pink": "accent",
		"gray": "dim",
		"grey": "dim",
		"white": "fg",
		"black": "bg",
		"cyan": "accent",
		"green": "success",
		"yellow": "warning",
		"blue": "accent",
		"red": "error",
		"magenta": "accent",
	};

	return colorMap[color.toLowerCase()];
}

export function scanAgentDirs(cwd: string): AgentDef[] {
	const dirs = [
		resolve(cwd, "agents"),
		resolve(cwd, ".claude", "agents"),
		resolve(cwd, ".pi", "agents"),
	];

	const agents: AgentDef[] = [];
	const seen = new Set<string>();

	function scanDir(dir: string) {
		if (!existsSync(dir)) return;
		try {
			const entries = readdirSync(dir, { withFileTypes: true });
			for (const entry of entries) {
				const fullPath = resolve(dir, entry.name);
				if (entry.isDirectory()) {
					scanDir(fullPath);
				} else if (entry.isFile() && entry.name.endsWith(".md")) {
					const def = parseAgentFile(fullPath);
					if (def && !seen.has(def.name.toLowerCase())) {
						seen.add(def.name.toLowerCase());
						agents.push(def);
					}
				}
			}
		} catch {}
	}

	for (const dir of dirs) {
		scanDir(dir);
	}

	return agents;
}
