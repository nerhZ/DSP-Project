import type { RequestHandler, RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async (event: RequestEvent) => {
	if (!event.locals.session) {
		return json(
			{ body: { message: 'Must be logged in to set a page size!', type: 'error' } },
			{
				status: 401
			}
		);
	}

	const body = await event.request.json();

	if (!body.pageSize || typeof parseInt(body.pageSize) !== 'number') {
		return json(
			{
				body: {
					message: 'Page size must exist & be a number!',
					type: 'error'
				}
			},
			{
				status: 401
			}
		);
	}

	event.cookies.set('pageSize', body.pageSize, {
		path: '/',
		maxAge: 60 * 60 * 24 * 365
	});

	return json(
		{
			body: {
				message: 'Successfully set page size!',
				type: 'success',
				pageSize: body.pageSize
			}
		},
		{
			status: 200
		}
	);
};
