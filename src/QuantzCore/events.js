/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
import { activeGlobalEvents, DELEGATED_STORAGE } from './Engine/Globals.js';

export function ensureGlobalDelegation(eventType) {
	if (activeGlobalEvents.has(eventType)) return;
	activeGlobalEvents.add(eventType);

	// WICHTIG: { passive: false } als dritten Parameter übergeben!
	document.addEventListener(eventType, event => {
		const path = event.composedPath();

		for (const current of path) {
			if (
				current === document.getElementById('app') ||
				current === window
			) {
				break;
			}

			const storage = current[DELEGATED_STORAGE];
			if (!storage) continue;

			let hasExecuted = false;

			for (const fullKey in storage) {
				const config = storage[fullKey];

				if (
					config.eventType !== eventType ||
					typeof config.callback !== 'function'
				) {
					continue;
				}

				const { callback, args, modifiers } = config;

				// Keydown Filter
				if (eventType === 'keydown' && args.length > 0) {
					const pressedKey = event.key.toLowerCase();
					if (!args.map(k => k.toLowerCase()).includes(pressedKey)) {
						continue;
					}
				}

				// DER FIX FÜR PREVENTDEFAULT:
				// Wir führen preventDefault SOFORT aus, noch BEVOR dein Callback läuft.
				// Entweder weil dein Modifier-Objekt es sagt, oder weil .prevent im String steht.
				if (modifiers?.prevent || fullKey.includes('.prevent')) {
					event.preventDefault();
				}

				// Falls du auch .stop nutzt, hier direkt mit fixieren
				if (modifiers?.stop || fullKey.includes('.stop')) {
					event.stopPropagation();
				}

				// Callback ausführen
				callback(event, current, args);
				hasExecuted = true;
			}

			if (hasExecuted) {
				return;
			}
		}
	}); // <-- passive: false allows preventDefault() to work
}
