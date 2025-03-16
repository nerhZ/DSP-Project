import type { RequestHandler, RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { count, eq, and, like } from 'drizzle-orm';

export const POST: RequestHandler = async (event: RequestEvent) => {
	const session = event.locals.session;

	if (!session || !session.userId) {
		return new Response(JSON.stringify({ message: 'Not authorized to get files', type: 'fail' }), {
			status: 401
		});
	}

	let pageSize = event.cookies.get('pageSize');
	let pageSizeInt: number;

	if (pageSize) {
		pageSizeInt = parseInt(pageSize);
	} else {
		pageSizeInt = 15;
	}

	const body = await event.request.json();
	const pageNum = body.pageNum;

	if (!pageNum || typeof pageNum !== 'number') {
		return new Response(JSON.stringify({ message: 'Invalid page number', type: 'fail' }), {
			status: 401
		});
	}

	const noOfFiles = await db
		.select({ files: count() })
		.from(table.user_file)
		.where(eq(table.user_file.userId, session.userId));
	const noOfPages = Math.ceil(noOfFiles[0].files / pageSizeInt);

	let files: { name: string; data: string; uploaded: Date }[] = [];
	try {
		const files = await db
			.select()
			.from(table.user_file)
			.where(eq(table.user_file.userId, session.userId))
			.limit(pageSizeInt)
			.offset((pageNum - 1) * pageSizeInt);

		return json(
			{
				body: {
					files
				}
			},
			{ status: 200 }
		);
	} catch (err) {
		return new Response(
			JSON.stringify({
				message: 'Unable to grab files from database! Please try again.',
				type: 'error'
			}),
			{
				status: 500
			}
		);
	}
};
