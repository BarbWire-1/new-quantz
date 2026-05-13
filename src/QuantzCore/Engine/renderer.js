/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */

import { reactiveRegistry } from './Globals.js';
import { getTemplateBlueprint } from './TemplateBlueprint.js';
import { NodePart, AttributePart, EventPart } from './partHandlers.js';

export function render(templateResult, container) {
	if (!templateResult || templateResult.type !== 'TemplateResult') {
		container.textContent = String(templateResult);
		return;
	}

	const blueprint = getTemplateBlueprint(templateResult.strings);

	// ERSTALIGES MOUNTING: Erzeuge die physischen Instanz-Parts auf den geklonten Nodes
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

		// Wir übersetzen blueprint.dynamicParts in funktionale Instanz-Parts
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
		container.replaceChildren(clone); // Shadow DOM sicher!
	}

	const { instanceParts } = container.__rootInstance;

	// RUNTIME UPDATE: Das ist jetzt der gesamte Code, der bei Updates ausgeführt wird!
	// Keine Ifs, kein Tree-Walking. Ein simpler, flacher, C++-naher Array-Loop.
	for (let i = 0; i < instanceParts.length; i++) {
		instanceParts[i].update(templateResult.values[i], render);
	}
}
