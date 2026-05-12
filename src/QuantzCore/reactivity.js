/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
const proxyCache = new WeakMap();

export function getReactiveProxy(obj, onChange) {
    if (!obj || typeof obj !== 'object' || typeof obj === 'function')
        return obj;

    if (proxyCache.has(obj)) return proxyCache.get(obj);
    let proxy;

    // --- ARRAYS ---
    if (Array.isArray(obj)) {
        proxy = new Proxy(obj, {
            get(target, prop, receiver) {
                const value = Reflect.get(target, prop, receiver);

                // Mutierende Methoden fangen wir ab
                if (['push','pop','shift','unshift','splice','sort','reverse','copyWithin','fill'].includes(prop)) {
                    return (...args) => {
                        // SICHERE INTEGRATION: Anwendung auf target, NICHT auf receiver!
                        const result = Array.prototype[prop].apply(target, args);
                        onChange();
                        return result;
                    };
                }
                if (typeof value === 'function') return value.bind(target);

                // Verschachtelte Objekte/Arrays rekursiv absichern
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
                // Länge von Arrays ignorieren wir beim direkten Trigger, um Doppel-Fires zu vermeiden
                if (old !== val && prop !== 'length') onChange();
                return res;
            },
            deleteProperty(target, prop) {
                const res = Reflect.deleteProperty(target, prop);
                onChange();
                return res;
            }
        });
    }
    // --- PLAIN OBJECTS ---
    else {
        proxy = new Proxy(obj, {
            get(target, prop, receiver) {
                const value = Reflect.get(target, prop, receiver);
                if (value && typeof value === 'object') {
                    if (proxyCache.has(value)) return proxyCache.get(value);
                    const reactiveValue = getReactiveProxy(value, onChange);
                    proxyCache.set(value, reactiveValue);
                    return reactiveValue;
                }
                return typeof value === 'function' ? value.bind(target) : value;
            },
            set(target, prop, val, receiver) {
                const old = target[prop];
                const res = Reflect.set(target, prop, val, receiver);
                if (old !== val) onChange();
                return res;
            },
            deleteProperty(target, prop) {
                const res = Reflect.deleteProperty(target, prop);
                onChange();
                return res;
            }
        });
    }

    proxyCache.set(obj, proxy);
    return proxy;
}
