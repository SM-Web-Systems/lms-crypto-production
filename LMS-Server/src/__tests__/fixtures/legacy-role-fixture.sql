-- Historical version-zero test rows only. Never included in canonical/runtime schema.
-- Production creation paths use explicit grants at authorization version one.
CREATE TRIGGER trg_fixture_legacy_roles AFTER INSERT ON users FOR EACH ROW
WHEN NEW.authorization_version = 0
BEGIN
 INSERT OR IGNORE INTO user_roles(user_id,role_id)
 SELECT NEW.id,CASE NEW.role WHEN 'student' THEN 'role_student' WHEN 'lecturer' THEN 'role_instructor' WHEN 'admin' THEN 'role_admin' END
 WHERE NEW.role IN ('student','lecturer','admin');
END;
