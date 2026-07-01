/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
import { activeGlobalEvents, DELEGATED_STORAGE, reactiveRegistry } from './Engine/Globals.js';

const DEBUG = true;

export function ensureGlobalDelegation(eventType) {
	if (activeGlobalEvents.has(eventType)) return;
	activeGlobalEvents.add(eventType);

	// ✨ DIESES LOG HAT GEFEHLT:
	// Wird genau EINMAL pro Event-Typ gefeuert, wenn die Engine den Listener auf das document legt.
	if (DEBUG) {
		console.log(
			`%c[QEngine] 🌐 Global event listener registered on document for: "${eventType}"`,
			'color: #00bcd4; font-weight: bold;'
		);
	}

	document.addEventListener(eventType, event => {
		const path = event.composedPath();

		if (DEBUG) {
			console.groupCollapsed(
				`%c[QEvent: ${eventType}] ⚡ Target: <${event.target.localName || 'unknown'}>`,
				'color: #ff9800; font-weight: bold;'
			);
		}

		for (let i = 0; i < path.length; i++) {
			const current = path[i];

			if (current === document.getElementById('app') || current === window) {
				break;
			}

			const storage = current[DELEGATED_STORAGE];
			if (!storage) continue;

			// 🎯 FIX: Kontext-Ermittlung repariert
			// Wir suchen das Host-Element im Pfad nach oben.
			const remainingPath = path.slice(i);
			const hostElement = remainingPath.find(node => reactiveRegistry.has(node));

			// Holt die Instanz aus der Registry.
			const registryEntry = hostElement ? reactiveRegistry.get(hostElement) : null;

			// Wenn der Eintrag aus dem Loop stammt (TemplateResult), ignorieren wir ihn für den Kontext,
			// da deine Arrow-Function im Template das korrekte "this" bereits von Haus aus mitbringt.
			const instanceContext = registryEntry && registryEntry.type !== 'TemplateResult' ? registryEntry : current;

			let shouldStopBubbling = false;

			for (const fullKey in storage) {
				const config = storage[fullKey];

				if (config.eventType !== eventType || typeof config.callback !== 'function') {
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

				// ✨ MAXIMALES EVENT DEBUGGING: Alle angeforderten Infos sauber strukturiert
				if (DEBUG) {
					console.groupCollapsed(
						`%c▶ Executing: ${fullKey} on <${current.localName}>`,
						'color: #4caf50; font-weight: bold;'
					);
					console.log('Target Context (this):', instanceContext);
					console.log('Event Target (Origin):', event.target);
					console.log('Current Handling Element:', current);
					console.log('Callback Function:', callback);
					console.log('Passed Arguments:', args);
					console.log(
						'Active Modifiers:',
						modifiers || {
							prevent: modifiers?.prevent || fullKey.includes('.prevent'),
							stop: modifiers?.stop || fullKey.includes('.stop'),
						}
					);
					console.groupEnd();
				}

				if (modifiers?.prevent || fullKey.includes('.prevent')) {
					event.preventDefault();
				}

				if (modifiers?.stop || fullKey.includes('.stop')) {
					event.stopPropagation();
					shouldStopBubbling = true;
				}

				// Ruft den Handler auf. Da du Arrow-Functions im Template nutzt,
				// bleibt das "this" stabil auf deiner Hauptkomponente (user-card).
				callback.call(instanceContext, event, current, args);
			}

			if (shouldStopBubbling || event.cancelBubble) {
				if (DEBUG) console.groupEnd();
				return;
			}
		}

		if (DEBUG) console.groupEnd();
	});
}
