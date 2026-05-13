/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
import { activeGlobalEvents, DELEGATED_STORAGE } from './Engine/Globals.js';

export function ensureGlobalDelegation(eventType) {
	if (activeGlobalEvents.has(eventType)) return;
	activeGlobalEvents.add(eventType);


	document.addEventListener(eventType, event => {
		// get event.target in shadowDOM
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
				// TODO - generilze and allow adding defenitions for customEvents/combinations
				// Keydown Filter
				if (eventType === 'keydown' && args.length > 0) {
					const pressedKey = event.key.toLowerCase();
					if (!args.map(k => k.toLowerCase()).includes(pressedKey)) {
						continue;
					}
				}

				// calling preventDefault if is modifier before callback is triggered, else leaks all document on eventName
				if (modifiers?.prevent || fullKey.includes('.prevent')) {
					event.preventDefault();
				}


				if (modifiers?.stop || fullKey.includes('.stop')) {
					event.stopPropagation();
				}

				callback(event, current, args);
				hasExecuted = true;
			}

			if (hasExecuted) {
				return;
			}
		}
	});
}
