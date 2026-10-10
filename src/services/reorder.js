const { AppError } = require('../utils/http');
const { audit } = require('./audit');

async function move(c, table, id, destination, actorId) {
  const isSubtask = table === 'subtasks';
  const scope = isSubtask ? ' WHERE task_id=?' : '';
  const args = isSubtask ? [destination.taskId] : [];
  // This stable complete-scope lock serializes all moves in the relevant parent.
  const [all] = await c.execute(`SELECT id,status,position FROM ${table}${scope} ORDER BY status, position, id FOR UPDATE`, args);
  const item = all.find((row) => row.id === Number(id));
  if (!item) throw new AppError(404, 'Record not found', 'NOT_FOUND');
  const before = new Map(all.map((row) => [row.id, { status: row.status, position: row.position }]));
  const remaining = all.filter((row) => row.id !== item.id);
  const destinationColumn = remaining.filter((row) => row.status === destination.status);
  const insertionPoint = Math.max(0, Math.min(destination.position, destinationColumn.length));
  destinationColumn.splice(insertionPoint, 0, { id: item.id, status: destination.status });

  const desired = new Map();
  for (const status of new Set([item.status, destination.status])) {
    const column = status === destination.status ? destinationColumn : remaining.filter((row) => row.status === status);
    column.forEach((row, position) => desired.set(row.id, { status, position }));
  }
  const changes = [];
  for (const row of all) {
    const next = desired.get(row.id);
    if (!next || (row.status === next.status && row.position === next.position)) continue;
    await c.execute(`UPDATE ${table} SET status=?, position=? WHERE id=?`, [next.status, next.position, row.id]);
    const change = { id: row.id, old: before.get(row.id), new: next };
    changes.push(change);
    await audit(c, actorId, table.slice(0, -1), row.id, row.id === item.id ? 'MOVED' : 'REORDERED', change.old, change.new);
  }
  return { status: destination.status, position: insertionPoint, changes };
}
module.exports = { move };
