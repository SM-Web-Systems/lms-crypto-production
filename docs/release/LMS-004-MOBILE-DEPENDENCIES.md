# LMS-004 — mobile high/critical dependency remediation

The installed full graph now reports **zero high and zero critical** findings, down from nine high findings in the audit. It remains on Expo SDK 54, React Native 0.81.5 and React 19.1.0. Moderate and low findings remain tracked separately in LMS-005.

## Compatibility decisions

- Refresh the lock within existing application/tooling ranges, pin React Test Renderer to the installed React 19.1.0, and use patched Joi 17.13.9 and node-forge 1.4.3 resolutions.
- Use Metro 0.83.8 in the existing compatible minor line. It removes the vulnerable image-size dependency; regression checks read actual project PNG dimensions on Android/iOS.
- Expo Router 6 consumes named CommonJS query-string methods. Its old parser/decoder chain has no safe patch in that line. A small local adapter exposes the default API object of unmodified `query-string@9.5.1`, retained as an auditable npm alias. No parser is vendored. The override is scoped to Router, and Jest explicitly transforms the new ES-module dependencies.
- Test the installed Router serializer, URL/Unicode/repeated-parameter behavior, and large malformed percent-encoding inputs in a process with a deadline. Keep the parser adapter until a compatible Router consumes the patched API directly.
- Raise the mobile CI audit gate from critical to high and run the new compatibility checks there. No audit exclusions, forced peer installs, SDK major upgrade or EAS downgrade are used.

## Local validation

Clean npm 10.9.9 install succeeds. The dependency checks (3), EAS/offline tooling checks (5), local setup checks (5), TypeScript, all 159 Jest tests, and both Android/iOS Hermes exports pass. Offline EAS validation reads all four build profiles across both platforms and the Android submission profile without accessing cloud accounts. Expo's offline compatibility check reports dependencies up to date, but explicitly warns that offline checking is limited.

The full native run uses LMS-007's shared lazy-component test setup. The first attempt reproduced a cold transform timeout; the complete final run passes with an empty transform cache and standard deadlines. Exports are bundle checks, not signed binary, physical-device or staging login acceptance.

See the [validation receipt](evidence/lms-004-validation.json) for source/result hashes and task closure. Keep the remaining advisories visible in LMS-005.
