/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */

/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */

import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
	base: './',

	build: {
		target: 'esnext',
		minify: 'terser',
		sourcemap: true,

		lib: {
			// Only define API here
			entry: {

				element: resolve(__dirname, 'src/QuantzCore/element.js'),
				events: resolve(__dirname, 'src/QuantzCore/events.js'),
				factory: resolve(__dirname, 'src/QuantzCore/factory.js'),

				index: resolve(__dirname, 'src/index.js'), // Exports main API
				'plugins/scroll': resolve(__dirname, 'src/plugins/scroll.js'),
			},
			formats: ['es'],
		},

		terserOptions: {
			mangle: {
				keep_classnames: false,
				keep_fnames: false,
			},

			compress: {
				passes: 500,
				dead_code: true,
				unused: true,
				arguments: true,
				booleans_as_integers: true,
				drop_console: true,
			},

			format: {
				comments: false,
			},
		},

		rollupOptions: {
			output: {
				entryFileNames: '[name].js',
				// prevent Code-Splitting for compatibility without build-tools (???)
				manualChunks: () => 'shared-quantz-factory',
			},
		},
	},
});
