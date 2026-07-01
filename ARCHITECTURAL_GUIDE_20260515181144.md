# Architectural Architecture Guide: Quantz Engine Evolution

Dieses Dokument beschreibt die beiden großen Meilensteine zur Optimierung der **Quantz-Engine**: Das zukunftssichere Debug-System und den Wechsel zur hocheffizienten Hybrid-Engine.

---

## Teil 1: Das zukunftssichere Debug-System (Plugin-Architektur)

Um zirkuläre Imports, Cache-Probleme und Resolver-Abstürze in Vite 8 im Consumer-Projekt komplett zu verhindern, wird die Datensammlung von der Datenausgabe entkoppelt.

### Das Prinzip
* **Die Core-Engine** sammelt die Metriken autonom und stellt sie über ein geschütztes, globales Objekt (`window.__QUANTZ_DEVTOOLS__`) ausschließlich im Entwicklungsmodus bereit.
* **Das optionale Debug-Plugin** (`plugins/metrics`) importiert *keinen* Code aus dem Core. Es liest und formatiert lediglich die Daten aus dem globalen `window`-Objekt.

### Code-Implementierung

#### 1. In `Metrics.js` (Engine Core)
```javascript
// Globale Registrierung nur im Entwicklungsmodus
if (import.meta.env.DEV && typeof window !== 'undefined') {
	window.__QUANTZ_DEVTOOLS__ = {
		stats: RENDER_STATS,
		timeAgg: TimeAgg,
		getReport: () => {
			const rows = [...TimeAgg.total.entries()].map(([label, total]) => {
				const calls = TimeAgg.count.get(label) || 1;
				return {
					Task: label,
					'Total (ms)': total.toFixed(2),
					Calls: calls,
					'Avg (ms)': (total / calls).toFixed(3),
				};
			});
			return { summaryTable: rows, stats: RENDER_STATS };
		}
	};
}
```

#### 2. In den Core-Dateien (`TemplateBlueprint.js`, `partHandlers.js`, `render.js`)
* Alle doppelten Plugin-Imports werden gelöscht.
* Es wird ausschließlich lokal und relativ aus `./Metrics.js` importiert.
* Performance-kritische Zähler und `timed()`-Aufrufe werden strikt in `if (import.meta.env.DEV)` gehüllt, damit sie im Production-Build von Terser restlos entfernt werden:
```javascript
if (import.meta.env.DEV) {
	RENDER_STATS.instanceBindings++;
}
```

#### 3. Im Debug-Plugin (`src/plugins/metrics/index.js`)
```javascript
export const QuantzDebugTool = {
	printReport() {
		if (typeof window !== 'undefined' && window.__QUANTZ_DEVTOOLS__) {
			const { summaryTable, stats } = window.__QUANTZ_DEVTOOLS__.getReport();
			console.log('%c📊 QUANTZ EXTENDED PERFORMANCE REPORT', 'color: magenta; font-weight: bold;');
			console.table(summaryTable);
			console.log('Engine Live Stats:', stats);
		} else {
			console.warn('[Quantz Debug Tool] Engine läuft im Production-Modus oder Datenkanal fehlt.');
		}
	}
};
```

---

## Teil 2: Der Wechsel zur Hybrid-Engine (Maximale Performance)

Der Wechsel zum Hybrid-Modell bedeutet: **In-Place Updates** (Props, Attribute, Text) laufen weiterhin feingranular über die Parts, aber **strukturelle Änderungen** (Arrays wie `reverse`, `splice`) umgehen das teure Schleifen-Diffing und manipulieren das DOM direkt über den Proxy.

### Das Prinzip
1. **Die Brücke:** Arrays merken sich im `NodePart` ihren zuständigen DOM-Container via `WeakMap`.
2. **Der Proxy-Angriff:** Wenn der Proxy ein `reverse()` oder `splice()` auf dem Array abfängt, mutiert er die Daten im Speicher, führt *sofort* die nativen DOM-Operationen (`insertBefore`, `remove`) auf dem Container aus und sortiert die interne Cache-Liste (`renderedChildren`) im selben Schritt um.
3. **Der Bypass:** Der normale Render-Zyklus wird zwar angestoßen, der `NodePart` erkennt aber über ein Flag (`__structuralBypass`), dass die Struktur bereits perfekt steht. Er überspringt das Diffing komplett und jagt nur noch schnelle In-Place-Updates über die inneren Werte der verschobenen Elemente.

### Code-Implementierung

#### 1. Die Registrierung (`Globals.js`)
```javascript
export const arrayToPartRegistry = new WeakMap();
```

#### 2. In der Proxy-Engine (`makeDeepReactive` für den Array-Zweig)
```javascript
if (Array.isArray(obj) && typeof val === 'function') {
	const mutatingMethods = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'];
	if (mutatingMethods.includes(prop)) {
		return function (...args) {
			const result = val.apply(obj, args); // 1. Daten im Speicher mutieren
			const nodePart = arrayToPartRegistry.get(obj); // 2. Zugehörigen DOM-Part holen

			if (nodePart && nodePart.renderedChildren.length > 0) {
				const container = nodePart.endMarker.parentNode;

				// --- STRUKTURELLER ENGPASS 1: REVERSE ---
				if (prop === 'reverse') {
					// Physisches DOM direkt im Container umdrehen
					for (let i = nodePart.renderedChildren.length - 2; i >= 0; i--) {
						const child = nodePart.renderedChildren[i];
						if (child && child.domNode) {
							container.insertBefore(child.domNode, nodePart.endMarker);
						}
					}
					// Internen Cache synchron mit dem DOM umdrehen
					nodePart.renderedChildren.reverse();
					nodePart.__structuralBypass = true;
				}

				// --- STRUKTURELLER ENGPASS 2: SPLICE ---
				else if (prop === 'splice') {
					const [start, deleteCount] = args;
					// Physisch die gelöschten Elemente aus dem DOM werfen
					const removed = nodePart.renderedChildren.splice(start, deleteCount);
					removed.forEach(child => child && child.domNode && child.domNode.remove());
					nodePart.__structuralBypass = true;
				}
			}

			const owner = reactiveRegistry.get(obj);
			if (owner) owner.__queueUpdate();
			return result;
		};
	}
}
```

#### 3. Im `NodePart.update` (`partHandlers.js`)
```javascript
else if (Array.isArray(newValue)) {
	arrayToPartRegistry.set(newValue, this); // Verbindung für den Proxy herstellen

	if (this.__structuralBypass) {
		this.__structuralBypass = false;

		// HYBRID-EFFEKT: Struktur steht bereits perfekt durch den Proxy!
		// Wir führen NUR In-Place Updates der inneren Werte aus (Props/Texte)
		newValue.forEach((item, idx) => {
			const childMeta = this.renderedChildren[idx];
			if (childMeta && childMeta.type === 'template') {
				renderEngine(item, childMeta.domNode);
			}
		});
		return;
	}

	// ... Fallback für das reguläre Listen-Diffing bei kompletter Array-Neu-Zuweisung ...
}
```
