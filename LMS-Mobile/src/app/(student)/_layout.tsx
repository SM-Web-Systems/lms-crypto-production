import { useEffect } from 'react';
import { Tabs, Redirect, usePathname, useRouter } from 'expo-router';
import { ActivityIndicator, BackHandler, Pressable, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { canStudy, canOpenStudentPath } from '@/utils/authorization';
import { brand } from '@/theme/colors';
import { backOr } from '@/utils/navigation';

/** Header Back for screens without a tab of their own. */
function HiddenTabBack() {
  const router = useRouter();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} style={{ paddingHorizontal: 16 }}
      onPress={() => backOr(router, '/(student)/dashboard')}>
      <Ionicons name="arrow-back" size={24} color={brand.primary.dark} />
    </Pressable>
  );
}
const hidden = (title: string) => ({ href: null, title, headerLeft: () => <HiddenTabBack /> });

export default function StudentTabsLayout() {
  const { isLoading, isAuthenticated, user } = useAuth();
  const path = usePathname();
  const router = useRouter();

  // A tab opened straight from a link has no history, so Android back would close the app. Go to Dashboard first.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack() || path === '/dashboard') return false;
      router.navigate('/(student)/dashboard');
      return true;
    });
    return () => subscription.remove();
  }, [router, path]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50">
        <ActivityIndicator size="large" color={brand.accent.teal} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  if (user?.deletionStatus === 'pending_deletion') return <Redirect href="/account" />;
  if (!canStudy(user)) return <Redirect href="/workspace" />;
  if (!canOpenStudentPath(user,path)) return <View className="flex-1 justify-center bg-neutral-50 p-6 gap-4">
    <Text className="text-xl font-bold">Access unavailable</Text>
    <Text>Your current permissions do not include this feature.</Text>
    <Button label="Back to learning" onPress={()=>router.replace('/(student)/dashboard')} />
    <Button label="Your workspaces" variant="outline" onPress={()=>router.replace('/workspace')} />
  </View>;

  return (
    <Tabs
      // Back walks the tabs the learner actually visited, and ends on Dashboard (the first tab).
      backBehavior="history"
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: brand.accent.teal,
        tabBarInactiveTintColor: brand.neutral[400],
        tabBarStyle: { backgroundColor: brand.white, borderTopColor: brand.neutral[200] },
        // Six tabs share a phone's width. Labels start at 12 and shrink only when a label (Submissions) would not fit;
        // scaling is capped so large system text does not clip them. Icons stay, and TalkBack still reads the full title.
        tabBarLabel: ({ color, children }) => <Text numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.2} style={{ color, fontSize: 12, textAlign: 'center' }}>{children}</Text>,
        headerStyle: { backgroundColor: brand.white },
        headerTitleStyle: { color: brand.primary.dark, fontWeight: '700' },
        headerShadowVisible: false,
      }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="course"
        options={{
          title: 'Course',
          tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="submissions"
        options={{
          title: 'Submissions',
          href: user?.permissions?.includes('course.submit') ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="cloud-upload-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size }) => <Ionicons name="mail-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="certificates"
        options={{
          title: 'Certificates',
          href: user?.permissions?.includes('certificate.view_own') ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="ribbon-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="certificate-detail" options={hidden('Certificate')} />
      <Tabs.Screen name="quizzes" options={hidden('Quizzes')} />
      <Tabs.Screen name="forum" options={hidden('Forum')} />
      <Tabs.Screen name="documents" options={hidden('Resources')} />
      <Tabs.Screen name="rewards" options={hidden('Rewards')} />
    </Tabs>
  );
}
