// Test script to verify agent content capture
import { spawn } from "child_process";

const args = [
    "--mode", "json",
    "-p",
    "--no-extensions",
    "--model", "zai/glm-5.1",
    "--tools", "bash",
    "--thinking", "off",
];

args.push("Gere um número aleatório entre 1 e 100 e me diga qual é.");

const proc = spawn("pi", args, {
    stdio: ["ignore", "pipe", "pipe"],
});

let buffer = "";
const textChunks = [];

proc.stdout.setEncoding("utf-8");
proc.stdout.on("data", (chunk) => {
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
                    console.error(`[CAPTURED] Delta: "${delta.delta}", Full so far (${full.length} chars): "${full.substring(0, 50)}${full.length > 50 ? '...' : ''}"`);
                }
            }
        } catch (err) {
            console.error(`[ERROR] ${err.message}`);
        }
    }
});

proc.on("close", () => {
    const finalContent = textChunks.join("");
    console.log(`\n=== FINAL RESULT ===`);
    console.log(`Content (${finalContent.length} chars): "${finalContent}"`);
});
