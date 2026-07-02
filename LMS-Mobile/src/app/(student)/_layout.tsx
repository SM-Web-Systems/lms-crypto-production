import { Tabs, Redirect } from 'expo-router';
import { ActivityIndicator, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { brand } from '@/theme/colors';

export default function StudentTabsLayout() {
  const { isLoading, isAuthenticated, user, logout } = useAuth();

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

  if (user?.role === 'admin') {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50 px-8">
        <Ionicons name="shield-outline" size={48} color={brand.accent.teal} />
        <Text className="mt-4 text-center text-lg font-bold text-neutral-900">Admin features are on web</Text>
        <Text className="mt-2 text-center text-sm text-neutral-600">
          Use the web dashboard for admin tools. Sign in with a student account to use the mobile app.
        </Text>
        {user.email ? (
          <Text className="mt-4 text-center text-xs text-neutral-400">Signed in as {user.email}</Text>
        ) : null}
        <View className="mt-6 w-full max-w-xs">
          <Button label="Sign out" variant="outline" onPress={logout} />
        </View>
      </View>
    );
  }

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
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="quizzes" options={{ href: null, title: 'Quizzes' }} />
      <Tabs.Screen name="forum" options={{ href: null, title: 'Forum' }} />
      <Tabs.Screen name="documents" options={{ href: null, title: 'Resources' }} />
    </Tabs>
  );
}
