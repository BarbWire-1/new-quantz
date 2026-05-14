/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
import { QElement } from './element.js';
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
/**
 * A Factory to create a QElement
 * The component will be registered as soon as you import the created file and/or instatiate
 *
 * @param {string} tagName  Your chosen tagname (needs a hyphen 'partA-partB')
 * @param {QElement} UserClass class YourClassName extends QElement{...}
 * @returns {HTMLElement} Userclass for instantiating a new web-component as new YourClassName()
 */
export function createComponent(tagName, UserClass) {
	if (!customElements.get(tagName)) {

		customElements.define(tagName, UserClass);
	}
	return UserClass;
}