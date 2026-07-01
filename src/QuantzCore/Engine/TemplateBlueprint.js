/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
import { blueprintCache } from './Globals.js';

// 🎛️ LOG-KONTROLLZENTRUM
const DEBUG = false; // Auf false setzen, um alle Logs komplett zu deaktivieren

export function getTemplateBlueprint(strings) {
	if (blueprintCache.has(strings)) {
		if (DEBUG) {
			console.log(`%c[Blueprint: Cache Hit] 🎯 Reusing cached blueprint`, 'color: #4caf50; font-style: italic;');
		}
		return blueprintCache.get(strings);
	}

	if (DEBUG) {
		console.groupCollapsed(
			`%c[Blueprint: Create] 🏗️ Compiling new template blueprint (${strings.length} strings)`,
			'color: #2196f3; font-weight: bold;'
		);
	}

	const template = document.createElement('template');
	let htmlString = '';
	const markerLogData = []; // Sammelbecken für die erste Tabelle

	for (let i = 0; i < strings.length; i++) {
		htmlString += strings[i];
		if (i < strings.length - 1) {
			const isInsideAttr = /=\s*["']?([^"'>]*)$/.test(htmlString);
			if (isInsideAttr) {
				const attrMarker = `qElv${i}x`;
				htmlString += attrMarker;
				if (DEBUG) markerLogData.push({ Index: i, Type: 'Attribute', Marker: attrMarker });
			} else {
				const nodeMarker = `<!--qEln${i}-->`;
				htmlString += nodeMarker;
				if (DEBUG) markerLogData.push({ Index: i, Type: 'Node Content', Marker: nodeMarker });
			}
		}
	}

	if (DEBUG) {
		console.groupCollapsed(`%c1. Injected Markers Overview`, 'color: #ff9800;');
		console.table(markerLogData);
		console.log(`%cFinal Raw HTML Structure:`, 'color: #9e9e9e; font-weight: bold;', htmlString);
		console.groupEnd();
	}

	template.innerHTML = htmlString;

	const dynamicParts = [];
	const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT);

	let elementCounter = 0;
	const elementIndexMap = new Map();
	const partsLogData = []; // Sammelbecken für die zweite Tabelle (Parts)

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

						const prefix = strings[index]
							.substring(strings[index].lastIndexOf(attrName + '='))
							.replace(/^[^\s=]+=\s*["']?/, '');
						const suffix = strings[index + 1]
							.substring(0, strings[index + 1].search(/["']?\s*>/))
							.replace(/^["']?/, '');

						const partType = attrName.startsWith('on') ? 'event' : 'attribute';

						if (DEBUG) {
							partsLogData.push({
								'Part Type': partType.toUpperCase(),
								'Binding Index': index,
								'Element ID': elId,
								'Tag Name': `<${node.localName}>`,
								'Attr/Event Name': attrName,
								'Prefix/Suffix': `"${prefix}" ... "${suffix}"`,
							});
						}

						dynamicParts.push({
							type: partType,
							index,
							elId,
							attrName,
							prefix,
							suffix,
						});
					}
					if (attr.name.startsWith('on')) {
						node.removeAttribute(attr.name);
					}
				}
			});
		} else if (node.nodeType === Node.COMMENT_NODE && node.nodeValue.startsWith('qEln')) {
			const index = parseInt(node.nodeValue.replace('qEln', ''), 10);
			const parentNode = node.parentNode;

			if (!elementIndexMap.has(parentNode)) {
				elementIndexMap.set(parentNode, elementCounter++);
			}

			const elId = elementIndexMap.get(parentNode);
			const commentPath = Array.from(parentNode.childNodes).indexOf(node);

			if (DEBUG) {
				partsLogData.push({
					'Part Type': 'NODE',
					'Binding Index': index,
					'Element ID': elId,
					'Tag Name': `<${parentNode.localName}>`,
					'Attr/Event Name': '—',
					'Prefix/Suffix': `Child Index: ${commentPath}`,
				});
			}

			dynamicParts.push({
				type: 'node',
				index,
				elId: elementIndexMap.get(parentNode),
				commentPath,
			});
		}
	}

	if (DEBUG) {
		console.groupCollapsed(`%c2. Extracted Dynamic Parts Tree`, 'color: #9c27b0;');
		console.table(partsLogData);
		console.groupEnd();
	}

	const blueprint = { template, dynamicParts };
	blueprintCache.set(strings, blueprint);

	if (DEBUG) {
		console.log(
			`%c🚀 Blueprint compilation finished. Generated ${dynamicParts.length} dynamic parts.`,
			'color: #4caf50; font-weight: bold;'
		);
		console.dir(blueprint);
		console.groupEnd();
	}

	return blueprint;
}
