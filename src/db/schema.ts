import { relations } from 'drizzle-orm';
import {
  boolean,
  foreignKey,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('Role', ['USER', 'MODERATOR', 'ADMIN']);

export const voteTypeEnum = pgEnum('VoteType', ['UPVOTE', 'DOWNVOTE']);

export const user = pgTable(
  'User',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    email: text('email').notNull(),
    username: text('username').notNull(),
    password: text('password').notNull(),
    fullName: text('fullName').notNull(),
    prodi: text('prodi').notNull(),
    role: roleEnum('role').default('USER').notNull(),
    createdAt: timestamp('createdAt', { precision: 3, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('User_email_key').on(table.email),
    uniqueIndex('User_username_key').on(table.username),
  ],
);

export const subforum = pgTable(
  'Subforum',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
  },
  (table) => [
    uniqueIndex('Subforum_name_key').on(table.name),
    uniqueIndex('Subforum_slug_key').on(table.slug),
  ],
);

export const thread = pgTable(
  'Thread',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: text('title').notNull(),
    content: text('content').notNull(),
    imageUrl: text('imageUrl'),
    isAnonymous: boolean('isAnonymous').default(false).notNull(),
    authorId: text('authorId').notNull(),
    subforumId: text('subforumId').notNull(),
    createdAt: timestamp('createdAt', { precision: 3, mode: 'date' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deletedAt', { precision: 3, mode: 'date' }),
  },
  (table) => [
    foreignKey({
      name: 'Thread_authorId_fkey',
      columns: [table.authorId],
      foreignColumns: [user.id],
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      name: 'Thread_subforumId_fkey',
      columns: [table.subforumId],
      foreignColumns: [subforum.id],
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
  ],
);

export const comment = pgTable(
  'Comment',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    content: text('content').notNull(),
    authorId: text('authorId').notNull(),
    threadId: text('threadId').notNull(),
    parentId: text('parentId'),
    createdAt: timestamp('createdAt', { precision: 3, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: 'Comment_authorId_fkey',
      columns: [table.authorId],
      foreignColumns: [user.id],
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      name: 'Comment_threadId_fkey',
      columns: [table.threadId],
      foreignColumns: [thread.id],
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      name: 'Comment_parentId_fkey',
      columns: [table.parentId],
      foreignColumns: [table.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
  ],
);

export const vote = pgTable(
  'Vote',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    type: voteTypeEnum('type').notNull(),
    userId: text('userId').notNull(),
    threadId: text('threadId'),
    commentId: text('commentId'),
  },
  (table) => [
    uniqueIndex('Vote_userId_threadId_key').on(table.userId, table.threadId),
    uniqueIndex('Vote_userId_commentId_key').on(table.userId, table.commentId),
    foreignKey({
      name: 'Vote_userId_fkey',
      columns: [table.userId],
      foreignColumns: [user.id],
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      name: 'Vote_threadId_fkey',
      columns: [table.threadId],
      foreignColumns: [thread.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    foreignKey({
      name: 'Vote_commentId_fkey',
      columns: [table.commentId],
      foreignColumns: [comment.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
  ],
);

export const authentication = pgTable('Authentication', {
  token: text('token').primaryKey(),
});

export const userRelations = relations(user, ({ many }) => ({
  threads: many(thread),
  comments: many(comment),
  votes: many(vote),
}));

export const subforumRelations = relations(subforum, ({ many }) => ({
  threads: many(thread),
}));

export const threadRelations = relations(thread, ({ one, many }) => ({
  author: one(user, {
    fields: [thread.authorId],
    references: [user.id],
  }),
  subforum: one(subforum, {
    fields: [thread.subforumId],
    references: [subforum.id],
  }),
  comments: many(comment),
  votes: many(vote),
}));

export const commentRelations = relations(comment, ({ one, many }) => ({
  author: one(user, {
    fields: [comment.authorId],
    references: [user.id],
  }),
  thread: one(thread, {
    fields: [comment.threadId],
    references: [thread.id],
  }),
  parent: one(comment, {
    fields: [comment.parentId],
    references: [comment.id],
    relationName: 'CommentReplies',
  }),
  replies: many(comment, {
    relationName: 'CommentReplies',
  }),
  votes: many(vote),
}));

export const voteRelations = relations(vote, ({ one }) => ({
  user: one(user, {
    fields: [vote.userId],
    references: [user.id],
  }),
  thread: one(thread, {
    fields: [vote.threadId],
    references: [thread.id],
  }),
  comment: one(comment, {
    fields: [vote.commentId],
    references: [comment.id],
  }),
}));

export type Role = (typeof roleEnum.enumValues)[number];
export type VoteType = (typeof voteTypeEnum.enumValues)[number];

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

export type Subforum = typeof subforum.$inferSelect;
export type NewSubforum = typeof subforum.$inferInsert;

export type Thread = typeof thread.$inferSelect;
export type NewThread = typeof thread.$inferInsert;

export type Comment = typeof comment.$inferSelect;
export type NewComment = typeof comment.$inferInsert;

export type Vote = typeof vote.$inferSelect;
export type NewVote = typeof vote.$inferInsert;

export type Authentication = typeof authentication.$inferSelect;
export type NewAuthentication = typeof authentication.$inferInsert;
