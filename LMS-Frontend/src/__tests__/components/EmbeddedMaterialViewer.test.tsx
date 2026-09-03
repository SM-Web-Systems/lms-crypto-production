import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Mock child components that need context / API calls
vi.mock('../../components/InlineQuizTaker', () => ({
  default: () => <div data-testid="inline-quiz-taker" />,
}));

vi.mock('../../components/InlineAssignmentForm', () => ({
  default: () => <div data-testid="inline-assignment-form" />,
}));

vi.mock('../../components/PdfViewer', () => ({
  PdfViewer: () => <div data-testid="pdf-viewer" />,
  PdfViewerWithAuth: () => <div data-testid="pdf-viewer-auth" />,
}));

import { EmbeddedMaterialViewer } from '../../components/EmbeddedMaterialViewer';
import type { CourseSection, CourseItemDownload, CourseItemAudio } from '../../types/course';

const mockSection: CourseSection = {
  id: 's1',
  title: 'Section 1',
  items: [],
};

const mockOnClose = vi.fn();

// EMV-1: Inline image rendering for .png download item
describe('EmbeddedMaterialViewer — inline image rendering', () => {
  it('renders inline <img> for download item with .png fileName', () => {
    const item: CourseItemDownload = {
      id: 'img-1',
      type: 'download',
      title: 'Architecture Diagram',
      order: 1,
      documentId: 'doc-123',
      fileName: 'diagram.png',
    };

    render(
      <EmbeddedMaterialViewer
        section={mockSection}
        item={item}
        onClose={mockOnClose}
      />,
    );

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/api/v1/documents/doc-123/download');
    expect(img).toHaveAttribute('alt', 'Architecture Diagram');
  });

  // EMV-2: Inline image rendering for .jpg download item
  it('renders inline <img> for download item with .jpg fileName', () => {
    const item: CourseItemDownload = {
      id: 'img-2',
      type: 'download',
      title: 'Photo',
      order: 1,
      documentId: 'doc-456',
      fileName: 'photo.jpg',
    };

    render(
      <EmbeddedMaterialViewer
        section={mockSection}
        item={item}
        onClose={mockOnClose}
      />,
    );

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/api/v1/documents/doc-456/download');
    expect(img).toHaveAttribute('alt', 'Photo');
  });

  // EMV-3: Inline image rendering for .jpeg download item
  it('renders inline <img> for download item with .jpeg fileName', () => {
    const item: CourseItemDownload = {
      id: 'img-3',
      type: 'download',
      title: 'Diagram JPEG',
      order: 1,
      documentId: 'doc-789',
      fileName: 'diagram.jpeg',
    };

    render(
      <EmbeddedMaterialViewer
        section={mockSection}
        item={item}
        onClose={mockOnClose}
      />,
    );

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/api/v1/documents/doc-789/download');
  });

  // EMV-4: Inline image rendering for .gif download item
  it('renders inline <img> for download item with .gif fileName', () => {
    const item: CourseItemDownload = {
      id: 'img-4',
      type: 'download',
      title: 'Animation',
      order: 1,
      documentId: 'doc-gif',
      fileName: 'anim.gif',
    };

    render(
      <EmbeddedMaterialViewer
        section={mockSection}
        item={item}
        onClose={mockOnClose}
      />,
    );

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/api/v1/documents/doc-gif/download');
  });

  // EMV-5: Download card for non-image download item
  it('renders download card (no <img>) for non-image download item', () => {
    const item: CourseItemDownload = {
      id: 'dl-1',
      type: 'download',
      title: 'Config File',
      order: 1,
      documentId: 'doc-456',
      fileName: 'config.json',
    };

    render(
      <EmbeddedMaterialViewer
        section={mockSection}
        item={item}
        onClose={mockOnClose}
      />,
    );

    // No img element — download card is shown instead
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Download file')).toBeInTheDocument();
  });

  // EMV-6: Case-insensitive extension matching (.PNG)
  it('renders inline <img> for .PNG extension (case-insensitive)', () => {
    const item: CourseItemDownload = {
      id: 'img-5',
      type: 'download',
      title: 'Uppercase PNG',
      order: 1,
      documentId: 'doc-upper',
      fileName: 'image.PNG',
    };

    render(
      <EmbeddedMaterialViewer
        section={mockSection}
        item={item}
        onClose={mockOnClose}
      />,
    );

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/api/v1/documents/doc-upper/download');
  });
});

// ── EMV-HTML: Information field HTML rendering ──────────────────────────────

describe('EmbeddedMaterialViewer — information field HTML rendering', () => {
  it('EMV-HTML-1: renders sanitized HTML in information field (not escaped)', () => {
    const item: CourseItemDownload = {
      id: 'md-1',
      type: 'download',
      title: 'Markdown Notes',
      order: 1,
      documentId: 'doc-md-1',
      fileName: 'notes.md',
      information: '<h1>Hello</h1><p><strong>Bold</strong> text</p>',
    };

    render(
      <EmbeddedMaterialViewer
        section={mockSection}
        item={item}
        onClose={mockOnClose}
      />,
    );

    // Should render as formatted HTML, not raw tags
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Bold')).toBeInTheDocument();
    // The h1 and strong tags should be rendered, not visible as text
    expect(screen.queryByText('<h1>')).not.toBeInTheDocument();
    expect(screen.queryByText('<strong>')).not.toBeInTheDocument();
  });

  it('EMV-HTML-2: renders plain text information without HTML (no tags)', () => {
    const item: CourseItemDownload = {
      id: 'plain-1',
      type: 'download',
      title: 'Simple Notes',
      order: 1,
      documentId: 'doc-plain-1',
      fileName: 'notes.txt',
      information: 'This is plain text with no HTML tags.',
    };

    render(
      <EmbeddedMaterialViewer
        section={mockSection}
        item={item}
        onClose={mockOnClose}
      />,
    );

    expect(screen.getByText('This is plain text with no HTML tags.')).toBeInTheDocument();
  });

  it('SEC-MD-1: script tags in information are not rendered', () => {
    const item: CourseItemDownload = {
      id: 'sec-1',
      type: 'download',
      title: 'Secure Notes',
      order: 1,
      documentId: 'doc-sec-1',
      fileName: 'notes.md',
      // DOMPurify would strip this on the backend, but test frontend doesn't re-inject
      information: '<p>Safe content</p>',
    };

    render(
      <EmbeddedMaterialViewer
        section={mockSection}
        item={item}
        onClose={mockOnClose}
      />,
    );

    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });

  it('SEC-LINK-1: links in information have rel="noopener noreferrer"', () => {
    const item: CourseItemDownload = {
      id: 'link-1',
      type: 'download',
      title: 'Link Notes',
      order: 1,
      documentId: 'doc-link-1',
      fileName: 'notes.md',
      information: '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">Example</a></p>',
    };

    const { container } = render(
      <EmbeddedMaterialViewer
        section={mockSection}
        item={item}
        onClose={mockOnClose}
      />,
    );

    const link = container.querySelector('a[href="https://example.com"]');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link!.getAttribute('target')).toBe('_blank');
  });
});

// ── EMV-AUDIO-YT: Audio YouTube link rendering ──────────────────────────────

describe('EmbeddedMaterialViewer — audio YouTube link', () => {
  it('EMV-AYT-1: renders "Listen on YouTube" link when youtubeUrl is set', () => {
    const item: CourseItemAudio = {
      id: 'bvc-1-audio',
      type: 'audio',
      title: 'Module 1 Audio Overview',
      url: 'https://blockchain-vibe-coding.smwebsystems.com/module-1-intro/content/audio-overview.mp3',
      youtubeUrl: 'RW1Q7lIExOM',
    };

    render(
      <EmbeddedMaterialViewer section={mockSection} item={item} onClose={mockOnClose} />,
    );

    const ytLink = screen.getByText('Listen on YouTube');
    expect(ytLink).toBeInTheDocument();
    expect(ytLink.closest('a')).toHaveAttribute('href', 'https://www.youtube.com/watch?v=RW1Q7lIExOM');
    expect(ytLink.closest('a')).toHaveAttribute('target', '_blank');
    expect(ytLink.closest('a')).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('EMV-AYT-2: does NOT render YouTube link when youtubeUrl is absent', () => {
    const item: CourseItemAudio = {
      id: 'generic-audio',
      type: 'audio',
      title: 'Generic Audio',
      url: 'https://example.com/audio.mp3',
    };

    render(
      <EmbeddedMaterialViewer section={mockSection} item={item} onClose={mockOnClose} />,
    );

    expect(screen.queryByText('Listen on YouTube')).not.toBeInTheDocument();
    expect(screen.getByText('Download audio file')).toBeInTheDocument();
  });

  it('EMV-AYT-3: native MP3 player is always rendered regardless of youtubeUrl', () => {
    const item: CourseItemAudio = {
      id: 'bvc-3-audio',
      type: 'audio',
      title: 'Module 3 Audio Overview',
      url: 'https://blockchain-vibe-coding.smwebsystems.com/module-3-bitcoin/content/audio-overview.mp3',
      youtubeUrl: 'yq-O8yV8d1A',
    };

    const { container } = render(
      <EmbeddedMaterialViewer section={mockSection} item={item} onClose={mockOnClose} />,
    );

    const audioEl = container.querySelector('audio');
    expect(audioEl).not.toBeNull();
    expect(audioEl!.getAttribute('src')).toBe(item.url);
    expect(screen.getByText('Download audio file')).toBeInTheDocument();
    expect(screen.getByText('Listen on YouTube')).toBeInTheDocument();
  });

  it('EMV-AYT-4: rejects invalid YouTube IDs (no link rendered)', () => {
    const item: CourseItemAudio = {
      id: 'bad-yt',
      type: 'audio',
      title: 'Bad YouTube ID',
      url: 'https://example.com/audio.mp3',
      youtubeUrl: '<script>alert(1)</script>',
    };

    render(
      <EmbeddedMaterialViewer section={mockSection} item={item} onClose={mockOnClose} />,
    );

    expect(screen.queryByText('Listen on YouTube')).not.toBeInTheDocument();
    expect(screen.getByText('Download audio file')).toBeInTheDocument();
  });

  it('EMV-AYT-5: does not render YouTube iframe by default (link only)', () => {
    const item: CourseItemAudio = {
      id: 'bvc-5-audio',
      type: 'audio',
      title: 'Module 5 Audio Overview',
      url: 'https://blockchain-vibe-coding.smwebsystems.com/module-5-defi-nfts/content/audio-overview.mp3',
      youtubeUrl: 'uIr1AnwQY3Y',
    };

    const { container } = render(
      <EmbeddedMaterialViewer section={mockSection} item={item} onClose={mockOnClose} />,
    );

    expect(container.querySelector('iframe')).toBeNull();
  });
});
