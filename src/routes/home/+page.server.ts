import type { PageServerLoad, Actions, PageServerLoadEvent } from './$types';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { count, eq, and, like, isNull, asc } from 'drizzle-orm';
import { sanitizePathSegment } from '$lib/utils';

type UserFileType = typeof table.user_file.$inferSelect;

export const load: PageServerLoad = async (event: PageServerLoadEvent) => {
	const session = event.locals.session;

	if (!session || !session.userId) {
		return fail(401, { message: 'Not authenticated - please try login again.' });
	}

	// Get pagination and folder context
	const parentId = event.url.searchParams.get('folderId') || null;
	let pageSize = event.cookies.get('pageSize');
	let pageSizeInt: number;

	if (pageSize && !isNaN(parseInt(pageSize))) {
		// Added NaN check
		pageSizeInt = parseInt(pageSize);
	} else {
		pageSizeInt = 15; // Default page size
	}

	// Filter conditions based on whether valid parentId is provided
	const parentFilter = parentId
		? eq(table.folder.parentFolderId, parentId)
		: isNull(table.folder.parentFolderId);

	const fileParentFilter = parentId
		? eq(table.user_file.folderId, parentId)
		: isNull(table.user_file.folderId);

	// clause for user and parent folder
	const folderWhereClause = and(eq(table.folder.userId, session.userId), parentFilter);
	const fileWhereClause = and(eq(table.user_file.userId, session.userId), fileParentFilter);

	// Order folders by name, then files by name
	const folderOrderBy = [asc(table.folder.name)];
	const fileOrderBy = [asc(table.user_file.filename)];

	try {
		const noOfFoldersResult = await db
			.select({ count: count() })
			.from(table.folder)
			.where(folderWhereClause);
		const totalFolders = noOfFoldersResult[0]?.count ?? 0;

		const noOfFilesResult = await db
			.select({ count: count() }) // Use consistent alias 'count'
			.from(table.user_file)
			.where(fileWhereClause);
		const totalFiles = noOfFilesResult[0]?.count ?? 0;

		const totalItems = totalFolders + totalFiles;

		// Fetch up to pageSizeInt folders, respecting the defined order
		const folders = await db
			.select()
			.from(table.folder)
			.where(folderWhereClause)
			.orderBy(...folderOrderBy)
			.limit(pageSizeInt);

		const fetchedFoldersCount = folders.length;

		let files: UserFileType[] = []; // Initialize files array
		const remainingSlots = pageSizeInt - fetchedFoldersCount;

		if (remainingSlots > 0) {
			// Fetch files to fill the remaining slots, respecting the defined order
			files = await db
				.select()
				.from(table.user_file)
				.where(fileWhereClause)
				.orderBy(...fileOrderBy) // Apply ordering
				.limit(remainingSlots); // Limit to remaining slots
		}

		const fileTypes = await db
			.selectDistinct({ mimetype: table.user_file.mimetype })
			.from(table.user_file)
			.where(eq(table.user_file.userId, session.userId));

		let currentFolder = null;
		if (parentId) {
			const folderResult = await db
				.select({
					id: table.folder.id,
					name: table.folder.name,
					parentId: table.folder.parentFolderId
				})
				.from(table.folder)
				.where(and(eq(table.folder.id, parentId), eq(table.folder.userId, session.userId)))
				.limit(1); // Ensure only one result
			currentFolder = folderResult[0] || null;
		}

		return {
			folders, // Folders fetched for page 1 (max pageSizeInt)
			files, // Files fetched for page 1 (fills remaining slots)
			pageSize: pageSizeInt,
			totalItems: totalItems, // Total count for pagination controls on frontend
			fileTypes,
			currentParentId: parentId,
			currentFolder: currentFolder
		};
	} catch (err) {
		console.error('Database error in load function:', err); // Log the specific error
		// Return fail object, don't just call fail() which might not return correctly
		return fail(500, { message: 'Failed to load data from database!' });
	}
};

export const actions: Actions = {
	createFolder: async (event) => {
		const currentUser = event.locals.session?.userId;

		if (!currentUser) {
			return fail(401, { message: 'Not authenticated, please login again' });
		}

		const formData = await event.request.formData();
		const folderName = formData.get('folderName');

		const parentId = formData.get('parentId') as string | null;

		if (!folderName || typeof folderName !== 'string' || folderName.trim() === '') {
			return fail(400, { message: 'Folder name cannot be empty' });
		}

		const trimmedFolderName = folderName.trim();

		const allowedCharsRegex = /^[a-zA-Z0-9]+$/; // Only letters and numbers
		if (!allowedCharsRegex.test(trimmedFolderName)) {
			return fail(400, {
				message: 'Folder name can only contain letters (a-z, A-Z) and numbers (0-9).'
			});
		}

		const sanitizedFolderName = sanitizePathSegment(trimmedFolderName); // Sanitize for path use

		if (!sanitizedFolderName) {
			return fail(400, {
				message: 'Folder name contains invalid characters or is empty after sanitization.'
			});
		}

		// Define the absolute root for storage
		const storageRoot = path.join('/mnt', 'AppStorage');
		// Define the user's base path (useful for ensuring it exists)
		const baseUserPath = path.join(storageRoot, currentUser);

		let newFolderUri = ''; // Will store the path relative to storageRoot (e.g., "userId/folder" or "userId/parent/folder")
		let newFolderPath = ''; // Will store the absolute filesystem path

		try {
			if (parentId) {
				// --- Subfolder Logic ---
				const parentFolderResult = await db
					.select({ uri: table.folder.URI }) // Fetch the parent's full URI (which should now include userId)
					.from(table.folder)
					.where(and(eq(table.folder.id, parentId), eq(table.folder.userId, currentUser)))
					.limit(1);

				if (parentFolderResult.length === 0) {
					return fail(404, { message: 'Parent folder not found.' });
				}
				const parentUri = parentFolderResult[0].uri; // e.g., "userId/parent" or "userId/grandparent/parent"

				// DB URI: Join parent's full URI with the new folder name
				newFolderUri = path.join(parentUri, sanitizedFolderName); // e.g., "userId/parent/newFolder"

				// Filesystem Path: Absolute path (Storage Root + Full DB URI)
				newFolderPath = path.join(storageRoot, newFolderUri); // e.g., "/mnt/AppStorage/userId/parent/newFolder"
			} else {
				// --- Root Folder Logic ---

				// DB URI: User ID + Folder Name
				newFolderUri = path.join(currentUser, sanitizedFolderName); // e.g., "userId/newFolder"

				// Filesystem Path: Absolute path (Storage Root + Full DB URI)
				newFolderPath = path.join(storageRoot, newFolderUri); // e.g., "/mnt/AppStorage/userId/newFolder"
			}

			const existingDbFolder = await db
				.select({ id: table.folder.id })
				.from(table.folder)
				.where(
					and(
						eq(table.folder.userId, currentUser),
						eq(table.folder.name, trimmedFolderName),
						parentId
							? eq(table.folder.parentFolderId, parentId)
							: isNull(table.folder.parentFolderId)
					)
				)
				.limit(1);

			if (existingDbFolder.length > 0) {
				return fail(409, { message: 'A folder with this name already exists in this location.' });
			}

			// Check if filesystem path already exists
			try {
				await fsp.access(newFolderPath);
				return fail(409, {
					message: 'A file or folder already exists at the target location on disk.'
				});
			} catch (accessError: any) {
				// ENOENT means path does NOT exist
				if (accessError.code !== 'ENOENT') {
					console.error('Filesystem access check error:', accessError);
					return fail(500, { message: 'Server error checking folder path.' });
				}
			}

			// Ensure the upload directory exists
			try {
				await fs.promises.mkdir(baseUserPath, { recursive: true });
			} catch (err) {
				console.error('Failed to create directory:', err);
				return fail(500, { message: 'Failed to create directory' });
			}

			try {
				await fsp.mkdir(newFolderPath, { recursive: false }); // Create only the final directory
				console.log('Directory created:', newFolderPath);
			} catch (mkdirError) {
				console.error('Failed to create directory:', mkdirError);
				return fail(500, { message: 'Failed to create folder directory on server.' });
			}

			try {
				await db.insert(table.folder).values({
					userId: currentUser,
					name: trimmedFolderName,
					parentFolderId: parentId ? parentId : null,
					URI: newFolderUri
				});

				return { success: true, message: 'Folder created!' };
			} catch (dbError) {
				console.error('Failed to insert folder into DB:', dbError);
				// Attempt to clean up the created directory if DB insert fails
				try {
					await fsp.rmdir(newFolderPath);
					console.log('Cleaned up directory after DB error:', newFolderPath);
				} catch (cleanupError) {
					console.error('Failed to cleanup directory after DB error:', cleanupError);
				}
				return fail(500, { message: 'Failed to save folder record.' });
			}
		} catch (err) {
			console.error('Unexpected error creating folder:', err);
			return fail(500, { message: 'An unexpected server error occurred.' });
		}
	},

	upload: async (event) => {
		const currentUser = event.locals.user?.id;

		if (!currentUser) {
			return fail(401, { message: 'Not authenticated' });
		}

		const formData = await event.request.formData();
		const files = formData.getAll('file') as File[];
		const folderId = formData.get('parentId') as string | null;

		if (!files || files.length === 0) {
			return fail(400, { message: 'No file uploaded' });
		}

		// Used for batch inserting to DB after all files are uploaded to lower DB overhead
		const insertValues = [];
		for (const file of files) {
			if (!(file instanceof File)) {
				return fail(400, { message: 'Invalid file type' });
			}

			// Validate file size
			const maxSize = 100 * 1024 * 1024; // 100MB
			if (file.size > maxSize) {
				return fail(400, { message: 'File size exceeds the limit of 100MB' });
			}

			// Get file type
			const mimetype = file.type.split('/')[0];
			const extension = file.type.split('/')[1];

			// Validate file type
			const allowedTypes = [
				'application/zip',
				'application/x-rar-compressed',
				'application/x-tar',
				'application/gzip',
				'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
				'application/msword',
				'application/pdf',
				'audio/mpeg',
				'audio/wav',
				'audio/ogg',
				'audio/opus',
				'image/jpeg',
				'image/png',
				'image/gif',
				'image/bmp',
				'image/tiff',
				'image/svg+xml',
				'image/webp',
				'text/css',
				'text/html',
				'application/x-httpd-php',
				'text/x-c',
				'text/x-c++',
				'text/x-h',
				'text/x-h++',
				'application/javascript',
				'text/x-java-source',
				'text/x-python',
				'text/plain',
				'video/webm',
				'video/mp4',
				'video/3gpp',
				'video/quicktime',
				'video/x-msvideo',
				'video/mpeg',
				'video/x-ms-wmv',
				'video/x-flv',
				'video/ogg'
			];
			if (!file.type || !allowedTypes.includes(file.type)) {
				return fail(400, { message: 'Invalid file type' });
			}

			// Sanitize file name
			let sanitizedFileName = path.basename(file.name).replace(/[^a-zA-Z0-9.\-_]/g, '_');
			// Define the absolute storage root
			const storageRoot = path.join('/mnt', 'AppStorage');
			// User's base path (relative to storage root)
			const userRelativePath = currentUser; // Just the user ID

			let targetFolderDbUri = ''; // Relative path within user's storage (e.g., "folder" or "parent/folder")
			let uploadDir = ''; // Absolute filesystem path for upload
			let fileDbUri = ''; // Full relative DB URI (e.g., "userId/folder/file.txt")

			let filenameType = path.extname(sanitizedFileName);
			let filenameBase = path.basename(sanitizedFileName, filenameType);

			if (folderId) {
				try {
					const parentFolderResult = await db
						.select({ uri: table.folder.URI })
						.from(table.folder)
						.where(and(eq(table.folder.id, folderId), eq(table.folder.userId, currentUser)))
						.limit(1);

					if (parentFolderResult.length === 0) {
						return fail(404, { message: 'Target folder not found or access denied.' });
					}
					targetFolderDbUri = parentFolderResult[0].uri;

					// Filesystem Path: Absolute root + full relative DB URI of the folder
					uploadDir = path.join(storageRoot, targetFolderDbUri);

					// DB URI for the file: Folder's full DB URI + sanitized file name
					fileDbUri = path.join(targetFolderDbUri, sanitizedFileName);
				} catch (dbError) {
					console.error('Error fetching target folder URI:', dbError);
					return fail(500, { message: 'Server error determining upload location.' });
				}
			} else {
				// If no folderId, upload to user's root directory
				uploadDir = path.join(storageRoot, userRelativePath);

				// DB URI for the file: User ID + sanitized file name
				fileDbUri = path.join(userRelativePath, sanitizedFileName);
			}

			// Check if file name is already in use
			const existingFile = await db
				.select({ count: count() })
				.from(table.user_file)
				.where(
					and(
						eq(table.user_file.userId, currentUser),
						like(
							table.user_file.filename,
							`${path.basename(sanitizedFileName, path.extname(sanitizedFileName))}%`
						),
						folderId ? eq(table.user_file.folderId, folderId) : isNull(table.user_file.folderId)
					)
				);

			if (existingFile[0].count > 0) {
				sanitizedFileName = `${filenameBase}-${existingFile[0].count}${filenameType}`;
			}

			// Ensure the upload directory exists
			try {
				await fs.promises.mkdir(uploadDir, { recursive: true });
			} catch (err) {
				console.error('Failed to create directory:', err);
				return fail(500, { message: 'Failed to create directory' });
			}

			const filePath = path.join(uploadDir, sanitizedFileName);
			const arrayBuffer = await file.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);

			// Write the file to disk
			try {
				// In case name change resulted in duplicate file name
				const fileExists = fs.existsSync(filePath);
				if (fileExists) {
					return fail(400, { message: 'File already exists, please alter file name' });
				}

				await fs.promises.writeFile(filePath, buffer);

				insertValues.push({
					userId: currentUser,
					filename: sanitizedFileName,
					extension: extension,
					mimetype: mimetype,
					uploadedAt: new Date(),
					fileSize: file.size,
					URI: fileDbUri,
					folderId: folderId ? folderId : null
				});
			} catch (err) {
				// If error occured, db insert definitely failed so ensure file is deleted
				await fs.promises.unlink(filePath);
				console.error(err);
				return fail(500, { message: 'Failed to write file' });
			}
		}
		await db.insert(table.user_file).values(insertValues);
		return { success: true, message: 'Files uploaded!' };
	},
	delete: async (event) => {
		const currentUser = event.locals.session?.userId;

		if (!currentUser) {
			return fail(401, { message: 'Not authenticated, please login again' });
		}

		const formData = await event.request.formData();
		const fileIdValue = formData.get('file');

		// Validate fileId
		if (!fileIdValue || typeof fileIdValue !== 'string') {
			return fail(400, { message: 'No file ID specified for deletion.' });
		}

		const fileId = parseInt(fileIdValue, 10);
		if (isNaN(fileId)) {
			return fail(400, { message: 'Invalid file ID format.' });
		}

		const storageRoot = path.join('/mnt', 'AppStorage');
		let fileDbUri: string | null = null;

		try {
			const fileResult = await db
				.select({
					uri: table.user_file.URI
				})
				.from(table.user_file)
				.where(and(eq(table.user_file.id, fileId), eq(table.user_file.userId, currentUser)))
				.limit(1);

			if (fileResult.length === 0) {
				return fail(404, { message: 'File not found or access denied.' });
			}

			fileDbUri = fileResult[0].uri;
			const absoluteFilePath = path.join(storageRoot, fileDbUri);

			const deleteDbResult = await db
				.delete(table.user_file)
				.where(and(eq(table.user_file.id, fileId), eq(table.user_file.userId, currentUser)));

			try {
				await fsp.unlink(absoluteFilePath);
				console.log(`Deleted file from filesystem: ${absoluteFilePath}`);
			} catch (unlinkError: any) {
				if (unlinkError.code === 'ENOENT') {
					console.warn(
						`File ${absoluteFilePath} not found on filesystem during delete, but DB record was removed.`
					);
				} else {
					// Other filesystem error
					console.error(`Failed to delete file from filesystem: ${absoluteFilePath}`, unlinkError);
					return fail(500, {
						message: 'File record deleted, but failed to remove file from storage.'
					});
				}
			}

			return { success: true, message: 'File deleted!' };
		} catch (err) {
			console.error(`Error during deletion process for file ID ${fileId}:`, err);
			// Check if it's a known error type if needed, otherwise generic error
			return fail(500, { message: 'Failed to delete file! Please try again or refresh.' });
		}
	}
};
