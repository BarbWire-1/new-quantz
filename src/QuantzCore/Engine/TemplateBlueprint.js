/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
import { blueprintCache } from './Globals.js';
export function getTemplateBlueprint(strings) {
	if (blueprintCache.has(strings)) return blueprintCache.get(strings);

	const template = document.createElement('template');
	let htmlString = '';

	// 1. Injektion von unmissverständlichen Markern direkt während des Zusammenbaus.
	// Jede Expression erhält ihre eigene feste ID im HTML. Das überlebt jede Minifizierung!
	for (let i = 0; i < strings.length; i++) {
		htmlString += strings[i];
		if (i < strings.length - 1) {
			const isInsideAttr = /=\s*["']?([^"'>]*)$/.test(htmlString);
			if (isInsideAttr) {
				// Für Attribute nutzen wir einen sicheren Token-String ohne Doppel-Unterstriche
				htmlString += `qElv${i}x`;
			} else {
				// Für Textknoten/Loops nutzen wir einen validen HTML-Kommentar
				htmlString += `<!--qEln${i}-->`;
			}
		}
	}

	template.innerHTML = htmlString;

	const dynamicParts = [];
	const walker = document.createTreeWalker(
		template.content,
		NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT
	);

	let elementCounter = 0;
	const elementIndexMap = new Map();

	// 2. DOM-Strukturanalyse: Wir lesen die harte ID direkt aus dem vom Browser gebauten DOM
	while (walker.nextNode()) {
		const node = walker.currentNode;

		if (node.nodeType === Node.ELEMENT_NODE) {
			const elId = elementCounter++;
			elementIndexMap.set(node, elId);

			Array.from(node.attributes).forEach(attr => {
				if (attr.value.includes('qElv')) {
					const match = attr.value.match(/qElv(\d+)x/);
					if (match) {
						const index = parseInt(match[1], 10);
						const attrName = attr.name;

						// KEIN REGEX-SPLIT! Wir holen uns die statischen Teile direkt aus dem strings-Array.
						// Das ist mathematisch bombensicher, da strings[index] immer vor dem Wert liegt.
						const prefix = strings[index]
							.substring(
								strings[index].lastIndexOf(attrName + '=')
							)
							.replace(/^[^\s=]+=\s*["']?/, '');
						const suffix = strings[index + 1]
							.substring(
								0,
								strings[index + 1].search(/["']?\s*>/)
							)
							.replace(/^["']?/, '');

						dynamicParts.push({
							type: attrName.startsWith('on')
								? 'event'
								: 'attribute',
							index,
							elId,
							attrName,
							prefix,
							suffix,
						});
					}
					// Verhindert, dass der Browser den Platzhalter als inline-JS ausführt
					if (attr.name.startsWith('on'))
						node.removeAttribute(attr.name);
				}
			});
		} else if (
			node.nodeType === Node.COMMENT_NODE &&
			node.nodeValue.startsWith('qEln')
		) {
			// Index direkt aus dem HTML-Kommentar extrahieren
			const index = parseInt(node.nodeValue.replace('qEln', ''), 10);
			const parentNode = node.parentNode;

			if (!elementIndexMap.has(parentNode)) {
				elementIndexMap.set(parentNode, elementCounter++);
			}

			dynamicParts.push({
				type: 'node',
				index,
				elId: elementIndexMap.get(parentNode),
				commentPath: Array.from(parentNode.childNodes).indexOf(node),
			});
		}
	}

	const blueprint = { template, dynamicParts };
	blueprintCache.set(strings, blueprint);
	return blueprint;
}
