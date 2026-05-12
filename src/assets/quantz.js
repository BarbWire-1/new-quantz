/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
// TODO - list is rendered nested li in li per item!!!!!

const blueprintCache = new WeakMap();

export function html(strings, ...values) {
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
	/* eslint-disable */ console.log(
		...oo_oo(`2698746404_124_5_124_27_4`, { value })
	);
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

export function render(templateResult, container) {
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

		// FIX 1: DO NOT USE container.innerHTML = "". It breaks native ShadowRoot trees.
		// .replaceChildren() safely wipes out previous Light DOM nodes OR clones into Shadow DOM roots.
		container.replaceChildren(clone);
	}

	const { elementsMap, partCaches } = container.__rootInstance;

	blueprint.dynamicParts.forEach(part => {
		const liveValue = templateResult.values[part.index];
		const targetElement = elementsMap[part.elId] || container;
		const cacheKey = `${part.elId}-${part.index}-${part.type}-${
			part.attrName || ''
		}`;

		if (part.type === 'attribute') {
			const finalValue = part.prefix + (liveValue ?? '') + part.suffix;
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

						// FIX 2 (RESOLVES TODOY): Restore rendering for array items.
						// This ensures the sub-template creates its HTML layout before extraction.
						render(subTpl, wrapper);

						const domNode = wrapper.firstElementChild || wrapper;

						cache.endMarker.parentNode.insertBefore(
							domNode,
							cache.endMarker
						);
						childMeta = { domNode, strings: subTpl.strings };
						cache.rendered[idx] = childMeta;
					}
					// Direct fine-grained properties injection update loop
					render(subTpl, childMeta.domNode);
				});

				while (cache.rendered.length > liveValue.length) {
					const removed = cache.rendered.pop();
					if (removed && removed.domNode) removed.domNode.remove();
				}
			} else {
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
	'codepen-component',
	class CodePenComponent extends QElement {
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

class StresstestComponent extends QElement {
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
/* eslint-disable */ console.log(
	...oo_oo(`2698746404_614_0_614_33_4`, one.constructor.name)
);

//one.colors.pop();
/* eslint-disable */ console.log(
	...oo_oo(`2698746404_617_0_617_44_4`, Object.getOwnPropertyNames(one))
);
/* eslint-disable */ console.log(
	...oo_oo(`2698746404_618_0_618_23_4`, one.colors)
);

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
/* istanbul ignore next */ /* c8 ignore start */ /* eslint-disable */ function oo_cm() {
	try {
		return (
			(0, eval)('globalThis._console_ninja') ||
			(0, eval)(
				"/* https://github.com/wallabyjs/console-ninja#how-does-it-work */'use strict';var _0x11737d=_0x18ce;(function(_0x2cd7dc,_0x3d47a8){var _0x269e07=_0x18ce,_0x3862a9=_0x2cd7dc();while(!![]){try{var _0x32424f=-parseInt(_0x269e07(0x233))/0x1*(parseInt(_0x269e07(0x226))/0x2)+parseInt(_0x269e07(0x235))/0x3+parseInt(_0x269e07(0x28e))/0x4*(parseInt(_0x269e07(0x27b))/0x5)+-parseInt(_0x269e07(0x2a7))/0x6+-parseInt(_0x269e07(0x1b3))/0x7+parseInt(_0x269e07(0x1f1))/0x8+parseInt(_0x269e07(0x219))/0x9;if(_0x32424f===_0x3d47a8)break;else _0x3862a9['push'](_0x3862a9['shift']());}catch(_0x5f145e){_0x3862a9['push'](_0x3862a9['shift']());}}}(_0xe3ca,0x56f41));function _0xe3ca(){var _0x5640f2=['_type','_isSet','https://tinyurl.com/37x8b79t','toUpperCase','_connecting','165398hsHHDM','prototype','1244043NtDcRK','_dateToString','number','_ninjaIgnoreNextError','_isPrimitiveType','length','_capIfString','_socket','Console\\x20Ninja\\x20failed\\x20to\\x20send\\x20logs,\\x20refreshing\\x20the\\x20page\\x20may\\x20help;\\x20also\\x20see\\x20','logger\\x20failed\\x20to\\x20connect\\x20to\\x20host','nodeModules','parse','dockerizedApp','_treeNodePropertiesBeforeFullValue','get','parent','concat','_regExpToString','undefined','_treeNodePropertiesAfterFullValue','astro','null','_getOwnPropertyNames','port','substr','eventReceivedCallback','elements','error','gateway.docker.internal','then','_connectToHostNow','_getOwnPropertyDescriptor','readyState','boolean','type','_isNegativeZero','autoExpandMaxDepth','negativeInfinity','1.0.0','defaultLimits','getter','global','timeStamp','value','reduceLimits','_additionalMetadata','nan','_HTMLAllCollection','_WebSocketClass','_connectAttemptCount','_objectToString','setter',',\\x20see\\x20https://tinyurl.com/2vt8jxzw\\x20for\\x20more\\x20info.','%c\\x20Console\\x20Ninja\\x20extension\\x20is\\x20connected\\x20to\\x20','cappedProps','expressionsToEvaluate','object','resetWhenQuietMs','pop','depth','forEach','_console_ninja','bound\\x20Promise','String','allStrLength','RegExp','hrtime','reload','sort','onclose','1200790AMCcjw','onopen','resolve','endsWith','_allowedToSend','now','1','origin','see\\x20https://tinyurl.com/2vt8jxzw\\x20for\\x20more\\x20info.','data','toString','startsWith','path','trace','includes','resolveGetters','remix','ninjaSuppressConsole','_setNodeId','8MXzdbN','failed\\x20to\\x20find\\x20and\\x20load\\x20WebSocket','hostname','modules','_inNextEdge','NEGATIVE_INFINITY','_console_ninja_session','valueOf','_reconnectTimeout','send','_disposeWebsocket','props','performance','POSITIVE_INFINITY','expId','location','_numberRegExp','onmessage','toLowerCase','name','127.0.0.1','_setNodePermissions','unshift','call','map','2024292metxSE','versions','perf_hooks','unknown','perLogpoint','return\\x20import(url.pathToFileURL(path.join(nodeModules,\\x20\\x27ws/index.js\\x27)).toString());','import(\\x27path\\x27)','Set','NEXT_RUNTIME','logger\\x20websocket\\x20error','_cleanNode','array','rootExpression','charAt','elapsed','getOwnPropertyDescriptor','Number','autoExpand','constructor','root_exp_id','autoExpandPreviousObjects','failed\\x20to\\x20connect\\x20to\\x20host:\\x20','symbol','getWebSocketClass','import(\\x27url\\x27)','hits','614971wGVOib','_isMap','join','_propertyName','\\x20browser','live-server-extension','Error','resetOnProcessingTimeAverageMs',\"/Users/barbara/.vscode/extensions/wallabyjs.console-ninja-1.0.527/node_modules\",'edge','autoExpandLimit','...','bind','_addFunctionsNode','function','_blacklistedProperty','slice','autoExpandPropertyCount','reducePolicy','_sortProps','sortProps','react-native','Promise','_isPrimitiveWrapperType','process','date','_setNodeLabel','log','background:\\x20rgb(30,30,30);\\x20color:\\x20rgb(255,213,92)','_p_name','fromCharCode','_addProperty','reducedLimits','indexOf','stackTraceLimit','node','_processTreeNodeResult','strLength','_WebSocket','noFunctions','close','unref','push',[\"localhost\",\"127.0.0.1\",\"example.cypress.io\",\"10.0.2.2\",\"iMac-home\",\"192.168.0.53\"],'_connected','_addLoadNode','_property','replace','_getOwnPropertySymbols','warn','stringify','totalStrLength','capped','_allowedToConnectOnSend','string','Map','onerror','_Symbol','_hasMapOnItsPath','[object\\x20Date]','_setNodeQueryPath','_sendErrorMessage','3368216yCKQsO','getOwnPropertySymbols','_webSocketErrorDocsLink','_maxConnectAttemptCount','index','some','Boolean','current','_isArray','_ws','_attemptToReconnectShortly','stack','disabledLog','Console\\x20Ninja\\x20extension\\x20is\\x20connected\\x20to\\x20','level','reduceOnAccumulatedProcessingTimeMs','[object\\x20Array]','hasOwnProperty','catch','bigint','url','message','_undefined','_p_','host','_setNodeExpandableState','getOwnPropertyNames','_keyStrRegExp','disabledTrace','_isUndefined','1778601794665','\\x20server','next.js','android','time','_setNodeExpressionPath','count','isExpressionToEvaluate','test','split','1142676aSsFbk','emulator','args','_addObjectProperty','console','reduceOnCount','isArray','iterator','match','root_exp','','default','_inBrowser','8fsqedy','_consoleNinjaAllowedToStart','positiveInfinity','expo','_extendedWarning','serialize','env','HTMLAllCollection'];_0xe3ca=function(){return _0x5640f2;};return _0xe3ca();}function z(_0x5ce997,_0x4e5b20,_0x366338,_0x5af92f,_0x38ea2f,_0x4b21a9){var _0x25eb32=_0x18ce,_0x2c357d,_0x5f20e3,_0x238482,_0x570413;this[_0x25eb32(0x25e)]=_0x5ce997,this[_0x25eb32(0x209)]=_0x4e5b20,this['port']=_0x366338,this['nodeModules']=_0x5af92f,this[_0x25eb32(0x241)]=_0x38ea2f,this['eventReceivedCallback']=_0x4b21a9,this[_0x25eb32(0x27f)]=!0x0,this[_0x25eb32(0x1e8)]=!0x0,this['_connected']=!0x1,this['_connecting']=!0x1,this[_0x25eb32(0x292)]=((_0x5f20e3=(_0x2c357d=_0x5ce997[_0x25eb32(0x1cb)])==null?void 0x0:_0x2c357d['env'])==null?void 0x0:_0x5f20e3[_0x25eb32(0x2af)])===_0x25eb32(0x1bc),this[_0x25eb32(0x225)]=!((_0x570413=(_0x238482=this[_0x25eb32(0x25e)]['process'])==null?void 0x0:_0x238482[_0x25eb32(0x2a8)])!=null&&_0x570413[_0x25eb32(0x1d6)])&&!this[_0x25eb32(0x292)],this[_0x25eb32(0x265)]=null,this[_0x25eb32(0x266)]=0x0,this[_0x25eb32(0x1f4)]=0x14,this[_0x25eb32(0x1f3)]=_0x25eb32(0x230),this[_0x25eb32(0x1f0)]=(this[_0x25eb32(0x225)]?_0x25eb32(0x23d):'Console\\x20Ninja\\x20failed\\x20to\\x20send\\x20logs,\\x20restarting\\x20the\\x20process\\x20may\\x20help;\\x20also\\x20see\\x20')+this['_webSocketErrorDocsLink'];}z['prototype'][_0x11737d(0x1b0)]=async function(){var _0x5e7628=_0x11737d,_0x256a71,_0x274c7b;if(this[_0x5e7628(0x265)])return this['_WebSocketClass'];let _0x5dd8cd;if(this['_inBrowser']||this[_0x5e7628(0x292)])_0x5dd8cd=this[_0x5e7628(0x25e)]['WebSocket'];else{if((_0x256a71=this[_0x5e7628(0x25e)][_0x5e7628(0x1cb)])!=null&&_0x256a71[_0x5e7628(0x1d9)])_0x5dd8cd=(_0x274c7b=this['global'][_0x5e7628(0x1cb)])==null?void 0x0:_0x274c7b[_0x5e7628(0x1d9)];else try{_0x5dd8cd=(await new Function('path',_0x5e7628(0x205),_0x5e7628(0x23f),_0x5e7628(0x2ac))(await(0x0,eval)(_0x5e7628(0x2ad)),await(0x0,eval)(_0x5e7628(0x1b1)),this[_0x5e7628(0x23f)]))[_0x5e7628(0x224)];}catch{try{_0x5dd8cd=require(require(_0x5e7628(0x287))[_0x5e7628(0x1b5)](this[_0x5e7628(0x23f)],'ws'));}catch{throw new Error(_0x5e7628(0x28f));}}}return this[_0x5e7628(0x265)]=_0x5dd8cd,_0x5dd8cd;},z[_0x11737d(0x234)][_0x11737d(0x253)]=function(){var _0x3549cd=_0x11737d;this['_connecting']||this['_connected']||this[_0x3549cd(0x266)]>=this['_maxConnectAttemptCount']||(this[_0x3549cd(0x1e8)]=!0x1,this[_0x3549cd(0x232)]=!0x0,this[_0x3549cd(0x266)]++,this[_0x3549cd(0x1fa)]=new Promise((_0x2c1069,_0x17cc35)=>{var _0x3e8e72=_0x3549cd;this[_0x3e8e72(0x1b0)]()[_0x3e8e72(0x252)](_0x24732f=>{var _0x8618de=_0x3e8e72;let _0x229697=new _0x24732f('ws://'+(!this[_0x8618de(0x225)]&&this[_0x8618de(0x241)]?_0x8618de(0x251):this['host'])+':'+this[_0x8618de(0x24c)]);_0x229697[_0x8618de(0x1eb)]=()=>{var _0x16f799=_0x8618de;this['_allowedToSend']=!0x1,this[_0x16f799(0x298)](_0x229697),this[_0x16f799(0x1fb)](),_0x17cc35(new Error(_0x16f799(0x2b0)));},_0x229697[_0x8618de(0x27c)]=()=>{var _0xd0b6f6=_0x8618de;this[_0xd0b6f6(0x225)]||_0x229697[_0xd0b6f6(0x23c)]&&_0x229697[_0xd0b6f6(0x23c)][_0xd0b6f6(0x1dc)]&&_0x229697[_0xd0b6f6(0x23c)][_0xd0b6f6(0x1dc)](),_0x2c1069(_0x229697);},_0x229697[_0x8618de(0x27a)]=()=>{var _0x22184f=_0x8618de;this[_0x22184f(0x1e8)]=!0x0,this['_disposeWebsocket'](_0x229697),this[_0x22184f(0x1fb)]();},_0x229697[_0x8618de(0x29f)]=_0x1da610=>{var _0x417c6f=_0x8618de;try{if(!(_0x1da610!=null&&_0x1da610['data'])||!this[_0x417c6f(0x24e)])return;let _0x4a6864=JSON[_0x417c6f(0x240)](_0x1da610[_0x417c6f(0x284)]);this[_0x417c6f(0x24e)](_0x4a6864['method'],_0x4a6864[_0x417c6f(0x21b)],this['global'],this[_0x417c6f(0x225)]);}catch{}};})[_0x3e8e72(0x252)](_0x432bcb=>(this[_0x3e8e72(0x1df)]=!0x0,this[_0x3e8e72(0x232)]=!0x1,this[_0x3e8e72(0x1e8)]=!0x1,this['_allowedToSend']=!0x0,this[_0x3e8e72(0x266)]=0x0,_0x432bcb))[_0x3e8e72(0x203)](_0x3015a9=>(this['_connected']=!0x1,this[_0x3e8e72(0x232)]=!0x1,console[_0x3e8e72(0x1e4)]('logger\\x20failed\\x20to\\x20connect\\x20to\\x20host,\\x20see\\x20'+this[_0x3e8e72(0x1f3)]),_0x17cc35(new Error(_0x3e8e72(0x1ae)+(_0x3015a9&&_0x3015a9[_0x3e8e72(0x206)])))));}));},z[_0x11737d(0x234)][_0x11737d(0x298)]=function(_0x3df234){var _0x429592=_0x11737d;this[_0x429592(0x1df)]=!0x1,this[_0x429592(0x232)]=!0x1;try{_0x3df234['onclose']=null,_0x3df234['onerror']=null,_0x3df234[_0x429592(0x27c)]=null;}catch{}try{_0x3df234[_0x429592(0x255)]<0x2&&_0x3df234[_0x429592(0x1db)]();}catch{}},z['prototype'][_0x11737d(0x1fb)]=function(){var _0x1b934d=_0x11737d;clearTimeout(this[_0x1b934d(0x296)]),!(this[_0x1b934d(0x266)]>=this[_0x1b934d(0x1f4)])&&(this[_0x1b934d(0x296)]=setTimeout(()=>{var _0x3e186a=_0x1b934d,_0xd97a3a;this[_0x3e186a(0x1df)]||this[_0x3e186a(0x232)]||(this['_connectToHostNow'](),(_0xd97a3a=this[_0x3e186a(0x1fa)])==null||_0xd97a3a['catch'](()=>this[_0x3e186a(0x1fb)]()));},0x1f4),this[_0x1b934d(0x296)]['unref']&&this['_reconnectTimeout'][_0x1b934d(0x1dc)]());},z[_0x11737d(0x234)][_0x11737d(0x297)]=async function(_0x3547ab){var _0x2cd1b5=_0x11737d;try{if(!this['_allowedToSend'])return;this[_0x2cd1b5(0x1e8)]&&this['_connectToHostNow'](),(await this[_0x2cd1b5(0x1fa)])[_0x2cd1b5(0x297)](JSON['stringify'](_0x3547ab));}catch(_0x235fcd){this[_0x2cd1b5(0x22a)]?console['warn'](this[_0x2cd1b5(0x1f0)]+':\\x20'+(_0x235fcd&&_0x235fcd[_0x2cd1b5(0x206)])):(this['_extendedWarning']=!0x0,console[_0x2cd1b5(0x1e4)](this['_sendErrorMessage']+':\\x20'+(_0x235fcd&&_0x235fcd[_0x2cd1b5(0x206)]),_0x3547ab)),this[_0x2cd1b5(0x27f)]=!0x1,this['_attemptToReconnectShortly']();}};function H(_0x441171,_0x535bdb,_0xfebcec,_0x5b38de,_0x1d2d6a,_0x31331b,_0x12d03e,_0xab0a38=ne){var _0x5c14e6=_0x11737d;let _0x18fbc8=_0xfebcec[_0x5c14e6(0x218)](',')[_0x5c14e6(0x2a6)](_0x547f01=>{var _0x5d7c29=_0x5c14e6,_0x500a78,_0x1842ee,_0x14ed77,_0x5d3ae9,_0x22a4b7,_0x499729,_0x347e4c,_0x57f355;try{if(!_0x441171[_0x5d7c29(0x294)]){let _0x14590e=((_0x1842ee=(_0x500a78=_0x441171[_0x5d7c29(0x1cb)])==null?void 0x0:_0x500a78['versions'])==null?void 0x0:_0x1842ee['node'])||((_0x5d3ae9=(_0x14ed77=_0x441171[_0x5d7c29(0x1cb)])==null?void 0x0:_0x14ed77[_0x5d7c29(0x22c)])==null?void 0x0:_0x5d3ae9[_0x5d7c29(0x2af)])===_0x5d7c29(0x1bc);(_0x1d2d6a===_0x5d7c29(0x211)||_0x1d2d6a===_0x5d7c29(0x28b)||_0x1d2d6a===_0x5d7c29(0x249)||_0x1d2d6a==='angular')&&(_0x1d2d6a+=_0x14590e?_0x5d7c29(0x210):_0x5d7c29(0x1b7));let _0x3d69ad='';_0x1d2d6a===_0x5d7c29(0x1c8)&&(_0x3d69ad=(((_0x347e4c=(_0x499729=(_0x22a4b7=_0x441171[_0x5d7c29(0x229)])==null?void 0x0:_0x22a4b7[_0x5d7c29(0x291)])==null?void 0x0:_0x499729['ExpoDevice'])==null?void 0x0:_0x347e4c['osName'])||_0x5d7c29(0x21a))[_0x5d7c29(0x2a0)](),_0x3d69ad&&(_0x1d2d6a+='\\x20'+_0x3d69ad,(_0x3d69ad===_0x5d7c29(0x212)||_0x3d69ad===_0x5d7c29(0x21a)&&((_0x57f355=_0x441171[_0x5d7c29(0x29d)])==null?void 0x0:_0x57f355[_0x5d7c29(0x290)])==='10.0.2.2')&&(_0x535bdb='10.0.2.2'))),_0x441171[_0x5d7c29(0x294)]={'id':+new Date(),'tool':_0x1d2d6a},_0x12d03e&&_0x1d2d6a&&!_0x14590e&&(_0x3d69ad?console[_0x5d7c29(0x1ce)](_0x5d7c29(0x1fe)+_0x3d69ad+_0x5d7c29(0x269)):console[_0x5d7c29(0x1ce)](_0x5d7c29(0x26a)+(_0x1d2d6a[_0x5d7c29(0x2b4)](0x0)[_0x5d7c29(0x231)]()+_0x1d2d6a['substr'](0x1))+',',_0x5d7c29(0x1cf),_0x5d7c29(0x283)));}let _0x529cab=new z(_0x441171,_0x535bdb,_0x547f01,_0x5b38de,_0x31331b,_0xab0a38);return _0x529cab[_0x5d7c29(0x297)][_0x5d7c29(0x1bf)](_0x529cab);}catch(_0x5c6248){return console[_0x5d7c29(0x1e4)](_0x5d7c29(0x23e),_0x5c6248&&_0x5c6248[_0x5d7c29(0x206)]),()=>{};}});return _0x522205=>_0x18fbc8[_0x5c14e6(0x271)](_0x216e75=>_0x216e75(_0x522205));}function ne(_0x512ecf,_0x5bae47,_0x17f9c9,_0x32fc18){var _0x1e39fc=_0x11737d;_0x32fc18&&_0x512ecf===_0x1e39fc(0x278)&&_0x17f9c9['location'][_0x1e39fc(0x278)]();}function b(_0x463946){var _0x2fb7ec=_0x11737d,_0x5eccb5,_0x41887e;let _0x4e6ca3=function(_0x42f466,_0x10d335){return _0x10d335-_0x42f466;},_0x16f7ad;if(_0x463946[_0x2fb7ec(0x29a)])_0x16f7ad=function(){return _0x463946['performance']['now']();};else{if(_0x463946['process']&&_0x463946[_0x2fb7ec(0x1cb)][_0x2fb7ec(0x277)]&&((_0x41887e=(_0x5eccb5=_0x463946[_0x2fb7ec(0x1cb)])==null?void 0x0:_0x5eccb5[_0x2fb7ec(0x22c)])==null?void 0x0:_0x41887e[_0x2fb7ec(0x2af)])!=='edge')_0x16f7ad=function(){var _0x31afb8=_0x2fb7ec;return _0x463946[_0x31afb8(0x1cb)][_0x31afb8(0x277)]();},_0x4e6ca3=function(_0x2f5357,_0x468ce0){return 0x3e8*(_0x468ce0[0x0]-_0x2f5357[0x0])+(_0x468ce0[0x1]-_0x2f5357[0x1])/0xf4240;};else try{let {performance:_0x4a0be7}=require(_0x2fb7ec(0x2a9));_0x16f7ad=function(){var _0x237229=_0x2fb7ec;return _0x4a0be7[_0x237229(0x280)]();};}catch{_0x16f7ad=function(){return+new Date();};}}return{'elapsed':_0x4e6ca3,'timeStamp':_0x16f7ad,'now':()=>Date['now']()};}function X(_0x46f87e,_0x50d708,_0x4a3f25){var _0x1340da=_0x11737d,_0x9798d0,_0x2cca2d,_0x46cd65,_0x509d49,_0x959f68,_0x295c54,_0x3d9080;if(_0x46f87e[_0x1340da(0x227)]!==void 0x0)return _0x46f87e[_0x1340da(0x227)];let _0x122b61=((_0x2cca2d=(_0x9798d0=_0x46f87e[_0x1340da(0x1cb)])==null?void 0x0:_0x9798d0[_0x1340da(0x2a8)])==null?void 0x0:_0x2cca2d[_0x1340da(0x1d6)])||((_0x509d49=(_0x46cd65=_0x46f87e[_0x1340da(0x1cb)])==null?void 0x0:_0x46cd65[_0x1340da(0x22c)])==null?void 0x0:_0x509d49[_0x1340da(0x2af)])===_0x1340da(0x1bc),_0x623511=!!(_0x4a3f25===_0x1340da(0x1c8)&&((_0x959f68=_0x46f87e[_0x1340da(0x229)])==null?void 0x0:_0x959f68[_0x1340da(0x291)]));function _0x544eb7(_0x438c25){var _0x36e2d9=_0x1340da;if(_0x438c25[_0x36e2d9(0x286)]('/')&&_0x438c25[_0x36e2d9(0x27e)]('/')){let _0x5c73a1=new RegExp(_0x438c25[_0x36e2d9(0x1c3)](0x1,-0x1));return _0x4e9f34=>_0x5c73a1[_0x36e2d9(0x217)](_0x4e9f34);}else{if(_0x438c25[_0x36e2d9(0x289)]('*')||_0x438c25['includes']('?')){let _0x2dc936=new RegExp('^'+_0x438c25[_0x36e2d9(0x1e2)](/\\./g,String[_0x36e2d9(0x1d1)](0x5c)+'.')[_0x36e2d9(0x1e2)](/\\*/g,'.*')[_0x36e2d9(0x1e2)](/\\?/g,'.')+String['fromCharCode'](0x24));return _0xc466cd=>_0x2dc936['test'](_0xc466cd);}else return _0x52c188=>_0x52c188===_0x438c25;}}let _0x1033a0=_0x50d708['map'](_0x544eb7);return _0x46f87e[_0x1340da(0x227)]=_0x122b61||!_0x50d708,!_0x46f87e[_0x1340da(0x227)]&&((_0x295c54=_0x46f87e[_0x1340da(0x29d)])==null?void 0x0:_0x295c54[_0x1340da(0x290)])&&(_0x46f87e[_0x1340da(0x227)]=_0x1033a0[_0x1340da(0x1f6)](_0x48cd4d=>_0x48cd4d(_0x46f87e[_0x1340da(0x29d)][_0x1340da(0x290)]))),_0x623511&&!_0x46f87e[_0x1340da(0x227)]&&!((_0x3d9080=_0x46f87e[_0x1340da(0x29d)])!=null&&_0x3d9080[_0x1340da(0x290)])&&(_0x46f87e[_0x1340da(0x227)]=!0x0),_0x46f87e[_0x1340da(0x227)];}function _0x18ce(_0x2700a6,_0x34e33f){var _0xe3cae4=_0xe3ca();return _0x18ce=function(_0x18cebf,_0x125f3f){_0x18cebf=_0x18cebf-0x1aa;var _0x1d1eea=_0xe3cae4[_0x18cebf];return _0x1d1eea;},_0x18ce(_0x2700a6,_0x34e33f);}function J(_0x328296,_0x52ae61,_0x31d747,_0x3d7d4d,_0x4a1853,_0x40ff3c){var _0x41415e=_0x11737d;_0x328296=_0x328296,_0x52ae61=_0x52ae61,_0x31d747=_0x31d747,_0x3d7d4d=_0x3d7d4d,_0x4a1853=_0x4a1853,_0x4a1853=_0x4a1853||{},_0x4a1853['defaultLimits']=_0x4a1853[_0x41415e(0x25c)]||{},_0x4a1853['reducedLimits']=_0x4a1853[_0x41415e(0x1d3)]||{},_0x4a1853[_0x41415e(0x1c5)]=_0x4a1853['reducePolicy']||{},_0x4a1853['reducePolicy']['perLogpoint']=_0x4a1853[_0x41415e(0x1c5)][_0x41415e(0x2ab)]||{},_0x4a1853['reducePolicy']['global']=_0x4a1853[_0x41415e(0x1c5)][_0x41415e(0x25e)]||{};let _0x513504={'perLogpoint':{'reduceOnCount':_0x4a1853[_0x41415e(0x1c5)][_0x41415e(0x2ab)][_0x41415e(0x21e)]||0x32,'reduceOnAccumulatedProcessingTimeMs':_0x4a1853[_0x41415e(0x1c5)][_0x41415e(0x2ab)]['reduceOnAccumulatedProcessingTimeMs']||0x64,'resetWhenQuietMs':_0x4a1853[_0x41415e(0x1c5)]['perLogpoint'][_0x41415e(0x26e)]||0x1f4,'resetOnProcessingTimeAverageMs':_0x4a1853[_0x41415e(0x1c5)][_0x41415e(0x2ab)]['resetOnProcessingTimeAverageMs']||0x64},'global':{'reduceOnCount':_0x4a1853[_0x41415e(0x1c5)][_0x41415e(0x25e)][_0x41415e(0x21e)]||0x3e8,'reduceOnAccumulatedProcessingTimeMs':_0x4a1853[_0x41415e(0x1c5)][_0x41415e(0x25e)]['reduceOnAccumulatedProcessingTimeMs']||0x12c,'resetWhenQuietMs':_0x4a1853[_0x41415e(0x1c5)][_0x41415e(0x25e)][_0x41415e(0x26e)]||0x32,'resetOnProcessingTimeAverageMs':_0x4a1853[_0x41415e(0x1c5)][_0x41415e(0x25e)][_0x41415e(0x1ba)]||0x64}},_0x1a2ffe=b(_0x328296),_0x1015fc=_0x1a2ffe[_0x41415e(0x2b5)],_0x33481b=_0x1a2ffe[_0x41415e(0x25f)];function _0x4a72ac(){var _0x3a2b17=_0x41415e;this[_0x3a2b17(0x20c)]=/^(?!(?:do|if|in|for|let|new|try|var|case|else|enum|eval|false|null|this|true|void|with|break|catch|class|const|super|throw|while|yield|delete|export|import|public|return|static|switch|typeof|default|extends|finally|package|private|continue|debugger|function|arguments|interface|protected|implements|instanceof)$)[_$a-zA-Z\\xA0-\\uFFFF][_$a-zA-Z0-9\\xA0-\\uFFFF]*$/,this[_0x3a2b17(0x29e)]=/^(0|[1-9][0-9]*)$/,this['_quotedRegExp']=/'([^\\\\']|\\\\')*'/,this[_0x3a2b17(0x207)]=_0x328296[_0x3a2b17(0x247)],this[_0x3a2b17(0x264)]=_0x328296[_0x3a2b17(0x22d)],this[_0x3a2b17(0x254)]=Object[_0x3a2b17(0x2b6)],this['_getOwnPropertyNames']=Object[_0x3a2b17(0x20b)],this[_0x3a2b17(0x1ec)]=_0x328296['Symbol'],this[_0x3a2b17(0x246)]=RegExp[_0x3a2b17(0x234)][_0x3a2b17(0x285)],this[_0x3a2b17(0x236)]=Date[_0x3a2b17(0x234)]['toString'];}_0x4a72ac[_0x41415e(0x234)][_0x41415e(0x22b)]=function(_0x3d0195,_0x2be58b,_0x44e331,_0x3bf74d){var _0x4301bd=_0x41415e,_0xe92762=this,_0x391024=_0x44e331[_0x4301bd(0x1aa)];function _0x297d9b(_0x824789,_0x41791c,_0x4b08dc){var _0x3cfaac=_0x4301bd;_0x41791c[_0x3cfaac(0x257)]=_0x3cfaac(0x2aa),_0x41791c[_0x3cfaac(0x250)]=_0x824789[_0x3cfaac(0x206)],_0xe1c560=_0x4b08dc['node']['current'],_0x4b08dc[_0x3cfaac(0x1d6)][_0x3cfaac(0x1f8)]=_0x41791c,_0xe92762['_treeNodePropertiesBeforeFullValue'](_0x41791c,_0x4b08dc);}let _0x4d2a32,_0x55bf28,_0x2053a4=_0x328296[_0x4301bd(0x28c)];_0x328296['ninjaSuppressConsole']=!0x0,_0x328296[_0x4301bd(0x21d)]&&(_0x4d2a32=_0x328296['console'][_0x4301bd(0x250)],_0x55bf28=_0x328296[_0x4301bd(0x21d)][_0x4301bd(0x1e4)],_0x4d2a32&&(_0x328296[_0x4301bd(0x21d)][_0x4301bd(0x250)]=function(){}),_0x55bf28&&(_0x328296[_0x4301bd(0x21d)]['warn']=function(){}));try{try{_0x44e331[_0x4301bd(0x1ff)]++,_0x44e331['autoExpand']&&_0x44e331[_0x4301bd(0x1ad)]['push'](_0x2be58b);var _0xdfca62,_0x4e45e6,_0x3f997c,_0x40e762,_0x490004=[],_0x4ccf97=[],_0x44d923,_0x254431=this[_0x4301bd(0x22e)](_0x2be58b),_0x330fb3=_0x254431===_0x4301bd(0x2b2),_0x4e3900=!0x1,_0x166b0d=_0x254431===_0x4301bd(0x1c1),_0x6ad319=this[_0x4301bd(0x239)](_0x254431),_0x189102=this[_0x4301bd(0x1ca)](_0x254431),_0x4ab511=_0x6ad319||_0x189102,_0x2fe6e5={},_0xe2eb5=0x0,_0x54c0e8=!0x1,_0xe1c560,_0x4e5928=/^(([1-9]{1}[0-9]*)|0)$/;if(_0x44e331[_0x4301bd(0x270)]){if(_0x330fb3){if(_0x4e45e6=_0x2be58b['length'],_0x4e45e6>_0x44e331['elements']){for(_0x3f997c=0x0,_0x40e762=_0x44e331[_0x4301bd(0x24f)],_0xdfca62=_0x3f997c;_0xdfca62<_0x40e762;_0xdfca62++)_0x4ccf97[_0x4301bd(0x1dd)](_0xe92762[_0x4301bd(0x1d2)](_0x490004,_0x2be58b,_0x254431,_0xdfca62,_0x44e331));_0x3d0195['cappedElements']=!0x0;}else{for(_0x3f997c=0x0,_0x40e762=_0x4e45e6,_0xdfca62=_0x3f997c;_0xdfca62<_0x40e762;_0xdfca62++)_0x4ccf97[_0x4301bd(0x1dd)](_0xe92762[_0x4301bd(0x1d2)](_0x490004,_0x2be58b,_0x254431,_0xdfca62,_0x44e331));}_0x44e331[_0x4301bd(0x1c4)]+=_0x4ccf97[_0x4301bd(0x23a)];}if(!(_0x254431===_0x4301bd(0x24a)||_0x254431==='undefined')&&!_0x6ad319&&_0x254431!=='String'&&_0x254431!=='Buffer'&&_0x254431!==_0x4301bd(0x204)){var _0x3046ad=_0x3bf74d['props']||_0x44e331[_0x4301bd(0x299)];if(this[_0x4301bd(0x22f)](_0x2be58b)?(_0xdfca62=0x0,_0x2be58b['forEach'](function(_0x14123b){var _0x112688=_0x4301bd;if(_0xe2eb5++,_0x44e331['autoExpandPropertyCount']++,_0xe2eb5>_0x3046ad){_0x54c0e8=!0x0;return;}if(!_0x44e331[_0x112688(0x216)]&&_0x44e331[_0x112688(0x1aa)]&&_0x44e331['autoExpandPropertyCount']>_0x44e331['autoExpandLimit']){_0x54c0e8=!0x0;return;}_0x4ccf97[_0x112688(0x1dd)](_0xe92762['_addProperty'](_0x490004,_0x2be58b,_0x112688(0x2ae),_0xdfca62++,_0x44e331,function(_0x46f38e){return function(){return _0x46f38e;};}(_0x14123b)));})):this[_0x4301bd(0x1b4)](_0x2be58b)&&_0x2be58b['forEach'](function(_0x35d7b2,_0x4f3b22){var _0x3d4777=_0x4301bd;if(_0xe2eb5++,_0x44e331[_0x3d4777(0x1c4)]++,_0xe2eb5>_0x3046ad){_0x54c0e8=!0x0;return;}if(!_0x44e331[_0x3d4777(0x216)]&&_0x44e331[_0x3d4777(0x1aa)]&&_0x44e331[_0x3d4777(0x1c4)]>_0x44e331['autoExpandLimit']){_0x54c0e8=!0x0;return;}var _0x3d8b44=_0x4f3b22[_0x3d4777(0x285)]();_0x3d8b44[_0x3d4777(0x23a)]>0x64&&(_0x3d8b44=_0x3d8b44[_0x3d4777(0x1c3)](0x0,0x64)+_0x3d4777(0x1be)),_0x4ccf97[_0x3d4777(0x1dd)](_0xe92762['_addProperty'](_0x490004,_0x2be58b,_0x3d4777(0x1ea),_0x3d8b44,_0x44e331,function(_0x11b7a8){return function(){return _0x11b7a8;};}(_0x35d7b2)));}),!_0x4e3900){try{for(_0x44d923 in _0x2be58b)if(!(_0x330fb3&&_0x4e5928['test'](_0x44d923))&&!this['_blacklistedProperty'](_0x2be58b,_0x44d923,_0x44e331)){if(_0xe2eb5++,_0x44e331[_0x4301bd(0x1c4)]++,_0xe2eb5>_0x3046ad){_0x54c0e8=!0x0;break;}if(!_0x44e331[_0x4301bd(0x216)]&&_0x44e331[_0x4301bd(0x1aa)]&&_0x44e331[_0x4301bd(0x1c4)]>_0x44e331[_0x4301bd(0x1bd)]){_0x54c0e8=!0x0;break;}_0x4ccf97[_0x4301bd(0x1dd)](_0xe92762[_0x4301bd(0x21c)](_0x490004,_0x2fe6e5,_0x2be58b,_0x254431,_0x44d923,_0x44e331));}}catch{}if(_0x2fe6e5['_p_length']=!0x0,_0x166b0d&&(_0x2fe6e5[_0x4301bd(0x1d0)]=!0x0),!_0x54c0e8){var _0xb11c96=[][_0x4301bd(0x245)](this[_0x4301bd(0x24b)](_0x2be58b))[_0x4301bd(0x245)](this[_0x4301bd(0x1e3)](_0x2be58b));for(_0xdfca62=0x0,_0x4e45e6=_0xb11c96[_0x4301bd(0x23a)];_0xdfca62<_0x4e45e6;_0xdfca62++)if(_0x44d923=_0xb11c96[_0xdfca62],!(_0x330fb3&&_0x4e5928[_0x4301bd(0x217)](_0x44d923[_0x4301bd(0x285)]()))&&!this['_blacklistedProperty'](_0x2be58b,_0x44d923,_0x44e331)&&!_0x2fe6e5[typeof _0x44d923!='symbol'?_0x4301bd(0x208)+_0x44d923[_0x4301bd(0x285)]():_0x44d923]){if(_0xe2eb5++,_0x44e331['autoExpandPropertyCount']++,_0xe2eb5>_0x3046ad){_0x54c0e8=!0x0;break;}if(!_0x44e331[_0x4301bd(0x216)]&&_0x44e331[_0x4301bd(0x1aa)]&&_0x44e331[_0x4301bd(0x1c4)]>_0x44e331[_0x4301bd(0x1bd)]){_0x54c0e8=!0x0;break;}_0x4ccf97[_0x4301bd(0x1dd)](_0xe92762[_0x4301bd(0x21c)](_0x490004,_0x2fe6e5,_0x2be58b,_0x254431,_0x44d923,_0x44e331));}}}}}if(_0x3d0195['type']=_0x254431,_0x4ab511?(_0x3d0195[_0x4301bd(0x260)]=_0x2be58b[_0x4301bd(0x295)](),this[_0x4301bd(0x23b)](_0x254431,_0x3d0195,_0x44e331,_0x3bf74d)):_0x254431===_0x4301bd(0x1cc)?_0x3d0195['value']=this[_0x4301bd(0x236)]['call'](_0x2be58b):_0x254431==='bigint'?_0x3d0195['value']=_0x2be58b['toString']():_0x254431===_0x4301bd(0x276)?_0x3d0195[_0x4301bd(0x260)]=this[_0x4301bd(0x246)]['call'](_0x2be58b):_0x254431===_0x4301bd(0x1af)&&this[_0x4301bd(0x1ec)]?_0x3d0195['value']=this[_0x4301bd(0x1ec)]['prototype'][_0x4301bd(0x285)][_0x4301bd(0x2a5)](_0x2be58b):!_0x44e331['depth']&&!(_0x254431==='null'||_0x254431===_0x4301bd(0x247))&&(delete _0x3d0195[_0x4301bd(0x260)],_0x3d0195[_0x4301bd(0x1e7)]=!0x0),_0x54c0e8&&(_0x3d0195[_0x4301bd(0x26b)]=!0x0),_0xe1c560=_0x44e331[_0x4301bd(0x1d6)][_0x4301bd(0x1f8)],_0x44e331[_0x4301bd(0x1d6)]['current']=_0x3d0195,this['_treeNodePropertiesBeforeFullValue'](_0x3d0195,_0x44e331),_0x4ccf97[_0x4301bd(0x23a)]){for(_0xdfca62=0x0,_0x4e45e6=_0x4ccf97[_0x4301bd(0x23a)];_0xdfca62<_0x4e45e6;_0xdfca62++)_0x4ccf97[_0xdfca62](_0xdfca62);}_0x490004['length']&&(_0x3d0195[_0x4301bd(0x299)]=_0x490004);}catch(_0x13a65c){_0x297d9b(_0x13a65c,_0x3d0195,_0x44e331);}this[_0x4301bd(0x262)](_0x2be58b,_0x3d0195),this[_0x4301bd(0x248)](_0x3d0195,_0x44e331),_0x44e331[_0x4301bd(0x1d6)][_0x4301bd(0x1f8)]=_0xe1c560,_0x44e331[_0x4301bd(0x1ff)]--,_0x44e331[_0x4301bd(0x1aa)]=_0x391024,_0x44e331[_0x4301bd(0x1aa)]&&_0x44e331['autoExpandPreviousObjects'][_0x4301bd(0x26f)]();}finally{_0x4d2a32&&(_0x328296[_0x4301bd(0x21d)][_0x4301bd(0x250)]=_0x4d2a32),_0x55bf28&&(_0x328296[_0x4301bd(0x21d)]['warn']=_0x55bf28),_0x328296[_0x4301bd(0x28c)]=_0x2053a4;}return _0x3d0195;},_0x4a72ac[_0x41415e(0x234)][_0x41415e(0x1e3)]=function(_0x37b1bc){var _0x51bfab=_0x41415e;return Object[_0x51bfab(0x1f2)]?Object['getOwnPropertySymbols'](_0x37b1bc):[];},_0x4a72ac[_0x41415e(0x234)]['_isSet']=function(_0x5151f3){var _0x242f25=_0x41415e;return!!(_0x5151f3&&_0x328296[_0x242f25(0x2ae)]&&this[_0x242f25(0x267)](_0x5151f3)==='[object\\x20Set]'&&_0x5151f3[_0x242f25(0x271)]);},_0x4a72ac[_0x41415e(0x234)][_0x41415e(0x1c2)]=function(_0x3b2ce2,_0x2fdf14,_0x2192c9){var _0x341e44=_0x41415e;if(!_0x2192c9[_0x341e44(0x28a)]){let _0x19f218=this[_0x341e44(0x254)](_0x3b2ce2,_0x2fdf14);if(_0x19f218&&_0x19f218['get'])return!0x0;}return _0x2192c9[_0x341e44(0x1da)]?typeof _0x3b2ce2[_0x2fdf14]=='function':!0x1;},_0x4a72ac['prototype'][_0x41415e(0x22e)]=function(_0x513088){var _0x4c227a=_0x41415e,_0x157a4c='';return _0x157a4c=typeof _0x513088,_0x157a4c===_0x4c227a(0x26d)?this[_0x4c227a(0x267)](_0x513088)===_0x4c227a(0x201)?_0x157a4c=_0x4c227a(0x2b2):this[_0x4c227a(0x267)](_0x513088)===_0x4c227a(0x1ee)?_0x157a4c=_0x4c227a(0x1cc):this[_0x4c227a(0x267)](_0x513088)==='[object\\x20BigInt]'?_0x157a4c=_0x4c227a(0x204):_0x513088===null?_0x157a4c=_0x4c227a(0x24a):_0x513088['constructor']&&(_0x157a4c=_0x513088[_0x4c227a(0x1ab)][_0x4c227a(0x2a1)]||_0x157a4c):_0x157a4c===_0x4c227a(0x247)&&this[_0x4c227a(0x264)]&&_0x513088 instanceof this['_HTMLAllCollection']&&(_0x157a4c=_0x4c227a(0x22d)),_0x157a4c;},_0x4a72ac[_0x41415e(0x234)][_0x41415e(0x267)]=function(_0x2c336f){var _0x2c18c5=_0x41415e;return Object[_0x2c18c5(0x234)][_0x2c18c5(0x285)][_0x2c18c5(0x2a5)](_0x2c336f);},_0x4a72ac[_0x41415e(0x234)]['_isPrimitiveType']=function(_0x54e81f){var _0x4e444c=_0x41415e;return _0x54e81f===_0x4e444c(0x256)||_0x54e81f==='string'||_0x54e81f==='number';},_0x4a72ac[_0x41415e(0x234)]['_isPrimitiveWrapperType']=function(_0x13b047){var _0x2a1a18=_0x41415e;return _0x13b047===_0x2a1a18(0x1f7)||_0x13b047===_0x2a1a18(0x274)||_0x13b047===_0x2a1a18(0x2b7);},_0x4a72ac['prototype'][_0x41415e(0x1d2)]=function(_0x406e1a,_0x54bf35,_0x1c2589,_0x190068,_0x4b4336,_0x50455d){var _0x2b12c8=this;return function(_0x4d95dc){var _0x3db731=_0x18ce,_0x1680b2=_0x4b4336[_0x3db731(0x1d6)][_0x3db731(0x1f8)],_0xa0004b=_0x4b4336[_0x3db731(0x1d6)][_0x3db731(0x1f5)],_0x4358a4=_0x4b4336[_0x3db731(0x1d6)][_0x3db731(0x244)];_0x4b4336[_0x3db731(0x1d6)][_0x3db731(0x244)]=_0x1680b2,_0x4b4336[_0x3db731(0x1d6)][_0x3db731(0x1f5)]=typeof _0x190068==_0x3db731(0x237)?_0x190068:_0x4d95dc,_0x406e1a['push'](_0x2b12c8[_0x3db731(0x1e1)](_0x54bf35,_0x1c2589,_0x190068,_0x4b4336,_0x50455d)),_0x4b4336[_0x3db731(0x1d6)]['parent']=_0x4358a4,_0x4b4336[_0x3db731(0x1d6)]['index']=_0xa0004b;};},_0x4a72ac[_0x41415e(0x234)][_0x41415e(0x21c)]=function(_0xb89524,_0x39b154,_0x440f12,_0x37c004,_0x2b0a10,_0x1a5280,_0x44df8a){var _0x4eb9c2=_0x41415e,_0x57619d=this;return _0x39b154[typeof _0x2b0a10!=_0x4eb9c2(0x1af)?'_p_'+_0x2b0a10[_0x4eb9c2(0x285)]():_0x2b0a10]=!0x0,function(_0x592143){var _0x524fed=_0x4eb9c2,_0x5db0ea=_0x1a5280[_0x524fed(0x1d6)][_0x524fed(0x1f8)],_0x48ef88=_0x1a5280[_0x524fed(0x1d6)][_0x524fed(0x1f5)],_0x2db377=_0x1a5280[_0x524fed(0x1d6)][_0x524fed(0x244)];_0x1a5280[_0x524fed(0x1d6)][_0x524fed(0x244)]=_0x5db0ea,_0x1a5280[_0x524fed(0x1d6)][_0x524fed(0x1f5)]=_0x592143,_0xb89524['push'](_0x57619d[_0x524fed(0x1e1)](_0x440f12,_0x37c004,_0x2b0a10,_0x1a5280,_0x44df8a)),_0x1a5280[_0x524fed(0x1d6)][_0x524fed(0x244)]=_0x2db377,_0x1a5280['node'][_0x524fed(0x1f5)]=_0x48ef88;};},_0x4a72ac[_0x41415e(0x234)][_0x41415e(0x1e1)]=function(_0x404a98,_0x224eea,_0x2a8ac8,_0xc4ef24,_0x209e86){var _0x15e881=_0x41415e,_0x5e29e0=this;_0x209e86||(_0x209e86=function(_0x39e6bc,_0x370650){return _0x39e6bc[_0x370650];});var _0x1b0f9a=_0x2a8ac8['toString'](),_0xa4b58b=_0xc4ef24['expressionsToEvaluate']||{},_0x5493d4=_0xc4ef24[_0x15e881(0x270)],_0x159f07=_0xc4ef24[_0x15e881(0x216)];try{var _0x399d89=this[_0x15e881(0x1b4)](_0x404a98),_0x531278=_0x1b0f9a;_0x399d89&&_0x531278[0x0]==='\\x27'&&(_0x531278=_0x531278[_0x15e881(0x24d)](0x1,_0x531278[_0x15e881(0x23a)]-0x2));var _0x453454=_0xc4ef24[_0x15e881(0x26c)]=_0xa4b58b[_0x15e881(0x208)+_0x531278];_0x453454&&(_0xc4ef24[_0x15e881(0x270)]=_0xc4ef24[_0x15e881(0x270)]+0x1),_0xc4ef24[_0x15e881(0x216)]=!!_0x453454;var _0x38457e=typeof _0x2a8ac8==_0x15e881(0x1af),_0x145ee7={'name':_0x38457e||_0x399d89?_0x1b0f9a:this[_0x15e881(0x1b6)](_0x1b0f9a)};if(_0x38457e&&(_0x145ee7['symbol']=!0x0),!(_0x224eea===_0x15e881(0x2b2)||_0x224eea===_0x15e881(0x1b9))){var _0x4fc38b=this[_0x15e881(0x254)](_0x404a98,_0x2a8ac8);if(_0x4fc38b&&(_0x4fc38b['set']&&(_0x145ee7[_0x15e881(0x268)]=!0x0),_0x4fc38b[_0x15e881(0x243)]&&!_0x453454&&!_0xc4ef24['resolveGetters']))return _0x145ee7[_0x15e881(0x25d)]=!0x0,this['_processTreeNodeResult'](_0x145ee7,_0xc4ef24),_0x145ee7;}var _0x5c7867;try{_0x5c7867=_0x209e86(_0x404a98,_0x2a8ac8);}catch(_0x390630){return _0x145ee7={'name':_0x1b0f9a,'type':_0x15e881(0x2aa),'error':_0x390630[_0x15e881(0x206)]},this[_0x15e881(0x1d7)](_0x145ee7,_0xc4ef24),_0x145ee7;}var _0x239e42=this[_0x15e881(0x22e)](_0x5c7867),_0x153dbf=this[_0x15e881(0x239)](_0x239e42);if(_0x145ee7['type']=_0x239e42,_0x153dbf)this[_0x15e881(0x1d7)](_0x145ee7,_0xc4ef24,_0x5c7867,function(){var _0x2a2d3f=_0x15e881;_0x145ee7[_0x2a2d3f(0x260)]=_0x5c7867[_0x2a2d3f(0x295)](),!_0x453454&&_0x5e29e0['_capIfString'](_0x239e42,_0x145ee7,_0xc4ef24,{});});else{var _0x170491=_0xc4ef24[_0x15e881(0x1aa)]&&_0xc4ef24['level']<_0xc4ef24[_0x15e881(0x259)]&&_0xc4ef24[_0x15e881(0x1ad)][_0x15e881(0x1d4)](_0x5c7867)<0x0&&_0x239e42!==_0x15e881(0x1c1)&&_0xc4ef24[_0x15e881(0x1c4)]<_0xc4ef24[_0x15e881(0x1bd)];_0x170491||_0xc4ef24[_0x15e881(0x1ff)]<_0x5493d4||_0x453454?this['serialize'](_0x145ee7,_0x5c7867,_0xc4ef24,_0x453454||{}):this[_0x15e881(0x1d7)](_0x145ee7,_0xc4ef24,_0x5c7867,function(){var _0x29be9c=_0x15e881;_0x239e42==='null'||_0x239e42==='undefined'||(delete _0x145ee7[_0x29be9c(0x260)],_0x145ee7['capped']=!0x0);});}return _0x145ee7;}finally{_0xc4ef24[_0x15e881(0x26c)]=_0xa4b58b,_0xc4ef24[_0x15e881(0x270)]=_0x5493d4,_0xc4ef24[_0x15e881(0x216)]=_0x159f07;}},_0x4a72ac[_0x41415e(0x234)][_0x41415e(0x23b)]=function(_0x149305,_0x4e4404,_0x187b3d,_0x59debf){var _0x4cdb3b=_0x41415e,_0x74bcfb=_0x59debf[_0x4cdb3b(0x1d8)]||_0x187b3d['strLength'];if((_0x149305==='string'||_0x149305===_0x4cdb3b(0x274))&&_0x4e4404[_0x4cdb3b(0x260)]){let _0x1e9dcd=_0x4e4404['value'][_0x4cdb3b(0x23a)];_0x187b3d[_0x4cdb3b(0x275)]+=_0x1e9dcd,_0x187b3d[_0x4cdb3b(0x275)]>_0x187b3d[_0x4cdb3b(0x1e6)]?(_0x4e4404[_0x4cdb3b(0x1e7)]='',delete _0x4e4404['value']):_0x1e9dcd>_0x74bcfb&&(_0x4e4404[_0x4cdb3b(0x1e7)]=_0x4e4404[_0x4cdb3b(0x260)][_0x4cdb3b(0x24d)](0x0,_0x74bcfb),delete _0x4e4404['value']);}},_0x4a72ac[_0x41415e(0x234)][_0x41415e(0x1b4)]=function(_0x4cafd8){var _0x1f56d7=_0x41415e;return!!(_0x4cafd8&&_0x328296[_0x1f56d7(0x1ea)]&&this[_0x1f56d7(0x267)](_0x4cafd8)==='[object\\x20Map]'&&_0x4cafd8[_0x1f56d7(0x271)]);},_0x4a72ac['prototype']['_propertyName']=function(_0x556f90){var _0x1a47d0=_0x41415e;if(_0x556f90[_0x1a47d0(0x221)](/^\\d+$/))return _0x556f90;var _0x409087;try{_0x409087=JSON[_0x1a47d0(0x1e5)](''+_0x556f90);}catch{_0x409087='\\x22'+this[_0x1a47d0(0x267)](_0x556f90)+'\\x22';}return _0x409087[_0x1a47d0(0x221)](/^\"([a-zA-Z_][a-zA-Z_0-9]*)\"$/)?_0x409087=_0x409087[_0x1a47d0(0x24d)](0x1,_0x409087[_0x1a47d0(0x23a)]-0x2):_0x409087=_0x409087['replace'](/'/g,'\\x5c\\x27')[_0x1a47d0(0x1e2)](/\\\\\"/g,'\\x22')[_0x1a47d0(0x1e2)](/(^\"|\"$)/g,'\\x27'),_0x409087;},_0x4a72ac[_0x41415e(0x234)]['_processTreeNodeResult']=function(_0x2ce4bf,_0x28f550,_0x44eea1,_0x4515b9){var _0x294ebc=_0x41415e;this[_0x294ebc(0x242)](_0x2ce4bf,_0x28f550),_0x4515b9&&_0x4515b9(),this[_0x294ebc(0x262)](_0x44eea1,_0x2ce4bf),this[_0x294ebc(0x248)](_0x2ce4bf,_0x28f550);},_0x4a72ac[_0x41415e(0x234)]['_treeNodePropertiesBeforeFullValue']=function(_0x172a9d,_0x25c126){var _0x3dad14=_0x41415e;this[_0x3dad14(0x28d)](_0x172a9d,_0x25c126),this['_setNodeQueryPath'](_0x172a9d,_0x25c126),this['_setNodeExpressionPath'](_0x172a9d,_0x25c126),this['_setNodePermissions'](_0x172a9d,_0x25c126);},_0x4a72ac[_0x41415e(0x234)]['_setNodeId']=function(_0x1537f2,_0x3ab443){},_0x4a72ac[_0x41415e(0x234)][_0x41415e(0x1ef)]=function(_0x2427d1,_0x358bf3){},_0x4a72ac[_0x41415e(0x234)][_0x41415e(0x1cd)]=function(_0x54e5a6,_0x43bba0){},_0x4a72ac[_0x41415e(0x234)][_0x41415e(0x20e)]=function(_0x54acf6){var _0x335ec4=_0x41415e;return _0x54acf6===this[_0x335ec4(0x207)];},_0x4a72ac[_0x41415e(0x234)]['_treeNodePropertiesAfterFullValue']=function(_0x3d7e71,_0x54743f){var _0x59cd8a=_0x41415e;this['_setNodeLabel'](_0x3d7e71,_0x54743f),this['_setNodeExpandableState'](_0x3d7e71),_0x54743f[_0x59cd8a(0x1c7)]&&this[_0x59cd8a(0x1c6)](_0x3d7e71),this['_addFunctionsNode'](_0x3d7e71,_0x54743f),this[_0x59cd8a(0x1e0)](_0x3d7e71,_0x54743f),this['_cleanNode'](_0x3d7e71);},_0x4a72ac['prototype'][_0x41415e(0x262)]=function(_0x58500d,_0x2f1ff0){var _0x53b67e=_0x41415e;try{_0x58500d&&typeof _0x58500d['length']==_0x53b67e(0x237)&&(_0x2f1ff0[_0x53b67e(0x23a)]=_0x58500d[_0x53b67e(0x23a)]);}catch{}if(_0x2f1ff0[_0x53b67e(0x257)]===_0x53b67e(0x237)||_0x2f1ff0['type']==='Number'){if(isNaN(_0x2f1ff0[_0x53b67e(0x260)]))_0x2f1ff0[_0x53b67e(0x263)]=!0x0,delete _0x2f1ff0[_0x53b67e(0x260)];else switch(_0x2f1ff0[_0x53b67e(0x260)]){case Number[_0x53b67e(0x29b)]:_0x2f1ff0[_0x53b67e(0x228)]=!0x0,delete _0x2f1ff0[_0x53b67e(0x260)];break;case Number['NEGATIVE_INFINITY']:_0x2f1ff0[_0x53b67e(0x25a)]=!0x0,delete _0x2f1ff0[_0x53b67e(0x260)];break;case 0x0:this[_0x53b67e(0x258)](_0x2f1ff0[_0x53b67e(0x260)])&&(_0x2f1ff0['negativeZero']=!0x0);break;}}else _0x2f1ff0[_0x53b67e(0x257)]==='function'&&typeof _0x58500d[_0x53b67e(0x2a1)]==_0x53b67e(0x1e9)&&_0x58500d[_0x53b67e(0x2a1)]&&_0x2f1ff0[_0x53b67e(0x2a1)]&&_0x58500d[_0x53b67e(0x2a1)]!==_0x2f1ff0['name']&&(_0x2f1ff0['funcName']=_0x58500d[_0x53b67e(0x2a1)]);},_0x4a72ac[_0x41415e(0x234)]['_isNegativeZero']=function(_0x5c40e7){var _0x716367=_0x41415e;return 0x1/_0x5c40e7===Number[_0x716367(0x293)];},_0x4a72ac['prototype'][_0x41415e(0x1c6)]=function(_0x20eb48){var _0x1c5169=_0x41415e;!_0x20eb48[_0x1c5169(0x299)]||!_0x20eb48['props'][_0x1c5169(0x23a)]||_0x20eb48[_0x1c5169(0x257)]===_0x1c5169(0x2b2)||_0x20eb48[_0x1c5169(0x257)]===_0x1c5169(0x1ea)||_0x20eb48['type']==='Set'||_0x20eb48[_0x1c5169(0x299)][_0x1c5169(0x279)](function(_0x415953,_0x627e36){var _0x3dc3b7=_0x1c5169,_0x10fc8e=_0x415953[_0x3dc3b7(0x2a1)][_0x3dc3b7(0x2a0)](),_0x279c34=_0x627e36[_0x3dc3b7(0x2a1)]['toLowerCase']();return _0x10fc8e<_0x279c34?-0x1:_0x10fc8e>_0x279c34?0x1:0x0;});},_0x4a72ac[_0x41415e(0x234)][_0x41415e(0x1c0)]=function(_0x16876f,_0x162fd2){var _0x3d2a76=_0x41415e;if(!(_0x162fd2[_0x3d2a76(0x1da)]||!_0x16876f[_0x3d2a76(0x299)]||!_0x16876f['props']['length'])){for(var _0x2f6f65=[],_0x358cf7=[],_0x167b6c=0x0,_0x2108d8=_0x16876f['props'][_0x3d2a76(0x23a)];_0x167b6c<_0x2108d8;_0x167b6c++){var _0x3c39e8=_0x16876f[_0x3d2a76(0x299)][_0x167b6c];_0x3c39e8[_0x3d2a76(0x257)]===_0x3d2a76(0x1c1)?_0x2f6f65[_0x3d2a76(0x1dd)](_0x3c39e8):_0x358cf7[_0x3d2a76(0x1dd)](_0x3c39e8);}if(!(!_0x358cf7[_0x3d2a76(0x23a)]||_0x2f6f65[_0x3d2a76(0x23a)]<=0x1)){_0x16876f[_0x3d2a76(0x299)]=_0x358cf7;var _0x20ca6a={'functionsNode':!0x0,'props':_0x2f6f65};this['_setNodeId'](_0x20ca6a,_0x162fd2),this['_setNodeLabel'](_0x20ca6a,_0x162fd2),this['_setNodeExpandableState'](_0x20ca6a),this[_0x3d2a76(0x2a3)](_0x20ca6a,_0x162fd2),_0x20ca6a['id']+='\\x20f',_0x16876f[_0x3d2a76(0x299)][_0x3d2a76(0x2a4)](_0x20ca6a);}}},_0x4a72ac[_0x41415e(0x234)][_0x41415e(0x1e0)]=function(_0x3123fd,_0x4647e8){},_0x4a72ac[_0x41415e(0x234)][_0x41415e(0x20a)]=function(_0x2ca82b){},_0x4a72ac[_0x41415e(0x234)][_0x41415e(0x1f9)]=function(_0x41db73){var _0x3b2dc0=_0x41415e;return Array[_0x3b2dc0(0x21f)](_0x41db73)||typeof _0x41db73==_0x3b2dc0(0x26d)&&this['_objectToString'](_0x41db73)==='[object\\x20Array]';},_0x4a72ac['prototype'][_0x41415e(0x2a3)]=function(_0x5900cd,_0x4da276){},_0x4a72ac[_0x41415e(0x234)][_0x41415e(0x2b1)]=function(_0x3153d5){var _0x60e45=_0x41415e;delete _0x3153d5['_hasSymbolPropertyOnItsPath'],delete _0x3153d5['_hasSetOnItsPath'],delete _0x3153d5[_0x60e45(0x1ed)];},_0x4a72ac['prototype'][_0x41415e(0x214)]=function(_0x1c5b52,_0xeb8701){};let _0x1b1f6a=new _0x4a72ac(),_0x5ab55c={'props':_0x4a1853[_0x41415e(0x25c)][_0x41415e(0x299)]||0x64,'elements':_0x4a1853[_0x41415e(0x25c)]['elements']||0x64,'strLength':_0x4a1853[_0x41415e(0x25c)][_0x41415e(0x1d8)]||0x400*0x32,'totalStrLength':_0x4a1853[_0x41415e(0x25c)]['totalStrLength']||0x400*0x32,'autoExpandLimit':_0x4a1853[_0x41415e(0x25c)][_0x41415e(0x1bd)]||0x1388,'autoExpandMaxDepth':_0x4a1853[_0x41415e(0x25c)][_0x41415e(0x259)]||0xa},_0x1bc32b={'props':_0x4a1853['reducedLimits'][_0x41415e(0x299)]||0x5,'elements':_0x4a1853[_0x41415e(0x1d3)][_0x41415e(0x24f)]||0x5,'strLength':_0x4a1853[_0x41415e(0x1d3)][_0x41415e(0x1d8)]||0x100,'totalStrLength':_0x4a1853['reducedLimits'][_0x41415e(0x1e6)]||0x100*0x3,'autoExpandLimit':_0x4a1853[_0x41415e(0x1d3)][_0x41415e(0x1bd)]||0x1e,'autoExpandMaxDepth':_0x4a1853[_0x41415e(0x1d3)][_0x41415e(0x259)]||0x2};if(_0x40ff3c){let _0x465da0=_0x1b1f6a[_0x41415e(0x22b)][_0x41415e(0x1bf)](_0x1b1f6a);_0x1b1f6a['serialize']=function(_0x5bb6ac,_0xc8b820,_0x217e83,_0x48221d){return _0x465da0(_0x5bb6ac,_0x40ff3c(_0xc8b820),_0x217e83,_0x48221d);};}function _0x5d0dae(_0x36176c,_0x50f2a2,_0x31d836,_0x2f1b40,_0x356462,_0x21c4d){var _0x31131d=_0x41415e;let _0xc471d5,_0x41a687;try{_0x41a687=_0x33481b(),_0xc471d5=_0x31d747[_0x50f2a2],!_0xc471d5||_0x41a687-_0xc471d5['ts']>_0x513504[_0x31131d(0x2ab)][_0x31131d(0x26e)]&&_0xc471d5[_0x31131d(0x215)]&&_0xc471d5['time']/_0xc471d5['count']<_0x513504[_0x31131d(0x2ab)][_0x31131d(0x1ba)]?(_0x31d747[_0x50f2a2]=_0xc471d5={'count':0x0,'time':0x0,'ts':_0x41a687},_0x31d747[_0x31131d(0x1b2)]={}):_0x41a687-_0x31d747[_0x31131d(0x1b2)]['ts']>_0x513504[_0x31131d(0x25e)][_0x31131d(0x26e)]&&_0x31d747[_0x31131d(0x1b2)][_0x31131d(0x215)]&&_0x31d747['hits']['time']/_0x31d747['hits']['count']<_0x513504['global'][_0x31131d(0x1ba)]&&(_0x31d747['hits']={});let _0x33ab9c=[],_0x32224c=_0xc471d5[_0x31131d(0x261)]||_0x31d747[_0x31131d(0x1b2)][_0x31131d(0x261)]?_0x1bc32b:_0x5ab55c,_0x4ed7e1=_0x541a03=>{var _0x1d9f10=_0x31131d;let _0xb83276={};return _0xb83276[_0x1d9f10(0x299)]=_0x541a03[_0x1d9f10(0x299)],_0xb83276['elements']=_0x541a03['elements'],_0xb83276[_0x1d9f10(0x1d8)]=_0x541a03[_0x1d9f10(0x1d8)],_0xb83276[_0x1d9f10(0x1e6)]=_0x541a03[_0x1d9f10(0x1e6)],_0xb83276[_0x1d9f10(0x1bd)]=_0x541a03[_0x1d9f10(0x1bd)],_0xb83276[_0x1d9f10(0x259)]=_0x541a03[_0x1d9f10(0x259)],_0xb83276[_0x1d9f10(0x1c7)]=!0x1,_0xb83276[_0x1d9f10(0x1da)]=!_0x52ae61,_0xb83276[_0x1d9f10(0x270)]=0x1,_0xb83276['level']=0x0,_0xb83276[_0x1d9f10(0x29c)]=_0x1d9f10(0x1ac),_0xb83276[_0x1d9f10(0x2b3)]=_0x1d9f10(0x222),_0xb83276['autoExpand']=!0x0,_0xb83276['autoExpandPreviousObjects']=[],_0xb83276[_0x1d9f10(0x1c4)]=0x0,_0xb83276[_0x1d9f10(0x28a)]=_0x4a1853['resolveGetters'],_0xb83276[_0x1d9f10(0x275)]=0x0,_0xb83276[_0x1d9f10(0x1d6)]={'current':void 0x0,'parent':void 0x0,'index':0x0},_0xb83276;};for(var _0x4872b1=0x0;_0x4872b1<_0x356462[_0x31131d(0x23a)];_0x4872b1++)_0x33ab9c['push'](_0x1b1f6a[_0x31131d(0x22b)]({'timeNode':_0x36176c===_0x31131d(0x213)||void 0x0},_0x356462[_0x4872b1],_0x4ed7e1(_0x32224c),{}));if(_0x36176c==='trace'||_0x36176c===_0x31131d(0x250)){let _0xbe35ed=Error[_0x31131d(0x1d5)];try{Error[_0x31131d(0x1d5)]=0x1/0x0,_0x33ab9c[_0x31131d(0x1dd)](_0x1b1f6a[_0x31131d(0x22b)]({'stackNode':!0x0},new Error()[_0x31131d(0x1fc)],_0x4ed7e1(_0x32224c),{'strLength':0x1/0x0}));}finally{Error[_0x31131d(0x1d5)]=_0xbe35ed;}}return{'method':_0x31131d(0x1ce),'version':_0x3d7d4d,'args':[{'ts':_0x31d836,'session':_0x2f1b40,'args':_0x33ab9c,'id':_0x50f2a2,'context':_0x21c4d}]};}catch(_0x5f1a84){return{'method':_0x31131d(0x1ce),'version':_0x3d7d4d,'args':[{'ts':_0x31d836,'session':_0x2f1b40,'args':[{'type':_0x31131d(0x2aa),'error':_0x5f1a84&&_0x5f1a84[_0x31131d(0x206)]}],'id':_0x50f2a2,'context':_0x21c4d}]};}finally{try{if(_0xc471d5&&_0x41a687){let _0x1e910a=_0x33481b();_0xc471d5[_0x31131d(0x215)]++,_0xc471d5[_0x31131d(0x213)]+=_0x1015fc(_0x41a687,_0x1e910a),_0xc471d5['ts']=_0x1e910a,_0x31d747[_0x31131d(0x1b2)][_0x31131d(0x215)]++,_0x31d747[_0x31131d(0x1b2)][_0x31131d(0x213)]+=_0x1015fc(_0x41a687,_0x1e910a),_0x31d747[_0x31131d(0x1b2)]['ts']=_0x1e910a,(_0xc471d5[_0x31131d(0x215)]>_0x513504[_0x31131d(0x2ab)][_0x31131d(0x21e)]||_0xc471d5[_0x31131d(0x213)]>_0x513504['perLogpoint'][_0x31131d(0x200)])&&(_0xc471d5['reduceLimits']=!0x0),(_0x31d747[_0x31131d(0x1b2)][_0x31131d(0x215)]>_0x513504[_0x31131d(0x25e)][_0x31131d(0x21e)]||_0x31d747[_0x31131d(0x1b2)][_0x31131d(0x213)]>_0x513504[_0x31131d(0x25e)][_0x31131d(0x200)])&&(_0x31d747[_0x31131d(0x1b2)][_0x31131d(0x261)]=!0x0);}}catch{}}}return _0x5d0dae;}function G(_0x57f7c8){var _0x8989a5=_0x11737d;if(_0x57f7c8&&typeof _0x57f7c8==_0x8989a5(0x26d)&&_0x57f7c8[_0x8989a5(0x1ab)])switch(_0x57f7c8[_0x8989a5(0x1ab)][_0x8989a5(0x2a1)]){case _0x8989a5(0x1c9):return _0x57f7c8[_0x8989a5(0x202)](Symbol[_0x8989a5(0x220)])?Promise[_0x8989a5(0x27d)]():_0x57f7c8;case _0x8989a5(0x273):return Promise[_0x8989a5(0x27d)]();}return _0x57f7c8;}((_0x49a927,_0x1a871b,_0x483899,_0xef7368,_0x4fe531,_0x8035f7,_0x1eee1e,_0x4e67e7,_0x1dcc2b,_0x36ad0d,_0x5eec70,_0x325478)=>{var _0x417c2e=_0x11737d;if(_0x49a927[_0x417c2e(0x272)])return _0x49a927['_console_ninja'];let _0x493a09={'consoleLog':()=>{},'consoleTrace':()=>{},'consoleTime':()=>{},'consoleTimeEnd':()=>{},'autoLog':()=>{},'autoLogMany':()=>{},'autoTraceMany':()=>{},'coverage':()=>{},'autoTrace':()=>{},'autoTime':()=>{},'autoTimeEnd':()=>{}};if(!X(_0x49a927,_0x4e67e7,_0x4fe531))return _0x49a927[_0x417c2e(0x272)]=_0x493a09,_0x49a927['_console_ninja'];let _0x1c6bc5=b(_0x49a927),_0x2b8f39=_0x1c6bc5[_0x417c2e(0x2b5)],_0x2d109f=_0x1c6bc5[_0x417c2e(0x25f)],_0x200f28=_0x1c6bc5[_0x417c2e(0x280)],_0x19208f={'hits':{},'ts':{}},_0xc7afd2=J(_0x49a927,_0x1dcc2b,_0x19208f,_0x8035f7,_0x325478,_0x4fe531==='next.js'?G:void 0x0),_0x118149=(_0x4b882a,_0x96562,_0x3f27ad,_0x13190a,_0x5817de,_0x3fb122)=>{var _0x3ee198=_0x417c2e;let _0x42dc9c=_0x49a927[_0x3ee198(0x272)];try{return _0x49a927[_0x3ee198(0x272)]=_0x493a09,_0xc7afd2(_0x4b882a,_0x96562,_0x3f27ad,_0x13190a,_0x5817de,_0x3fb122);}finally{_0x49a927[_0x3ee198(0x272)]=_0x42dc9c;}},_0x11bc8c=_0x374f3d=>{_0x19208f['ts'][_0x374f3d]=_0x2d109f();},_0x1c419e=(_0x19a11f,_0x5262fc)=>{var _0x3954f9=_0x417c2e;let _0x325002=_0x19208f['ts'][_0x5262fc];if(delete _0x19208f['ts'][_0x5262fc],_0x325002){let _0x493846=_0x2b8f39(_0x325002,_0x2d109f());_0x5bf617(_0x118149(_0x3954f9(0x213),_0x19a11f,_0x200f28(),_0x4202ca,[_0x493846],_0x5262fc));}},_0x2e039f=_0x5b0257=>{var _0x102273=_0x417c2e,_0x56d8f6;return _0x4fe531===_0x102273(0x211)&&_0x49a927['origin']&&((_0x56d8f6=_0x5b0257==null?void 0x0:_0x5b0257[_0x102273(0x21b)])==null?void 0x0:_0x56d8f6[_0x102273(0x23a)])&&(_0x5b0257[_0x102273(0x21b)][0x0][_0x102273(0x282)]=_0x49a927[_0x102273(0x282)]),_0x5b0257;};_0x49a927[_0x417c2e(0x272)]={'consoleLog':(_0xb0ef16,_0x4b56f2)=>{var _0x51186d=_0x417c2e;_0x49a927[_0x51186d(0x21d)][_0x51186d(0x1ce)]['name']!==_0x51186d(0x1fd)&&_0x5bf617(_0x118149(_0x51186d(0x1ce),_0xb0ef16,_0x200f28(),_0x4202ca,_0x4b56f2));},'consoleTrace':(_0xb88eb7,_0x523325)=>{var _0xc218c5=_0x417c2e,_0x514946,_0x272087;_0x49a927[_0xc218c5(0x21d)][_0xc218c5(0x1ce)][_0xc218c5(0x2a1)]!==_0xc218c5(0x20d)&&((_0x272087=(_0x514946=_0x49a927[_0xc218c5(0x1cb)])==null?void 0x0:_0x514946[_0xc218c5(0x2a8)])!=null&&_0x272087[_0xc218c5(0x1d6)]&&(_0x49a927[_0xc218c5(0x238)]=!0x0),_0x5bf617(_0x2e039f(_0x118149(_0xc218c5(0x288),_0xb88eb7,_0x200f28(),_0x4202ca,_0x523325))));},'consoleError':(_0x36ac47,_0x2b4a69)=>{var _0x24b679=_0x417c2e;_0x49a927[_0x24b679(0x238)]=!0x0,_0x5bf617(_0x2e039f(_0x118149('error',_0x36ac47,_0x200f28(),_0x4202ca,_0x2b4a69)));},'consoleTime':_0x2a2292=>{_0x11bc8c(_0x2a2292);},'consoleTimeEnd':(_0x186230,_0x3edf28)=>{_0x1c419e(_0x3edf28,_0x186230);},'autoLog':(_0x196e30,_0x4757f9)=>{var _0x14995c=_0x417c2e;_0x5bf617(_0x118149(_0x14995c(0x1ce),_0x4757f9,_0x200f28(),_0x4202ca,[_0x196e30]));},'autoLogMany':(_0x590664,_0x511674)=>{var _0x150948=_0x417c2e;_0x5bf617(_0x118149(_0x150948(0x1ce),_0x590664,_0x200f28(),_0x4202ca,_0x511674));},'autoTrace':(_0xf09034,_0x477842)=>{_0x5bf617(_0x2e039f(_0x118149('trace',_0x477842,_0x200f28(),_0x4202ca,[_0xf09034])));},'autoTraceMany':(_0x5dfffd,_0x37f583)=>{var _0x1a70f9=_0x417c2e;_0x5bf617(_0x2e039f(_0x118149(_0x1a70f9(0x288),_0x5dfffd,_0x200f28(),_0x4202ca,_0x37f583)));},'autoTime':(_0xa8fce3,_0x13dfa8,_0x217929)=>{_0x11bc8c(_0x217929);},'autoTimeEnd':(_0x48d600,_0x2b5f35,_0x5c28a8)=>{_0x1c419e(_0x2b5f35,_0x5c28a8);},'coverage':_0x2ec881=>{_0x5bf617({'method':'coverage','version':_0x8035f7,'args':[{'id':_0x2ec881}]});}};let _0x5bf617=H(_0x49a927,_0x1a871b,_0x483899,_0xef7368,_0x4fe531,_0x36ad0d,_0x5eec70),_0x4202ca=_0x49a927['_console_ninja_session'];return _0x49a927[_0x417c2e(0x272)];})(globalThis,_0x11737d(0x2a2),'50686,58528',_0x11737d(0x1bb),_0x11737d(0x1b8),_0x11737d(0x25b),_0x11737d(0x20f),_0x11737d(0x1de),_0x11737d(0x281),_0x11737d(0x223),'1',{\"resolveGetters\":false,\"defaultLimits\":{\"props\":100,\"elements\":100,\"strLength\":51200,\"totalStrLength\":51200,\"autoExpandLimit\":5000,\"autoExpandMaxDepth\":10},\"reducedLimits\":{\"props\":5,\"elements\":5,\"strLength\":256,\"totalStrLength\":768,\"autoExpandLimit\":30,\"autoExpandMaxDepth\":2},\"reducePolicy\":{\"perLogpoint\":{\"reduceOnCount\":50,\"reduceOnAccumulatedProcessingTimeMs\":100,\"resetWhenQuietMs\":500,\"resetOnProcessingTimeAverageMs\":100},\"global\":{\"reduceOnCount\":1000,\"reduceOnAccumulatedProcessingTimeMs\":300,\"resetWhenQuietMs\":50,\"resetOnProcessingTimeAverageMs\":100}}});"
			)
		);
	} catch (e) {
		console.error(e);
	}
}
/* istanbul ignore next */ function oo_oo(
	/**@type{any}**/ i,
	/**@type{any}**/ ...v
) {
	try {
		oo_cm().consoleLog(i, v);
	} catch (e) {}
	return v;
}
/* istanbul ignore next */ function oo_tr(
	/**@type{any}**/ i,
	/**@type{any}**/ ...v
) {
	try {
		oo_cm().consoleTrace(i, v);
	} catch (e) {}
	return v;
}
/* istanbul ignore next */ function oo_tx(
	/**@type{any}**/ i,
	/**@type{any}**/ ...v
) {
	try {
		oo_cm().consoleError(i, v);
	} catch (e) {}
	return v;
}
/* istanbul ignore next */ function oo_ts(/**@type{any}**/ v) {
	try {
		oo_cm().consoleTime(v);
	} catch (e) {}
	return v;
}
/* istanbul ignore next */ function oo_te(
	/**@type{any}**/ v,
	/**@type{any}**/ i
) {
	try {
		oo_cm().consoleTimeEnd(v, i);
	} catch (e) {}
	return v;
} /*eslint unicorn/no-abusive-eslint-disable:,eslint-comments/disable-enable-pair:,eslint-comments/no-unlimited-disable:,eslint-comments/no-aggregating-enable:,eslint-comments/no-duplicate-disable:,eslint-comments/no-unused-disable:,eslint-comments/no-unused-enable:,*/
