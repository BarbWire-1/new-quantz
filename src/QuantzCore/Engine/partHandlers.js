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

		// // EINMALIGES PARSING FÜR EVENT-MODIFIER IM CONSTRUCTOR (0 ms Runtime-Overhead)
		if (this.name.startsWith('@')) {
			const parts = this.name.slice(1).toLowerCase().split('.'); //
			this.pureEventType = parts[0]; // 'click'
		}
	}

	update(newValue) {
		// EXKLUSIVER 'USE' NAMENSRAUM
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

		// GLOBALE EVENT-DELEGATION MIT HOCHPERFORMANTEN MODIFIER-PAKETEN
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

			// 1. Speicher auf dem Element initialisieren, falls noch nicht geschehen
			if (!this.element[DELEGATED_STORAGE]) {
				this.element[DELEGATED_STORAGE] = {};
			}

			// 2. PRÜFUNG: Haben wir diese exakte Direktive für dieses Element schon registriert?
			const isAlreadyRegistered =
				!!this.element[DELEGATED_STORAGE][this.name];

			// 3. Callback im Speicher aktualisieren (damit Closures/neue Daten aus dem Render funktionieren)
			this.element[DELEGATED_STORAGE][this.name] = {
				eventType: pureEventType,
				callback: newValue,
				modifiers: this.modifiers,
				args: pureArgs,
			};

			// WEG 1: Wenn .prevent aktiv ist -> Als EIN lokaler Kombi-Handler ausführen
			if (hasPrevent) {
				// NUR REGISTRIEREN, WENN ES NOCH NICHT EXISTIERT!
				if (!isAlreadyRegistered) {
					this.element.addEventListener(pureEventType, event => {
						// WICHTIG: Wir holen uns die Konfiguration DYNAMISCH bei jedem Event-Trigger aus dem Speicher.
						// Dadurch altert der Callback nicht (kein Stale-Closure-Problem).
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

			// WEG 2: Für alle normalen Events ohne .prevent -> Weiterhin globale Delegation
			// Da wir oben isAlreadyRegistered prüfen, müssen wir hier nicht doppelt delegieren
			if (!isAlreadyRegistered) {
				ensureGlobalDelegation(pureEventType);
			}

			return;
		}

		// AB HIER DEIN NORMALER CORE-CODE (Dirty-Check für Standard-Attribute)
		if (this.lastValue === newValue) return;
		this.lastValue = newValue;

		const finalValue = this.prefix + newValue + this.suffix;
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

		// 1. NESTED TEMPLATES HANDLING
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
		// 2. FINE-GRAINED ARRAY HANDLING (.map Loops)
		else if (Array.isArray(newValue)) {
			if (!this.endMarker) {
				this.endMarker = document.createComment('end-loop');
				this.marker.parentNode.insertBefore(
					this.endMarker,
					this.marker.nextSibling
				);
			}
			// TODO  does not handle if NOT in map
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
		// 3. PRIMITIVES HANDLING
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
