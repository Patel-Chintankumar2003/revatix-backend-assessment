const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config({ quiet: true });

const dbName = process.env.TEST_DB_NAME || 'synergytask_test';
const fixturePrefix = `__synergytest_${Date.now()}_`;
let admin, employeeA, employeeB, connection, app, server, baseUrl;

function config(database) { return { host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database, multipleStatements: true, timezone: 'Z' }; }
async function request(pathname, token, method = 'GET', body) {
  const response = await fetch(`${baseUrl}${pathname}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}
function token(user) { return jwt.sign({ id: user.id, role: user.role, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1h' }); }

test.before(async () => {
  assert.ok(process.env.JWT_SECRET, 'JWT_SECRET must be set for integration tests');
  const root = await mysql.createConnection(config(undefined));
  await root.query(`CREATE DATABASE IF NOT EXISTS \`${dbName.replace(/`/g, '')}\``);
  await root.end();
  connection = await mysql.createConnection(config(dbName));
  const [tables] = await connection.query("SHOW TABLES LIKE 'users'");
  if (!tables.length) await connection.query(fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8'));
  const hash = '$2b$10$ZFUWWwy345HBX5CbXeV3Y.PjJ19sj8wSSodoM5KlzlcaOsqHcK7Bm';
  const users = [[`${fixturePrefix}admin@test.local`, 'ADMIN'], [`${fixturePrefix}employee-a@test.local`, 'EMPLOYEE'], [`${fixturePrefix}employee-b@test.local`, 'EMPLOYEE']];
  for (const [email, role] of users) await connection.execute('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)', [email, email, hash, role]);
  const [created] = await connection.execute('SELECT id,email,role FROM users WHERE email LIKE ? ORDER BY id', [`${fixturePrefix}%`]);
  [admin, employeeA, employeeB] = created;
  process.env.DB_NAME = dbName;
  ({ pool: connection } = require('../src/config/database'));
  app = require('../src/app'); server = app.listen(0); await new Promise((resolve) => server.once('listening', resolve)); baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test('MySQL reordering is contiguous for same-column and cross-column moves and audits affected rows', async () => {
  const { transaction } = require('../src/config/database'); const { move } = require('../src/services/reorder');
  const [created] = await connection.execute("INSERT INTO tasks(title,deadline,priority,status,position,created_by) VALUES (?,UTC_TIMESTAMP(),'MEDIUM','TODO',0,?),(?,UTC_TIMESTAMP(),'MEDIUM','TODO',1,?),(?,UTC_TIMESTAMP(),'MEDIUM','TODO',2,?)", [`${fixturePrefix}one`, admin.id, `${fixturePrefix}two`, admin.id, `${fixturePrefix}three`, admin.id]);
  const firstId = created.insertId;
  await transaction((c) => move(c, 'tasks', firstId, { status: 'TODO', position: 99 }, admin.id));
  await transaction((c) => move(c, 'tasks', firstId, { status: 'TODO', position: 0 }, admin.id));
  await transaction((c) => move(c, 'tasks', firstId + 2, { status: 'IN_PROGRESS', position: 0 }, admin.id));
  const [rows] = await connection.execute('SELECT id,status,position FROM tasks WHERE id BETWEEN ? AND ? ORDER BY status,position', [firstId, firstId + 2]);
  assert.deepEqual(rows.filter(x => x.status === 'TODO').map(x => x.position), [0, 1]);
  assert.deepEqual(rows.filter(x => x.status === 'IN_PROGRESS').map(x => x.position), [0]);
  const [logs] = await connection.execute("SELECT action FROM audit_logs WHERE entity_type='task' AND entity_id BETWEEN ? AND ?", [firstId, firstId + 2]);
  assert.ok(logs.some(x => x.action === 'MOVED')); assert.ok(logs.some(x => x.action === 'REORDERED'));
});

test('MySQL-backed API prevents concurrent overlaps and accepts adjacent shifts', async () => {
  const auth = token(admin); const payload = { employeeId: employeeA.id, startTime: '2031-01-01T09:00:00Z', endTime: '2031-01-01T17:00:00Z' };
  const results = await Promise.all([request('/api/shifts', auth, 'POST', payload), request('/api/shifts', auth, 'POST', payload)]);
  assert.equal(results.filter(x => x.status === 201).length, 1); assert.equal(results.filter(x => x.status === 409).length, 1);
  const adjacent = await request('/api/shifts', auth, 'POST', { ...payload, startTime: '2031-01-01T17:00:00Z', endTime: '2031-01-01T22:00:00Z' }); assert.equal(adjacent.status, 201);
});

test('MySQL-backed multi-assignment is idempotent and does not write phantom audit records', async () => {
  const auth = token(admin); const task = await request('/api/tasks', auth, 'POST', { title: `${fixturePrefix}assignment`, deadline: '2031-02-01T00:00:00Z', priority: 'LOW', status: 'TODO' });
  const subtask = await request(`/api/tasks/${task.body.data.id}/subtasks`, auth, 'POST', { title: 'assign me' });
  const endpoint = `/api/subtasks/${subtask.body.data.id}/assignments`;
  assert.equal((await request(endpoint, auth, 'POST', { employeeIds: [employeeA.id, employeeB.id] })).status, 201);
  const repeat = await request(endpoint, auth, 'POST', { employeeIds: [employeeA.id, employeeB.id] }); assert.deepEqual(repeat.body.data.insertedEmployeeIds, []);
  const [logs] = await connection.execute("SELECT * FROM audit_logs WHERE entity_type='subtask_assignment' AND entity_id=? AND action='ASSIGNED'", [subtask.body.data.id]); assert.equal(logs.length, 2);
});

test('subtask status PATCH reorders transactionally and task detail returns an empty employee array', async () => {
  const auth = token(admin);
  const task = await request('/api/tasks', auth, 'POST', { title: `${fixturePrefix}status`, deadline: '2031-03-01T00:00:00Z', priority: 'LOW', status: 'TODO' });
  const first = await request(`/api/tasks/${task.body.data.id}/subtasks`, auth, 'POST', { title: 'first' });
  const second = await request(`/api/tasks/${task.body.data.id}/subtasks`, auth, 'POST', { title: 'second' });
  const changed = await request(`/api/subtasks/${first.body.data.id}`, auth, 'PATCH', { status: 'IN_PROGRESS' });
  assert.equal(changed.status, 200); assert.equal(changed.body.data.position, 0);
  const detail = await request(`/api/tasks/${task.body.data.id}`, auth);
  const todo = detail.body.data.subtasks.filter(x => x.status === 'TODO');
  assert.deepEqual(todo.map(x => x.position), [0]);
  assert.deepEqual(detail.body.data.subtasks.find(x => x.id === second.body.data.id).employees, []);
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (connection) { const [users] = await connection.execute('SELECT id FROM users WHERE email LIKE ?', [`${fixturePrefix}%`]); const ids = users.map(x => x.id); if (ids.length) { const marks = ids.map(() => '?').join(','); await connection.execute(`DELETE FROM audit_logs WHERE actor_id IN (${marks})`, ids); await connection.execute(`DELETE FROM shifts WHERE created_by IN (${marks}) OR employee_id IN (${marks})`, [...ids, ...ids]); await connection.execute(`DELETE FROM tasks WHERE created_by IN (${marks})`, ids); await connection.execute(`DELETE FROM users WHERE id IN (${marks})`, ids); } await connection.end(); }
});
