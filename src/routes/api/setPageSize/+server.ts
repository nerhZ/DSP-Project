import type { RequestHandler, RequestEvent } from '@sveltejs/kit';

export const POST: RequestHandler = async (event: RequestEvent) => {
	if (!event.locals.session) {
		return new Response(
			JSON.stringify({ message: 'Must be logged in to set a page size!', type: 'error' }),
			{
				status: 401
			}
		);
	}

	const body = await event.request.json();

	if (!body.pageSize || typeof body.pageSize !== 'number') {
		JSON.stringify({ message: 'Page size must exist & be a number!', type: 'error' }),
			{
				status: 401
			};
	}

	event.cookies.set('pageSize', body.pageSize, {
		path: '/',
		maxAge: 60 * 60 * 24 * 365
	});

	return new Response(
		JSON.stringify({
			message: 'Successfully set page size!',
			type: 'success',
			pageSize: body.pageSize
		}),
		{
			status: 200
		}
	);
};
