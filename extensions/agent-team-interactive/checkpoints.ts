// Checkpoint management for agent sessions

import type { AgentSessionState, Checkpoint } from "./types.js";
import { generateId } from "./utils.js";

export class CheckpointManager {
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
