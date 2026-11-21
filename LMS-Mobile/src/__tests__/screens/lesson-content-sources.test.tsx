import React from 'react';
import { Linking } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { MaterialViewer } from '@/components/MaterialViewer';
import { courseFromApi, toReadableResourceUrl } from '@/utils/courseContent';
import type { CourseItem } from '@/types/course';

jest.mock('@/services/documentsService');
jest.mock('@/services/lessonContentService', () => ({
  lessonContentService: { getReading: jest.fn(), recordPlay: jest.fn().mockResolvedValue(undefined) },
  createPlayTracker: jest.fn(() => ({ progress: jest.fn(), complete: jest.fn() })),
}));
import { lessonContentService } from '@/services/lessonContentService';
jest.mock('@/lib/api', () => ({ getAuthToken: jest.fn().mockResolvedValue('test-token') }));
jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));
jest.mock('@/components/LessonMedia', () => {
  const { Text } = jest.requireActual('react-native');
  return { LessonVideo: () => null, LessonAudio: () => <Text>direct-audio-player</Text> };
});
jest.mock('@/components/LessonYouTube', () => {
  const { Text } = jest.requireActual('react-native');
  return { LessonYouTube: ({ url }: { url: string }) => <Text>{`youtube-player ${url}`}</Text> };
});

const onComplete = jest.fn().mockResolvedValue(undefined);
const props = { section: { id: 's', title: 'Section', items: [] }, courseId: 'course', onClose: jest.fn(), onComplete, onProgress: jest.fn(), onAssessmentSubmitted: jest.fn() };
const webviews = () => screen.UNSAFE_queryAllByType('WebView' as never);

beforeEach(() => jest.clearAllMocks());

describe('lesson content from GitHub, YouTube and file downloads', () => {
  it('shows a GitHub or ZIP imported text lesson (inline HTML, no URL) and lets the learner complete it', async () => {
    const item = { id: 'i', title: 'Imported lesson', type: 'text', url: '', information: '<h1>Module 1</h1><p>Read me</p>' } as CourseItem;
    render(<MaterialViewer {...props} item={item} />);
    expect(screen.queryByText(/not been configured/)).toBeNull();
    expect(screen.queryByText(/<h1>/)).toBeNull();
    const [reader] = webviews();
    expect(reader.props.source.html).toContain('<h1>Module 1</h1>');
    expect(reader.props.javaScriptEnabled).toBe(false);
    fireEvent.press(screen.getByText('Mark lesson complete'));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it('keeps links in imported readings out of the lesson view', () => {
    render(<MaterialViewer {...props} item={{ id: 'i', title: 'L', type: 'text', url: '', information: '<p><a href="https://x.test">x</a></p>' } as CourseItem} />);
    const [reader] = webviews();
    expect(reader.props.onShouldStartLoadWithRequest({ url: 'about:blank' })).toBe(true);
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    expect(reader.props.onShouldStartLoadWithRequest({ url: 'https://x.test' })).toBe(false);
    expect(openURL).toHaveBeenCalledWith('https://x.test');
  });

  it('renders instructor information that contains HTML instead of printing the tags', () => {
    render(<MaterialViewer {...props} item={{ id: 'i', title: 'L', type: 'link', url: 'https://example.com', information: '<p>Before you start</p>' } as CourseItem} />);
    expect(screen.queryByText('<p>Before you start</p>')).toBeNull();
    expect(webviews()[0].props.source.html).toContain('Before you start');
  });

  it('shows the server-formatted GitHub lesson, and falls back to the raw file instead of the GitHub website', async () => {
    const getReading = lessonContentService.getReading as jest.Mock;
    getReading.mockResolvedValueOnce({ html: '<h1>Formatted</h1>', source: 'github' });
    const item = { id: 'i', title: 'L', type: 'text', url: 'https://github.com/SM-Web-Systems/course/blob/main/module-1/lesson.md' } as CourseItem;
    const { unmount } = render(<MaterialViewer {...props} item={item} />);
    await waitFor(() => expect(webviews()[0].props.source.html).toContain('<h1>Formatted</h1>'));
    expect(getReading).toHaveBeenCalledWith('course', 'i');
    unmount();
    getReading.mockRejectedValueOnce(new Error('not approved'));
    render(<MaterialViewer {...props} item={item} />);
    await waitFor(() => expect(webviews()[0].props.source.uri).toBe('https://raw.githubusercontent.com/SM-Web-Systems/course/main/module-1/lesson.md'));
    expect(toReadableResourceUrl('https://example.com/a.md')).toBe('https://example.com/a.md');
  });

  it('plays audio from YouTube first, like the web, when the lesson also has a legacy MP3 URL', () => {
    render(<MaterialViewer {...props} item={{ id: 'i', title: 'L', type: 'audio', url: 'https://old-host.example/audio-overview.mp3', youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk', downloadUrl: 'https://raw.githubusercontent.com/o/r/sha/audio.mp3' } as CourseItem} />);
    expect(screen.getByText(/youtube-player/)).toBeTruthy();
    expect(screen.queryByText('direct-audio-player')).toBeNull();
    expect(screen.getByText('Download audio')).toBeTruthy();
  });

  it('plays YouTube for BVC audio, whose youtubeUrl is a bare video ID', () => {
    const course = courseFromApi({ id: 'c', title: 'C', sections: [{ id: 's', title: 'S', items: [
      { id: 'bvc-2-audio', type: 'audio', title: 'Audio', url: 'https://old-host.example/audio-overview.mp3', youtubeUrl: 'WIDvvPM3DfE' },
    ] }] });
    const item = course.sections![0].items[0];
    expect(item).toMatchObject({ youtubeUrl: 'https://www.youtube.com/watch?v=WIDvvPM3DfE' });
    render(<MaterialViewer {...props} item={item} />);
    expect(screen.getByText('youtube-player https://www.youtube.com/watch?v=WIDvvPM3DfE')).toBeTruthy();
    expect(screen.queryByText('direct-audio-player')).toBeNull();
  });

  it('opens YouTube lessons in the YouTube app and records it as a YouTube app view', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<MaterialViewer {...props} item={{ id: 'v', title: 'L', type: 'video', url: 'https://youtu.be/abcdefghijk' } as CourseItem} />);
    fireEvent.press(screen.getByText('Watch or save in YouTube app'));
    await waitFor(() => expect(openURL).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abcdefghijk'));
    expect(lessonContentService.recordPlay).toHaveBeenCalledWith('course', 'v', 'youtube_app', 'open_external');
  });

  it('still plays a direct audio file when there is no YouTube version', () => {
    render(<MaterialViewer {...props} item={{ id: 'i', title: 'L', type: 'audio', url: 'https://example.com/a.mp3' } as CourseItem} />);
    expect(screen.getByText('direct-audio-player')).toBeTruthy();
  });
});
