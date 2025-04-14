import { pgTable, serial, text, integer, timestamp, uuid, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const user = pgTable('user', {
	id: text('id').primaryKey(),
	username: text('username').notNull().unique(),
	passwordHash: text('password_hash').notNull()
});

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	files: many(user_file),
	folders: many(folder)
}));

export const session = pgTable('session', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),
	expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull()
});

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	})
}));

export const folder = pgTable('folder', {
	id: uuid('id').defaultRandom().primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	parentFolderId: uuid('parent_folder_id').references(() => folder.id, { onDelete: 'cascade' }),
	URI: text('uri').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export const folderRelations = relations(folder, ({ one, many }) => ({
	user: one(user, {
		fields: [folder.userId],
		references: [user.id]
	}),
	parentFolder: one(folder, {
		fields: [folder.parentFolderId],
		references: [folder.id],
		relationName: 'parentFolder'
	}),
	subFolders: many(folder, { relationName: 'parentFolder' }),
	files: many(user_file)
}));

export const user_file = pgTable('user_file', {
	id: serial('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	filename: text('filename').notNull(),
	extension: text('extension').notNull(),
	mimetype: text('mimetype').notNull(),
	uploadedAt: timestamp('uploaded_at', { withTimezone: true, mode: 'date' }).notNull(),
	fileSize: integer('file_size').notNull(),
	URI: text('uri').notNull(),
	folderId: uuid('folder_id').references(() => folder.id, { onDelete: 'cascade' })
});

export const userFileRelations = relations(user_file, ({ one }) => ({
	user: one(user, {
		fields: [user_file.userId],
		references: [user.id]
	}),
	folder: one(folder, {
		fields: [user_file.folderId],
		references: [folder.id]
	})
}));

export type Session = typeof session.$inferSelect;
export type User = typeof user.$inferSelect;
export type UserFile = typeof user_file.$inferSelect;
export type Folder = typeof folder.$inferSelect;
