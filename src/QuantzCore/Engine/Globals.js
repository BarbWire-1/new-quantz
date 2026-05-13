/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
// HOOKS
export const activeGlobalEvents = new Set();
export const DELEGATED_STORAGE = '__delegated_events__';
export const blueprintCache = new WeakMap();
// Global registry mapping arrays and nested objects back to their parent element
export const reactiveRegistry = new WeakMap();