import { formatDuration } from "@gym/shared/domain";
import { Pause, Play, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Plays the end-of-rest cue.
 *
 * A short synthesised tone rather than an audio file: it needs no asset, no
 * network, and it survives the browser's autoplay policy because the
 * AudioContext is created inside the user gesture that started the timer.
 */
function useChime() {
	const context = useRef<AudioContext | null>(null);

	const prime = useCallback(() => {
		if (!context.current && typeof window !== "undefined") {
			const Ctor =
				window.AudioContext ??
				(window as { webkitAudioContext?: typeof AudioContext })
					.webkitAudioContext;
			if (Ctor) context.current = new Ctor();
		}
		void context.current?.resume();
	}, []);

	const play = useCallback(() => {
		const ctx = context.current;
		if (!ctx) return;

		// Two short beeps, a fifth apart.
		[0, 0.18].forEach((offset, index) => {
			const oscillator = ctx.createOscillator();
			const gain = ctx.createGain();
			oscillator.frequency.value = index === 0 ? 880 : 1320;
			oscillator.connect(gain);
			gain.connect(ctx.destination);

			const start = ctx.currentTime + offset;
			gain.gain.setValueAtTime(0.0001, start);
			gain.gain.exponentialRampToValueAtTime(0.3, start + 0.01);
			gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
			oscillator.start(start);
			oscillator.stop(start + 0.16);
		});
	}, []);

	return { prime, play };
}

type Props = {
	seconds: number;
	onDismiss: () => void;
	onWakeLockChange?: (held: boolean) => void;
};

export function RestTimer({ seconds, onDismiss }: Props) {
	const [remaining, setRemaining] = useState(seconds);
	const [paused, setPaused] = useState(false);
	const [rang, setRang] = useState(false);
	const { prime, play } = useChime();

	// The deadline is wall-clock, not a decremented counter: a tab that is
	// throttled or briefly hidden would otherwise drift by however long it was
	// starved, and a rest timer that lies is worse than none.
	const deadline = useRef(Date.now() + seconds * 1000);

	useEffect(() => {
		prime();
	}, [prime]);

	useEffect(() => {
		if (paused) return;

		const tick = () => {
			const left = Math.max(
				0,
				Math.round((deadline.current - Date.now()) / 1000),
			);
			setRemaining(left);

			if (left === 0 && !rang) {
				setRang(true);
				play();
				navigator.vibrate?.([200, 100, 200]);
			}
		};

		tick();
		const id = setInterval(tick, 250);
		return () => clearInterval(id);
	}, [paused, rang, play]);

	const adjust = (delta: number) => {
		deadline.current += delta * 1000;
		setRang(false);
		setRemaining(
			Math.max(0, Math.round((deadline.current - Date.now()) / 1000)),
		);
	};

	const reset = () => {
		deadline.current = Date.now() + seconds * 1000;
		setRang(false);
		setPaused(false);
	};

	const done = remaining === 0;

	return (
		<div
			className={cn(
				"absolute inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t bg-card px-4 py-3",
				done && "bg-success/15",
			)}
		>
			<div className="flex items-center gap-3">
				<div className="flex-1">
					<p className="text-xs uppercase tracking-wide text-muted-foreground">
						{done ? "Descanso terminado" : "Descanso"}
					</p>
					{/*
					 * Only the readout is a live region, and only once it finishes:
					 * announcing every tick would flood a screen reader with a number
					 * that changes four times a second.
					 */}
					<output
						aria-live={done ? "assertive" : "off"}
						className={cn(
							"block font-display text-4xl font-bold leading-none",
							done && "text-success",
						)}
					>
						{formatDuration(remaining)}
					</output>
				</div>

				<Button
					variant="outline"
					size="sm"
					onClick={() => adjust(-15)}
					className="h-11 px-3"
				>
					−15
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={() => adjust(15)}
					className="h-11 px-3"
				>
					+15
				</Button>

				<Button
					variant="outline"
					size="icon"
					onClick={() => (done ? reset() : setPaused(!paused))}
					aria-label={done ? "Reiniciar" : paused ? "Reanudar" : "Pausar"}
					className="size-11"
				>
					{done ? (
						<RotateCcw className="size-4" aria-hidden />
					) : paused ? (
						<Play className="size-4" aria-hidden />
					) : (
						<Pause className="size-4" aria-hidden />
					)}
				</Button>

				<Button
					variant="ghost"
					size="icon"
					onClick={onDismiss}
					aria-label="Cerrar el descanso"
					className="size-11"
				>
					<X className="size-4" aria-hidden />
				</Button>
			</div>
		</div>
	);
}
