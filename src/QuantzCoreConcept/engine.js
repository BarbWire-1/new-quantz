/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
import { getReactiveProxy } from './reactivity.js';

export class QuantzEngine {
    static initializeReactiveBindings(target, parent, variables = {}, onSet) {
        parent.exprDeps = new Map();
        const cachedValues = new WeakMap();

        for (const [prop, initial] of Object.entries(variables)) {
            let val; // Interner Datenspeicher im Closure-Scope

            const notify = () => {
                if (onSet) onSet(prop, val);

                // Watcher-Signale abfeuern
                const watchers = target._watchers;
                if (watchers) {
                    const handlers = watchers.get(prop);
                    if (handlers) {
                        for (const fn of handlers) {
                            fn(val);
                        }
                    }
                }

                // Native DOM-Updates anstoßen
                if (QuantzEngine.updateElements) {
                    QuantzEngine.updateElements(parent, prop, val, target);
                }
            };

            Object.defineProperty(target, prop, {
                configurable: true,
                enumerable: true,
                get: function () {
                    return val;
                },
                set: function (v) {
                    // Prüfen, ob es ein reines JS-Objekt/Array ist (Schutz vor nativen Browser-Instanzen)
                    const isPlainObject = v && typeof v === 'object' &&
                        (Object.getPrototypeOf(v) === Object.prototype || Array.isArray(v));

                    if (isPlainObject) {
                        if (cachedValues.has(v)) {
                            val = cachedValues.get(v);
                        } else {
                            val = getReactiveProxy(v, notify);
                            try { cachedValues.set(v, val); } catch(e) {}
                        }
                    } else {
                        val = v; // Inerte Primitiven oder native Browser-Objekte durchreichen
                    }

                    notify();
                }
            });

            // Initialisierung triggert den Setter sauber
            target[prop] = initial;
        }
    }
}
