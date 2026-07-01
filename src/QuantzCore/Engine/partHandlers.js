/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */

import { DELEGATED_STORAGE, activeGlobalEvents } from './Globals.js';
import { ensureGlobalDelegation } from '../events.js';

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



export class NodePart {
	constructor(markerComment) {
		this.marker = markerComment;
		this.lastValue = undefined;
		this.textNode = null;
		this.subContainer = null;
		this.endMarker = null;
		this.renderedChildren = [];
	}

	update(newValue, renderEngine) {
		if (this.lastValue === newValue) return;
		this.lastValue = newValue;

		// nested templates
		if (newValue && newValue.type === 'TemplateResult') {
			if (!this.subContainer) {
				this.subContainer = document.createElement('span');
				this.marker.parentNode.insertBefore(
					this.subContainer,
					this.marker.nextSibling
				);
				if (DEBUG) {
					console.log('%c[NodePart] 🧱 Created new sub-container span for nested TemplateResult', 'color: #00bcd4;');
				}
			}
			if (DEBUG) {
				console.log('%c[NodePart] 🔄 Updating nested TemplateResult', 'color: #00bcd4;', newValue);
			}
			renderEngine(newValue, this.subContainer);
		}

		// fine-grained array-handling (.map Loops und reine Arrays)
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

			if (isPrimitiveArray) {
				if (!this.bracketStartNode) {
					this.bracketStartNode = document.createTextNode('[');
					this.marker.parentNode.insertBefore(
						this.bracketStartNode,
						this.marker.nextSibling
					);
					this.bracketEndNode = document.createTextNode(']');
					this.endMarker.parentNode.insertBefore(
						this.bracketEndNode,
						this.endMarker
					);
				}
			}

			let domIndex = 0;

			newValue.forEach((item, idx) => {
				// --- CASE A: TemplateResult (.map Loops) ---
				if (item && item.type === 'TemplateResult') {
					let childMeta = this.renderedChildren[domIndex];
					const wrapper = document.createElement('q-p');
					wrapper.style.display = 'contents';
					const domNode = wrapper.firstElementChild || wrapper;

					if (
						!childMeta ||
						childMeta.type !== 'template' ||
						childMeta.strings !== item.strings
					) {
						if (childMeta && childMeta.domNode) {
							if (DEBUG) {
								console.log(`%c[NodePart: Loop] 🗑️ Structural change at index ${idx}. Removing old node.`, 'color: #e91e63;');
							}
							childMeta.domNode.remove();
						}

						if (DEBUG) {
							console.log(`%c[NodePart: Loop] 🆕 Creating new instance for item at index ${idx}`, 'color: #2196f3;', item);
						}

						renderEngine(item, wrapper);
						this.endMarker.parentNode.insertBefore(
							domNode,
							this.endMarker
						);

						childMeta = {
							type: 'template',
							domNode,
							strings: item.strings,
						};
						this.renderedChildren[domIndex] = childMeta;
					} else {
						// ✨ HIER PASSIERT DAS RE-RENDER BEI VALUE-ÄNDERUNGEN
						if (DEBUG) {
							console.log(`%c[NodePart: Loop] 🔄 Updating existing item at index ${idx}`, 'color: #4caf50;', {
								node: childMeta.domNode,
								newValues: item.values
							});
						}
						renderEngine(item, childMeta.domNode);
					}
					domIndex++;
				}
				// --- CASE B: Primitives Array (incl commas) ---
				else {
					let childMeta = this.renderedChildren[domIndex];
					const textString = String(
						item === undefined || item === null ? '' : item
					);

					if (!childMeta || childMeta.type !== 'text') {
						if (childMeta && childMeta.domNode) childMeta.domNode.remove();
						const textNode = document.createTextNode(textString);

						if (DEBUG) {
							console.log(`%c[NodePart: Array] 🆕 Appending primitive value text-node at index ${idx}: "${textString}"`, 'color: #ff9800;');
						}

						const targetLocation = this.bracketEndNode || this.endMarker;
						targetLocation.parentNode.insertBefore(
							textNode,
							targetLocation
						);

						childMeta = {
							type: 'text',
							domNode: textNode,
							value: textString,
						};
						this.renderedChildren[domIndex] = childMeta;
					} else if (childMeta.value !== textString) {
						if (DEBUG) {
							console.log(`%c[NodePart: Array] 📝 Updating primitive value text at index ${idx}: "${childMeta.value}" -> "${textString}"`, 'color: #ff9800;');
						}
						childMeta.domNode.textContent = textString;
						childMeta.value = textString;
					}
					domIndex++;

					if (idx < newValue.length - 1) {
						let commaMeta = this.renderedChildren[domIndex];
						if (!commaMeta || commaMeta.type !== 'comma') {
							if (commaMeta && commaMeta.domNode) commaMeta.domNode.remove();
							const commaNode = document.createTextNode(', ');

							const targetLocation = this.bracketEndNode || this.endMarker;
							targetLocation.parentNode.insertBefore(
								commaNode,
								targetLocation
							);

							commaMeta = { type: 'comma', domNode: commaNode };
							this.renderedChildren[domIndex] = commaMeta;
						}
						domIndex++;
					}
				}
			});

			while (this.renderedChildren.length > domIndex) {
				const removed = this.renderedChildren.pop();
				if (removed && removed.domNode) {
					if (DEBUG) {
						console.log('%c[NodePart: Loop] 🗑️ Truncating array: removing trailing DOM node', 'color: #f44336;', removed.domNode);
					}
					removed.domNode.remove();
				}
			}
		}

		// primitives
		else {
			const stringified = String(
				newValue === undefined || newValue === null ? '' : newValue
			);
			if (!this.textNode) {
				if (DEBUG) {
					console.log(`%c[NodePart: Primitive] 🆕 Creating new text-node: "${stringified}"`, 'color: #9e9e9e;');
				}
				this.textNode = document.createTextNode(stringified);
				this.marker.parentNode.insertBefore(
					this.textNode,
					this.marker.nextSibling
				);
			} else if (this.textNode.textContent !== stringified) {
				if (DEBUG) {
					console.log(`%c[NodePart: Primitive] 📝 Updating text content: "${this.textNode.textContent}" -> "${stringified}"`, 'color: #9e9e9e;');
				}
				this.textNode.textContent = stringified;
			}
		}
	}
}

export default { NodePart, AttributePart, EventPart };
