/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */

/**
 * Normalizes values before they hit the DOM.
 * Handles Primitives, nested Templates, and Boolean Attributes.
 */
export function normalizeValue(value, isAttribute = false, seen = new Set()) {

	// Functions are never rendered, but executed if not explicitly stringified, which is intended!!

	if (typeof value === 'string') return value;
	//TODO should I pass as text? could break access to bool
	if (value === null || value === undefined) {
		return value;
	}

	if (
		typeof value === 'number' &&
		(Number.isNaN(value) || !Number.isFinite(value))
	) {
		return isAttribute ? null : String(value); // Renders "NaN", "Infinity", "-Infinity"
	}
	// TODO - check this - or better add a boolean prefix like ?attribute
	if (typeof value === 'boolean') {
		if (value === false) return isAttribute ? null : 'false';
		if (value === true) return isAttribute ? '' : 'true'; //boolean attr (e.G. disabled="")
	}

	// Complex objects
	if (typeof value === 'object') {
		// pass inner complex to handling
		if (value.type === 'TemplateResult') {
			return value;
		}

		// Cycle-check for self-referencing
		if (seen.has(value)) {
			return isAttribute ? '[Circular]' : '[Circular Reference]';
		}
		seen.add(value); // register

		//Normalize arrays
		if (Array.isArray(value)) {
			try {
				const normalizedArray = value.map(item =>
					normalizeValue(item, isAttribute, seen)
				);

				return normalizedArray;
			} finally {
				seen.delete(value); // Cleanup
			}
		}

		// Do not render raw objects [object Object]
		// if (process?.env?.NODE_ENV === 'development') {
		// 	console.warn(
		// 		'Framework Warning: Attempted to render raw object:',
		// 		value
		// 	);
		// }

		// seen set to handle circular refs
		try {
			const jsonString = JSON.stringify(value, (key, val) => {
				if (typeof val === 'object' && val !== null) {
					if (key !== '' && seen.has(val)) return '[Circular]';
				}
				return val;
			});
			seen.delete(value); // Cleanup
			return jsonString;
		} catch (e) {
			seen.delete(value); // Fallback-Cleanup
			return '[Object (Unserializable)]';
		}
	}

	// Strings pass through; Symbols and BigInts need explicit conversion to avoid
	// TypeError on implicit string coercion in template concatenation
	if (typeof value === 'symbol' || typeof value === 'bigint') {
		return String(value);
	}
	return value;
}
