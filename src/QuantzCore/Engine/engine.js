/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
import { reactiveRegistry } from './Globals.js';

function normalizeValue(value, isAttribute = false) {
	// 1. Handle "Nothing" (null, undefined, false)
	if (value === null || value === undefined || value === false) {
		return isAttribute ? null : String(value);
	}
	// TODO ?????
	// 2. Handle Boolean 'true' for attributes (e.g., ?disabled="${true}")
	if (value === true) {
		return isAttribute ? '' : '';
	}
	console.log(value);
	// 3. Catch raw objects to prevent rendering "[object Object]"
	// if (
	// 	typeof value === 'object' &&
	// 	!Array.isArray(value) &&
	// 	value.type !== 'TemplateResult'
	// ) {
	// 	console.warn(
	// 		'Framework Warning: Attempted to render raw object:',
	// 		value
	// 	);
	// 	return JSON.stringify(value);
	// }

	// Pass through Strings, Numbers, Arrays, and TemplateResults
	return value;
}
// Deep proxy wrapper for nested structures and array methods
// TODO add Map, Set - try to use one proxy for handling all instances systemwide
// downside: would retun proxy-objects and might be tricky in this context as no depsGraph
export function makeDeepReactive(target, ownerComponent) {
	if (target.__isProxy) return target;

	reactiveRegistry.set(target, ownerComponent);

	return new Proxy(target, {
		get(obj, prop) {
			if (prop === '__isProxy') return true;
			const val = obj[prop];
			// recurse for complex object types
			// capture mutating array methods (push, pop, splice, sort, reverse)
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

			if (val !== null && typeof val === 'object') {
				return makeDeepReactive(val, ownerComponent);
			}
			return val;
		},

		set(obj, prop, value) {
			if (obj[prop] === value) return true;

			obj[prop] =
				value !== null && typeof value === 'object'
					? makeDeepReactive(value, ownerComponent)
					: value;

			const owner = reactiveRegistry.get(obj);
			if (owner) owner.__queueUpdate();
			return true;
		},
	});
}
