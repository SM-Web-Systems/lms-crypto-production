import { useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

/**
 * Keeps a form above the keyboard on Android. The app draws edge-to-edge (targetSdk 35), so the window no
 * longer shrinks for the keyboard: pad the content instead. The keyboard's position is in window coordinates
 * and the view's own frame is not, so offset by where this view starts (below the header).
 * iOS needs nothing here: the ScrollView inside uses automaticallyAdjustKeyboardInsets.
 */
export function KeyboardAvoid({ children }: { children: ReactNode }) {
  const ref = useRef<View>(null);
  const [top, setTop] = useState(0);
  if (Platform.OS !== 'android') return <>{children}</>;
  return (
    <View ref={ref} style={{ flex: 1 }} onLayout={() => ref.current?.measureInWindow((_x, y) => setTop(y))}>
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={top} style={{ flex: 1 }}>
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}
