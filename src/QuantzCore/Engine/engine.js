/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
import { reactiveRegistry } from './Globals.js';

// Deep proxy wrapper for nested structures and array methods
export function makeDeepReactive(target, ownerComponent) {
	// Reuse proxies
	if (target && target.__isProxy) return target;

	// ONLY wrap complex objects
	if (target === null || typeof target !== 'object') return target;

	reactiveRegistry.set(target, ownerComponent);

	return new Proxy(target, {
		get(obj, prop, receiver) {
			if (prop === '__isProxy') return true;

			// --- MAP & SET - INSTANCES ---
			if (obj instanceof Map || obj instanceof Set) {
				const val = obj[prop];

				if (typeof val === 'function') {
					// Define mutating methods for Map/Set
					const mapMutators = ['set', 'delete', 'clear'];
					const setMutators = ['add', 'delete', 'clear'];
					const isMutator =
						mapMutators.includes(prop) ||
						setMutators.includes(prop);

					return function (...args) {
						// IMPORTANT: Recurse on inner props
						let processedArgs = args;

						if (
							obj instanceof Map &&
							prop === 'set' &&
							args.length >= 2
						) {
							// Map.set(key, value) -> only proxy value to preserve key identity!
							const value = args[1];
							processedArgs = [
								args[0],
								value !== null && typeof value === 'object'
									? makeDeepReactive(value, ownerComponent)
									: value,
							];
						} else if (
							obj instanceof Set &&
							prop === 'add' &&
							args.length >= 1
						) {
							// Set.add(value) -> only proxy value to keep ref!
							const value = args[0];
							processedArgs = [
								value !== null && typeof value === 'object'
									? makeDeepReactive(value, ownerComponent)
									: value,
							];
						}

						// Resolve on ORIGINAL object!
						const result = val.apply(obj, processedArgs);

						if (isMutator) {
							const owner = reactiveRegistry.get(obj);
							if (owner) owner.__queueUpdate();
						}

						// Recurse proxying over returned value
						return result !== null && typeof result === 'object'
							? makeDeepReactive(result, ownerComponent)
							: result;
					};
				}

				// Bind Type methods
				return typeof val === 'function' ? val.bind(obj) : val;
			}

			// --- STANDARD: ARRAYS & OBJECTS ---
			const val = Reflect.get(obj, prop, receiver);

			// Intercept array mutation methods
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

			// Deep nested Objects/Arrays
			if (val !== null && typeof val === 'object') {
				return makeDeepReactive(val, ownerComponent);
			}
			return val;
		},

		set(obj, prop, value, receiver) {
			// For =-assigned values (standard objects/arrays)
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
