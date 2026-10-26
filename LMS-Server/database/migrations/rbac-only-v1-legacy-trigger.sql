CREATE TRIGGER IF NOT EXISTS trg_auto_assign_user_role
AFTER INSERT ON users
FOR EACH ROW
WHEN NEW.role IN ('student', 'lecturer', 'admin')
BEGIN
  INSERT OR IGNORE INTO user_roles (user_id, role_id)
  VALUES (
    NEW.id,
    CASE NEW.role
      WHEN 'student' THEN 'role_student'
      WHEN 'lecturer' THEN 'role_instructor'
      WHEN 'admin' THEN 'role_admin'
    END
  );
END;
