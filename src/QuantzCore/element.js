/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
import { reactiveRegistry } from './Engine/Globals.js';
import { makeDeepReactive } from './Engine/engine.js';
import { render } from './Engine/renderer.js';


/**
 * The BaseClass for all QElements
 *
 * @export
 * @class QElement
 * @typedef {QElement}
 * @extends {HTMLElement}
 */
export class QElement extends HTMLElement {
	#updateQueued = false;
	#valuesStore = {};

	constructor() {
		super();
		try {
			if (!this.shadowRoot) {
				this.attachShadow({ mode: 'open' });
			}
		} catch (e) {
			// do nothing
		}
	}

	connectedCallback() {
		// IMPORTANT: register per instance
		reactiveRegistry.set(this, this);

		if (!this.shadowRoot) {
			this.attachShadow({ mode: 'open' });
		}

		// make props reactive then trigger init update
		this.__convertFieldsToReactive();
		this.__queueUpdate();
	}
	disconnectedCallback() {
		reactiveRegistry.delete(this);
	}

	__convertFieldsToReactive() {
		Object.keys(this).forEach(key => {
			// exclude private properties
			if (key.startsWith('__') || key.startsWith('#')) return;
			const initialValue = this[key];

			// make reactive
			this.#valuesStore[key] =
				initialValue !== null && typeof initialValue === 'object'
					? makeDeepReactive(initialValue, this)
					: initialValue;

			// for objects register on instance
			if (initialValue !== null && typeof initialValue === 'object') {
				reactiveRegistry.set(initialValue, this);
			}

			Object.defineProperty(this, key, {
				get: () => this.#valuesStore[key],
				set: newValue => {
					// proxy-unwrapping to prevent infinite loops
					const currentValue = this.#valuesStore[ key ];
					const currentRaw = currentValue?.__raw__;
					const newRaw = newValue?.__raw__;
					if (
						currentValue === newValue ||
						(currentRaw &&
							(currentRaw === newValue || currentRaw === newRaw))
					)
						return;

					// proxy new value if complex
					if (newValue !== null && typeof newValue === 'object') {
						this.#valuesStore[key] = makeDeepReactive(
							newValue,
							this
						);
						// and register on instance
						reactiveRegistry.set(newValue, this);
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
	// ONLY render after all queued values are updated
	__queueUpdate() {
		if (this.#updateQueued) return;
		this.#updateQueued = true;

		queueMicrotask(() => {

			try {
				if (this.template) {
					render(this.template(), this.shadowRoot);
				}
			} finally {
				this.#updateQueued = false;
			}
		});
	}
}
