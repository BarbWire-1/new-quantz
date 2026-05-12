# SYSTEM SAVESTATE: QuantzElement / SnapEngine (POC Phase V2)
# Architecture: Native-First / Minification-Proof / Transparent Deep Reactivity

## 1. Core Philosophy & Invariants
- Task: Zero-compiler framework with 100/100 Lighthouse performance under heavy load (500+ instances).
- Invariant A (HTML Strings): Native tagged template literals (`strings` array) are cached via WeakMap. Index positions are mathematical constants. Immune to production minification.
- Invariant B (DOM Nodes): Use native C++ template cloning (`cloneNode`). No Virtual DOM abstraction layer.
- Invariant C (Reactivity): Pull-principle using flat array `InstanceParts` to avoid topological complexity of push-based signal dependency graphs. Updates cost O(N) where N is expressions, optimized via strict dirty-checking to nanoseconds in V8.

## 2. Shared Engine Core (engine.js / reactivity.js)
```javascript
const blueprintCache = new WeakMap();
const proxyCache = new WeakMap();

export function html(strings, ...values) {
    return { type: "TemplateResult", strings, values };
}

export function getReactiveProxy(obj, onChange) {
    if (!obj || typeof obj !== 'object' || typeof obj === 'function') return obj;
    if (proxyCache.has(obj)) return proxyCache.get(obj);
    let proxy;

    if (Array.isArray(obj)) {
        proxy = new Proxy(obj, {
            get(target, prop, receiver) {
                const value = Reflect.get(target, prop, receiver);
                if (['push','pop','shift','unshift','splice','sort','reverse','copyWithin','fill'].includes(prop)) {
                    return (...args) => {
                        const result = Array.prototype[prop].apply(target, args); // Apply mutation to TARGET, not receiver
                        onChange();
                        return result;
                    };
                }
                if (typeof value === 'function') return value.bind(target);
                if (value && typeof value === 'object') {
                    if (proxyCache.has(value)) return proxyCache.get(value);
                    const reactiveValue = getReactiveProxy(value, onChange);
                    proxyCache.set(value, reactiveValue);
                    return reactiveValue;
                }
                return value;
            },
            set(target, prop, val, receiver) {
                const old = target[prop];
                const res = Reflect.set(target, prop, val, receiver);
                if (old !== val && prop !== 'length') onChange();
                return res;
            }
        });
    } else {
        // Plain Objects, Maps, Sets specialization logic verified & encapsulated here...
        // ... (standard get/set/delete traps applied securely using proxyCache verification)
    }
    proxyCache.set(obj, proxy);
    return proxy;
}

export function render(templateResult, container) {
    if (!templateResult || templateResult.type !== "TemplateResult") {
        container.textContent = String(templateResult);
        return;
    }
    const blueprint = getTemplateBlueprint(templateResult.strings); // Uses 'tkevt${i}x' / 'tkexpr${i}x' string markers

    if (!container.__rootInstance) {
        const clone = blueprint.template.content.cloneNode(true);
        const elementsMap = {};
        let elementCounter = 0;
        const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);
        while (walker.nextNode()) { elementsMap[elementCounter++] = walker.currentNode; }

        const instanceParts = blueprint.dynamicParts.map(part => {
            const targetElement = elementsMap[part.elId] || clone.firstElementChild || clone;
            if (part.type === "attribute") return new AttributePart(targetElement, part);
            if (part.type === "event") return new EventPart(targetElement, part);
            if (part.type === "node") return new NodePart(targetElement.childNodes[part.commentPath]);
        });

        container.__rootInstance = { instanceParts };
        container.replaceChildren(clone); // Shadow DOM safe node replacement
    }

    const { instanceParts } = container.__rootInstance;
    for (let i = 0; i < instanceParts.length; i++) {
        instanceParts[i].update(templateResult.values[i], render);
    }
}
```

## 3. Base Component Interface (QElement.js)
```javascript
export const reactiveRegistry = new WeakMap();

export class QElement extends HTMLElement {
    #updateQueued = false;
    #valuesStore = {};
    _watchers = null;

    constructor() {
        super();
        try { if (!this.shadowRoot) this.attachShadow({ mode: 'open' }); } catch (e) {}
    }

    watch(prop, handler) {
        this._watchers ??= new Map();
        if (!this._watchers.has(prop)) this._watchers.set(prop, new Set());
        this._watchers.get(prop).add(handler);
    }

    connectedCallback() {
        reactiveRegistry.set(this, this);
        if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
        this.__convertFieldsToReactive();
        this.__queueUpdate();
    }

    __convertFieldsToReactive() {
        const notify = (changedProp, currentVal) => {
            if (this._watchers) {
                const handlers = this._watchers.get(changedProp);
                if (handlers) { for (const fn of handlers) fn(currentVal); }
            }
            this.__queueUpdate();
        };

        Object.keys(this).forEach(key => {
            if (key.startsWith('__') || key.startsWith('#')) return;
            const initialValue = this[key];

            // Inert Safeguard: Block processing native browser entities (PointerEvents, DOM elements)
            const isSafe = initialValue && typeof initialValue === 'object' && (
                Object.getPrototypeOf(initialValue) === Object.prototype ||
                Array.isArray(initialValue) || initialValue instanceof Map || initialValue instanceof Set
            );

            this.#valuesStore[key] = isSafe ? getReactiveProxy(initialValue, () => notify(key, this.#valuesStore[key])) : initialValue;

            Object.defineProperty(this, key, {
                get: () => this.#valuesStore[key],
                set: newValue => {
                    if (this.#valuesStore[key] === newValue) return;
                    const isNewSafe = newValue && typeof newValue === 'object' && (
                        Object.getPrototypeOf(newValue) === Object.prototype ||
                        Array.isArray(newValue) || newValue instanceof Map || newValue instanceof Set
                    );
                    this.#valuesStore[key] = isNewSafe ? getReactiveProxy(newValue, () => notify(key, this.#valuesStore[key])) : newValue;
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
            if (this.template) render(this.template(), this.shadowRoot);
        });
    }
}
```

## 4. Current State Metrics & Milestone Achievement
- Verification Environment: CodePen (Inline Class definitions inside wrapper factories).
- Performance Stats (500 dynamic instances loaded in parallel - Dev Mode):
  - FCP / LCP: 0.3s - 0.4s (Blazing fast via C++ memory replication).
  - Total Blocking Time (TBT): 300ms (Pure initialization cost due to JS-level TreeWalker loops on first mount).
  - Subsequent State Updates: 0ms TBT (Direct pointer writes inside cached instances array).
- Functional Features: Supports deep object routing via proxies, allows external element watching (`el.watch('num', fn)`), fully immune to production minifier variable renaming.

## 5. Next Session Roadmap Targets
1. Eliminate Instance-Phase TreeWalker costs entirely by implementing **Lit Path-Indexing** (pre-calculated string child offsets).
2. Integrate Boolean Attributes prefix rules (`?disabled="${this.cond}"`) into tokenizers.
3. Establish Property Bindings (`.value="${this.data}"`) to pass deep structures directly to JS layers.
