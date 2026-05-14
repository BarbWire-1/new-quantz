/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */


/**
 * Normalizes values before they hit the DOM.
 * Handles Primitives, nested Templates, and Boolean Attributes.
 */
export function normalizeValue(value, isAttribute = false, seen = new Set()) {
	// 1. Spezialwerte & Primitiven abfangen (null, undefined, NaN, Infinity, Booleans)
	if (value === null || value === undefined) {
		return isAttribute ? null : String(value);
	}

	if (
		typeof value === 'number' &&
		(Number.isNaN(value) || !Number.isFinite(value))
	) {
		return isAttribute ? null : String(value); // Renders "NaN", "Infinity", "-Infinity"
	}

	if (typeof value === 'boolean') {
		if (value === false) return isAttribute ? null : 'false';
		if (value === true) return isAttribute ? '' : 'true'; // Leerer String für boolean Attributes (z.B. disabled="")
	}

	// 2. Komplexe Objekte verarbeiten (Zirkelbezüge abfangen)
	if (typeof value === 'object') {
		// Ausnahmen für deine Template-Engine direkt durchwinken
		if (value.type === 'TemplateResult') {
			return value;
		}

		// ZYKLEN-CHECK: Haben wir dieses Objekt in diesem Render-Pfad schon gesehen?
		if (seen.has(value)) {
			return isAttribute ? '[Circular]' : '[Circular Reference]';
		}
		seen.add(value); // Objekt für diesen Pfad registrieren

		// Arrays normalisieren (Elemente rekursiv bereinigen)
		if (Array.isArray(value)) {
			try {
				const normalizedArray = value.map(item =>
					normalizeValue(item, isAttribute, seen)
				);
				seen.delete(value); // Cleanup nach Verlassen des Pfads
				return normalizedArray;
			} finally {
				seen.delete(value); // Cleanup nach Verlassen des Pfads
			}
		}

		// Rohe Objekte abfangen, um [object Object] im HTML zu verhindern
		if (process.env.NODE_ENV === 'development') {
			console.warn(
				'Framework Warning: Attempted to render raw object:',
				value
			);
		}

		// Sicheres Stringify unter Verwendung unseres bestehenden "seen"-Sets
		try {
			const jsonString = JSON.stringify(value, (key, val) => {
				if (typeof val === 'object' && val !== null) {
					// Da JSON.stringify einen eigenen Baum durchläuft,
					// nutzen wir hier ein lokales Set nur für dieses eine JSON
					if (key !== '' && seen.has(val)) return '[Circular]';
				}
				return val;
			});
			seen.delete(value); // Cleanup
			return jsonString;
		} catch (e) {
			seen.delete(value); // Fallback-Cleanup
			return '[Object (Circular)]';
		}
	}

	// Strings, Symbole, BigInts etc.
	return value;
}
