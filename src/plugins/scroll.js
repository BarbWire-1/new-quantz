/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
// Directive hooks
export function autoScroll() {
	return {
		isHook: true,
		apply(element, lastValue) {

			queueMicrotask(() => {
				element.scrollTop = element.scrollHeight;
			});
		},
	};
}

export function autoScrollToBottom() {

	return {
		isHook: true,
		wasAtBottom: true,

		apply(element, lastValue) {

			// check position, 10px padding
			this.wasAtBottom =
				element.scrollHeight - element.clientHeight <=
				element.scrollTop + 10;

			// after Dom update: scroll
			queueMicrotask(() => {
				if (this.wasAtBottom) {
					element.scrollTop = element.scrollHeight;
				}
			});
		},
	};
}