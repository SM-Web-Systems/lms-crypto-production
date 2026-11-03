# RBAC Permission Matrix — Instawards D2

> **Session:** RBAC Assessment for Instawards D2
> **Date:** 2026-10-13
> **Source:** `LMS-Server/src/config/database.ts` seed data (lines 1129-1535)
> **Baseline LMS SHA:** `470b634`

---

## Roles (12 system roles)

| ID | Name | Label | SOW Category | Perm Count |
|----|------|-------|--------------|------------|
| role_student | student | Student | Learner | 19 |
| role_supporter_student | super-student | Super Student | Learner (elevated) | 21 |
| role_parent | parent | Parent | *(Not in SOW)* | 28 |
| role_teacher | teacher | Teacher | *(Not in SOW)* | 31 |
| role_employer | employer | Employer | Corporate Sponsor | 27 |
| role_sponsor | sponsor | Sponsor | Corporate Sponsor | 30 |
| role_instructor | instructor | Instructor | Instructor | 27 |
| role_ta | teaching-assistant | Teaching Assistant | *(Not in SOW)* | 11 |
| role_admin | admin | Administrator | Administrator | 72 |
| role_admin2 | admin-2 | Extended Administrator | Administrator | 81 |
| role_super_admin | super-admin | Super Administrator | Administrator | 93 |
| role_custom | custom-user | Custom User | *(Not in SOW)* | 1 |

> **Note:** `reward.give` (deprecated) exists in the permissions table but is not
> assigned to any role, including super-admin. Total unique permissions: 94.
> Super-admin holds 93 (all except the deprecated one).

---

## Permissions (94 total, 21 categories)

### course (10)

| Permission | STU | S-STU | PAR | TCH | EMP | SPON | INST | TA | ADM | ADM2 | S-ADM |
|------------|-----|-------|-----|-----|-----|------|------|----|-----|------|-------|
| course.view | x | x | x | x | x | x | x | x | x | x | x |
| course.create | | | | | | | x | | x | x | x |
| course.manage | | | | x | | | x | | x | x | x |
| course.delete | | | | | | | | | x | x | x |
| course.enroll | x | x | | | | | | | x | x | x |
| course.enroll_others | | | | | | | x | | x | x | x |
| course.submit | x | x | | | | | | | x | x | x |
| course.grade | | | | | | | x | | x | x | x |
| course.grade_pending | | x | | | | | | x | x | x | x |
| course.approve | | | | | | | | | x | x | x |

### billing (8)

| Permission | STU | S-STU | PAR | TCH | EMP | SPON | INST | TA | ADM | ADM2 | S-ADM |
|------------|-----|-------|-----|-----|-----|------|------|----|-----|------|-------|
| billing.view_own | x | x | x | x | x | x | | | x | x | x |
| billing.view_assigned | | | x | | | | | | | x | x |
| billing.view_all | | | | | | x | | | x | x | x |
| billing.create | | | | | | | | | | x | x |
| billing.confirm | | | | | | | | | x | x | x |
| billing.waive | | | | | | | | | x | x | x |
| billing.refund | | | | | | | | | | x | x |
| billing.pay_for_student | | | x | x | x | x | | | | | x |

### wallet (6)

| Permission | STU | S-STU | PAR | TCH | EMP | SPON | INST | TA | ADM | ADM2 | S-ADM |
|------------|-----|-------|-----|-----|-----|------|------|----|-----|------|-------|
| wallet.view_own | x | x | x | x | x | x | | | x | x | x |
| wallet.manage_own | x | x | | | | | | | x | x | x |
| wallet.fund | | | x | x | x | x | | | x | x | x |
| wallet.view_assigned | | | | | | | | | | | x |
| student_wallet.read_assigned | | | x | | | | | | | | x |
| student_wallet.write_assigned | | | x | | | | | | | | x |

### user (9)

| Permission | STU | S-STU | PAR | TCH | EMP | SPON | INST | TA | ADM | ADM2 | S-ADM |
|------------|-----|-------|-----|-----|-----|------|------|----|-----|------|-------|
| user.view_self | x | x | x | x | x | x | x | x | x | x | x |
| user.view_all | | | | | | | x | | x | x | x |
| user.create | | | x | | | | | | x | x | x |
| user.manage | | | | | | | | | x | x | x |
| user.delete | | | | | | | | | | x | x |
| user.assign_role | | | | | | | | | | x | x |
| user.suspend | | | | | | | | | x | x | x |
| student.view_assigned | | | x | x | x | x | | | x | x | x |
| student.login_history | | | x | x | x | x | | | x | x | x |

### cohort (6)

| Permission | STU | S-STU | PAR | TCH | EMP | SPON | INST | TA | ADM | ADM2 | S-ADM |
|------------|-----|-------|-----|-----|-----|------|------|----|-----|------|-------|
| cohort.view_own | | | | | x | x | | | x | x | x |
| cohort.view_all | | | | | | x | | | x | x | x |
| cohort.create | | | | | x | x | | | x | x | x |
| cohort.manage | | | | | | x | | | x | x | x |
| cohort.bulk_apply | | | | | | x | | | | x | x |
| cohort.bulk_pay | | | | | | x | | | | x | x |

### certificate (6)

| Permission | STU | S-STU | PAR | TCH | EMP | SPON | INST | TA | ADM | ADM2 | S-ADM |
|------------|-----|-------|-----|-----|-----|------|------|----|-----|------|-------|
| certificate.view_own | x | x | | | | | | | x | x | x |
| certificate.apply | x | x | | | | | | | x | x | x |
| certificate.approve | | | | | | | x | | x | x | x |
| certificate.reject | | | | | | | x | | x | x | x |
| certificate.mint | | | | | | | | | x | x | x |
| certificate.badge_view | x | x | | | | | | | x | x | x |

### quiz (5)

| Permission | STU | S-STU | PAR | TCH | EMP | SPON | INST | TA | ADM | ADM2 | S-ADM |
|------------|-----|-------|-----|-----|-----|------|------|----|-----|------|-------|
| quiz.view | x | x | | x | | | x | x | x | x | x |
| quiz.create | | | | x | | | x | | x | x | x |
| quiz.manage | | | | | | | x | | x | x | x |
| quiz.submit | x | x | | | | | | | x | x | x |
| quiz.view_analytics | | | | | | | x | | x | x | x |

### announcement (4)

| Permission | STU | S-STU | PAR | TCH | EMP | SPON | INST | TA | ADM | ADM2 | S-ADM |
|------------|-----|-------|-----|-----|-----|------|------|----|-----|------|-------|
| announcement.view | x | x | x | x | x | x | x | x | x | x | x |
| announcement.create | | | | x | | | | | x | x | x |
| announcement.manage | | | | | | | | | x | x | x |
| announcement.delete | | | | | | | | | x | x | x |

### document (4)

| Permission | STU | S-STU | PAR | TCH | EMP | SPON | INST | TA | ADM | ADM2 | S-ADM |
|------------|-----|-------|-----|-----|-----|------|------|----|-----|------|-------|
| document.view | x | x | x | x | x | x | x | x | x | x | x |
| document.upload | | | | x | | | x | | x | x | x |
| document.manage | | | | | | | x | | x | x | x |
| document.delete | | | | | | | | | x | x | x |

### forum (4)

| Permission | STU | S-STU | PAR | TCH | EMP | SPON | INST | TA | ADM | ADM2 | S-ADM |
|------------|-----|-------|-----|-----|-----|------|------|----|-----|------|-------|
| forum.view | x | x | x | x | x | x | x | x | x | x | x |
| forum.post | x | x | | | | | | | x | x | x |
| forum.moderate | | | | | | | x | | x | x | x |
| forum.view_deleted | | | | | | | | | x | x | x |

### reward (14)

| Permission | STU | S-STU | PAR | TCH | EMP | SPON | INST | TA | ADM | ADM2 | S-ADM |
|------------|-----|-------|-----|-----|-----|------|------|----|-----|------|-------|
| reward.view_own | x | x | x | x | x | x | | | x | x | x |
| reward.give | | | | | | | | | x | x | x |
| reward.manage | | | | | | | | | x | x | x |
| reward.create | | | x | x | x | x | | | x | x | x |
| reward.fund | | | x | x | x | x | | | x | x | x |
| reward.activate | | | x | x | x | x | | | x | x | x |
| reward.approve | | | x | x | x | x | | | x | x | x |
| reward.cancel | | | x | x | x | x | | | x | x | x |
| reward.view_assigned | x | x | | | | | | | x | x | x |
| reward.refund | | | | | | x | | | x | x | x |
| reward.release | | | x | x | x | x | | | x | x | x |
| reward.setup | | | x | x | x | x | | | | | x |
| reward.refund_review | | | | | | | | | x | x | x |
| reward.refund_resolve | | | | | | | | | | x | x |

### system (4)

| Permission | STU | S-STU | PAR | TCH | EMP | SPON | INST | TA | ADM | ADM2 | S-ADM |
|------------|-----|-------|-----|-----|-----|------|------|----|-----|------|-------|
| system.manage_roles | | | | | | | | | | x | x |
| system.manage_permissions | | | | | | | | | | | x |
| system.view_audit_log | | | | | | | | | x | x | x |
| system.config | | | | | | | | | | | x |

### Other categories

| Permission | STU | S-STU | PAR | TCH | EMP | SPON | INST | TA | ADM | ADM2 | S-ADM |
|------------|-----|-------|-----|-----|-----|------|------|----|-----|------|-------|
| tenant.manage | | | | | | | | | | | x |
| tenant.view | | | | | | | | | x | x | x |
| email.manage | | | | | | | | | x | x | x |
| notification.broadcast | | | | | | | | | x | x | x |
| group.create | | | x | x | x | | | | x | x | x |
| group.manage | | | x | x | x | | | | x | x | x |
| perks.access | | x | | | | | | | x | x | x |
| session.manage_own | x | x | x | x | x | x | x | x | x | x | x |
| session.manage_any | | | | | | | | | x | x | x |
| impact_report.read | | | | | | x | | | x | x | x |
| privacy.view_deleted_identity | | | | | | | | | | x | x |
| message.delete_own | x | x | | | | | | | x | x | x |
| message.delete_any | | | | | | | | | x | x | x |
| message.view_deleted | | | | | | | | | x | x | x |

---

## Legacy Bridge

```sql
CREATE TRIGGER trg_auto_assign_user_role
AFTER INSERT ON users
WHEN NEW.role IN ('student', 'lecturer', 'admin')
BEGIN
  INSERT OR IGNORE INTO user_roles (user_id, role_id)
  VALUES (NEW.id,
    CASE NEW.role
      WHEN 'student' THEN 'role_student'
      WHEN 'lecturer' THEN 'role_instructor'
      WHEN 'admin' THEN 'role_admin'
    END);
END;
```
