import * as auth from '$lib/server/auth';
import { fail, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad, Actions, LayoutServerLoadEvent } from './$types';

export const load: LayoutServerLoad = async (event: LayoutServerLoadEvent) => {
	return { user: event.locals.user };
};
