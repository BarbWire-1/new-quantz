/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
// src/index.js
// src/index.js

// Alles Relevante aus dem Core gesammelt exportieren
export { QElement } from './QuantzCore/element.js';
// src/index.js


export { createComponent, html } from './QuantzCore/factory.js';

// WICHTIG: Optionale Plugins (wie scroll.js) werden hier BEWUSST NICHT importiert!
// Dadurch bleibt der Haupt-Import extrem klein und Plugins bleiben optional.
