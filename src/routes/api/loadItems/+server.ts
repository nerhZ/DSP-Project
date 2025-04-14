import type { RequestHandler, RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { count, eq, and, or, ilike, between, isNull, asc, SQL } from 'drizzle-orm';
import { parseAndValidateDateRange } from '$lib/utils';

type UserFileType = typeof table.user_file.$inferSelect;
type FolderType = typeof table.folder.$inferSelect;

export const POST: RequestHandler = async (event: RequestEvent) => {
	const session = event.locals.session;
	if (!session || !session.userId) {
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
		console.error('Error parsing request body:', e);
		return json({ message: 'Invalid request body' }, { status: 400 });
	}

	const pageNum = typeof body.pageNum === 'number' && body.pageNum > 0 ? body.pageNum : 1;
	const searchQuery = typeof body.searchQuery === 'string' ? body.searchQuery.trim() : null;
	const fileType = typeof body.fileType === 'string' ? body.fileType : null;
	const startDateStr = typeof body.startDate === 'string' ? body.startDate : null;
	const endDateStr = typeof body.endDate === 'string' ? body.endDate : null;
	const parentId = typeof body.parentId === 'string' ? body.parentId : null;

	try {
		// Base Filters
		const baseUserFilter = eq(table.folder.userId, session.userId);
		const baseFileUserFilter = eq(table.user_file.userId, session.userId);

		const parentFolderFilter = parentId
			? eq(table.folder.parentFolderId, parentId)
			: isNull(table.folder.parentFolderId);

		const parentFileFilter = parentId
			? eq(table.user_file.folderId, parentId)
			: isNull(table.user_file.folderId);

		// Date Range Filter
		const dateRange = parseAndValidateDateRange(startDateStr, endDateStr);

		// Folder Filters
		const folderWhereClauses: SQL[] = [baseUserFilter, parentFolderFilter];
		if (searchQuery) {
			folderWhereClauses.push(ilike(table.folder.name, `%${searchQuery}%`));
		}
		// Apply date filter to folders
		if (dateRange) {
			if (table.folder.createdAt) {
				folderWhereClauses.push(between(table.folder.createdAt, dateRange.start, dateRange.end));
			}
		}
		const finalFolderWhere = folderWhereClauses.length > 0 ? and(...folderWhereClauses) : undefined; // Handle empty clauses

		// File Filters
		const fileWhereClauses: SQL[] = [baseFileUserFilter, parentFileFilter];
		if (searchQuery) {
			fileWhereClauses.push(ilike(table.user_file.filename, `%${searchQuery}%`));
		}
		// Only apply fileType filter if it's not "Folder"
		if (fileType && fileType !== 'Folder') {
			fileWhereClauses.push(eq(table.user_file.mimetype, fileType));
		}
		if (dateRange) {
			// Ensure user_file table has uploadedAt
			if (table.user_file.uploadedAt) {
				fileWhereClauses.push(between(table.user_file.uploadedAt, dateRange.start, dateRange.end));
			} else {
				console.warn(
					"File date filter skipped: 'uploadedAt' column not found in schema definition for 'user_file' table."
				);
			}
		}
		const finalFileWhere = fileWhereClauses.length > 0 ? and(...fileWhereClauses) : undefined; // Handle empty clauses

		// Determine which items to fetch/count
		const shouldIncludeFolders = !fileType || fileType === 'Folder';
		const shouldIncludeFiles = !fileType || fileType !== 'Folder';

		// Calculate Totals
		let totalFolders = 0;
		if (shouldIncludeFolders) {
			const totalFoldersResult = await db
				.select({ count: count() })
				.from(table.folder)
				.where(finalFolderWhere); // Apply final folder filters
			totalFolders = totalFoldersResult[0]?.count ?? 0;
		}

		let totalFiles = 0;
		if (shouldIncludeFiles) {
			const totalFilesResult = await db
				.select({ count: count() })
				.from(table.user_file)
				.where(finalFileWhere); // Apply final file filters
			totalFiles = totalFilesResult[0]?.count ?? 0;
		}

		const totalItems = totalFolders + totalFiles; // Total is sum of *potentially* included items

		//Pagination
		const offset = (pageNum - 1) * pageSize;
		const limit = pageSize;

		// Fetch Data
		let folders: FolderType[] = [];
		let fetchedFoldersCount = 0;

		if (shouldIncludeFolders && offset < totalFolders) {
			// Fetch folders only if they are relevant for the current filter and page offset
			folders = await db
				.select()
				.from(table.folder)
				.where(finalFolderWhere)
				.orderBy(asc(table.folder.name))
				.limit(limit)
				.offset(offset);
			fetchedFoldersCount = folders.length;
		}

		let files: UserFileType[] = [];
		const filesNeeded = limit - fetchedFoldersCount; // How many file slots are left

		if (shouldIncludeFiles && filesNeeded > 0 && offset + fetchedFoldersCount < totalItems) {
			// Calculate offset relative to the start of the file list
			// If folders were fetched/included, adjust offset; otherwise, use page offset directly relative to files.
			const fileOffset = shouldIncludeFolders ? Math.max(0, offset - totalFolders) : offset;

			files = await db
				.select()
				.from(table.user_file)
				.where(finalFileWhere) // Use final filter
				.orderBy(asc(table.user_file.filename))
				.limit(filesNeeded)
				.offset(fileOffset);
		}

		return json(
			{
				body: {
					folders,
					files,
					totalItems
				}
			},
			{ status: 200 }
		);
	} catch (error) {
		console.error('Error fetching files/folders:', error);
		return json({ message: 'Server error processing request' }, { status: 500 });
	}
};
