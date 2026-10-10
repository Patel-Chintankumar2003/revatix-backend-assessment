async function audit(
  c,
  actorId,
  entityType,
  entityId,
  action,
  oldValues,
  newValues,
) {
  await c.execute(
    "INSERT INTO audit_logs (actor_id,entity_type,entity_id,action,old_values,new_values) VALUES (?,?,?,?,?,?)",
    [
      actorId,
      entityType,
      entityId,
      action,
      JSON.stringify(oldValues ?? null),
      JSON.stringify(newValues ?? null),
    ],
  );
}
module.exports = { audit };
