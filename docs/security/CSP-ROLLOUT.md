# CSP rollout: Report-Only to enforcing

The web container (`LMS-Frontend/nginx.docker.conf`) sends a strict Content-Security-Policy in **Report-Only**
mode. Browsers POST every violation to `/api/v1/csp-report`, which the API logs as `CSP violation`
(query strings and fragments are stripped). To enforce it, swap the two `add_header` lines in
`nginx.docker.conf` (both carry the same policy) and redeploy the web image.

## Already checked (19 Nov 2026, cloud, headless Chromium)

The built SPA was served with the policy **enforced**, the API proxied on the same origin, and 32 pages
visited signed out, as admin, as student and as sponsor: 0 violations.

- Signed out: `/`, `/login`, `/sign-up`, `/forgot-password`, `/verify/<id>`
- Admin: `/admin` and students, course, documents, quizzes, certificates, rewards, messages, forum, users,
  submissions, platform-credit, profile, `/settings/notifications`
- Student: `/student` and course, documents, quizzes, progress, badges, rewards, payments, messages, forum,
  profile, submissions
- Sponsor: `/sponsor`

The fixture database has no real course media, so embeds were not exercised there.

## Needs a real Safari / iPhone check before enforcing

Do these on staging with the Report-Only header live, then check the API log for `CSP violation`:

1. **Course lesson with a YouTube video** (BVC course): plays inline, fullscreen works. Covers `frame-src https:`.
2. **Lesson with an audio file and a PDF** (BVC audio and PDF items): audio plays, PDF shows in the viewer.
   Covers `media-src`, `object-src`, `frame-src blob:`.
3. **Lesson with an Office document** (Office Online embed): renders.
4. **Markdown lesson, flashcards and mind map from GitHub** (BVC course): the text loads, not "Failed to load content", and images show. Covers `connect-src https://raw.githubusercontent.com` and `img-src https:`.
5. **Sign in with AmmaWallet** (SSO round trip) on iPhone Safari: lands on the dashboard.
6. **Home-screen app on iPhone** (installed PWA): opens, web push permission prompt and a test push still work.
   Covers `worker-src 'self'` and `manifest-src 'self'`.
7. **Paystack checkout** from student payments: redirect out and back works.
8. **Certificate verify page** opened from a shared link (`/verify/<id>`), plus the share buttons.
9. **Admin course import** (ZIP, GitHub and JSON import) and a document upload.

If all pass and the log shows no `CSP violation` for a few days of normal traffic, enforce.
