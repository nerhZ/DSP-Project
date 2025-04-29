import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import * as auth from '$lib/server/auth.js';
import { dev } from '$app/environment'; // Or check a specific TEST environment variable

const handleAuth: Handle = async ({ event, resolve }) => {
	const testUserId = event.request.headers.get('X-Test-User-Id');

	// If dev server is running and testUserId is present in the header ignore regular auth logic to enable testing
	if (dev && testUserId) {
		// Only apply during dev/test and if header exists
		// WARNING: Ensure this logic ONLY runs in test environments, not production!
		console.log(`[Test Hook] Injecting session for user: ${testUserId}`);
		event.locals.session = { id: '123', userId: testUserId, expiresAt: new Date() }; // Or whatever your session structure is

		return resolve(event);
	} else {
		const sessionToken = event.cookies.get(auth.sessionCookieName);
		if (!sessionToken) {
			event.locals.user = null;
			event.locals.session = null;
			return resolve(event);
		}

		const { session, user } = await auth.validateSessionToken(sessionToken);
		if (session) {
			auth.setSessionTokenCookie(event, sessionToken, session.expiresAt);
		} else {
			auth.deleteSessionTokenCookie(event);
		}

		event.locals.user = user;
		event.locals.session = session;

		if (event.url.pathname.startsWith('/home') && !event.locals.session?.userId) {
			return redirect(302, '/');
		}

		if (event.url.pathname.startsWith('/api') && !event.locals.session?.userId) {
			return redirect(302, '/login');
		}

		return resolve(event);
	}
};

export const handle: Handle = handleAuth;
