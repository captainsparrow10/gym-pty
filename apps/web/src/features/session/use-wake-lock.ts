import { useEffect, useRef, useState } from "react";

/**
 * Holds a screen wake lock while `active` is true.
 *
 * This is what makes a rest timer usable in a browser tab. iOS cannot schedule
 * a local notification from a web page and has no background execution for one,
 * so a timer only fires while the page is alive and visible. Keeping the screen
 * awake for the duration of a workout is the whole mechanism.
 *
 * Supported in Safari from 16.4. The long-standing bug that broke this API
 * affected installed home-screen web apps, not ordinary tabs, and was fixed in
 * 18.4 — so a plain browser tab is the better place for this, not the worse one.
 *
 * The lock is released by the browser whenever the page is hidden, which is not
 * an error and not recoverable at that moment; it has to be re-acquired on the
 * way back, which is what the visibilitychange listener does.
 */
export function useWakeLock(active: boolean) {
	const [held, setHeld] = useState(false);
	const sentinel = useRef<WakeLockSentinel | null>(null);

	useEffect(() => {
		if (
			!active ||
			typeof navigator === "undefined" ||
			!("wakeLock" in navigator)
		) {
			setHeld(false);
			return;
		}

		let cancelled = false;

		const acquire = async () => {
			if (cancelled || document.visibilityState !== "visible") return;
			try {
				const lock = await navigator.wakeLock.request("screen");
				if (cancelled) {
					await lock.release();
					return;
				}
				sentinel.current = lock;
				setHeld(true);
				lock.addEventListener("release", () => setHeld(false));
			} catch {
				// Denied, unsupported, or the tab lost focus mid-request. The timer
				// still runs; the screen just may dim.
				setHeld(false);
			}
		};

		const onVisibility = () => {
			if (document.visibilityState === "visible") void acquire();
		};

		void acquire();
		document.addEventListener("visibilitychange", onVisibility);

		return () => {
			cancelled = true;
			document.removeEventListener("visibilitychange", onVisibility);
			void sentinel.current?.release().catch(() => {});
			sentinel.current = null;
			setHeld(false);
		};
	}, [active]);

	return held;
}
