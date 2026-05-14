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
		try {
			if (!this.shadowRoot) {
				this.attachShadow({ mode: 'open' });
			}
		} catch (e) {
			// do nothing
		}
	}

	connectedCallback() {
		// WICHTIG: Die Komponente muss sich selbst in der Registry kennen
		reactiveRegistry.set(this, this);

		if (!this.shadowRoot) {
			this.attachShadow({ mode: 'open' });
		}

		// Erst Felder konvertieren, DANN das initiale Rendering triggern
		this.__convertFieldsToReactive();
		this.__queueUpdate();
	}

	__convertFieldsToReactive() {
		Object.keys(this).forEach(key => {
			if (key.startsWith('__') || key.startsWith('#')) return;
			const initialValue = this[key];

			// 1. Initialwert reaktiv machen
			this.#valuesStore[key] =
				initialValue !== null && typeof initialValue === 'object'
					? makeDeepReactive(initialValue, this)
					: initialValue;

			// Falls der Initialwert ein Objekt war, registrieren wir dieses Objekt auf DIESE Komponente
			if (initialValue !== null && typeof initialValue === 'object') {
				reactiveRegistry.set(initialValue, this);
			}

			Object.defineProperty(this, key, {
				get: () => this.#valuesStore[key],
				set: newValue => {
					// 2. Proxy-Unwrapping beim Vergleich!
					// Verhindert Endlosschleifen, falls newValue ein Proxy des bestehenden Werts ist
					const currentValue = this.#valuesStore[key];
					if (
						currentValue === newValue ||
						(currentValue && currentValue.__raw__ === newValue)
					)
						return;

					if (newValue !== null && typeof newValue === 'object') {
						this.#valuesStore[key] = makeDeepReactive(
							newValue,
							this
						);
						reactiveRegistry.set(newValue, this); // Registrierung erneuern
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
			// Wichtig: Erst rendern, DANN den Flag zurücksetzen.
			// Das verhindert, dass während des Render-Vorgangs (z.B. durch Getters) voreilig neue Tasks geplant werden.
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
