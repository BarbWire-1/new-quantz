/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */

import { reactiveRegistry } from './Globals.js';
import { getTemplateBlueprint } from './TemplateBlueprint.js';
import { NodePart, AttributePart, EventPart } from './partHandlers.js';
import { normalizeValue } from '../Utils/Normalize.js';

// 🎛️ LOG-KONTROLLZENTRUM
const DEBUG = false; // Schaltet die detaillierten Tabellen & Gruppen an/aus
const PERF_LOG = true; // Schaltet das hochpräzise Einzeilen-Performance-Log an/aus

// 📦 BATCH-SPEICHER FÜR REINES TIMING
let batchHydrateTime = 0;
let batchUpdateTime = 0;
let batchHydrateCount = 0;
let batchUpdateCount = 0;
let isBatchScheduled = false;

function flushMetrics() {
	batchHydrateTime = 0;
	batchUpdateTime = 0;
	batchHydrateCount = 0;
	batchUpdateCount = 0;
	isBatchScheduled = false;
}

function queueMetrics(type, duration) {
	if (type === 'Hydrate') {
		batchHydrateTime += duration;
		batchHydrateCount++;
	} else {
		batchUpdateTime += duration;
		batchUpdateCount++;
	}

	if (!isBatchScheduled) {
		isBatchScheduled = true;
		queueMicrotask(flushMetrics);
	}
}

/**
 * PHASE 1: INITIAL HYDRATION
 * Erstellt Parts und injiziert die Initialwerte sofort in einem einzigen Durchlauf.
 */
function hydrateContainer(templateResult, container, blueprint) {
	// 🎯 EINGEBAUT: Startzeitpunkt für die Hydration erfassen
	const start = PERF_LOG ? performance.now() : 0;

	const clone = blueprint.template.content.cloneNode(true);
	const elementsMap = {};
	let elementCounter = 0;

	const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);
	while (walker.nextNode()) {
		elementsMap[elementCounter++] = walker.currentNode;
	}

	const hydrateTableData = [];

	const instanceParts = blueprint.dynamicParts.map((part, i) => {
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
			const rawValue = templateResult.values[i];
			let normalizedValue = rawValue;

			if (handlerInstance instanceof AttributePart) {
				// 🎯 DIREKTIVEN-SCHUTZ: "use" und "if" werden vor der Normalisierung geschützt
				normalizedValue =
					handlerInstance.name === 'use' || handlerInstance.name === 'if'
						? rawValue
						: normalizeValue(rawValue, true);
			} else if (handlerInstance instanceof NodePart) {
				normalizedValue = normalizeValue(rawValue, false);
			}

			handlerInstance.__lastValue = normalizedValue;
			handlerInstance.update(normalizedValue, render);

			if (DEBUG) {
				hydrateTableData.push({
					Index: i,
					Status: '🔥 Bare-Metal Hydrated',
					'Part Type': handlerInstance.constructor.name,
					Target: handlerInstance.element || handlerInstance.marker?.parentNode || 'unknown',
					'Raw Value': rawValue,
					'Normalized Value': normalizedValue,
				});
			}
		}

		return handlerInstance;
	});

	container.__rootInstance = { instanceParts };

	if (container instanceof DocumentFragment) {
		container.appendChild(clone);
	} else if (container && typeof container.replaceChildren === 'function') {
		container.replaceChildren(clone);
	}

	// 🎯 EINGEBAUT: Bare-Metal Performance-Log für die Hydration ausgeben
	if (PERF_LOG && instanceParts.length > 0) {
		const duration = (performance.now() - start).toFixed(3);
		console.log(
			`%c[QEngine: Perf] 🏗️ Hydrated <${container.localName || 'container'}>: ${instanceParts.length} DOM-parts initialized in ${duration}ms`,
			'color: #00bcd4; font-weight: bold;'
		);
	}

	if (DEBUG && instanceParts.length > 0) {
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
	const start = PERF_LOG ? performance.now() : 0;
	const { instanceParts } = container.__rootInstance;
	const updateTableData = [];
	let hasAnyDirtyPart = false;
	let dirtyCount = 0;

	for (let i = 0; i < instanceParts.length; i++) {
		const part = instanceParts[i];
		const rawValue = templateResult.values[i];

		let normalizedValue = rawValue;
		if (part instanceof AttributePart) {
			// 🎯 FIX: Hier wurde deine "if"-Direktive brutal zerstört! Jetzt exakt wie in Phase 1 geschützt.
			normalizedValue = part.name === 'use' || part.name === 'if' ? rawValue : normalizeValue(rawValue, true);
		} else if (part instanceof NodePart) {
			normalizedValue = normalizeValue(rawValue, false);
		}

		let status = '💤 Clean (Skipped)';
		let isDirty = false;

		if (part instanceof AttributePart && part.name === 'use') {
			status = '⚡ Directive (Always)';
			isDirty = true;
		} else if (typeof part.__lastValue === 'function' && typeof normalizedValue === 'function') {
			if (part.__lastValue.toString() !== normalizedValue.toString()) {
				status = '⚡ Dirty (Updated)';
				isDirty = true;
			}
		} else if (part.__lastValue !== normalizedValue) {
			status = '⚡ Dirty (Updated)';
			isDirty = true;
		}

		if (isDirty) {
			hasAnyDirtyPart = true;
			dirtyCount++;
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
			// 🎯 REKURSIONS-RETTE: Führt innere Parts sofort synchron aus
			part.update(normalizedValue, render);
		}
	}

	if (PERF_LOG && dirtyCount > 0) {
		const duration = (performance.now() - start).toFixed(3);
		console.log(
			`%c[QEngine: Perf] 🔄 Updated <${container.localName || 'container'}>: ${dirtyCount}/${instanceParts.length} DOM-parts changed in ${duration}ms`,
			'color: #4caf50; font-weight: bold;'
		);
	}

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
 * HAUPT-EINSTIEGSPUNKT - REIN BARE-METAL SYNCHRON
 */
export function render(templateResult, container) {
	const pureStart = performance.now();

	if (!templateResult || templateResult.type !== 'TemplateResult') {
		if (DEBUG) {
			console.log(
				`%c[QEngine: Render] 📝 Primitive Value -> <${container.localName || 'unknown'}>`,
				'color: #9e9e9e; font-style: italic;',
				{ value: templateResult }
			);
		}
		if (container) {
			container.textContent = String(templateResult);
		}
		return;
	}

	const blueprint = getTemplateBlueprint(templateResult.strings);
	const isHydration = !container.__rootInstance;

	if (isHydration) {
		hydrateContainer(templateResult, container, blueprint);
	} else {
		updateContainer(templateResult, container);
	}

	if (!PERF_LOG && !DEBUG) {
		queueMetrics(isHydration ? 'Hydrate' : 'Update', performance.now() - pureStart);
	}
}
