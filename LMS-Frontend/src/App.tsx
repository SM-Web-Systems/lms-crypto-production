import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { DataProvider } from './context/DataContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import Landing from './pages/Landing';
import Messages from './pages/Messages';
import Profile from './pages/Profile';
import CourseMembers from './pages/CourseMembers';
import StudentDashboard from './pages/StudentDashboard';
import StudentSubmissions from './pages/StudentSubmissions';
import AdminDashboard from './pages/AdminDashboard';
import AdminStudents from './pages/AdminStudents';
import AdminSubmissions from './pages/AdminSubmissions';
import StudentDocuments from './pages/StudentDocuments';
import StudentCourse from './pages/StudentCourse';
import Forum from './pages/Forum';
import AdminDocuments from './pages/AdminDocuments';
import AdminCourse from './pages/AdminCourse';
import AdminQuizzes from './pages/AdminQuizzes';
import StudentQuizzes from './pages/StudentQuizzes';
import { Loader2 } from 'lucide-react';
import { ToastProvider } from './components/ToastProvider';

const LoadingScreen: React.FC = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="text-center">
      <Loader2 className="h-12 w-12 animate-spin text-primary-600 mx-auto" />
      <p className="mt-4 text-gray-600">Loading...</p>
    </div>
  </div>
);

const ProtectedRoute: React.FC<{ 
  children: React.ReactNode; 
  allowedRole?: 'student' | 'admin' 
}> = ({ children, allowedRole }) => {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRole && user?.role !== allowedRole) {
    return <Navigate to={user?.role === 'admin' ? '/admin' : '/student'} replace />;
  }

  return <>{children}</>;
};

const HomeRoute: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      navigate(user.role === 'admin' ? '/admin' : '/student', { replace: true });
    }
  }, [isAuthenticated, user, navigate, isLoading]);

  if (isLoading) {
    return <LoadingScreen />;
  }
  if (isAuthenticated && user) {
    return null;
  }
  return <Landing />;
};

const LoginRoute: React.FC = () => {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (isAuthenticated && user) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/student'} replace />;
  }

  return <Login />;
};

const SignUpRoute: React.FC = () => {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (isAuthenticated && user) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/student'} replace />;
  }

  return <SignUp />;
};

function App() {
  return (
    <ThemeProvider>
    <Router>
      <ToastProvider>
        <AuthProvider>
          <DataProvider>
            <Routes>
            <Route path="/login/*" element={<LoginRoute />} />
            <Route path="/sign-up/*" element={<SignUpRoute />} />
            <Route path="/" element={<HomeRoute />} />

            {/* Student Routes */}
            <Route
              path="/student"
              element={
                <ProtectedRoute allowedRole="student">
                  <Layout>
                    <StudentDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/submissions"
              element={
                <ProtectedRoute allowedRole="student">
                  <Layout>
                    <StudentSubmissions />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/documents"
              element={
                <ProtectedRoute allowedRole="student">
                  <Layout>
                    <StudentDocuments />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/course"
              element={
                <ProtectedRoute allowedRole="student">
                  <Layout>
                    <StudentCourse />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/forum"
              element={
                <ProtectedRoute allowedRole="student">
                  <Layout>
                    <Forum />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/messages"
              element={
                <ProtectedRoute allowedRole="student">
                  <Layout>
                    <Messages />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/quizzes"
              element={
                <ProtectedRoute allowedRole="student">
                  <Layout>
                    <StudentQuizzes />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/profile"
              element={
                <ProtectedRoute allowedRole="student">
                  <Layout>
                    <Profile />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/profile/:userId"
              element={
                <ProtectedRoute allowedRole="student">
                  <Layout>
                    <Profile />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/course-members"
              element={
                <ProtectedRoute allowedRole="student">
                  <Layout>
                    <CourseMembers />
                  </Layout>
                </ProtectedRoute>
              }
            />

            {/* Admin Routes */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRole="admin">
                  <Layout>
                    <AdminDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/students"
              element={
                <ProtectedRoute allowedRole="admin">
                  <Layout>
                    <AdminStudents />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/submissions"
              element={
                <ProtectedRoute allowedRole="admin">
                  <Layout>
                    <AdminSubmissions />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/documents"
              element={
                <ProtectedRoute allowedRole="admin">
                  <Layout>
                    <AdminDocuments />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/course"
              element={
                <ProtectedRoute allowedRole="admin">
                  <Layout>
                    <AdminCourse />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/quizzes"
              element={
                <ProtectedRoute allowedRole="admin">
                  <Layout>
                    <AdminQuizzes />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/forum"
              element={
                <ProtectedRoute allowedRole="admin">
                  <Layout>
                    <Forum />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/messages"
              element={
                <ProtectedRoute allowedRole="admin">
                  <Layout>
                    <Messages />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/profile"
              element={
                <ProtectedRoute allowedRole="admin">
                  <Layout>
                    <Profile />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/profile/:userId"
              element={
                <ProtectedRoute allowedRole="admin">
                  <Layout>
                    <Profile />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/course-members"
              element={
                <ProtectedRoute allowedRole="admin">
                  <Layout>
                    <CourseMembers />
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </DataProvider>
        </AuthProvider>
      </ToastProvider>
    </Router>
    </ThemeProvider>
  );
}

export default App;
