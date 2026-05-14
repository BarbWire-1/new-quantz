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
			// FIX: Using an array forces separate, fully standalone builds
			entry: [
				resolve(__dirname, 'src/index.js'),
				resolve(__dirname, 'src/plugins/scroll.js'),
			],
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
				// Re-establishes named mapping for array entries
				entryFileNames: chunkInfo => {
					return chunkInfo.name === 'index'
						? 'index.js'
						: 'plugins/scroll.js';
				},
				chunkFileNames: '[name].js',
				assetFileNames: '[name].[ext]',
			},
		},
	},
});
