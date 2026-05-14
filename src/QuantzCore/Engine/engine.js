/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
import { reactiveRegistry } from './Globals.js';



// Deep proxy wrapper for nested structures and array methods
// TODO add Map, Set - try to use one proxy for handling all instances systemwide
// downside: would retun proxy-objects and might be tricky in this context as no depsGraph


export function makeDeepReactive(target, ownerComponent) {
	// 1. Bereits verarbeitete Proxies direkt zurückgeben
	if (target && target.__isProxy) return target;

	// 2. Nur komplexe Objekte/Collections verpacken
	if (target === null || typeof target !== 'object') return target;

	reactiveRegistry.set(target, ownerComponent);

	return new Proxy(target, {
		get(obj, prop, receiver) {

			
			if (prop === '__isProxy') return true;

			// --- SPEZIALFALL: MAP & SET INSTANZEN ---
			if (obj instanceof Map || obj instanceof Set) {
				const val = obj[prop];

				if (typeof val === 'function') {
					// Mutierende Methoden für Map & Set definieren
					const mapMutators = ['set', 'delete', 'clear'];
					const setMutators = ['add', 'delete', 'clear'];
					const isMutator =
						mapMutators.includes(prop) ||
						setMutators.includes(prop);

					return function (...args) {
						// Wichtig: Argumente für tiefere Reaktivität ebenfalls proxyfizieren
						const processedArgs = args.map(arg =>
							arg !== null && typeof arg === 'object'
								? makeDeepReactive(arg, ownerComponent)
								: arg
						);

						// Ausführen auf dem ORIGINALEN Objekt (behebt Slot-Inkompatibilität)
						const result = val.apply(obj, processedArgs);

						if (isMutator) {
							const owner = reactiveRegistry.get(obj);
							if (owner) owner.__queueUpdate();
						}

						// Wenn z.B. map.get(key) ein Objekt liefert, dieses reaktiv zurückgeben
						return result !== null && typeof result === 'object'
							? makeDeepReactive(result, ownerComponent)
							: result;
					};
				}

				// Löst das Problem mit dem Zugriff auf .size
				return typeof val === 'function' ? val.bind(obj) : val;
			}

			// --- STANDARD: ARRAYS & OBJEKTE ---
			const val = Reflect.get(obj, prop, receiver);

			// Array-Mutationsmethoden abfangen
			if (Array.isArray(obj) && typeof val === 'function') {
				const mutatingMethods = [
					'push',
					'pop',
					'shift',
					'unshift',
					'splice',
					'sort',
					'reverse',
				];
				if (mutatingMethods.includes(prop)) {
					return function (...args) {
						const result = val.apply(obj, args);
						const owner = reactiveRegistry.get(obj);
						if (owner) owner.__queueUpdate();
						return result;
					};
				}
			}

			// Tiefen-Reaktivität für geschachtelte Objekte/Arrays
			if (val !== null && typeof val === 'object') {
				return makeDeepReactive(val, ownerComponent);
			}
			return val;
		},

		set(obj, prop, value, receiver) {
			// Map und Set nutzen keine Zuweisungen per "=", daher greift das hier nur für Standardobjekte/Arrays
			if (Reflect.get(obj, prop, receiver) === value) return true;

			const safeValue =
				value !== null && typeof value === 'object'
					? makeDeepReactive(value, ownerComponent)
					: value;

			const success = Reflect.set(obj, prop, safeValue, receiver);

			if (success) {
				const owner = reactiveRegistry.get(obj);
				if (owner) owner.__queueUpdate();
			}
			return success;
		},
	});
}
