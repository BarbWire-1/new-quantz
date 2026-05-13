/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
/**
 * The Factory Wrapper
 * @param {string} tagName - Der HTML-Tag-Name
 * @param {Function} classFactory - Eine Funktion oder die Klasse selbst
 */
export function html(strings, ...values) {
	return { type: 'TemplateResult', strings, values };
}
export function createComponent(tagName, UserClass) {
	if (!customElements.get(tagName)) {
		// Sofortige, harte Registrierung beim Browser
		customElements.define(tagName, UserClass);
	}
	return UserClass;
}