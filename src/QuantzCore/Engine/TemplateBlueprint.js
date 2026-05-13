/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
import { blueprintCache } from './Globals.js';
export function getTemplateBlueprint(strings) {
	if (blueprintCache.has(strings)) return blueprintCache.get(strings);

	const template = document.createElement('template');
	let htmlString = '';

	// unambigious markers (survived all minification, other than previous string-adventure)
	for (let i = 0; i < strings.length; i++) {

		htmlString += strings[i];
		if (i < strings.length - 1) {
			const isInsideAttr = /=\s*["']?([^"'>]*)$/.test(htmlString);
			if (isInsideAttr) {
				// attr-marker
				htmlString += `qElv${i}x`;
			} else {
				// nodes/nodes in loop- marker
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

	// get margerId's and cache
	while (walker.nextNode()) {
		const node = walker.currentNode;

		if (node.nodeType === Node.ELEMENT_NODE) {
			const elId = elementCounter++;
			elementIndexMap.set(node, elId);

			Array.from(node.attributes).forEach(attr => {

				if (attr.value.includes('qElv')) {
					// set and bind index
					const match = attr.value.match(/qElv(\d+)x/);
					if (match) {
						const index = parseInt(match[1], 10);
						const attrName = attr.name;


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
					// TODO remove this? - allow native events? TEST!!!
					if (attr.name.startsWith('on'))
						node.removeAttribute(attr.name);
				}
			});
		} else if (
			node.nodeType === Node.COMMENT_NODE &&
			node.nodeValue.startsWith('qEln')
		) {
			// get index from commentMarker
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
