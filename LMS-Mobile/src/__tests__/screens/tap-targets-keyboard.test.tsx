import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { KeyboardAvoidingView, Platform, Text } from 'react-native';
import { Button } from '@/components/ui/Button';
import { KeyboardAvoid } from '@/components/KeyboardAvoid';
import DocumentsScreen from '@/app/(student)/documents';
import MessagesScreen from '@/app/(student)/messages';
import { documentsService } from '@/services/documentsService';
import { messageService } from '@/services/messageService';

jest.mock('@/services/documentsService', () => ({
  documentsService: { getAll: jest.fn(), getCategories: jest.fn().mockResolvedValue([]), download: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', name: 'Me', permissions: [] } }) }));
jest.mock('@/services/enrollmentService', () => ({ enrollmentService: { getPeersInMyCourses: jest.fn().mockResolvedValue([]) } }));
jest.mock('@/services/messageService', () => ({
  messageService: {
    getConversationsForUser: jest.fn(), getMessages: jest.fn().mockResolvedValue([]), markConversationRead: jest.fn().mockResolvedValue(undefined),
    getOtherDisplayName: jest.fn(() => ({ otherUserId: 'pat', otherUserName: 'Pat Lee' })),
  },
}));

// 44pt is the smallest comfortable touch target (Apple HIG; Android asks for 48dp).
const atLeast44 = (el: { props: { className?: string; hitSlop?: number } }) =>
  /\bmin-h-\[44px\]|\bh-\[44px\]/.test(el.props.className ?? '') || (el.props.hitSlop ?? 0) >= 10;

describe('tap targets', () => {
  it('every Button size is at least 44pt tall', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      render(<Button label={`Go ${size}`} size={size} onPress={() => undefined} />);
      expect(screen.getByRole('button', { name: `Go ${size}` }).props.className).toMatch(/\bmin-h-\[44px\]/);
    }
  });

  it('the Resources download icon is a labelled 44pt button', async () => {
    (documentsService.getAll as jest.Mock).mockResolvedValue({ documents: [
      { id: 'd-1', title: 'Week 1 notes', fileName: 'notes.pdf', category: 'Notes', fileSize: 1024, uploadedAt: '2026-11-20T10:00:00Z' },
    ] });
    render(<DocumentsScreen />);
    const download = await screen.findByRole('button', { name: 'Download Week 1 notes' });
    expect(atLeast44(download)).toBe(true);
    fireEvent.press(download);
    expect(documentsService.download).toHaveBeenCalledWith('d-1', 'notes.pdf');
  });

  it('the Messages back arrow is a labelled 44pt button', async () => {
    (messageService.getConversationsForUser as jest.Mock).mockResolvedValue([
      { id: 'c-1', participantIds: ['me', 'pat'], participantNames: ['Me', 'Pat Lee'], updatedAt: '2026-11-21T09:00:00Z' },
    ]);
    render(<MessagesScreen />);
    fireEvent.press(await screen.findByText('Pat Lee'));
    const back = await screen.findByRole('button', { name: 'Back to conversations' });
    expect(atLeast44(back)).toBe(true);
    fireEvent.press(back);
    expect(await screen.findByText('New message')).toBeTruthy();
  });
});

describe('keyboard on Android', () => {
  const os = Platform.OS;
  afterEach(() => { Platform.OS = os; });

  it('pads the content above the keyboard, offset by where the screen starts in the window', () => {
    Platform.OS = 'android';
    render(<KeyboardAvoid><Text>Reply</Text></KeyboardAvoid>);
    const kav = screen.UNSAFE_getByType(KeyboardAvoidingView);
    expect(kav.props.behavior).toBe('padding');
    expect(typeof kav.props.keyboardVerticalOffset).toBe('number');
  });

  it('keeps the Messages reply box above the keyboard', async () => {
    Platform.OS = 'android';
    (messageService.getConversationsForUser as jest.Mock).mockResolvedValue([
      { id: 'c-1', participantIds: ['me', 'pat'], participantNames: ['Me', 'Pat Lee'], updatedAt: '2026-11-21T09:00:00Z' },
    ]);
    render(<MessagesScreen />);
    fireEvent.press(await screen.findByText('Pat Lee'));
    const box = await screen.findByPlaceholderText('Write a message…');
    const padded = screen.UNSAFE_getAllByType(KeyboardAvoidingView).find(kav => kav.props.behavior === 'padding');
    expect(padded).toBeTruthy();
    expect(typeof padded!.props.keyboardVerticalOffset).toBe('number');
    // The reply box sits inside the padded view, so it moves up with the keyboard.
    let node: { parent: unknown } | null = box as unknown as { parent: unknown };
    while (node && node !== padded) node = node.parent as { parent: unknown } | null;
    expect(node).toBe(padded);
  });

  it('leaves iOS to the ScrollView keyboard insets', () => {
    Platform.OS = 'ios';
    render(<KeyboardAvoid><Text>Reply</Text></KeyboardAvoid>);
    expect(screen.UNSAFE_queryByType(KeyboardAvoidingView)).toBeNull();
    expect(screen.getByText('Reply')).toBeTruthy();
  });
});

describe('source rules', () => {
  const read = (file: string) => readFileSync(join(__dirname, '..', '..', 'app', '(student)', file), 'utf8');

  it.each(['forum.tsx', 'profile.tsx', 'quizzes.tsx', 'course.tsx'])(
    '%s keeps typed text above the keyboard: iOS insets on every vertical ScrollView, Android padding', (file) => {
      expect(read(file)).toMatch(/<KeyboardAvoid>/);
      const tags = read(file).match(/<ScrollView\b[^>]*>/g) ?? [];
      const vertical = tags.filter((t) => !/\bhorizontal\b/.test(t));
      expect(vertical.length).toBeGreaterThan(0);
      for (const tag of vertical) expect(tag).toMatch(/automaticallyAdjustKeyboardInsets/);
    });

  it('in-screen Back rows are 44pt buttons', () => {
    for (const [file, label] of [['quizzes.tsx', 'All quizzes'], ['forum.tsx', 'Back to discussions']]) {
      const source = read(file);
      const at = source.indexOf(`>${label}<`);
      expect(at).toBeGreaterThan(0);
      const row = source.slice(source.lastIndexOf('<Pressable', at), at);
      expect(row).toMatch(/accessibilityRole="button"/);
      expect(row).toMatch(/min-h-\[44px\]/);
    }
    expect(read('quizzes.tsx')).toMatch(/accessibilityRole="radio"[\s\S]{0,300}min-h-\[44px\]/);
  });

  it('standalone quiz options are announced as radio buttons', () => {
    expect(read('quizzes.tsx')).toMatch(/accessibilityRole="radio"/);
  });
});
