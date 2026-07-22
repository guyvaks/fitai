import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { ThemeProvider } from "./context/ThemeContext";
import Layout from "./components/layout/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import Metrics from "./pages/Metrics";
import Nutrition from "./pages/Nutrition";
import CalorieCalculator from "./pages/CalorieCalculator";
import Workouts from "./pages/Workouts";
import ManualWorkoutBuilder from "./pages/ManualWorkoutBuilder";
import LiveWorkout from "./pages/LiveWorkout";
import AISuggestion from "./pages/AISuggestion";
import Progress from "./pages/Progress";
import Admin from "./pages/Admin";
import Settings from "./pages/Settings";

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-primary text-xl">טוען...</div>
      </div>
    );
  }
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        {/*
          Mobile-only frame: the whole app is constrained to a phone-width
          column centred on screen, with a darker backdrop outside so it reads
          as a device frame on desktop. Paired with the neutralised breakpoints
          in index.css. To bring desktop back: remove this wrapper (and the
          breakpoint block in index.css) — no page markup needs to change.
        */}
        <div className="min-h-screen w-full flex justify-center bg-[#05070d]">
          {/*
            The `transform` makes this frame the containing block for every
            `position: fixed` descendant (slide-in sidebar, floating + button,
            modals, overlays), so they anchor to the 430px frame instead of the
            viewport. `overflow-hidden` clips the off-screen (closed) sidebar so
            it doesn't peek into the dark backdrop on desktop.
          */}
          <div className="relative w-full max-w-[430px] min-h-screen bg-background shadow-[0_0_80px_rgba(0,0,0,0.55)] overflow-hidden [transform:translateZ(0)]">
        <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Navigate to="/dashboard" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Layout>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Layout>
                <Profile />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/metrics"
          element={
            <ProtectedRoute>
              <Layout>
                <Metrics />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/nutrition"
          element={
            <ProtectedRoute>
              <Layout>
                <Nutrition />
              </Layout>
            </ProtectedRoute>
          }
        />
        {/* יומן אכילה מוזג לתוך דף התזונה כטאב "מעקב יומי" — קישורים ישנים ממשיכים לעבוד */}
        <Route path="/food-log" element={<Navigate to="/nutrition?tab=daily" replace />} />
        <Route
          path="/calorie-calculator"
          element={
            <ProtectedRoute>
              <Layout>
                <CalorieCalculator />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/workouts"
          element={
            <ProtectedRoute>
              <Layout>
                <Workouts />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/workouts/manual-builder"
          element={
            <ProtectedRoute>
              <Layout>
                <ManualWorkoutBuilder />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/live-workout"
          element={
            <ProtectedRoute>
              <Layout>
                <LiveWorkout />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ai-suggestion"
          element={
            <ProtectedRoute>
              <Layout>
                <AISuggestion />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/progress"
          element={
            <ProtectedRoute>
              <Layout>
                <Progress />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <Layout>
                <Admin />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Layout>
                <Settings />
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
          </div>
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}
