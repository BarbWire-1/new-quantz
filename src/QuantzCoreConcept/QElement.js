/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
import { render } from './engine.js';
import { getReactiveProxy } from './reactivity.js';

export const reactiveRegistry = new WeakMap();

export class QElement extends HTMLElement {
	#updateQueued = false;
	#valuesStore = {};
	_watchers = null; // Interner Speicher für deine registrierten Watcher-Callbacks

	constructor() {
		super();
		try {
			if (!this.shadowRoot) {
				this.attachShadow({ mode: 'open' });
			}
		} catch (e) {}
	}

	// DEIN REAKTIVER WATCHER-PART
	// Erlaubt dir: this.watch('num', (newVal) => { ... })
	watch(prop, handler) {
		this._watchers ??= new Map();
		if (!this._watchers.has(prop)) {
			this._watchers.set(prop, new Set());
		}
		this._watchers.get(prop).add(handler);
	}

	connectedCallback() {
		reactiveRegistry.set(this, this);

		if (!this.shadowRoot) {
			this.attachShadow({ mode: 'open' });
		}

		// Felder reaktiv machen
		this.__convertFieldsToReactive();
		this.__queueUpdate();
	}

	__convertFieldsToReactive() {
		// Der zentrale Signal-Verteiler für deine Watcher und das DOM-Rendering
		const notify = (changedProp, currentVal) => {
			// 1. SIGNALING-PHASE: Prüfen, ob für diese Eigenschaft Watcher registriert sind
			if (this._watchers) {
				const handlers = this._watchers.get(changedProp);
				if (handlers) {
					for (const fn of handlers) {
						fn(currentVal); // Führt deinen registrierten Handler aus
					}
				}
			}

			// 2. RENDERING-PHASE: DOM-Update in die Queue schieben
			this.__queueUpdate();
		};

		Object.keys(this).forEach(key => {
			if (key.startsWith('__') || key.startsWith('#')) return;
			const initialValue = this[key];

			// Hilfsfunktion: Schützt vor nativen C++ Browser-Objekten (Events, DOM-Nodes)
			const isSafeObject =
				initialValue &&
				typeof initialValue === 'object' &&
				(Object.getPrototypeOf(initialValue) === Object.prototype ||
					Array.isArray(initialValue) ||
					initialValue instanceof Map ||
					initialValue instanceof Set);

			// Für komplexe verschachtelte Arrays/Objekte übergeben wir einen Wrapper,
			// der bei Mutationen (z.B. push) meldet, zu welchem Key er gehört
			if (isSafeObject) {
				this.#valuesStore[key] = getReactiveProxy(initialValue, () =>
					notify(key, this.#valuesStore[key])
				);
			} else {
				this.#valuesStore[key] = initialValue;
			}

			Object.defineProperty(this, key, {
				get: () => this.#valuesStore[key],
				set: newValue => {
					if (this.#valuesStore[key] === newValue) return;

					const isNewValueSafe =
						newValue &&
						typeof newValue === 'object' &&
						(Object.getPrototypeOf(newValue) === Object.prototype ||
							Array.isArray(newValue) ||
							newValue instanceof Map ||
							newValue instanceof Set);

					if (isNewValueSafe) {
						// Wenn ein neues Objekt/Array zugewiesen wird, kriegt der Proxy seinen Key mit
						this.#valuesStore[key] = getReactiveProxy(
							newValue,
							() => notify(key, this.#valuesStore[key])
						);
					} else {
						this.#valuesStore[key] = newValue;
					}

					// Triggert den Watcher-Zweig und das rendering für flache Zuweisungen (=)
					notify(key, this.#valuesStore[key]);
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
				render(this.template(), this.shadowRoot);
			}
		});
	}
}
class StresstestComponent extends QElement {
	constructor() {
		super();
		this.num = 0;
		this.colors = ['red', 'green'];

		// HIER nutzen wir deinen Watcher-Part:
		this.watch('num', newVal => {
			console.log(`[Watcher] 'num' hat sich geändert auf: ${newVal}`);
		});

		this.watch('colors', updatedArray => {
			console.log(
				`[Watcher] Array mutiert! Neue Länge: ${updatedArray.length}`
			);
		});
	}

	template() {
		return html`
			<h2>Count: ${this.num}</h2>
			<button onclick="${() => this.num++}">+1</button>
			<button onclick="${() => this.colors.push('blue')}">
				Add Color
			</button>
		`;
	}
}
// 1. Greife dir das Element aus dem DOM
const el = document.getElementById('myComp');

// 2. Registriere den Watcher von AUSSEN!
el.watch('num', (newValue) => {
     console.log(`[Externer Watcher] Komponente meldet neuen Zählerstand: ${newValue}`);

     // Beispiel für einen kontrollierten Side-Effect:
     // Sende Daten an einen Analytics-Server oder aktualisiere ein globales State-Management
     if (newValue === 10) {
          alert('Meilenstein erreicht!');
     }
});

el.watch('colors', (newArray) => {
     console.log('[Externer Watcher] Die Farbliste wurde extern/intern manipuliert:', newArray);
});
const rawArray = ['red', 'green'];
this.colors = rawArray;

// ACHTUNG: Das originale Objekt ist NICHT identisch mit der reaktiven Hülle!
console.log(this.colors === rawArray); // => false
