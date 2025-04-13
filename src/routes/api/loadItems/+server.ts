import type { RequestHandler, RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { count, eq, and, or, ilike, between, isNull, asc, SQL } from 'drizzle-orm';

type UserFileType = typeof table.user_file.$inferSelect;
type FolderType = typeof table.folder.$inferSelect;

export const POST: RequestHandler = async (event: RequestEvent) => {
	const session = event.locals.session;
	if (!session || !session.userId) {
		// Use json helper for consistent responses
		return json({ message: 'Not authorized' }, { status: 401 });
	}

	let pageSize: number;
	try {
		pageSize = parseInt(event.cookies.get('pageSize') || '15');
		if (isNaN(pageSize) || pageSize <= 0) {
			pageSize = 15;
		}
	} catch {
		pageSize = 15;
	}

	let body;
	try {
		body = await event.request.json();
	} catch (e) {
		return json({ message: 'Invalid request body' }, { status: 400 });
	}

	const pageNum = typeof body.pageNum === 'number' && body.pageNum > 0 ? body.pageNum : 1;
	const searchQuery = typeof body.searchQuery === 'string' ? body.searchQuery.trim() : null;
	const fileType = typeof body.fileType === 'string' ? body.fileType : null;
	const startDate = typeof body.startDate === 'string' ? body.startDate : null;
	const endDate = typeof body.endDate === 'string' ? body.endDate : null;
	const parentId = typeof body.parentId === 'string' ? body.parentId : null;

	try {
		// Filters
		const baseUserFilter = eq(table.folder.userId, session.userId);
		const baseFileUserFilter = eq(table.user_file.userId, session.userId);

		const parentFolderFilter = parentId
			? eq(table.folder.parentFolderId, parentId)
			: isNull(table.folder.parentFolderId);

		const parentFileFilter = parentId
			? eq(table.user_file.folderId, parentId)
			: isNull(table.user_file.folderId);

		// Folder Filters
		const folderWhereClauses: SQL[] = [baseUserFilter, parentFolderFilter];
		if (searchQuery) {
			// Apply search to folder names
			folderWhereClauses.push(ilike(table.folder.name, `%${searchQuery}%`));
		}
		const finalFolderWhere = and(...folderWhereClauses);

		// File Filters
		const fileWhereClauses: SQL[] = [baseFileUserFilter, parentFileFilter];
		if (searchQuery) {
			// Apply search to filenames
			fileWhereClauses.push(ilike(table.user_file.filename, `%${searchQuery}%`));
		}
		if (fileType) {
			fileWhereClauses.push(eq(table.user_file.mimetype, fileType));
		}
		if (startDate && endDate) {
			try {
				const start = new Date(startDate);
				const end = new Date(endDate);
				// Ensure dates are valid before using them
				if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
					start.setHours(0, 0, 0, 0); // Start of the start day
					end.setHours(23, 59, 59, 999); // End of the end day
					if (start <= end) {
						// Ensure start is not after end
						fileWhereClauses.push(between(table.user_file.uploadedAt, start, end));
					} else {
						console.warn('Start date is after end date, ignoring date filter.');
					}
				} else {
					console.warn('Invalid start or end date received, ignoring date filter.');
				}
			} catch (dateError) {
				console.error('Error processing date filter:', dateError);
			}
		}
		const finalFileWhere = and(...fileWhereClauses);

		const totalFoldersResult = await db
			.select({ count: count() })
			.from(table.folder)
			.where(finalFolderWhere);
		const totalFolders = totalFoldersResult[0]?.count ?? 0;

		const totalFilesResult = await db
			.select({ count: count() })
			.from(table.user_file)
			.where(finalFileWhere);
		const totalFiles = totalFilesResult[0]?.count ?? 0;

		const totalItems = totalFolders + totalFiles;

		const offset = (pageNum - 1) * pageSize;
		const limit = pageSize;

		let folders: FolderType[] = [];
		if (offset < totalFolders) {
			// Only fetch folders if the offset is within the folder range
			folders = await db
				.select()
				.from(table.folder)
				.where(finalFolderWhere)
				.orderBy(asc(table.folder.name))
				.limit(limit)
				.offset(offset);
		}
		const fetchedFoldersCount = folders.length;

		let files: UserFileType[] = [];
		const filesNeeded = limit - fetchedFoldersCount; // How many file slots are left

		if (filesNeeded > 0 && offset + fetchedFoldersCount < totalItems) {
			// Only fetch files if needed and if there are files remaining in the total list
			const fileOffset = Math.max(0, offset - totalFolders);

			files = await db
				.select()
				.from(table.user_file)
				.where(finalFileWhere)
				.orderBy(asc(table.user_file.filename))
				.limit(filesNeeded)
				.offset(fileOffset);
		}

		// Use the structure expected by the frontend
		return json(
			{
				body: {
					folders,
					files,
					totalItems // Send the total combined count for pagination controls
				}
			},
			{ status: 200 }
		);
	} catch (error) {
		console.error('Error fetching files/folders:', error);
		// Provide a generic error message to the client
		return json({ message: 'Server error processing request' }, { status: 500 });
	}
};
