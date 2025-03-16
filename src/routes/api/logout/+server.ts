import * as auth from '$lib/server/auth';
import type { RequestHandler, RequestEvent } from '@sveltejs/kit';

export const POST: RequestHandler = async (event: RequestEvent) => {
	if (!event.locals.session) {
		return new Response(JSON.stringify({ message: 'Failed to log out!', type: 'error' }), {
			status: 401
		});
	}
	await auth.invalidateSession(event.locals.session.id);
	auth.deleteSessionTokenCookie(event);

	return new Response(JSON.stringify({ message: 'Logged out!', type: 'success' }), { status: 200 });
};
