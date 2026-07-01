/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */

import { reactiveRegistry } from './Globals.js';
import { getTemplateBlueprint } from './TemplateBlueprint.js';
import { NodePart, AttributePart, EventPart } from './partHandlers.js';
import { normalizeValue } from '../Utils/Normalize.js';

const DEBUG = true;

/**
 * PHASE 1: INITIAL HYDRATION
 * Erstellt die DOM-Struktur aus dem Blueprint und instanziiert alle Parts einmalig.
 */
function hydrateContainer(templateResult, container, blueprint) {
	const clone = blueprint.template.content.cloneNode(true);
	const elementsMap = {};
	let elementCounter = 0;

	const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);
	while (walker.nextNode()) {
		elementsMap[elementCounter++] = walker.currentNode;
	}

	const instanceParts = blueprint.dynamicParts.map(part => {
		const targetElement = elementsMap[part.elId] || clone;
		let handlerInstance = null;

		if (part.type === 'attribute') {
			handlerInstance = new AttributePart(targetElement, part);
		} else if (part.type === 'event') {
			handlerInstance = new EventPart(targetElement, part);
		} else if (part.type === 'node') {
			const markerComment = targetElement.childNodes[part.commentPath];
			handlerInstance = new NodePart(markerComment);
		}

		if (handlerInstance) {
			handlerInstance.__lastValue = undefined;
		}

		return handlerInstance;
	});

	container.__rootInstance = { instanceParts };
	container.replaceChildren(clone);

	// Tabellarische Erfassung der initialen Hydration
	if (DEBUG && instanceParts.length > 0) {
		const hydrateTableData = instanceParts.map((part, i) => {
			const rawValue = templateResult.values[i];
			let normalizedValue = rawValue;

			if (part instanceof AttributePart) {
				normalizedValue = normalizeValue(rawValue, true);
			} else if (part instanceof NodePart) {
				normalizedValue = normalizeValue(rawValue, false);
			}

			// Initialen Wert für den nachfolgenden Dirty-Check cachen
			part.__lastValue = normalizedValue;
			part.update(normalizedValue, render);

			return {
				Index: i,
				Status: '🔥 Hydrated',
				'Part Type': part.constructor.name,
				Target: part.element || part.marker?.parentNode || 'unknown',
				'Raw Value': rawValue,
				'Normalized Value': normalizedValue,
			};
		});

		console.groupCollapsed(
			`%c[QEngine: Hydrate] 🏗️ First instantiation for <${container.localName || 'container'}> (${hydrateTableData.length} Parts)`,
			'color: #00bcd4; font-weight: bold;'
		);
		console.table(hydrateTableData, ['Index', 'Status', 'Part Type', 'Target', 'Raw Value', 'Normalized Value']);
		console.groupEnd();
	}
}

/**
 * PHASE 2: RUNTIME UPDATE
 * Verarbeitet nachfolgende Wertänderungen über einen strikten Dirty-Check.
 */
function updateContainer(templateResult, container) {
	const { instanceParts } = container.__rootInstance;
	const updateTableData = [];
	let hasAnyDirtyPart = false; // ✨ Tracker für tatsächliche Updates im aktuellen Durchlauf

	for (let i = 0; i < instanceParts.length; i++) {
		const part = instanceParts[i];
		const rawValue = templateResult.values[i];

		let normalizedValue = rawValue;
		if (part instanceof AttributePart) {
			normalizedValue = normalizeValue(rawValue, true);
		} else if (part instanceof NodePart) {
			normalizedValue = normalizeValue(rawValue, false);
		}

		let status = '💤 Clean (Skipped)';
		let isDirty = false;

		// 1. INTELLIGENTER FUNKTIONS-CHECK
		if (typeof part.__lastValue === 'function' && typeof normalizedValue === 'function') {
			if (part.__lastValue.toString() !== normalizedValue.toString()) {
				status = '⚡ Dirty (Updated)';
				isDirty = true;
			}
		}
		// 2. INTELLIGENTER ARRAY-CHECK
		else if (Array.isArray(part.__lastValue) && Array.isArray(normalizedValue)) {
			if (
				part.__lastValue.length !== normalizedValue.length ||
				part.__lastValue.some((val, idx) => val !== normalizedValue[idx])
			) {
				status = '⚡ Dirty (Updated)';
				isDirty = true;
			}
		}
		// 3. STANDARD PRIMITIV-CHECK
		else if (part.__lastValue !== normalizedValue) {
			status = '⚡ Dirty (Updated)';
			isDirty = true;
		}

		if (isDirty) {
			hasAnyDirtyPart = true;
		}

		if (DEBUG) {
			updateTableData.push({
				Index: i,
				Status: status,
				'Part Type': part.constructor.name,
				Target: part.element || part.marker?.parentNode || 'unknown',
				'Raw Value': rawValue,
				'Normalized Value': normalizedValue,
			});
		}

		if (isDirty) {
			part.__lastValue = normalizedValue;
			part.update(normalizedValue, render);
		}
	}

	// ✨ LOG-GUARD: Tabelle wird NUR dann ausgegeben, wenn mindestens ein Part im Container dirty war!
	if (DEBUG && hasAnyDirtyPart && updateTableData.length > 0) {
		console.groupCollapsed(
			`%c[QEngine: Update] 🔄 Runtime update for <${container.localName || 'container'}> (${updateTableData.length} Items)`,
			'color: #4caf50; font-weight: bold;'
		);
		console.table(updateTableData, ['Index', 'Status', 'Part Type', 'Target', 'Raw Value', 'Normalized Value']);
		console.groupEnd();
	}
}

/**
 * HAUPT-EINSTIEGSPUNKT
 */
export function render(templateResult, container) {
	if (!templateResult || templateResult.type !== 'TemplateResult') {
		if (DEBUG) {
			console.log(
				`%c[QEngine: Render] 📝 Primitive Value -> <${container.localName || 'unknown'}>`,
				'color: #9e9e9e; font-style: italic;',
				{ value: templateResult }
			);
		}
		container.textContent = String(templateResult);
		return;
	}

	const blueprint = getTemplateBlueprint(templateResult.strings);

	// Verzweigung basierend auf dem Instanz-Zustand des Containers
	if (!container.__rootInstance) {
		hydrateContainer(templateResult, container, blueprint);
	} else {
		updateContainer(templateResult, container);
	}
}
