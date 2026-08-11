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
import type { CourseSection, CourseItemDownload } from '../../types/course';

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
