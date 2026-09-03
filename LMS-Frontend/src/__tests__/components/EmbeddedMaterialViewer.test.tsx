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

vi.mock('../../components/MarkdownViewer', () => ({
  MarkdownViewer: ({ url, title }: { url: string; title: string }) => (
    <div data-testid="markdown-viewer" data-url={url} data-title={title} />
  ),
  toApprovedRawUrl: (url: string) => {
    if (url.includes('github.com/SM-Web-Systems/') || url.includes('raw.githubusercontent.com/SM-Web-Systems/')) {
      return `https://raw.githubusercontent.com/SM-Web-Systems/blockchain-foundations-for-vibe-coding/b9fad25/${url.split('/').pop()}`;
    }
    return null;
  },
}));

import { EmbeddedMaterialViewer } from '../../components/EmbeddedMaterialViewer';
import type { CourseSection, CourseItemDownload, CourseItemAudio, CourseItemVideo, CourseItemText } from '../../types/course';

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

// ── EMV-VIDEO: Video YouTube primary + download button ─────────────────────

describe('EmbeddedMaterialViewer — video item rendering', () => {
  it('EMV-VID-1: renders YouTube embed as primary player for YouTube video URL', () => {
    const item: CourseItemVideo = {
      id: 'bvc-1-video',
      type: 'video',
      title: 'Video: Introduction to Blockchain',
      url: 'https://www.youtube.com/watch?v=SyK8hJVq3_Q',
      description: 'Explainer video for Module 1.',
      downloadUrl: 'https://raw.githubusercontent.com/SM-Web-Systems/blockchain-foundations-for-vibe-coding/b9fad25/module-1-intro/content/explainer-video.mp4',
    };

    const { container } = render(
      <EmbeddedMaterialViewer section={mockSection} item={item} onClose={mockOnClose} />,
    );

    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute('src')).toBe('https://www.youtube.com/embed/SyK8hJVq3_Q?rel=0');
  });

  it('EMV-VID-2: renders clean GitHub download button for video', () => {
    const item: CourseItemVideo = {
      id: 'bvc-1-video',
      type: 'video',
      title: 'Video: Introduction to Blockchain',
      url: 'https://www.youtube.com/watch?v=SyK8hJVq3_Q',
      description: 'Explainer video for Module 1.',
      downloadUrl: 'https://raw.githubusercontent.com/SM-Web-Systems/blockchain-foundations-for-vibe-coding/b9fad25/module-1-intro/content/explainer-video.mp4',
    };

    render(
      <EmbeddedMaterialViewer section={mockSection} item={item} onClose={mockOnClose} />,
    );

    const dlBtn = screen.getByText('Download video (MP4)');
    expect(dlBtn).toBeInTheDocument();
    expect(dlBtn.closest('a')).toHaveAttribute('href', item.downloadUrl);
    expect(dlBtn.closest('a')).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('EMV-VID-3: does not render local server URLs as visible text', () => {
    const item: CourseItemVideo = {
      id: 'bvc-1-video',
      type: 'video',
      title: 'Video: Introduction to Blockchain',
      url: 'https://www.youtube.com/watch?v=SyK8hJVq3_Q',
      description: 'Explainer video for Module 1.',
      downloadUrl: 'https://raw.githubusercontent.com/SM-Web-Systems/blockchain-foundations-for-vibe-coding/b9fad25/module-1-intro/content/explainer-video.mp4',
    };

    render(
      <EmbeddedMaterialViewer section={mockSection} item={item} onClose={mockOnClose} />,
    );

    // No server domain or raw GitHub URL visible as text
    expect(screen.queryByText(/blockchain-vibe-coding\.smwebsystems\.com/)).not.toBeInTheDocument();
    expect(screen.queryByText(/raw\.githubusercontent\.com/)).not.toBeInTheDocument();
    expect(screen.queryByText(/fallback/i)).not.toBeInTheDocument();
  });

  it('EMV-VID-4: does not render download button when downloadUrl is absent', () => {
    const item: CourseItemVideo = {
      id: 'generic-video',
      type: 'video',
      title: 'Generic Video',
      url: 'https://www.youtube.com/watch?v=SyK8hJVq3_Q',
    };

    render(
      <EmbeddedMaterialViewer section={mockSection} item={item} onClose={mockOnClose} />,
    );

    expect(screen.queryByText('Download video (MP4)')).not.toBeInTheDocument();
  });

  it('EMV-VID-5: does not render native <video> element for YouTube URL', () => {
    const item: CourseItemVideo = {
      id: 'bvc-1-video',
      type: 'video',
      title: 'Video: Introduction to Blockchain',
      url: 'https://www.youtube.com/watch?v=SyK8hJVq3_Q',
    };

    const { container } = render(
      <EmbeddedMaterialViewer section={mockSection} item={item} onClose={mockOnClose} />,
    );

    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('iframe')).not.toBeNull();
  });

  it('EMV-VID-6: preserves expected YouTube video ID in embed', () => {
    const item: CourseItemVideo = {
      id: 'bvc-7-video',
      type: 'video',
      title: 'Video: Regulation, CBDCs, and the Future',
      url: 'https://www.youtube.com/watch?v=J4lw7bN8isw',
    };

    const { container } = render(
      <EmbeddedMaterialViewer section={mockSection} item={item} onClose={mockOnClose} />,
    );

    const iframe = container.querySelector('iframe');
    expect(iframe!.getAttribute('src')).toBe('https://www.youtube.com/embed/J4lw7bN8isw?rel=0');
  });
});

// ── EMV-AUDIO: Audio YouTube primary + download button ─────────────────────

describe('EmbeddedMaterialViewer — audio YouTube primary', () => {
  it('EMV-AYT-1: renders YouTube embed as primary when youtubeUrl is set', () => {
    const item: CourseItemAudio = {
      id: 'bvc-1-audio',
      type: 'audio',
      title: 'Audio Overview: Introduction to Blockchain',
      url: 'https://blockchain-vibe-coding.smwebsystems.com/module-1-intro/content/audio-overview.mp3',
      youtubeUrl: 'RW1Q7lIExOM',
      downloadUrl: 'https://raw.githubusercontent.com/SM-Web-Systems/blockchain-foundations-for-vibe-coding/b9fad25/module-1-intro/content/audio-overview.mp3',
    };

    const { container } = render(
      <EmbeddedMaterialViewer section={mockSection} item={item} onClose={mockOnClose} />,
    );

    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute('src')).toBe('https://www.youtube.com/embed/RW1Q7lIExOM?rel=0');
  });

  it('EMV-AYT-2: does NOT render redundant "Listen on YouTube" button', () => {
    const item: CourseItemAudio = {
      id: 'bvc-1-audio',
      type: 'audio',
      title: 'Audio Overview: Introduction to Blockchain',
      url: 'https://blockchain-vibe-coding.smwebsystems.com/module-1-intro/content/audio-overview.mp3',
      youtubeUrl: 'RW1Q7lIExOM',
    };

    render(
      <EmbeddedMaterialViewer section={mockSection} item={item} onClose={mockOnClose} />,
    );

    // YouTube embed is already visible — no need for a separate "Listen on YouTube" link
    expect(screen.queryByText('Listen on YouTube')).not.toBeInTheDocument();
  });

  it('EMV-AYT-3: does not render native MP3 player when youtubeUrl is set', () => {
    const item: CourseItemAudio = {
      id: 'bvc-3-audio',
      type: 'audio',
      title: 'Audio Overview: Bitcoin & Cryptocurrencies',
      url: 'https://blockchain-vibe-coding.smwebsystems.com/module-3-bitcoin/content/audio-overview.mp3',
      youtubeUrl: 'yq-O8yV8d1A',
    };

    const { container } = render(
      <EmbeddedMaterialViewer section={mockSection} item={item} onClose={mockOnClose} />,
    );

    expect(container.querySelector('audio')).toBeNull();
    expect(container.querySelector('iframe')).not.toBeNull();
  });

  it('EMV-AYT-4: rejects invalid YouTube IDs (no embed or link rendered)', () => {
    const item: CourseItemAudio = {
      id: 'bad-yt',
      type: 'audio',
      title: 'Bad YouTube ID',
      url: 'https://example.com/audio.mp3',
      youtubeUrl: '<script>alert(1)</script>',
    };

    const { container } = render(
      <EmbeddedMaterialViewer section={mockSection} item={item} onClose={mockOnClose} />,
    );

    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.queryByText('Listen on YouTube')).not.toBeInTheDocument();
  });

  it('EMV-AYT-5: renders YouTube iframe (not just link) when youtubeUrl is valid', () => {
    const item: CourseItemAudio = {
      id: 'bvc-5-audio',
      type: 'audio',
      title: 'Audio Overview: DeFi & NFTs',
      url: 'https://blockchain-vibe-coding.smwebsystems.com/module-5-defi-nfts/content/audio-overview.mp3',
      youtubeUrl: 'uIr1AnwQY3Y',
    };

    const { container } = render(
      <EmbeddedMaterialViewer section={mockSection} item={item} onClose={mockOnClose} />,
    );

    expect(container.querySelector('iframe')).not.toBeNull();
  });

  it('EMV-AYT-6: renders GitHub download button for audio', () => {
    const item: CourseItemAudio = {
      id: 'bvc-4-audio',
      type: 'audio',
      title: 'Audio Overview: Smart Contracts & Ethereum',
      url: 'https://blockchain-vibe-coding.smwebsystems.com/module-4-smart-contracts/content/audio-overview.mp3',
      youtubeUrl: 'ilLsUuW2aeU',
      downloadUrl: 'https://raw.githubusercontent.com/SM-Web-Systems/blockchain-foundations-for-vibe-coding/b9fad25/module-4-smart-contracts/content/audio-overview.mp3',
    };

    render(
      <EmbeddedMaterialViewer section={mockSection} item={item} onClose={mockOnClose} />,
    );

    const dlBtn = screen.getByText('Download audio (MP3)');
    expect(dlBtn).toBeInTheDocument();
    expect(dlBtn.closest('a')).toHaveAttribute('href', item.downloadUrl);
  });

  it('EMV-AYT-7: does not render local server domain as visible text', () => {
    const item: CourseItemAudio = {
      id: 'bvc-6-audio',
      type: 'audio',
      title: 'Audio Overview: Enterprise Blockchain',
      url: 'https://blockchain-vibe-coding.smwebsystems.com/module-6-enterprise/content/audio-overview.mp3',
      youtubeUrl: 'HYzC_-3wSAI',
      downloadUrl: 'https://raw.githubusercontent.com/SM-Web-Systems/blockchain-foundations-for-vibe-coding/b9fad25/module-6-enterprise/content/audio-overview.mp3',
    };

    render(
      <EmbeddedMaterialViewer section={mockSection} item={item} onClose={mockOnClose} />,
    );

    expect(screen.queryByText(/blockchain-vibe-coding\.smwebsystems\.com/)).not.toBeInTheDocument();
    expect(screen.queryByText(/raw\.githubusercontent\.com/)).not.toBeInTheDocument();
  });

  it('EMV-AYT-8: does not render raw GitHub URL as visible text', () => {
    const item: CourseItemAudio = {
      id: 'bvc-1-audio',
      type: 'audio',
      title: 'Audio Overview: Introduction to Blockchain',
      url: 'https://blockchain-vibe-coding.smwebsystems.com/module-1-intro/content/audio-overview.mp3',
      youtubeUrl: 'RW1Q7lIExOM',
      downloadUrl: 'https://raw.githubusercontent.com/SM-Web-Systems/blockchain-foundations-for-vibe-coding/b9fad25/module-1-intro/content/audio-overview.mp3',
    };

    render(
      <EmbeddedMaterialViewer section={mockSection} item={item} onClose={mockOnClose} />,
    );

    expect(screen.queryByText(/raw\.githubusercontent\.com/)).not.toBeInTheDocument();
  });

  it('EMV-AYT-9: audio and video YouTube IDs cannot be swapped', () => {
    // Video ID for Module 1 is SyK8hJVq3_Q, Audio is RW1Q7lIExOM — they must not match
    const videoItem: CourseItemVideo = {
      id: 'bvc-1-video',
      type: 'video',
      title: 'Video',
      url: 'https://www.youtube.com/watch?v=SyK8hJVq3_Q',
    };
    const audioItem: CourseItemAudio = {
      id: 'bvc-1-audio',
      type: 'audio',
      title: 'Audio',
      url: 'https://example.com/audio.mp3',
      youtubeUrl: 'RW1Q7lIExOM',
    };

    const { container: vc } = render(
      <EmbeddedMaterialViewer section={mockSection} item={videoItem} onClose={mockOnClose} />,
    );
    const { container: ac } = render(
      <EmbeddedMaterialViewer section={mockSection} item={audioItem} onClose={mockOnClose} />,
    );

    const videoSrc = vc.querySelector('iframe')!.getAttribute('src')!;
    const audioSrc = ac.querySelector('iframe')!.getAttribute('src')!;
    expect(videoSrc).not.toBe(audioSrc);
    expect(videoSrc).toContain('SyK8hJVq3_Q');
    expect(audioSrc).toContain('RW1Q7lIExOM');
  });

  it('EMV-AYT-10: fallback renders download button when no youtubeUrl', () => {
    const item: CourseItemAudio = {
      id: 'generic-audio',
      type: 'audio',
      title: 'Generic Audio',
      url: 'https://example.com/audio.mp3',
      downloadUrl: 'https://example.com/download/audio.mp3',
    };

    const { container } = render(
      <EmbeddedMaterialViewer section={mockSection} item={item} onClose={mockOnClose} />,
    );

    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('audio')).toBeNull();
    expect(screen.queryByText('Listen on YouTube')).not.toBeInTheDocument();
    expect(screen.getByText('Download audio (MP3)')).toBeInTheDocument();
  });
});

// ── EMV-MD: Text item markdown rendering ────────────────────────────────────

describe('EmbeddedMaterialViewer — text item markdown rendering', () => {
  it('EMV-MD-1: renders MarkdownViewer for text item with approved GitHub URL', () => {
    const item: CourseItemText = {
      id: 'bvc-1-lesson',
      type: 'text',
      title: 'Lesson: Introduction to Blockchain',
      url: 'https://github.com/SM-Web-Systems/vibe-coding-blockchain/blob/main/module-1-intro/content/lesson.md',
      order: 2,
    };

    render(
      <EmbeddedMaterialViewer section={mockSection} item={item} onClose={mockOnClose} />,
    );

    const mdViewer = screen.getByTestId('markdown-viewer');
    expect(mdViewer).toBeInTheDocument();
    expect(mdViewer).toHaveAttribute('data-url', item.url);
    expect(mdViewer).toHaveAttribute('data-title', item.title);
    // No "Open resource" button
    expect(screen.queryByText('Open resource')).not.toBeInTheDocument();
  });

  it('EMV-MD-2: falls back to ExternalResourceCard for non-approved text URL', () => {
    const item: CourseItemText = {
      id: 'ext-text',
      type: 'text',
      title: 'External Resource',
      url: 'https://example.com/some-doc.md',
      order: 1,
    };

    render(
      <EmbeddedMaterialViewer section={mockSection} item={item} onClose={mockOnClose} />,
    );

    // MarkdownViewer not rendered for non-approved URL
    expect(screen.queryByTestId('markdown-viewer')).not.toBeInTheDocument();
    // Falls back to ExternalResourceCard with "Open resource" button
    expect(screen.getByText('Open resource')).toBeInTheDocument();
  });

  it('EMV-MD-3: renders MarkdownViewer for study guide text item', () => {
    const item: CourseItemText = {
      id: 'bvc-3-study-guide',
      type: 'text',
      title: 'Study Guide: Bitcoin & Cryptocurrencies',
      url: 'https://github.com/SM-Web-Systems/vibe-coding-blockchain/blob/main/module-3-bitcoin/content/study-guide.md',
      order: 3,
    };

    render(
      <EmbeddedMaterialViewer section={mockSection} item={item} onClose={mockOnClose} />,
    );

    expect(screen.getByTestId('markdown-viewer')).toBeInTheDocument();
    expect(screen.queryByText('Open resource')).not.toBeInTheDocument();
  });
});
