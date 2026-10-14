// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://seraveem.github.io',
	base: process.env.BASE_PATH || (process.env.GITHUB_ACTIONS ? '/Fawwaz' : '/'),
	devToolbar: {
		enabled: false,
	},
});
