// src/routes/home/+page.server.integration.spec.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import fsp from 'node:fs/promises';
import path from 'node:path';

const APP_URL = 'http://localhost:5173';
const TEST_USER_ID = 'integration-test-user-abc';
const STORAGE_ROOT = path.join('/mnt', 'AppStorage');
const TEST_USER_STORAGE_PATH = path.join(STORAGE_ROOT, TEST_USER_ID);

async function cleanupTestUserResources() {
	console.log(`Cleaning up resources for user: ${TEST_USER_ID}`);
	try {
		// Cascade delete should handle folders and files due to schema setup
		const deleteResult = await db
			.delete(table.user)
			.where(eq(table.user.id, TEST_USER_ID))
			.returning();
		if (deleteResult.length > 0) {
			console.log(`Deleted user ${TEST_USER_ID} from database.`);
		} else {
			// Changed log message slightly for clarity
			console.log(`User ${TEST_USER_ID} not found in database (already clean?).`);
		}
	} catch (error) {
		console.error(`Error deleting user ${TEST_USER_ID} from database:`, error);
	}

	try {
		await fsp.rm(TEST_USER_STORAGE_PATH, { recursive: true, force: true });
		console.log(`Removed filesystem directory: ${TEST_USER_STORAGE_PATH}`);
	} catch (error: any) {
		if (error.code === 'ENOENT') {
			console.log(`Filesystem directory ${TEST_USER_STORAGE_PATH} not found (already clean?).`);
		} else {
			console.error(`Error removing filesystem directory ${TEST_USER_STORAGE_PATH}:`, error);
		}
	}
}

describe('/home actions (API Testing)', () => {
	beforeAll(async () => {
		await cleanupTestUserResources();
	});

	beforeEach(async () => {
		await cleanupTestUserResources();
		try {
			const testUsername = `testuser_${TEST_USER_ID}`;
			await db.insert(table.user).values({
				id: TEST_USER_ID,
				username: testUsername,
				passwordHash: 'test-password-hash-placeholder'
			});
			console.log(`Created test user ${TEST_USER_ID} for the test.`);
		} catch (error) {
			// Fail fast if user creation fails, as tests depend on it
			console.error(`Failed to create test user ${TEST_USER_ID}:`, error);
			throw new Error(`Setup failed: Could not create test user ${TEST_USER_ID}`);
		}
	});

	afterAll(async () => {
		await cleanupTestUserResources();
	});

	it('POST /home?/createFolder should create a folder in the database and filesystem', async () => {
		const folderName = 'MyCleanTestFolder';
		const formData = new FormData();
		formData.append('folderName', folderName);
		formData.append('parentId', ''); // Root folder

		const response = await fetch(`${APP_URL}/home?/createFolder`, {
			method: 'POST',
			body: formData,
			headers: { 'X-Test-User-Id': TEST_USER_ID }
		});

		if (!response.ok && response.status !== 303) {
			const errorBody = await response.text();
			console.error('Fetch failed:', response.status, errorBody);
		}
		expect(
			[200, 201, 303].includes(response.status),
			`Unexpected status code: ${response.status}`
		).toBe(true);

		const results = await db
			.select()
			.from(table.folder)
			.where(
				and(
					eq(table.folder.name, folderName),
					eq(table.folder.userId, TEST_USER_ID),
					isNull(table.folder.parentFolderId)
				)
			)
			.limit(1);
		const createdFolder = results[0];

		expect(
			createdFolder,
			`Folder '${folderName}' not found in DB for user ${TEST_USER_ID}`
		).toBeDefined();
		expect(createdFolder?.name).toBe(folderName);
		expect(createdFolder?.userId).toBe(TEST_USER_ID);

		const expectedFolderPath = path.join(TEST_USER_STORAGE_PATH, folderName);
		try {
			await fsp.access(expectedFolderPath);
		} catch (error) {
			expect.fail(
				`Filesystem directory ${expectedFolderPath} was not created or is not accessible.`
			);
		}
	});

	// --- NEW TEST: Upload File ---
	it('POST /home?/upload should upload a file to the root directory', async () => {
		const fileName = `test-upload-${Date.now()}.txt`;
		const fileContent = 'This is the content of the test file.';
		const fileBlob = new Blob([fileContent], { type: 'text/plain' });

		const formData = new FormData();
		// Ensure 'file' matches the name attribute of your file input in the form
		formData.append('file', fileBlob, fileName);
		formData.append('parentId', ''); // Upload to root

		// --- Act ---
		const response = await fetch(`${APP_URL}/home?/upload`, {
			// Adjust URL if needed
			method: 'POST',
			body: formData,
			headers: {
				'X-Test-User-Id': TEST_USER_ID
			}
		});

		// --- Assert ---
		// 1. Check HTTP Response
		if (!response.ok && response.status !== 303) {
			const errorBody = await response.text();
			console.error('Upload fetch failed:', response.status, errorBody);
		}
		expect(
			[200, 201, 303].includes(response.status),
			`Unexpected upload status code: ${response.status}`
		).toBe(true);
		console.log(response);

		// 2. Check Database State
		const results = await db
			.select()
			.from(table.user_file)
			.where(
				and(
					eq(table.user_file.filename, fileName),
					eq(table.user_file.userId, TEST_USER_ID),
					isNull(table.user_file.folderId) // Check it's in the root
				)
			)
			.limit(1);
		const uploadedFileRecord = results[0];
		console.log(uploadedFileRecord);

		expect(
			uploadedFileRecord,
			`File record '${fileName}' not found in DB for user ${TEST_USER_ID}`
		).toBeDefined();
		expect(uploadedFileRecord?.filename).toBe(fileName);
		expect(uploadedFileRecord?.userId).toBe(TEST_USER_ID);
		expect(uploadedFileRecord?.mimetype).toBe('text/plain');
		expect(uploadedFileRecord?.fileSize).toBe(fileContent.length);

		// 3. Check Filesystem State
		// Assuming the URI in the DB matches the relative path used for storage
		const expectedFilePath = path.join(STORAGE_ROOT, uploadedFileRecord!.URI); // Use URI from DB record
		try {
			const actualContent = await fsp.readFile(expectedFilePath, 'utf-8');
			expect(actualContent).toBe(fileContent);
		} catch (error) {
			console.error(`Error reading uploaded file from filesystem: ${error}`);
			expect.fail(`Uploaded file ${expectedFilePath} was not found or content mismatch.`);
		}
	});

	// --- NEW TEST: Delete File ---
	it('POST /home?/deleteFile should delete a file from the database and filesystem', async () => {
		// --- Arrange: Create a file record and dummy file to delete ---
		const fileNameToDelete = `test-delete-${Date.now()}.txt`;
		const fileUri = `${TEST_USER_ID}/${fileNameToDelete}`; // Construct expected URI
		const fileContentToDelete = 'Delete me!';

		// Insert DB record
		const insertedFile = await db
			.insert(table.user_file)
			.values({
				filename: fileNameToDelete,
				userId: TEST_USER_ID,
				folderId: null, // Root folder
				URI: fileUri,
				mimetype: 'text/plain',
				extension: 'txt',
				fileSize: fileContentToDelete.length,
				uploadedAt: new Date()
			})
			.returning({ id: table.user_file.id }); // Get the generated ID

		const fileIdToDelete = insertedFile[0].id;
		expect(fileIdToDelete).toBeDefined();

		// Create dummy file on filesystem
		const absoluteFilePath = path.join(STORAGE_ROOT, fileUri);
		await fsp.mkdir(path.dirname(absoluteFilePath), { recursive: true });
		await fsp.writeFile(absoluteFilePath, fileContentToDelete);
		expect(
			async () => await fsp.access(absoluteFilePath),
			'Dummy file for deletion was not created'
		).not.toThrow();

		// Prepare form data for the delete action
		const formData = new FormData();
		// Ensure 'fileId' matches the expected field name in your delete action
		formData.append('file', fileIdToDelete.toString());

		// --- Act ---
		const response = await fetch(`${APP_URL}/home?/delete`, {
			// Adjust URL if needed
			method: 'POST',
			body: formData,
			headers: {
				'X-Test-User-Id': TEST_USER_ID
			}
		});

		// --- Assert ---
		// 1. Check HTTP Response
		if (!response.ok && response.status !== 303) {
			const errorBody = await response.text();
			console.error('Delete fetch failed:', response.status, errorBody);
		}
		expect(
			[200, 204, 303].includes(response.status), // 204 No Content is also common for delete
			`Unexpected delete status code: ${response.status}`
		).toBe(true);

		// 2. Verify file is gone from DB
		const results = await db
			.select()
			.from(table.user_file)
			.where(eq(table.user_file.id, fileIdToDelete))
			.limit(1);
		const deletedFileRecord = results[0];
		expect(
			deletedFileRecord,
			`File record with ID ${fileIdToDelete} was not deleted from DB.`
		).toBeUndefined();

		// 3. Verify file is gone from filesystem
		try {
			await fsp.access(absoluteFilePath);
			// If access doesn't throw, the file still exists (failure)
			expect.fail(`Filesystem file ${absoluteFilePath} was not deleted.`);
		} catch (error: any) {
			// Expecting ENOENT (Error NO ENTry/File not found)
			expect(error.code).toBe('ENOENT');
		}
	});
});
