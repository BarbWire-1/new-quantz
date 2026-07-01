/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
// Directive hooks
export function autoScroll() {
	console.log("scollToBottom called")
	return {
		isHook: true,
		apply(element, lastValue) {

			queueMicrotask(() => {
				console.log(element)
				element.scrollTop = element.scrollHeight;
			});
		},
	};
}

export function autoScrollToBottom() {
console.log('autoScollToBottom called');
	return {
		isHook: true,
		wasAtBottom: true,

		apply(element, lastValue) {
	console.log(element);
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