/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
import { activeGlobalEvents, DELEGATED_STORAGE, reactiveRegistry } from './Engine/Globals.js';

const DEBUG = true;

export function ensureGlobalDelegation(eventType) {
	if (activeGlobalEvents.has(eventType)) return;
	activeGlobalEvents.add(eventType);

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

			// Kontext-Ermittlung über den verbleibenden Pfad nach oben
			const remainingPath = path.slice(i);
			const hostElement = remainingPath.find(node => reactiveRegistry.has(node));
			const registryEntry = hostElement ? reactiveRegistry.get(hostElement) : null;

			// 🎯 DYNAMISCHE KONTEXT-AUFLÖSUNG:
			let instanceContext = current;

			if (registryEntry) {
				// Fall A: Wir befinden uns in einem Listen-Item (Loop)
				if (registryEntry.type === 'TemplateResult') {
					// Extrahiere das echte User/Daten-Objekt (u) aus den Werten des Templates
					instanceContext =
						registryEntry.values && registryEntry.values.length > 0
							? registryEntry.values[0]
							: registryEntry;
				}
				// Fall B: Standard-Komponente (Web Component Instanz)
				else {
					instanceContext = registryEntry;
				}
			}

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

				if (DEBUG) {
					console.groupCollapsed(
						`%c▶ Executing: ${fullKey} on <${current.localName}>`,
						'color: #4caf50; font-weight: bold;'
					);
					console.log('Target Context (this):', instanceContext);
					console.log('Event Target (Origin):', event.target);
					console.log('Callback Function:', callback);
					console.groupEnd();
				}

				if (modifiers?.prevent || fullKey.includes('.prevent')) {
					event.preventDefault();
				}

				if (modifiers?.stop || fullKey.includes('.stop')) {
					event.stopPropagation();
					shouldStopBubbling = true;
				}

				// ✅ DER FINALE TRIGGER:
				// .call() zwingt reguläre Methoden, das exakt ermittelte Objekt als 'this' zu nutzen.
				// Arrow-Functions ignorieren das .call() nativ und behalten ihr lexikalisches 'this' (die user-card).
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
