/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */

import { defineConfig } from 'vite';

export default defineConfig({
	base: './',

	build: {
		target: 'esnext',

		minify: 'terser',

		terserOptions: {
			mangle: {
				keep_classnames: false,
				keep_fnames: false,
			},

			compress: {
				passes: 100,
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
	},
});