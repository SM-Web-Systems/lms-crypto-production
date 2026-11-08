# EAS merge compatibility

EAS CLI 25.3 consumes the default callable API of ts-deepmerge 6. The patched 8.0.0 exposes a named `merge` function. This package exports that unmodified function for the existing consumer, retaining its own `withOptions` behavior. The npm alias keeps upstream 8.0.0 and its advisory identity visible to audit.

The override applies to EAS CLI only. The dependency acceptance suite runs the actual offline EAS project-config generator against a temporary synthetic project, verifies preserved and updated nested fields, and exercises hostile prototype-method input. No cloud project is created or changed. Remove this boundary when the pinned CLI supports the patched named export directly, after repeating tooling checks.
