import { pgTable, serial, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const user = pgTable('user', {
	id: text('id').primaryKey(),
	age: integer('age'),
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

export const test123 = pgTable('test123', {
	id: serial('id').primaryKey(),
	userID: text('userID').notNull().unique(),
	test: text('test').notNull()
});

export type Session = typeof session.$inferSelect;

export type User = typeof user.$inferSelect;
