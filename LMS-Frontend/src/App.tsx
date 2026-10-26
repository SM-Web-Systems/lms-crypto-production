import React, { Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation, Link } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { DataProvider } from './context/DataContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import Landing from './pages/Landing';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import SsoCallback from './pages/SsoCallback';
import CertificateVerification from './pages/CertificateVerification';
import { UserRoleManager } from './components/UserRoleManager';
import { Loader2 } from 'lucide-react';
import { ToastProvider } from './components/ToastProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { availableWorkspaces, canAccessPath, homeForUser } from './utils/authorization';
import type { Workspace } from './types/api';

// Lazy-loaded pages — split into separate chunks per route
const Messages = React.lazy(() => import('./pages/Messages'));
const Profile = React.lazy(() => import('./pages/Profile'));
const CourseMembers = React.lazy(() => import('./pages/CourseMembers'));
const StudentDashboard = React.lazy(() => import('./pages/StudentDashboard'));
const StudentSubmissions = React.lazy(() => import('./pages/StudentSubmissions'));
const StudentPayments = React.lazy(() => import('./pages/StudentPayments'));
const BadgeGallery = React.lazy(() => import('./pages/BadgeGallery'));
const StudentDocuments = React.lazy(() => import('./pages/StudentDocuments'));
const StudentCourse = React.lazy(() => import('./pages/StudentCourse'));
const Forum = React.lazy(() => import('./pages/Forum'));
const StudentQuizzes = React.lazy(() => import('./pages/StudentQuizzes'));
const StudentProgress = React.lazy(() => import('./pages/StudentProgress'));
const NotificationSettings = React.lazy(() => import('./pages/NotificationSettings'));
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'));
const AdminStudents = React.lazy(() => import('./pages/AdminStudents'));
const AdminSubmissions = React.lazy(() => import('./pages/AdminSubmissions'));
const AdminDocuments = React.lazy(() => import('./pages/AdminDocuments'));
const AdminCourse = React.lazy(() => import('./pages/AdminCourse'));
const AdminQuizzes = React.lazy(() => import('./pages/AdminQuizzes'));
const AdminCertificates = React.lazy(() => import('./pages/AdminCertificates'));
const SponsorDashboard = React.lazy(() => import('./pages/SponsorDashboard'));
const LecturerDashboard = React.lazy(() => import('./pages/LecturerDashboard'));
const LecturerCourseStudents = React.lazy(() => import('./pages/LecturerCourseStudents'));
const LecturerSubmissions = React.lazy(() => import('./pages/LecturerSubmissions'));
const TADashboard = React.lazy(() => import('./pages/TADashboard'));
const EmployerDashboard = React.lazy(() => import('./pages/EmployerDashboard'));
const ParentDashboard = React.lazy(() => import('./pages/ParentDashboard'));
const TeacherDashboard = React.lazy(() => import('./pages/TeacherDashboard'));

export const AccessDenied: React.FC = () => {
  const { user } = useAuth();
  return <div className="p-8 space-y-4" role="alert"><h1 className="text-xl font-bold">Access unavailable</h1>
    <p>Your current access does not include this page. Contact your administrator if you need access.</p>
    {availableWorkspaces(user).length > 0 && <Link to={homeForUser(user)}>Return to your workspace</Link>}</div>;
};

const LoadingScreen: React.FC = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="text-center">
      <Loader2 className="h-12 w-12 animate-spin text-primary-600 mx-auto" />
      <p className="mt-4 text-gray-600">Loading...</p>
    </div>
  </div>
);

export const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  allowedWorkspace?: Workspace;
  allowedWorkspaces?: Workspace[];
}> = ({ children, allowedWorkspace, allowedWorkspaces }) => {
  const { isAuthenticated, user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const workspaces = availableWorkspaces(user);
  if ((allowedWorkspaces && !allowedWorkspaces.some(role => workspaces.includes(role)))
    || (allowedWorkspace && !workspaces.includes(allowedWorkspace))
    || !canAccessPath(user, location.pathname)) {
    return <AccessDenied />;
  }

  return <>{children}</>;
};

const HomeRoute: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      navigate(homeForUser(user), { replace: true });
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
    return <Navigate to={homeForUser(user)} replace />;
  }

  return <Login />;
};

const SignUpRoute: React.FC = () => {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (isAuthenticated && user) {
    return <Navigate to={homeForUser(user)} replace />;
  }

  return <SignUp />;
};

function App() {
  return (
    <ThemeProvider>
    <Router>
      <ToastProvider>
        <AuthProvider>
          <SessionDataProvider>
            <ErrorBoundary>
            <Suspense fallback={<LoadingScreen />}>
            <Routes>
            <Route path="/login/*" element={<LoginRoute />} />
            <Route path="/sign-up/*" element={<SignUpRoute />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            {/* AmmaWallet SSO callback — must be outside ProtectedRoute */}
            <Route path="/sso-callback" element={<SsoCallback />} />
            {/* Public certificate verification — no auth required */}
            <Route path="/verify/:credentialId" element={<CertificateVerification />} />
            <Route path="/" element={<HomeRoute />} />
            <Route path="/access-denied" element={<ProtectedRoute><AccessDenied /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Layout><Profile /></Layout></ProtectedRoute>} />
            <Route path="/profile/:userId" element={<ProtectedRoute><Layout><Profile /></Layout></ProtectedRoute>} />
            <Route path="/messages" element={<ProtectedRoute><Layout><Messages /></Layout></ProtectedRoute>} />
            <Route path="/forum" element={<ProtectedRoute><Layout><Forum /></Layout></ProtectedRoute>} />
            <Route path="/lecturer/course-members" element={<ProtectedRoute allowedWorkspace="lecturer"><Layout><CourseMembers /></Layout></ProtectedRoute>} />

            {/* Student Routes */}
            <Route
              path="/student"
              element={
                <ProtectedRoute allowedWorkspace="student">
                  <Layout>
                    <StudentDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/submissions"
              element={
                <ProtectedRoute allowedWorkspace="student">
                  <Layout>
                    <StudentSubmissions />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/payments"
              element={
                <ProtectedRoute allowedWorkspace="student">
                  <Layout>
                    <StudentPayments />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/rewards"
              element={
                <ProtectedRoute allowedWorkspace="student">
                  <Layout>
                    <StudentDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/badges"
              element={
                <ProtectedRoute allowedWorkspace="student">
                  <Layout>
                    <BadgeGallery />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/documents"
              element={
                <ProtectedRoute allowedWorkspace="student">
                  <Layout>
                    <StudentDocuments />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/course"
              element={
                <ProtectedRoute allowedWorkspace="student">
                  <Layout>
                    <StudentCourse />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/forum"
              element={
                <ProtectedRoute allowedWorkspace="student">
                  <Layout>
                    <Forum />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/messages"
              element={
                <ProtectedRoute allowedWorkspace="student">
                  <Layout>
                    <Messages />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/quizzes"
              element={
                <ProtectedRoute allowedWorkspace="student">
                  <Layout>
                    <StudentQuizzes />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/progress"
              element={
                <ProtectedRoute allowedWorkspace="student">
                  <Layout>
                    <StudentProgress />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/profile"
              element={
                <ProtectedRoute allowedWorkspace="student">
                  <Layout>
                    <Profile />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/profile/:userId"
              element={
                <ProtectedRoute allowedWorkspace="student">
                  <Layout>
                    <Profile />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/course-members"
              element={
                <ProtectedRoute allowedWorkspace="student">
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
                <ProtectedRoute allowedWorkspace="admin">
                  <Layout>
                    <AdminDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/students"
              element={
                <ProtectedRoute allowedWorkspace="admin">
                  <Layout>
                    <AdminStudents />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/submissions"
              element={
                <ProtectedRoute allowedWorkspace="admin">
                  <Layout>
                    <AdminSubmissions />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/documents"
              element={
                <ProtectedRoute allowedWorkspace="admin">
                  <Layout>
                    <AdminDocuments />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/course"
              element={
                <ProtectedRoute allowedWorkspaces={['admin', 'lecturer']}>
                  <Layout>
                    <AdminCourse />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/quizzes"
              element={
                <ProtectedRoute allowedWorkspace="admin">
                  <Layout>
                    <AdminQuizzes />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/forum"
              element={
                <ProtectedRoute allowedWorkspace="admin">
                  <Layout>
                    <Forum />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/messages"
              element={
                <ProtectedRoute allowedWorkspace="admin">
                  <Layout>
                    <Messages />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/profile"
              element={
                <ProtectedRoute allowedWorkspace="admin">
                  <Layout>
                    <Profile />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/profile/:userId"
              element={
                <ProtectedRoute allowedWorkspace="admin">
                  <Layout>
                    <Profile />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/course-members"
              element={
                <ProtectedRoute allowedWorkspace="admin">
                  <Layout>
                    <CourseMembers />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/certificates"
              element={
                <ProtectedRoute allowedWorkspace="admin">
                  <Layout>
                    <AdminCertificates />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/sponsor/:tab?"
              element={
                <ProtectedRoute allowedWorkspace="admin">
                  <Layout>
                    <SponsorDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/users"
              element={
                <ProtectedRoute allowedWorkspace="admin">
                  <Layout>
                    <UserRoleManager />
                  </Layout>
                </ProtectedRoute>
              }
            />

            {/* Lecturer Routes */}
            <Route
              path="/lecturer"
              element={
                <ProtectedRoute allowedWorkspace="lecturer">
                  <Layout>
                    <LecturerDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/lecturer/courses/:courseId"
              element={
                <ProtectedRoute allowedWorkspace="lecturer">
                  <Layout>
                    <LecturerCourseStudents />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/lecturer/course"
              element={
                <ProtectedRoute allowedWorkspace="lecturer">
                  <Layout>
                    <AdminCourse />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/lecturer/submissions"
              element={
                <ProtectedRoute allowedWorkspace="lecturer">
                  <Layout>
                    <LecturerSubmissions />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/lecturer/messages"
              element={
                <ProtectedRoute allowedWorkspace="lecturer">
                  <Layout>
                    <Messages />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/lecturer/profile"
              element={
                <ProtectedRoute allowedWorkspace="lecturer">
                  <Layout>
                    <Profile />
                  </Layout>
                </ProtectedRoute>
              }
            />

            {/* TA Routes */}
            <Route
              path="/ta"
              element={
                <ProtectedRoute allowedWorkspace="teaching-assistant">
                  <Layout>
                    <TADashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/ta/courses"
              element={
                <ProtectedRoute allowedWorkspace="teaching-assistant">
                  <Layout>
                    <TADashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/ta/grade"
              element={
                <ProtectedRoute allowedWorkspace="teaching-assistant">
                  <Layout>
                    <TADashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />

            {/* Sponsor Routes (self-service) */}
            <Route
              path="/sponsor/:tab?"
              element={
                <ProtectedRoute allowedWorkspace="sponsor">
                  <Layout>
                    <SponsorDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />

            {/* Employer Routes */}
            <Route
              path="/employer"
              element={
                <ProtectedRoute allowedWorkspace="employer">
                  <Layout>
                    <EmployerDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/employer/rewards"
              element={
                <ProtectedRoute allowedWorkspace="employer">
                  <Layout>
                    <EmployerDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/employer/teams"
              element={
                <ProtectedRoute allowedWorkspace="employer">
                  <Layout>
                    <EmployerDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/employer/billing"
              element={
                <ProtectedRoute allowedWorkspace="employer">
                  <Layout>
                    <EmployerDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />

            {/* Parent Routes */}
            <Route
              path="/parent"
              element={
                <ProtectedRoute allowedWorkspace="parent">
                  <Layout>
                    <ParentDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/parent/rewards"
              element={
                <ProtectedRoute allowedWorkspace="parent">
                  <Layout>
                    <ParentDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/parent/children"
              element={
                <ProtectedRoute allowedWorkspace="parent">
                  <Layout>
                    <ParentDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/parent/wallets"
              element={
                <ProtectedRoute allowedWorkspace="parent">
                  <Layout>
                    <ParentDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/parent/groups"
              element={
                <ProtectedRoute allowedWorkspace="parent">
                  <Layout>
                    <ParentDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/parent/billing"
              element={
                <ProtectedRoute allowedWorkspace="parent">
                  <Layout>
                    <ParentDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />

            {/* Teacher Routes */}
            <Route
              path="/teacher"
              element={
                <ProtectedRoute allowedWorkspace="teacher">
                  <Layout>
                    <TeacherDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/rewards"
              element={
                <ProtectedRoute allowedWorkspace="teacher">
                  <Layout>
                    <TeacherDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/classes"
              element={
                <ProtectedRoute allowedWorkspace="teacher">
                  <Layout>
                    <TeacherDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/analytics"
              element={
                <ProtectedRoute allowedWorkspace="teacher">
                  <Layout>
                    <TeacherDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/billing"
              element={
                <ProtectedRoute allowedWorkspace="teacher">
                  <Layout>
                    <TeacherDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />

            {/* Settings — available to all authenticated roles */}
            <Route
              path="/settings/notifications"
              element={
                <ProtectedRoute>
                  <Layout>
                    <NotificationSettings />
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
            </ErrorBoundary>
          </SessionDataProvider>
        </AuthProvider>
      </ToastProvider>
    </Router>
    </ThemeProvider>
  );
}

export default App;

/** Clear cached rosters/submissions when identity or effective permissions change. */
const SessionDataProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const { user } = useAuth();
  return <DataProvider key={JSON.stringify([user?.id, user?.permissions, user?.workspaces, user?.assignedCourses])}>{children}</DataProvider>;
};
