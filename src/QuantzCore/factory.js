/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
/**
 * The Factory Wrapper
 * @param {string} tagName - Der HTML-Tag-Name
 * @param {Function} classFactory - Eine Funktion oder die Klasse selbst
 */

// struct reurn of treewalker
export function html(strings, ...values) {
	return { type: 'TemplateResult', strings, values };
}

// registates in browser when imported
export function createComponent(tagName, UserClass) {
	if (!customElements.get(tagName)) {

		customElements.define(tagName, UserClass);
	}
	return UserClass;
}