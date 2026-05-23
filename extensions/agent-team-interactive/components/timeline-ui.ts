// TimelineUI component for checkpoint navigation

import { Container, Text, Spacer, matchesKey, Key, DynamicBorder, type Theme } from "@mariozechner/pi-tui";
import type { Checkpoint } from "../types.js";
import { formatTime } from "../utils.js";

export class TimelineUI {
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

	render(width: number, height: number, theme: Theme): string[] {
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
