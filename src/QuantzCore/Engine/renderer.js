/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */

import { reactiveRegistry } from './Globals.js';
import { getTemplateBlueprint } from './TemplateBlueprint.js';
import { NodePart, AttributePart, EventPart } from './partHandlers.js';
import { normalizeValue } from '../Utils/Normalize.js';

export function render(templateResult, container) {
	if (!templateResult || templateResult.type !== 'TemplateResult') {
		container.textContent = String(templateResult);
		return;
	}

	const blueprint = getTemplateBlueprint(templateResult.strings);

	// first instantiation: walk the passed html` code, get parts to set markes and bind
	if (!container.__rootInstance) {
		const clone = blueprint.template.content.cloneNode(true);
		const elementsMap = {};
		let elementCounter = 0;

		const walker = document.createTreeWalker(
			clone,
			NodeFilter.SHOW_ELEMENT
		);
		while (walker.nextNode()) {
			elementsMap[elementCounter++] = walker.currentNode;
		}

		// recognized dynamic parts => passed partHandler classes
		const instanceParts = blueprint.dynamicParts.map(part => {
			const targetElement = elementsMap[part.elId] || clone;

			if (part.type === 'attribute') {
				return new AttributePart(targetElement, part);
			} else if (part.type === 'event') {
				return new EventPart(targetElement, part);
			} else if (part.type === 'node') {
				const markerComment =
					targetElement.childNodes[part.commentPath];
				return new NodePart(markerComment);
			}
		});

		container.__rootInstance = { instanceParts };
		container.replaceChildren(clone);
	}

	const { instanceParts } = container.__rootInstance;

	// RUNTIME UPDATE:
	for (let i = 0; i < instanceParts.length; i++) {
		const part = instanceParts[i];
		const rawValue = templateResult.values[i];

		// Context-sensitive normalization based on part type:
		// AttributeParts need isAttribute = true, NodeParts (text) need false.
		// EventParts don't need normalization (since they are functions).
		let normalizedValue = rawValue;
		if (part instanceof AttributePart) {
			normalizedValue = normalizeValue(rawValue, true);
		} else if (part instanceof NodePart) {
			normalizedValue = normalizeValue(rawValue, false);
		}

		part.update(normalizedValue, render);
	}
}
