import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';

const results = await db.select().from(table.user);

console.log(results);
