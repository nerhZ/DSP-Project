import type { RequestHandler, RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { count, eq, and, like, ilike, between } from 'drizzle-orm';

export const POST: RequestHandler = async (event: RequestEvent) => {
	const session = event.locals.session;
	if (!session || !session.userId) {
		return json({ body: { message: 'Not authorized', type: 'error' } }, { status: 401 });
	}

	const pageSize = parseInt(event.cookies.get('pageSize') || '15');

	const body = await event.request.json();
	const pageNum = body.pageNum;
	const searchQuery = body.searchQuery;
	const fileType = body.fileType;
	const startDate = body.startDate;
	const endDate = body.endDate;

	try {
		const query = db.select().from(table.user_file);

		const whereClauses = [];
		whereClauses.push(eq(table.user_file.userId, session.userId));

		if (searchQuery) {
			whereClauses.push(ilike(table.user_file.filename, `%${searchQuery}%`));
		}
		if (fileType) {
			whereClauses.push(eq(table.user_file.mimetype, fileType));
		}
		if (startDate && endDate) {
			const start = new Date(startDate);
			const end = new Date(endDate);
			// Set the time to the start and end of the day, to ensure the date range is inclusive
			start.setHours(0, 0, 0, 0);
			end.setHours(23, 59, 59, 999);

			whereClauses.push(between(table.user_file.uploadedAt, start, end));
		}

		if (whereClauses.length > 0) {
			query.where(and(...whereClauses));
		}

		const totalCountResult = await db
			.select({ count: count() })
			.from(table.user_file)
			.where(and(...whereClauses));
		const totalCount = totalCountResult[0].count;
		const files = await query.limit(pageSize).offset((pageNum - 1) * pageSize);

		return json({ body: { files, totalCount } }, { status: 200 });
	} catch (error) {
		console.error('Error fetching files:', error);
		return json({ body: { message: 'Database error', type: 'error' } }, { status: 500 });
	}
};
