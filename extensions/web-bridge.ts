/**
 * Web Bridge — HTTP endpoint for Pi
 *
 * Exposes a local HTTP server to receive messages from any web interface
 * and deliver them to Pi as follow-up messages.
 *
 * Usage: pi -e extensions/web-bridge.ts
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { applyExtensionDefaults } from "./themeMap.ts";
import http from "node:http";
import crypto from "node:crypto";

// ━━ Types ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface WebMessage {
	source: string;
	target?: string;
	payload: any;
	meta?: {
		file_path?: string;
		selection?: any;
	};
}

interface PendingResponse {
	status: "pending" | "complete" | "error";
	response?: string;
	error?: string;
	timestamp: number;
}

// ━━ ULID Helper ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function ulid(): string {
	const time = Date.now();
	const rand = crypto.randomBytes(10);
	let timeStr = "";
	let t = time;
	for (let i = 9; i >= 0; i--) {
		timeStr = CROCKFORD[t % 32] + timeStr;
		t = Math.floor(t / 32);
	}
	let randStr = "";
	let bits = 0;
	let n = 0;
	for (const b of rand) {
		n = (n << 8) | b;
		bits += 8;
		while (bits >= 5) {
			randStr += CROCKFORD[n & 0x1f];
			n >>= 5;
			bits -= 5;
		}
	}
	if (bits > 0) {
		randStr += CROCKFORD[n];
	}
	return timeStr + randStr;
}

// ━━ Extension ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function (pi: ExtensionAPI) {
	let server: http.Server | null = null;
	const pendingResponses = new Map<string, PendingResponse>();
	let lastMessageId: string | null = null;
	const PORT = 3737;
	const HOST = "127.0.0.1";

	// CORS headers
	const corsHeaders = {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
	};

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);

		// Create HTTP server
		server = http.createServer((req, res) => {
			// Set CORS headers
			Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));

			// Handle CORS preflight
			if (req.method === "OPTIONS") {
				res.writeHead(200);
				res.end();
				return;
			}

			// POST /pi/message
			if (req.method === "POST" && req.url === "/pi/message") {
				let body = "";
				req.on("data", (chunk) => {
					body += chunk.toString();
					if (body.length > 1_000_000) {
						res.writeHead(413, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "Payload too large" }));
						req.destroy();
					}
				});
				req.on("end", () => {
					try {
						const msg: WebMessage = JSON.parse(body);
						const id = ulid();

						pendingResponses.set(id, {
							status: "pending",
							timestamp: Date.now(),
						});
						lastMessageId = id;

						const formatted = [
							msg.source ? `[From: ${msg.source}]` : "[From web-bridge]",
							msg.meta?.file_path ? `File: ${msg.meta.file_path}` : "",
							JSON.stringify(msg.payload, null, 2),
						].filter(Boolean).join("\n");

						pi.sendMessage(formatted, { deliverAs: "followUp" });

						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ id, status: "queued" }));
					} catch (e) {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "Invalid JSON" }));
					}
				});
				return;
			}

			// GET /poll/:id
			if (req.method === "GET" && req.url?.startsWith("/poll/")) {
				const id = req.url.slice(6);
				const pending = pendingResponses.get(id);

				if (!pending) {
					res.writeHead(404, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Not found" }));
					return;
				}

				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({
					status: pending.status,
					response: pending.response,
					error: pending.error,
				}));
				return;
			}

			// GET /health
			if (req.method === "GET" && req.url === "/health") {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ status: "ok", pending: pendingResponses.size }));
				return;
			}

			// 404
			res.writeHead(404, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "Not found" }));
		});

		// Start server
		server.listen(PORT, HOST, () => {
			const url = `http://${HOST}:${PORT}`;
			pi.appendEntry("web-bridge", { event: "started", url });
			ctx.ui.notify(`Web Bridge listening on ${url}`, "info");
		});

		server.on("error", (err: any) => {
			if (err.code === "EADDRINUSE") {
				ctx.ui.notify(`Port ${PORT} already in use`, "error");
			} else {
				ctx.ui.notify(`Web Bridge error: ${err.message}`, "error");
			}
		});
	});

	// Capture agent responses
	pi.on("agent_end", (_event, ctx) => {
		if (lastMessageId && pendingResponses.has(lastMessageId)) {
			const lastEntry = ctx.ui.getEntries().at(-1);
			const responseText = lastEntry?.text || "";

			pendingResponses.set(lastMessageId, {
				status: "complete",
				response: responseText,
				timestamp: Date.now(),
			});
			lastMessageId = null;
		}
	});

	pi.on("session_shutdown", () => {
		if (server) {
			server.close();
			server = null;
		}
		pendingResponses.clear();
	});
}
