/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
// TODO - list is rendered nested li in li per item!!!!!
import './style.css';

// textNode-Schnittstelle zur Vermeidung von [object Object]
//import { normalizeValue } from './engine.js';

export class AttributePart {
	constructor(element, blueprintPart) {
		this.element = element;
		this.name = blueprintPart.attrName;
		this.prefix = blueprintPart.prefix;
		this.suffix = blueprintPart.suffix;
		this.lastValue = undefined;
	}
	update(newValue) {
		// HIER SITZT DER INSTANZBASIERTE DIRTY-CHECK
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

			newValue.forEach((subTpl, idx) => {
				if (!subTpl || subTpl.type !== 'TemplateResult') return;
				let childMeta = this.renderedChildren[idx];

				if (!childMeta || childMeta.strings !== subTpl.strings) {
					const wrapper = document.createElement('div');
					renderEngine(subTpl, wrapper);
					const domNode = wrapper.firstElementChild || wrapper;

					this.endMarker.parentNode.insertBefore(
						domNode,
						this.endMarker
					);
					childMeta = { domNode, strings: subTpl.strings };
					this.renderedChildren[idx] = childMeta;
				}
				renderEngine(subTpl, childMeta.domNode);
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

const blueprintCache = new WeakMap();

export function html(strings, ...values) {
	return { type: 'TemplateResult', strings, values };
}
/*

TODO
Wenn du deine Pause beendest und wieder einsteigen möchtest, um das System weiter zu verfeinern (z. B. das Path-Indexing [lit.dev] anzugehen, um die Initialisierungszeit bei 500 Instanzen komplett zu pulverisieren), bin ich bereit.


export function html(strings, ...values) {
    const template = document.createElement('template');

    // 1. Wir bauen das HTML völlig normal zusammen (ohne Marker!)
    // An den Stellen der Ausdrücke lassen wir einfach leere Textknoten oder Attribute
    let htmlString = strings.join('');
    template.innerHTML = htmlString;

    const fragment = template.content;

    // 2. Wir nutzen deinen "Context", um die Live-Verbindung herzustellen.
    // values[i] ist hier die Funktion, z.B. () => this.color
    values.forEach((expr, index) => {
        if (typeof expr !== 'function') return;

        // Wir erstellen eine präzise Update-Funktion für genau diese Stelle
        const updateTarget = () => {
            const currentValue = expr(); // Holt den echten, aktuellen Wert aus 'this'

            // Logik zum Schreiben ins DOM (Text oder Attribut)
            // Hier greift dein Proxy-Kontext an und triggert genau diesen Block,
            // wenn sich die Variable ändert!
        };

        // Initial ausführen
        updateTarget();
    });

    return fragment;
}
*/

function getTemplateBlueprint(strings) {
	if (blueprintCache.has(strings)) return blueprintCache.get(strings);

	const template = document.createElement('template');
	let htmlString = '';

	// 1. Injektion von unmissverständlichen Markern direkt während des Zusammenbaus.
	// Jede Expression erhält ihre eigene feste ID im HTML. Das überlebt jede Minifizierung!
	for (let i = 0; i < strings.length; i++) {
		htmlString += strings[i];
		if (i < strings.length - 1) {
			const isInsideAttr = /=\s*["']?([^"'>]*)$/.test(htmlString);
			if (isInsideAttr) {
				// Für Attribute nutzen wir einen sicheren Token-String ohne Doppel-Unterstriche
				htmlString += `litv${i}x`;
			} else {
				// Für Textknoten/Loops nutzen wir einen validen HTML-Kommentar
				htmlString += `<!--litn${i}-->`;
			}
		}
	}

	template.innerHTML = htmlString;

	const dynamicParts = [];
	const walker = document.createTreeWalker(
		template.content,
		NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT
	);

	let elementCounter = 0;
	const elementIndexMap = new Map();

	// 2. DOM-Strukturanalyse: Wir lesen die harte ID direkt aus dem vom Browser gebauten DOM
	while (walker.nextNode()) {
		const node = walker.currentNode;

		if (node.nodeType === Node.ELEMENT_NODE) {
			const elId = elementCounter++;
			elementIndexMap.set(node, elId);

			Array.from(node.attributes).forEach(attr => {
				if (attr.value.includes('litv')) {
					const match = attr.value.match(/litv(\d+)x/);
					if (match) {
						const index = parseInt(match[1], 10);
						const attrName = attr.name;

						// KEIN REGEX-SPLIT! Wir holen uns die statischen Teile direkt aus dem strings-Array.
						// Das ist mathematisch bombensicher, da strings[index] immer vor dem Wert liegt.
						const prefix = strings[index]
							.substring(
								strings[index].lastIndexOf(attrName + '=')
							)
							.replace(/^[^\s=]+=\s*["']?/, '');
						const suffix = strings[index + 1]
							.substring(
								0,
								strings[index + 1].search(/["']?\s*>/)
							)
							.replace(/^["']?/, '');

						dynamicParts.push({
							type: attrName.startsWith('on')
								? 'event'
								: 'attribute',
							index,
							elId,
							attrName,
							prefix,
							suffix,
						});
					}
					// Verhindert, dass der Browser den Platzhalter als inline-JS ausführt
					if (attr.name.startsWith('on'))
						node.removeAttribute(attr.name);
				}
			});
		} else if (
			node.nodeType === Node.COMMENT_NODE &&
			node.nodeValue.startsWith('litn')
		) {
			// Index direkt aus dem HTML-Kommentar extrahieren
			const index = parseInt(node.nodeValue.replace('litn', ''), 10);
			const parentNode = node.parentNode;

			if (!elementIndexMap.has(parentNode)) {
				elementIndexMap.set(parentNode, elementCounter++);
			}

			dynamicParts.push({
				type: 'node',
				index,
				elId: elementIndexMap.get(parentNode),
				commentPath: Array.from(parentNode.childNodes).indexOf(node),
			});
		}
	}

	const blueprint = { template, dynamicParts };
	blueprintCache.set(strings, blueprint);
	return blueprint;
}
// TODO value is NEVER ARRAY OR OBJECT!!!!!! only PROPS
/**
 * Normalizes values before they hit the DOM.
 * Handles Primitives, nested Templates, and Boolean Attributes.
 */
function normalizeValue(value, isAttribute = false) {
	console.log({ value });
	// 1. Handle "Nothing" (null, undefined, false)
	if (value === null || value === undefined || value === false) {
		return isAttribute ? null : String(value);
	}
	// TODO ?????
	// 2. Handle Boolean 'true' for attributes (e.g., ?disabled="${true}")
	if (value === true) {
		return isAttribute ? '' : '';
	}

	// 3. Catch raw objects to prevent rendering "[object Object]"
	if (
		typeof value === 'object' &&
		!Array.isArray(value) &&
		value.type !== 'TemplateResult'
	) {
		console.warn(
			'Framework Warning: Attempted to render raw object:',
			value
		);
		return JSON.stringify(value);
	}

	// Pass through Strings, Numbers, Arrays, and TemplateResults
	return value;
}
// NEW PART REGISTRY
/**
 * One-time execution map compiler.
 * Discovers exactly which class properties are accessed by which expression indices.
 */
export function compileDependencyMap(componentInstance) {
	const dependencyMap = new Map(); // Property Key -> Set of expression indices
	const templateResult = componentInstance.template();
	const values = templateResult.values;

	values.forEach((_, index) => {
		// Create a temporary tracking proxy for this specific expression slot
		const tracker = new Proxy(componentInstance, {
			get(target, prop) {
				if (!dependencyMap.has(prop))
					dependencyMap.set(prop, new Set());
				dependencyMap.get(prop).add(index); // Bind property key to this expression index
				return target[prop];
			},
		});

		// Execute the expression in the context of our tracker proxy to sniff out the property name
		try {
			// If the value is a function wrapper (like an event), we look at its code body dependencies
			if (typeof values[index] === 'function') {
				const fnStr = values[index].toString();
				Object.keys(componentInstance).forEach(key => {
					if (fnStr.includes(`this.${key}`)) {
						if (!dependencyMap.has(key))
							dependencyMap.set(key, new Set());
						dependencyMap.get(key).add(index);
					}
				});
			} else {
				// Evaluate complex properties (like expressions or ternaries) via a safe runtime execution hook
				// For simple primitives, your existing makeDeepReactive already knows who accessed what!
			}
		} catch (e) {}
	});

	return dependencyMap;
}

export function render(templateResult, container) {
	if (!templateResult || templateResult.type !== 'TemplateResult') {
		container.textContent = String(templateResult);
		return;
	}

	const blueprint = getTemplateBlueprint(templateResult.strings);

	// ERSTALIGES MOUNTING: Erzeuge die physischen Instanz-Parts auf den geklonten Nodes
	if (!container.__rootInstance) {
		const clone = blueprint.template.content.cloneNode(true);
		const elementsMap = {};
		let elementCounter = 0;

		const walker = document.createTreeWalker(
			clone,
			NodeFilter.SHOW_ELEMENT
		);
		while (walker.nextNode()) {
			elementsMap[elementCounter++] = walker.currentNode;
		}

		// Wir übersetzen blueprint.dynamicParts in funktionale Instanz-Parts
		const instanceParts = blueprint.dynamicParts.map(part => {
			const targetElement = elementsMap[part.elId] || clone;

			if (part.type === 'attribute') {
				return new AttributePart(targetElement, part);
			} else if (part.type === 'event') {
				return new EventPart(targetElement, part);
			} else if (part.type === 'node') {
				const markerComment =
					targetElement.childNodes[part.commentPath];
				return new NodePart(markerComment);
			}
		});

		container.__rootInstance = { instanceParts };
		container.replaceChildren(clone); // Shadow DOM sicher!
	}

	const { instanceParts } = container.__rootInstance;

	// RUNTIME UPDATE: Das ist jetzt der gesamte Code, der bei Updates ausgeführt wird!
	// Keine Ifs, kein Tree-Walking. Ein simpler, flacher, C++-naher Array-Loop.
	for (let i = 0; i < instanceParts.length; i++) {
		instanceParts[i].update(templateResult.values[i], render);
	}
}

// Global registry mapping arrays and nested objects back to their parent element
const reactiveRegistry = new WeakMap();
// TODO THIS DOES NOT USE SHADOWDOM,  BAD
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

// Deep proxy wrapper for nested structures and array methods
function makeDeepReactive(target, ownerComponent) {
	if (target.__isProxy) return target;

	reactiveRegistry.set(target, ownerComponent);

	return new Proxy(target, {
		get(obj, prop) {
			if (prop === '__isProxy') return true;
			const val = obj[prop];

			// Safely capture mutating array methods (push, pop, splice, sort, reverse)
			if (Array.isArray(obj) && typeof val === 'function') {
				const mutatingMethods = [
					'push',
					'pop',
					'shift',
					'unshift',
					'splice',
					'sort',
					'reverse',
				];
				if (mutatingMethods.includes(prop)) {
					return function (...args) {
						const result = val.apply(obj, args);
						const owner = reactiveRegistry.get(obj);
						if (owner) owner.__queueUpdate();
						return result;
					};
				}
			}

			if (val !== null && typeof val === 'object') {
				return makeDeepReactive(val, ownerComponent);
			}
			return val;
		},

		set(obj, prop, value) {
			if (obj[prop] === value) return true;

			obj[prop] =
				value !== null && typeof value === 'object'
					? makeDeepReactive(value, ownerComponent)
					: value;

			const owner = reactiveRegistry.get(obj);
			if (owner) owner.__queueUpdate();
			return true;
		},
	});
}
/**
 * The Factory Wrapper
 * @param {string} tagName - Der HTML-Tag-Name
 * @param {Function} classFactory - Eine Funktion oder die Klasse selbst
 */
export function createComponent(tagName, UserClass) {
	if (!customElements.get(tagName)) {
		// Sofortige, harte Registrierung beim Browser
		customElements.define(tagName, UserClass);
	}
	return UserClass;
}

createComponent(
	'stresstest-component',
	class StresstestComponent extends QElement {
		constructor() {
			super(); // 100% legal instantiation

			// Simply declare fields on 'this'. No state wrappers or .reactive properties!

			this.color = 'crimson';
			this.colors = [ 'red', 'green' ];
			this.blah = "BLAH"
			this.user = {
				profile: { name: 'John Doe', id: null },
			};
		}

		shuffleData() {
			// Array methods trigger updates perfectly through the Proxy layer
			this.colors.reverse();
		}

		runInnerCalculations() {
			const helperFunction = () => {
				// Inner functions change data natively
				this.user.profile.name = 'Max Mustermann';
				this.user.profile.id = 999;
			};
			helperFunction();
		}

		async simulateFetch() {
			function getRandomInt(max) {
				return Math.floor(Math.random() * max);
			}
			await new Promise(resolve => setTimeout(resolve, 1000));
			// Async assignments are batched via queueMicrotask
			this.user.profile.name = 'Fetched User';
			this.user.profile.id = getRandomInt(3000);
			this.colors.splice(2, 0, StresstestComponent.randomColor());
		}
		static randomColor() {
			return '#' + Math.floor(Math.random() * 16777215).toString(16);
		}

		static test(c) {
			return `Active wrapper: ${c.toUpperCase()}`;
		}
		addNewColor(newColor) {
			// Weil Arrays über den rekursiven Proxy laufen, triggert auch das
			// Hinzufügen von Elementen automatisch das minimale DOM-Update!
			this.colors.push(StresstestComponent.randomColor());
		}

		template() {
			const newDate = new Date();
			return html`
				<h2>
					User: ${this.user.profile.name} (ID:
					${this.user.profile.id})
				</h2>
				<p>this.none?.existing?.prop: ${this.none?.existing?.prop}</p>
				<p>new Date(): ${newDate}</p>
				<button onclick="${() => this.addNewColor()}">Add Item</button>
				<button onclick="${() => this.colors.pop()}">Pop Item</button>
				<button onclick="${() => this.shuffleData()}">
					Reverse Array
				</button>
				<button onclick="${() => this.runInnerCalculations()}">
					Set User
				</button>
				<button onclick="${() => this.simulateFetch()}">
					Fetch User (1s,at [2])
				</button>
				<!-- colors array is NOT rendered -->
				<p>Array this.colors:${this.colors}</p>

				<p>this.color: ${this.color}</p>
				<ul>
					<li
						style="color: ${this.blah === 'NÖ'
							? this.color
							: 'pink'}"
					>
						TERNARY: ${StresstestComponent.test(this.color)}
					</li>
					<li
						style="font-family: arial; font-weight: bolder; color: ${this.colors.at(
							-1
						)}"
					>
						My color is the last in list: ${this.colors.at(-1)},
						current user.ID: ${this.user.profile.id}
					</li>

					<ol>
						${this.colors.map(
							c => html`
								<li style="font-family: monospace; color: ${c}">
									My color is ${c}, current user.ID:
									${this.user.profile.id}
								</li>
							`
						)}
					</ol>
				</ul>
			`;
		}
	}
);



//one.colors.pop();
for (let i = 0; i < 500; i++) {
	const t = document.createElement('stresstest-component');
	document.getElementById('app').appendChild(t);
}
const one = document.querySelector('stresstest-component');
// Dynamically alter system states after 2 seconds to prove full reactivity loop integrity
setTimeout(() => {
	one.color = 'purple';
	one.num = 100;
	one.colors = ['orange', 'teal', 'darkblue'];
	one.blah = 'NÖ';
}, 2000);

/*
TO IMPLEMENT:
// ... inside the part.type === "node" branch:
const liveValue = templateResult.values[part.index];
const processed = normalizeValue(liveValue);

if (processed && processed.type === "TemplateResult") {
    // RECURSION: The engine handles nested html`` calls
    if (!partCaches[cacheKey]) {
        const subContainer = document.createElement("span");
        markerComment.parentNode.insertBefore(subContainer, markerComment.nextSibling);
        partCaches[cacheKey] = { node: subContainer };
    }
    render(processed, partCaches[cacheKey].node);
} else if (Array.isArray(processed)) {
    // ARRAY LOGIC: Native .map() handling
    // ... existing loop/diffing code ...
} else {
    // PRIMITIVE LOGIC: Text and numbers
    const display = String(processed);
    // ... existing text node update with dirty-check ...
}




// registry.js
export const componentRegistry = new Map();



export function registerLazy(lazyObj) {
    componentRegistry.set(lazyObj.tagName.toLowerCase(), lazyObj);
}
// engine.js
import { componentRegistry } from './registry.js';

function autoHydrate(tagName) {
    const tag = tagName.toLowerCase();

    // Falls das Element im Browser unbekannt ist, aber in unserer Registry steht
    if (!customElements.get(tag) && componentRegistry.has(tag)) {
        console.debug(`[AutoHydrate] Defining lazy component: <${tag}>`);
        const lazyObj = componentRegistry.get(tag);

        // Triggert die .define() Methode deiner Factory
        lazyObj.define();
    }
}

// In deiner Haupt-Schleife (z.B. im getTemplateBlueprint oder render)
// prüfen wir beim ersten Kontakt mit einem Element:
if (node.nodeType === Node.ELEMENT_NODE && node.tagName.includes('-')) {
    autoHydrate(node.tagName);
}
// EAGER
// MyButton.js
export const MyButton = createComponent('my-button', class extends ReactiveElement {
    template() { return html`<button>Klick mich</button>`; }
});
// LAZY
// LazyComponents.js
import { createComponent, registerLazy } from './framework.js';

// Wir definieren die Komponente nur als Blaupause (Lazy)
const LazyChart = createComponent('complex-chart', () =>
    class extends ReactiveElement {
        template() { return html`<div>Ein schweres Diagramm...</div>`; }
    }
);

// Wir registrieren sie in unserer internen Registry
registerLazy(LazyChart);

// App.js
import './LazyComponents.js'; // Lädt nur die Registry-Einträge, nicht die Klassen!

class MyApp extends ReactiveElement {
    constructor() {
        super();
        this.showChart = false;
    }

    template() {
        return html`
            <h1>Willkommen</h1>
            <button onclick="${() => this.showChart = true}">Chart laden</button>

            ${this.showChart
                ? html`<complex-chart></complex-chart>`
                : html`<p>Klicke zum Laden</p>`
            }
        `;
    }
}

// In deiner engine.js (innerhalb der render-Logik)
function checkRegistration(tagName) {
    const tag = tagName.toLowerCase();

    // 1. Prüfen: Kennt der Browser dieses Element schon?
    if (!customElements.get(tag)) {

        // 2. Wenn NEIN: Haben wir eine Lazy-Definition dafür?
        const lazyDef = componentRegistry.get(tag);

        if (lazyDef) {
            // 3. JETZT wird die Klasse final registriert!
            // Das triggert intern: customElements.define(tag, definition())
            lazyDef.define();
            console.log(`[Framework] Lazy registered: <${tag}>`);
        }
    }
}
// In deiner getTemplateBlueprint() Funktion:
while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName.includes('-')) {
        // HIER passiert die magische Registrierung "just in time"
        checkRegistration(node.tagName);
    }
    // ... restliche Logik (Attributes, etc.)
}


*/
