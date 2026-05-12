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
			mangle: true,

			compress: {
				passes: 1,
				dead_code: false,
				unused: false,
			},

			format: {
				comments: false,
			},

			keep_classnames: false,
			keep_fnames: false,
		},
	},
});