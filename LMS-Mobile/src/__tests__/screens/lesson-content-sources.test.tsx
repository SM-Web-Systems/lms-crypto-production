import React from 'react';
import { Linking } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { MaterialViewer } from '@/components/MaterialViewer';
import { toReadableResourceUrl } from '@/utils/courseContent';
import type { CourseItem } from '@/types/course';

jest.mock('@/services/documentsService');
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

  it('loads a github.com blob lesson from raw.githubusercontent.com instead of the GitHub website', () => {
    render(<MaterialViewer {...props} item={{ id: 'i', title: 'L', type: 'text', url: 'https://github.com/SM-Web-Systems/course/blob/main/module-1/lesson.md' } as CourseItem} />);
    expect(webviews()[0].props.source.uri).toBe('https://raw.githubusercontent.com/SM-Web-Systems/course/main/module-1/lesson.md');
    expect(toReadableResourceUrl('https://example.com/a.md')).toBe('https://example.com/a.md');
  });

  it('plays audio from YouTube first, like the web, when the lesson also has a legacy MP3 URL', () => {
    render(<MaterialViewer {...props} item={{ id: 'i', title: 'L', type: 'audio', url: 'https://old-host.example/audio-overview.mp3', youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk', downloadUrl: 'https://raw.githubusercontent.com/o/r/sha/audio.mp3' } as CourseItem} />);
    expect(screen.getByText(/youtube-player/)).toBeTruthy();
    expect(screen.queryByText('direct-audio-player')).toBeNull();
    expect(screen.getByText('Download audio')).toBeTruthy();
  });

  it('still plays a direct audio file when there is no YouTube version', () => {
    render(<MaterialViewer {...props} item={{ id: 'i', title: 'L', type: 'audio', url: 'https://example.com/a.mp3' } as CourseItem} />);
    expect(screen.getByText('direct-audio-player')).toBeTruthy();
  });
});
