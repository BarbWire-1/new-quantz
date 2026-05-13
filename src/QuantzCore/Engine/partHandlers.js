/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */

import { DELEGATED_STORAGE, activeGlobalEvents } from './Globals.js';
import { ensureGlobalDelegation } from '../events.js';

/**
 * Normalizes values before they hit the DOM.
 * Handles Primitives, nested Templates, and Boolean Attributes.
 */

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
			this.element.removeAttribute('use');

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

		//nested templates
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
		// TODO check for map, else is just an array ;)
		// fine-grained array-handling (.map Loops)
		else if (Array.isArray(newValue)) {
			if (!this.endMarker) {
				this.endMarker = document.createComment('end-loop');
				this.marker.parentNode.insertBefore(
					this.endMarker,
					this.marker.nextSibling
				);
			}

			newValue.forEach((subTpl, idx) => {
				if (!subTpl || subTpl.type !== 'TemplateResult') return;
				let childMeta = this.renderedChildren[idx];
				const wrapper = document.createElement('div');
				const domNode = wrapper.firstElementChild || wrapper;

				if (!childMeta || childMeta.strings !== subTpl.strings) {
					renderEngine(subTpl, wrapper);

					this.endMarker.parentNode.insertBefore(
						domNode,
						this.endMarker
					);
					childMeta = { domNode, strings: subTpl.strings };
					this.renderedChildren[idx] = childMeta;
				} else {
					renderEngine(subTpl, childMeta.domNode);
				}
			});

			while (this.renderedChildren.length > newValue.length) {
				const removed = this.renderedChildren.pop();
				if (removed && removed.domNode) removed.domNode.remove();
			}
		}
		// primitives
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
