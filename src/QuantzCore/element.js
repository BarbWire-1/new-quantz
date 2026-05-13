/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
import { reactiveRegistry } from './Engine/Globals.js';
import { makeDeepReactive } from './Engine/engine.js';
import { render } from './Engine/renderer.js';

export class QElement extends HTMLElement {
	#updateQueued = false;
	#valuesStore = {};

	constructor() {
		super();
		// Versuch 1: Shadow DOM direkt im Constructor erzeugen
		try {
			if (!this.shadowRoot) {
				this.attachShadow({ mode: 'open' });
			}
		} catch (e) {
			// Wird vom Browser abgefangen, falls die Registrierung noch nicht vollständig war
		}
	}

	connectedCallback() {
		reactiveRegistry.set(this, this);

		// Versuch 2 (Sicherheitsgurt): Falls das Shadow DOM im Constructor blockiert wurde,
		// erzwingen wir es JETZT, da das Element definitiv registriert und im DOM ist.
		if (!this.shadowRoot) {
			this.attachShadow({ mode: 'open' });
		}

		// Felder reaktiv machen
		this.__convertFieldsToReactive();
		this.__queueUpdate();
	}

	__convertFieldsToReactive() {
		Object.keys(this).forEach(key => {
			if (key.startsWith('__') || key.startsWith('#')) return;
			const initialValue = this[key];

			this.#valuesStore[key] =
				initialValue !== null && typeof initialValue === 'object'
					? makeDeepReactive(initialValue, this)
					: initialValue;

			Object.defineProperty(this, key, {
				get: () => this.#valuesStore[key],
				set: newValue => {
					if (this.#valuesStore[key] === newValue) return;

					if (newValue !== null && typeof newValue === 'object') {
						this.#valuesStore[key] = makeDeepReactive(
							newValue,
							this
						);
					} else {
						this.#valuesStore[key] = newValue;
					}

					this.__queueUpdate();
				},
				configurable: true,
				enumerable: true,
			});
		});
	}

	__queueUpdate() {
		if (this.#updateQueued) return;
		this.#updateQueued = true;

		queueMicrotask(() => {
			this.#updateQueued = false;
			if (this.template) {
				// Wir rendern NIEMALS in 'this' (Light DOM).
				// Wir nutzen AUSNAHMSLOS den shadowRoot.
				render(this.template(), this.shadowRoot);
			}
		});
	}
}
