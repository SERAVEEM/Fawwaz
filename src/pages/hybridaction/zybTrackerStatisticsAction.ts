import type { APIRoute } from 'astro';

// ponytail: handles browser extension tracker gracefully so it doesn't flood terminal with 404s
export const ALL: APIRoute = () => {
	return new Response(null, { status: 204 });
};

