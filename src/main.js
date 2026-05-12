/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
// TODO - list is rendered nested li in li per item!!!!!

const blueprintCache = new WeakMap();

function html(strings, ...values) {
	return { type: 'TemplateResult', strings, values };
}

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

function render(templateResult, container) {
	if (!templateResult || templateResult.type !== 'TemplateResult') {
		container.textContent = String(templateResult);
		return;
	}

	const blueprint = getTemplateBlueprint(templateResult.strings);

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

		container.__rootInstance = { clone, elementsMap, partCaches: {} };
		container.innerHTML = '';
		container.appendChild(clone);
	}

	const { elementsMap, partCaches } = container.__rootInstance;

	// 3. Laufzeit-Update: Direkte Wertezuordnung über die ID, komplett ohne Variablennamen!
	blueprint.dynamicParts.forEach(part => {
		const liveValue = templateResult.values[part.index];
		const targetElement = elementsMap[part.elId] || container;
		const cacheKey = `${part.elId}-${part.index}-${part.type}-${
			part.attrName || ''
		}`;

		if (part.type === 'attribute') {
			const finalValue = part.prefix + liveValue + part.suffix;
			if (part.attrName === 'style') {
				targetElement.style.cssText = finalValue;
			} else {
				targetElement.setAttribute(part.attrName, finalValue);
			}
		} else if (part.type === 'event') {
			if (targetElement[`__bound_${part.attrName}`] !== liveValue) {
				if (targetElement[`__bound_${part.attrName}`]) {
					targetElement.removeEventListener(
						part.attrName.substring(2),
						targetElement[`__bound_${part.attrName}`]
					);
				}
				targetElement.addEventListener(
					part.attrName.substring(2),
					liveValue
				);
				targetElement[`__bound_${part.attrName}`] = liveValue;
			}
		} else if (part.type === 'node') {
			const markerComment = targetElement.childNodes[part.commentPath];
			if (!markerComment) return;

			if (liveValue && liveValue.type === 'TemplateResult') {
				if (!partCaches[cacheKey]) {
					const subContainer = document.createElement('span');
					markerComment.parentNode.insertBefore(
						subContainer,
						markerComment.nextSibling
					);
					partCaches[cacheKey] = subContainer;
				}
				render(liveValue, partCaches[cacheKey]);
				// TODOY: handles full array only in loop ??????????
			} else if (Array.isArray(liveValue)) {
				if (!partCaches[cacheKey]) {
					const endMarker = document.createComment(
						`end-loop-${part.index}`
					);
					markerComment.parentNode.insertBefore(
						endMarker,
						markerComment.nextSibling
					);
					partCaches[cacheKey] = { endMarker, rendered: [] };
				}

				const cache = partCaches[cacheKey];

				liveValue.forEach((subTpl, idx) => {
					if (!subTpl || subTpl.type !== 'TemplateResult') return;
					let childMeta = cache.rendered[idx];
					if (!childMeta || childMeta.strings !== subTpl.strings) {
						const wrapper = document.createElement('div');
						//render(subTpl, wrapper);
						const domNode = wrapper.firstElementChild || wrapper;

						cache.endMarker.parentNode.insertBefore(
							domNode,
							cache.endMarker
						);
						childMeta = { domNode, strings: subTpl.strings };
						cache.rendered[idx] = childMeta;
					}
					render(subTpl, childMeta.domNode);
				});

				while (cache.rendered.length > liveValue.length) {
					const removed = cache.rendered.pop();
					if (removed && removed.domNode) removed.domNode.remove();
				}
			} else {
				const liveValue = templateResult.values[part.index];

				let txtNode = partCaches[cacheKey];
				const stringifiedValue = normalizeValue(liveValue);

				if (!txtNode) {
					txtNode = document.createTextNode(stringifiedValue);
					markerComment.parentNode.insertBefore(
						txtNode,
						markerComment.nextSibling
					);
					partCaches[cacheKey] = txtNode;
				} else if (txtNode.textContent !== stringifiedValue) {
					txtNode.textContent = stringifiedValue;
				}
			}
		}
	});
}

// Global registry mapping arrays and nested objects back to their parent element
const reactiveRegistry = new WeakMap();

class ReactiveElement extends HTMLElement {
	#updateQueued;
	#valuesStore;
	constructor() {
		super(); // Legally calls HTMLElement without browser constructor errors
		this.#updateQueued = false;
		this.#valuesStore = {}; // Secret container for actual data values

		reactiveRegistry.set(this, this);

		// Run this logic right after initialization completes
		queueMicrotask(() => this.__convertFieldsToReactive());
	}

	connectedCallback() {
		this.__queueUpdate();
	}

	__convertFieldsToReactive() {
		// Read all keys initialized on 'this' (e.g., this.color, this.colors)
		Object.keys(this).forEach(key => {
			if (key.startsWith('__')) return;

			const initialValue = this[key];

			// Store the initial value inside our proxy-wrapped storage mechanism
			if (initialValue !== null && typeof initialValue === 'object') {
				this.#valuesStore[key] = makeDeepReactive(initialValue, this);
			} else {
				this.#valuesStore[key] = initialValue;
			}

			// REDEFINE PROPERTY: Erase the raw property and hook into setters/getters
			Object.defineProperty(this, key, {
				get: () => {
					return this.#valuesStore[key];
				},
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

		// Async batching scheduler ensures the engine renders exactly once per loop cycle
		queueMicrotask(() => {
			this.#updateQueued = false;
			if (this.template) {
				render(this.template(), this);
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
 function createComponent(tagName, UserClass) {
	// 1. Wir registrieren die Klasse direkt beim Browser
	customElements.define(tagName, UserClass);

	// 2. Wir geben die Klasse zurück (für ""s oder weitere Nutzung)
	return UserClass;
}

createComponent(
	'codepen-component',
	class CodePenComponent extends ReactiveElement {
		constructor() {
			super(); // 100% legal instantiation

			// Simply declare fields on 'this'. No state wrappers or .reactive properties!

			this.color = 'crimson';
			this.colors = ['red', 'green'];
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
			this.colors.splice(2, 0, CodePenComponent.randomColor());
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
			this.colors.push(CodePenComponent.randomColor());
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
						TERNARY: ${CodePenComponent.test(this.color)}
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

class StresstestComponent extends ReactiveElement {
	constructor() {
		super(); // Legally constructs HTMLElement without browser validation errors

		// Declare properties inside the reactive window
		this.num = 0;
		this.colors = ['red', 'green'];
		this.user = {
			profile: { name: 'John Doe' },
		};
	}

	shuffleData() {
		this.colors.reverse();
		this.colors.push('blue');
		// Batched together: DOM updates exactly once!
	}

	runInnerCalculations() {
		const helperFunction = () => {
			// Deep nested updates inside an inner scope work perfectly via the proxy reference
			this.user.profile.name = 'Max Mustermann';
			this.num = 999;
		};
		helperFunction();
	}

	async simulateFetch() {
		await new Promise(resolve => setTimeout(resolve, 1000));
		// Asynchronous changes map correctly over the microtask pipeline
		this.user.profile.name = 'Data from API';
		this.colors.splice(0, 1, 'teal', 'gold');
	}

	template() {
		return html`
			<h2>User: ${this.user.profile.name} (ID: ${this.num})</h2>

			<button onclick="${() => this.shuffleData()}">
				Manipulate Array
			</button>
			<button onclick="${() => this.runInnerCalculations()}">
				Run Inner Function
			</button>
			<button onclick="${() => this.simulateFetch()}">
				Async Fetch (1s)
			</button>

			<ul>
				${this.colors.map(
					c => html` <li style="color: ${c}">Color: ${c}</li> `
				)}
			</ul>
		`;
	}
}

customElements.define('stresstest-component', StresstestComponent);
const one = document.querySelector('codepen-component');
console.log(one.constructor.name);

//one.colors.pop();
console.log(Object.getOwnPropertyNames(one));
console.log(one.colors);

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
"" const componentRegistry = new Map();



"" function registerLazy(lazyObj) {
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
"" const MyButton = createComponent('my-button', class extends ReactiveElement {
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
