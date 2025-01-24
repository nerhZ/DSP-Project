import { pgTable, serial, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const user = pgTable('user', {
	id: text('id').primaryKey(),
	username: text('username').notNull().unique(),
	passwordHash: text('password_hash').notNull()
});

export const session = pgTable('session', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),
	expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull()
});

export const user_file = pgTable('user_file', {
	id: serial('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),
	filename: text('filename').notNull(),
	extension: text('extension').notNull(),
	mimetype: text('mimetype').notNull(),
	uploadedAt: timestamp('uploaded_at', { withTimezone: true, mode: 'date' }).notNull(),
	fileSize: integer('file_size').notNull()
});

export type Session = typeof session.$inferSelect;
export type User = typeof user.$inferSelect;
export type UserFile = typeof user_file.$inferSelect;
