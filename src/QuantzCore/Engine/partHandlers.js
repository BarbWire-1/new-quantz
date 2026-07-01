/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */

import { DELEGATED_STORAGE, activeGlobalEvents } from './Globals.js';
import { ensureGlobalDelegation } from '../events.js';
import { render } from './renderer.js';

const DEBUG = false;

export class AttributePart {
	constructor(element, blueprintPart) {
		this.element = element;
		this.name = blueprintPart.attrName;
		this.prefix = blueprintPart.prefix;
		this.suffix = blueprintPart.suffix;
		this.lastValue = undefined;

		// Once parsed for  event-modifyer in constructor (0 ms Runtime-Overhead)
		if (this.name.startsWith('@')) {
			const parts = this.name.slice(1).toLowerCase().split('.'); //
			this.pureEventType = parts[0]; // 'click'
		}
	}

	update(newValue) {
		// ==========================================
		// 🔀 SPEZIALFALL: Conditional Rendering (if)
		// ==========================================
				// ==========================================
		// 🔀 SPEZIALFALL: Conditional Rendering (if)
		// ==========================================
		if (this.name === 'if') {
			// Falls der Wert ein TemplateResult ist (z. B. condition ? html`A` : html`B`)
			if (newValue && newValue.type === 'TemplateResult') {

				// 1. Initialisierung: Beim ersten Mal das originale Platzhalter-Element im DOM ersetzen
				if (!this.anchor) {
					this.anchor = document.createTextNode(''); // Unsichtbarer Anker im DOM
					this.element.parentNode.insertBefore(this.anchor, this.element);
					this.element.parentNode.removeChild(this.element); // Das "if"-Träger-Element entfernen

					// 🎯 Cache-Initialisierung auf der Instanz
					this.cache = new Map();
				}

				// 2. Struktureller Dirty-Check: Nur neu rendern, wenn sich das Template-Layout geändert hat
				if (this.lastValue?.strings !== newValue.strings) {

					// 🎯 CACHE ANALYSIS & LOGGING (Schatten-Zweig, greift nicht in DOM-Logik ein)
					const templateKey = newValue.strings;
					if (this.cache.has(templateKey)) {
						console.log(
							`%c[QEngine: If-Cache] 🎯 HIT! Template already exists in cache. Found ${this.cache.get(templateKey).length} nodes.`,
							'color: #4caf50; font-weight: bold;'
						);
					} else {
						console.log(
							`%c[QEngine: If-Cache] 🐢 MISS! Template layout is new. Creating fresh cache entry.`,
							'color: #ff9800; font-style: italic;'
						);
					}

					// Alten Inhalt sauber aus dem DOM entfernen
					this.activeNodes?.forEach(node => {
						if (node.parentNode) node.parentNode.removeChild(node);
					});
					this.activeNodes = [];

					// Neues Fragment rendern (Dein originaler, unveränderter Fluss)
					const fragment = document.createDocumentFragment();
					render(newValue, fragment);

					// Neue Knoten vor dem Anker einfügen und tracken
					const childNodes = Array.from(fragment.childNodes);
					childNodes.forEach(node => this.anchor.parentNode.insertBefore(node, this.anchor));
					this.activeNodes = childNodes;

					// 🎯 CACHE POPULATION: Nodes für das gerade eben gerenderte Template im Cache ablegen
					this.cache.set(templateKey, childNodes);
				}

				this.lastValue = newValue;
				return;
			}

			// Fallback: Wenn ein primitiver Boolean übergeben wird (z. B. if=${showHeadline})
			// Hier steuerst du einfach die Sichtbarkeit des Elements selbst
			if (!newValue) {
				this.element.style.display = 'none';
			} else {
				this.element.style.removeProperty('display');
			}
			this.lastValue = newValue;
			return;
		}

		// use- namespace: use="{handlerName}" for predefined nice-to-have (directives)
		if (this.name === 'use') {
			//this.element.removeAttribute('use');

			if (newValue && typeof newValue === 'object' && newValue.isHook) {
				newValue.apply(this.element, this.lastValue);
				this.lastValue = newValue;
				return;
			}

			if (typeof newValue === 'function') {
				newValue(this.element);
				return;
			}
			return;
		}
		// TODO check lifecycle of global events/events on el, should be ok, but untested yet
		// handles global eventDelegation
		if (this.name.startsWith('@') && typeof newValue === 'function') {
			const eventTypeMatch = this.name.match(/@([a-zA-Z]+)/);
			if (!eventTypeMatch) return;

			const pureEventType = eventTypeMatch[1].toLowerCase();

			const argsMatch = this.name.match(/\(([^)]+)\)/);
			const pureArgs = argsMatch
				? argsMatch[1].split(',').map(arg => arg.trim())
				: [];

			const hasPrevent =
				this.name.includes('.prevent') || this.modifiers?.prevent;

			// bind to el
			if (!this.element[DELEGATED_STORAGE]) {
				this.element[DELEGATED_STORAGE] = {};
			}

			// once-check
			const isAlreadyRegistered =
				!!this.element[DELEGATED_STORAGE][this.name];

			// update with newValue
			this.element[DELEGATED_STORAGE][this.name] = {
				eventType: pureEventType,
				callback: newValue,
				modifiers: this.modifiers,
				args: pureArgs,
			};

			if (hasPrevent) {
				// register ONCE on el
				if (!isAlreadyRegistered) {
					this.element.addEventListener(pureEventType, event => {
						// dynamic lookup of configState
						const currentConfig =
							this.element[DELEGATED_STORAGE][this.name];
						if (
							!currentConfig ||
							typeof currentConfig.callback !== 'function'
						)
							return;

						const { callback, args } = currentConfig;

						if (pureEventType === 'keydown' && args.length > 0) {
							const pressedKey = event.key.toLowerCase();

							if (
								args
									.map(k => k.toLowerCase())
									.includes(pressedKey)
							) {
								event.preventDefault();
								callback(event, this.element, args);
							}
						} else {
							event.preventDefault();
							callback(event, this.element, args);
						}
					});
				}

				return;
			}

			// "normal" events
			if (!isAlreadyRegistered) {
				ensureGlobalDelegation(pureEventType);
			}

			return;
		}

		// dirty-check
		if (this.lastValue === newValue) return;
		this.lastValue = newValue;

		const finalValue = this.prefix + newValue + this.suffix;
		// TODO add other object attr (transform....)
		if (this.name === 'style') {
			this.element.style.cssText = finalValue;
		} else {
			this.element.setAttribute(this.name, finalValue);
		}
	}
}

export class EventPart {
	constructor(element, blueprintPart) {
		this.element = element;
		this.name = blueprintPart.attrName.substring(2); // onclick -> click
		this.boundListener = null;
	}
	// do not like setting eventListeners instead of respecting couce to use native events, but...
	update(newListener) {
		if (this.boundListener === newListener) return;
		// switch to new instances fraQ
		if (this.boundListener) {
			this.element.removeEventListener(this.name, this.boundListener);
		}

		this.element.addEventListener(this.name, newListener);

		this.boundListener = newListener;
	}
}
// textNodes are lookedup for update by markerComments (seen at lit)
/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */


// TODO THIS USING THE COMMENT IS A NIGHTMARE!!!!!!!!
/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */

export class NodePart {
	constructor(markerComment) {
		this.marker = markerComment;
		this.lastValue = undefined;
		this.textNode = null;
		this.subContainer = null;
		this.endMarker = null;
		this.renderedChildren = []; // Trackt die Metadaten der Schleifen-Items
	}

	update(newValue, renderEngine) {
		if (this.lastValue === newValue) return;
		this.lastValue = newValue;

		// --- 1. Verschachtelte Templates ---
		if (newValue && newValue.type === 'TemplateResult') {
			if (!this.subContainer) {
				this.subContainer = document.createElement('span');
				this.marker.parentNode.insertBefore(
					this.subContainer,
					this.marker.nextSibling
				);
			}
			renderEngine(newValue, this.subContainer);
		}

		// --- 2. Feingranulares Array-Handling (.map Loops & reine Arrays) ---
		else if (Array.isArray(newValue)) {
			if (!this.endMarker) {
				this.endMarker = document.createComment('end-loop');
				this.marker.parentNode.insertBefore(
					this.endMarker,
					this.marker.nextSibling
				);
			}

			if (!this.renderedChildren) this.renderedChildren = [];

			const isPrimitiveArray =
				newValue.length > 0 &&
				!newValue.some(item => item && item.type === 'TemplateResult');

			// --- CASE B: Primitives Array ---
			if (isPrimitiveArray) {
				const textString = newValue.toString();

				if (!this.textNode) {
					this.textNode = document.createTextNode(textString);
					this.endMarker.parentNode.insertBefore(this.textNode, this.endMarker);
				}
				else if (this.textNode.textContent !== textString) {
					this.textNode.textContent = textString;
				}
			}

			// --- CASE A: TemplateResult Loops (.map) - RADIKAL WRAPPERLOS ---
			else {
				const isFirstRender = this.renderedChildren.length === 0;

				// 🚀 INITIALER RENDER-PFAD: Erstellt die Items wrapperlos
				if (isFirstRender && newValue.length > 0) {
					const fragment = document.createDocumentFragment();

					newValue.forEach((item, idx) => {
						if (item && item.type === 'TemplateResult') {
							// Ein DocumentFragment dient als reiner, tag-loser logischer Container
							const itemFragment = document.createDocumentFragment();

							// Synchrones Hydrieren direkt in das Fragment (0% Struktur-Verfälschung)
							renderEngine(item, itemFragment, { quiet: true });

							// Sichere alle echten Kindknoten (unterstützt ein oder mehrere Geschwister-Elemente!)
							const childNodes = Array.from(itemFragment.childNodes);

							// Schiebe die nackten Nodes in das Hauptfragment für den DOM-Insert
							childNodes.forEach(node => fragment.appendChild(node));

							this.renderedChildren[idx] = {
								type: 'template',
								domNodes: childNodes,       // Tracke ALLE nackten Nodes dieses Items für spätere Löschungen
								wrapperContext: itemFragment, // Hält die __rootInstance mit den funktionstüchtigen Parts im RAM
								strings: item.strings,
							};
						}
					});

					// Alle nackten Items in einem einzigen Hardware-Paint vor dem endMarker einfügen
					this.endMarker.parentNode.insertBefore(fragment, this.endMarker);
				}

				// ⚡ LAUFZEIT UPDATE-PFAD: Aktualisiert die Werte über den bestehenden Kontext
				else {
					let domIndex = 0;
					newValue.forEach((item, idx) => {
						if (item && item.type === 'TemplateResult') {
							let childMeta = this.renderedChildren[domIndex];

							if (childMeta && childMeta.strings === item.strings) {
								// Pure, pfeilschnelle Dirty-Checks direkt auf den Parts des DocumentFragments
								renderEngine(item, childMeta.wrapperContext, { quiet: true });
							} else {
								// Fallback bei strukturellem Drift oder Array-Erweiterung
								if (childMeta && childMeta.domNodes) {
									childMeta.domNodes.forEach(node => node.remove());
								}

								const itemFragment = document.createDocumentFragment();
								renderEngine(item, itemFragment, { quiet: true });

								const childNodes = Array.from(itemFragment.childNodes);
								const fragment = document.createDocumentFragment();
								childNodes.forEach(node => fragment.appendChild(node));

								this.endMarker.parentNode.insertBefore(fragment, this.endMarker);

								childMeta = {
									type: 'template',
									domNodes: childNodes,
									wrapperContext: itemFragment,
									strings: item.strings,
								};
								this.renderedChildren[domIndex] = childMeta;
							}
							domIndex++;
						}
					});

					// Array ist geschrumpft: Überschüssige Items restlos aus dem DOM fegen
					while (this.renderedChildren.length > domIndex) {
						const removed = this.renderedChildren.pop();
						if (removed && removed.domNodes) {
							removed.domNodes.forEach(node => node.remove());
						}
					}
				}
			}
		}

		// --- 3. Primitive Werte ---
		else {
			const stringified = String(
				newValue === undefined || newValue === null ? '' : newValue
			);
			if (!this.textNode) {
				this.textNode = document.createTextNode(stringified);
				this.marker.parentNode.insertBefore(
					this.textNode,
					this.marker.nextSibling
				);
			} else if (this.textNode.textContent !== stringified) {
				this.textNode.textContent = stringified;
			}
		}
	}
}


export default { NodePart, AttributePart, EventPart };
