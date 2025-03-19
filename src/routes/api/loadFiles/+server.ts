import type { RequestHandler, RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { count, eq, and, like, ilike } from 'drizzle-orm';

export const POST: RequestHandler = async (event: RequestEvent) => {
	const session = event.locals.session;

	if (!session || !session.userId) {
		return json(
			{ body: { message: 'Not authorized to get files', type: 'fail' } },
			{ status: 401 }
		);
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
	const searchQuery = body.searchQuery;

	if (!pageNum || typeof pageNum !== 'number') {
		return json({ body: { message: 'Invalid page number', type: 'fail' } }, { status: 401 });
	}

	try {
		// Get the total count of files
		const totalCountResult = await db
			.select({ count: count() })
			.from(table.user_file)
			.where(
				searchQuery
					? ilike(table.user_file.filename, `%${searchQuery}%`)
					: eq(table.user_file.userId, session.userId)
			);
		const fileCount = totalCountResult[0].count;

		// Build the final query with the combined where clause, limit, and offset
		const files = await db
			.select()
			.from(table.user_file)
			.where(
				searchQuery
					? ilike(table.user_file.filename, `%${searchQuery}%`)
					: eq(table.user_file.userId, session.userId)
			)
			.limit(pageSizeInt)
			.offset((pageNum - 1) * pageSizeInt);

		return json(
			{
				body: {
					files,
					fileCount
				}
			},
			{ status: 200 }
		);
	} catch (err) {
		return json(
			{
				body: {
					message: 'Unable to grab files from database! Please try again.',
					type: 'error'
				}
			},
			{
				status: 500
			}
		);
	}
};
