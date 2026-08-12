# Phase 27 C1 — Upload Extensions Hardening Implementation Spec

> Date: 2026-08-12 | Status: Ready for implementation

## Assessment

The previous follow-up session completed H-1 (streaming ZIP), H-4 (MD-FOLDER-1 integration test), H-5 (diagrams), and partially completed H-2/H-3 (frontend tests). However, close inspection reveals three test gaps in the frontend test coverage:

### Remaining Gaps

| # | Gap | Priority | File |
|---|-----|----------|------|
| G-1 | WIZ-GH-3 tests error (404) but not success (happy path with preview) | Medium | `ImportWizard.test.tsx` |
| G-2 | WIZ-GH-2 only tests empty URL — missing non-GitHub URL validation test | Low | `ImportWizard.test.tsx` |
| G-3 | No test for 403 (non-whitelisted org) error display | Low | `ImportWizard.test.tsx` |

### What's Already Solid

- **Backend:** 26 tests in `upload-extensions.test.ts` covering MIME, mapping, sanitization, DOMPurify hook, MD-FOLDER-1 integration, GitHub URL parsing, org whitelist, and streaming
- **Frontend EMV:** 6 tests (EMV-1 through EMV-6) for inline image rendering — comprehensive
- **Frontend IW:** 3 tests for Phase 26 C4 base + 3 for GitHub (WIZ-GH-1/2/3), but WIZ-GH-2 and WIZ-GH-3 are incomplete as noted above

---

## G-1: WIZ-GH-4 — Successful GitHub Import Happy Path

### What to Test

When the API returns a successful response with preview sections, the ImportWizard should:
1. Transition to Step 2 (editable preview)
2. Display section titles and item titles from the response
3. Show file count or import summary

### File

`LMS-Frontend/src/__tests__/components/ImportWizard.test.tsx`

### Test Structure

```typescript
describe('WIZ-GH-4 — Successful GitHub import shows preview', () => {
  it('displays preview sections after successful fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        data: {
          preview: {
            sections: [{
              title: 'Week 1 — Introduction',
              week: '1',
              items: [
                { title: 'README', type: 'text', fileName: 'README.md', documentId: 'doc-1', warnings: [] },
                { title: 'Slides', type: 'pdf', fileName: 'slides.pdf', documentId: 'doc-2', warnings: [] },
              ],
            }],
            warnings: [],
            filesStored: 2,
            filesSkipped: 0,
          },
        },
      }),
    });

    render(<ImportWizard {...defaultProps} />);
    fireEvent.click(screen.getByTestId('source-github'));

    const urlInput = screen.getByPlaceholderText(/github\.com/i);
    fireEvent.change(urlInput, { target: { value: 'https://github.com/SM-Web-Systems/blockchain-course' } });

    fireEvent.click(screen.getByText(/^Fetch$/i));

    await waitFor(() => {
      expect(screen.getByText(/Week 1/i)).toBeInTheDocument();
      expect(screen.getByText('README')).toBeInTheDocument();
      expect(screen.getByText('Slides')).toBeInTheDocument();
    });
  });
});
```

### Fixtures

- Mock `fetch` returning `{ success: true, data: { preview: { sections: [...], warnings: [], filesStored: 2, filesSkipped: 0 } } }`
- No additional component mocks needed (ImportWizard is self-contained)

---

## G-2: WIZ-GH-2b — Non-GitHub URL Validation

### What to Test

The GitHub form should show an error when a non-GitHub URL is submitted. This validation happens on the backend (the frontend just sends the URL), so the mock response should return a 400.

Looking at the code, the frontend does **not** validate the URL format client-side — it sends whatever the user enters to the backend. So the appropriate test is: mock a 400 response for a non-GitHub URL and verify the error displays.

### Test Structure

```typescript
it('shows error for non-GitHub URL (backend validation)', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 400,
    json: () => Promise.resolve({
      success: false,
      error: { message: 'Only GitHub URLs are supported' },
    }),
  });

  render(<ImportWizard {...defaultProps} />);
  fireEvent.click(screen.getByTestId('source-github'));

  const urlInput = screen.getByPlaceholderText(/github\.com/i);
  fireEvent.change(urlInput, { target: { value: 'https://gitlab.com/some/repo' } });

  fireEvent.click(screen.getByText(/^Fetch$/i));

  await waitFor(() => {
    expect(screen.getByText(/only github/i)).toBeInTheDocument();
  });
});
```

---

## G-3: WIZ-GH-5 — 403 Forbidden (Non-Whitelisted Org)

### What to Test

When the backend returns 403 for a non-whitelisted org, the error message should display.

### Test Structure

```typescript
describe('WIZ-GH-5 — Non-whitelisted org error', () => {
  it('shows error message on 403 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({
        success: false,
        error: { message: 'Repository owner not in allowed list' },
      }),
    });

    render(<ImportWizard {...defaultProps} />);
    fireEvent.click(screen.getByTestId('source-github'));

    const urlInput = screen.getByPlaceholderText(/github\.com/i);
    fireEvent.change(urlInput, { target: { value: 'https://github.com/evil-org/repo' } });

    fireEvent.click(screen.getByText(/^Fetch$/i));

    await waitFor(() => {
      expect(screen.getByText(/not in allowed list/i)).toBeInTheDocument();
    });
  });
});
```

---

## Diagram Status

All three diagrams are **current** as of 2026-08-12:
- `upload-extensions-current-file-flow.md` — all 4 paths show markdown rendering
- `github-import-current-flow.md` — streaming pipeline noted
- `markdown-processing-pipeline.md` — DOMPurify hook active, all paths rendering

**No diagram updates needed.**
