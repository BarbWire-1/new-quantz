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
		sourcemap: true ,

		lib: {
			// Only define API here
			entry: {
				index: resolve(__dirname, 'src/index.js'), // Falls du eine Hauptdatei hast
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
				manualChunks: () => 'shared-utils',
			},
		},
	},
});
