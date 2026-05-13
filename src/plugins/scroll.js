/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
// 1. Die Directive-Funktion gibt eine Konfiguration zurück
export function autoScroll() {
	return {
		isHook: true,
		apply(element, lastValue) {
			// Nutze ein Microtask/rAF direkt im Hook, damit die Engine
			// die restlichen DOM-Änderungen der Liste davor fertigstellen kann
			queueMicrotask(() => {
				element.scrollTop = element.scrollHeight;
			});
		},
	};
}

export function autoScrollToBottom() {
	
	return {
		isHook: true,
		// Wir speichern den Zustand direkt auf der Instanz des Hooks
		wasAtBottom: true,

		apply(element, lastValue) {
			// 1. VOR dem DOM-Update: Prüfen, ob der User unten steht
			// (Wir nutzen 10px Puffer für Touch-Geräte und Zoom-Ungenauigkeiten)
			this.wasAtBottom =
				element.scrollHeight - element.clientHeight <=
				element.scrollTop + 10;

			// 2. NACH dem DOM-Update: Scrollen, falls er unten stand
			queueMicrotask(() => {
				if (this.wasAtBottom) {
					element.scrollTop = element.scrollHeight;
				}
			});
		},
	};
}