-- Hanya untuk local/development.
-- Kredensial: admin@hris-restu.test / restu123
-- Ganti password sebelum digunakan di environment bersama atau production.

START TRANSACTION;

INSERT INTO users (
  uid,
  username,
  email,
  password_hash,
  full_name,
  status,
  must_change_password,
  failed_login_attempts
)
SELECT
  UUID(),
  'administrator.hris',
  'admin@hris-restu.test',
  '$argon2id$v=19$m=65536,t=3,p=4$wQbFKsEQmkSKHrATh64bdA$bB+OqeBo4dlXHelx2ahzW3OY8WNtnmMDWgY7mUjfHYo',
  'Administrator HRIS',
  'ACTIVE',
  0,
  0
WHERE NOT EXISTS (
  SELECT 1
  FROM users
  WHERE email = 'admin@hris-restu.test'
     OR username = 'administrator.hris'
);

INSERT INTO user_roles (uid, user_id, role_id)
SELECT UUID(), u.id, r.id
FROM users u
JOIN roles r ON r.code = 'SUPER_ADMIN'
WHERE u.email = 'admin@hris-restu.test'
  AND NOT EXISTS (
    SELECT 1
    FROM user_roles ur
    WHERE ur.user_id = u.id AND ur.role_id = r.id
  );

-- Super Admin memperoleh seluruh permission melalui role_permissions seed.
-- Seluruh site tidak perlu baris user_site_access karena middleware memberi bypass Super Admin.

COMMIT;
