#!/usr/bin/env node

/**
 * One-time safe reconciliation for historical tasks that are already Done and
 * contain explicit owner acceptance evidence. Ambiguous Done tasks are left alone.
 *
 * Usage on the production host after deploy:
 *   node scripts/archive-signed-off-done-tasks.mjs
 */
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("STOP: DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

try {
  const candidates = await sql`
    select distinct t.id, t.title
    from tasks t
    join task_messages m on m.task_id = t.id
    where t.status = 'done'
      and t.archived_at is null
      and (
        upper(m.body) like 'OWNER ACCEPTED%'
        or upper(m.body) like 'APPROVED — APPROVED DIRECTLY FROM THE KANBAN CARD%'
      )
    order by t.id
  `;

  if (!candidates.length) {
    console.log("PASS: no explicitly signed-off Done tasks require archival");
    process.exit(0);
  }

  console.log(`Found ${candidates.length} explicitly signed-off Done task(s).`);

  for (const task of candidates) {
    await sql.begin(async (tx) => {
      const [locked] = await tx`
        select id, project, attachments, report
        from tasks
        where id = ${task.id} and status = 'done' and archived_at is null
        for update
      `;
      if (!locked) return;

      const archivedAt = new Date();
      await tx`update tasks set archived_at = ${archivedAt} where id = ${task.id}`;
      await tx`
        insert into task_messages (task_id, author, body, created_at)
        values (${task.id}, 'Mission Control', ${`Historical reconciliation — task archived after recorded owner sign-off at ${archivedAt.toISOString()}.`}, ${archivedAt})
      `;

      console.log(`ARCHIVED #${task.id}: ${task.title}`);
    });
  }

  console.log("PASS: historical signed-off Done reconciliation complete");
} finally {
  await sql.end({ timeout: 5 });
}
