import { Tabs, Redirect, usePathname, useRouter } from 'expo-router';
import { ActivityIndicator, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { canStudy, canOpenStudentPath } from '@/utils/authorization';
import { brand } from '@/theme/colors';

export default function StudentTabsLayout() {
  const { isLoading, isAuthenticated, user } = useAuth();
  const path = usePathname();
  const router = useRouter();

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
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: brand.accent.teal,
        tabBarInactiveTintColor: brand.neutral[400],
        tabBarStyle: { backgroundColor: brand.white, borderTopColor: brand.neutral[200] },
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
      <Tabs.Screen name="certificate-detail" options={{ href: null, title: 'Certificate' }} />
      <Tabs.Screen name="quizzes" options={{ href: null, title: 'Quizzes' }} />
      <Tabs.Screen name="forum" options={{ href: null, title: 'Forum' }} />
      <Tabs.Screen name="documents" options={{ href: null, title: 'Resources' }} />
    </Tabs>
  );
}
