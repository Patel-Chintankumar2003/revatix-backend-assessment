-- Passwords are intentionally deterministic for assessment use only: AdminPass123!, ManagerPass123!, EmployeePass123!
INSERT INTO
  users (name, email, password_hash, role)
VALUES
  (
    'Ada Admin',
    'admin@synergytask.test',
    '$2b$10$oZRK0otFsP/osxEMLcAo2uTnfWsH0NKjUx10n4/Ag9Jtv4n.rJwQG',
    'ADMIN'
  ),
  (
    'Mina Manager',
    'manager@synergytask.test',
    '$2b$10$oj9Pj0dA6NYCV.TmszyFf.IBqa5X8nHAxGzmfn1moHytOszwkh43i',
    'MANAGER'
  ),
  (
    'Eli Employee',
    'employee1@synergytask.test',
    '$2b$10$ZFUWWwy345HBX5CbXeV3Y.PjJ19sj8wSSodoM5KlzlcaOsqHcK7Bm',
    'EMPLOYEE'
  ),
  (
    'Sam Employee',
    'employee2@synergytask.test',
    '$2b$10$ZFUWWwy345HBX5CbXeV3Y.PjJ19sj8wSSodoM5KlzlcaOsqHcK7Bm',
    'EMPLOYEE'
  );

INSERT INTO
  tasks (
    title,
    description,
    deadline,
    priority,
    status,
    position,
    created_by
  )
VALUES
  (
    'Onboard warehouse team',
    'Initial onboarding checklist',
    '2026-12-01 17:00:00',
    'HIGH',
    'TODO',
    0,
    2
  );

INSERT INTO
  subtasks (task_id, title, description, status, position)
VALUES
  (
    1,
    'Complete safety training',
    'All assigned staff',
    'TODO',
    0
  );

INSERT INTO
  subtask_assignments (subtask_id, employee_id)
VALUES
  (1, 3),
  (1, 4);