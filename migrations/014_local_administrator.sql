ALTER TABLE users ADD COLUMN isLocalAdmin INTEGER NOT NULL DEFAULT 0 CHECK (isLocalAdmin IN (0, 1));
UPDATE users SET isLocalAdmin = 1 WHERE id = (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1);
CREATE UNIQUE INDEX users_single_local_admin ON users(isLocalAdmin) WHERE isLocalAdmin = 1;
