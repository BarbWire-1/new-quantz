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
		// if already registered
		try {
			if (!this.shadowRoot) {
				this.attachShadow({ mode: 'open' });
			}
		} catch (e) {
			// do nothing
		}
	}

	connectedCallback() {
		reactiveRegistry.set(this, this);

		if (!this.shadowRoot) {
			this.attachShadow({ mode: 'open' });
		}

		// handle props
		this.__convertFieldsToReactive();
		this.__queueUpdate();
	}
	// Keeps access to own Properties while proxy handles updates (target and frag)
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
				// does NOT rerender all template but replace bound nodes (frag) with clones of newValue
				render(this.template(), this.shadowRoot);
			}
		});
	}
}
