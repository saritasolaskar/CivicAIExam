import { useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useNavigate,
} from "react-router-dom";
import AdminDashboard from "./components/AdminDashboard";
import { AuthProvider, useAuth } from "./context/AuthContext";
import {
  ShieldCheck,
  UserRound,
  Building2,
  Mail,
  Lock,
  ArrowRight,
  LogOut,
  AlertCircle,
} from "lucide-react";
import OfficerDashboard from "./components/OfficerDashboard";
import CitizenDashboard from "./components/CitizenDashboard";
import "./App.css";

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loader" />
      <p>Loading CivicAI...</p>
    </div>
  );
}

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (!user) return <Navigate to="/login" replace />;

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login(email, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Unable to log in. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div className="auth-heading">
        <span className="eyebrow">WELCOME BACK</span>
        <h2>Sign in to CivicAI</h2>
        <p>Access your civic services dashboard.</p>
      </div>

      <form onSubmit={handleSubmit} className="auth-form">
        <label>Email address</label>
        <div className="input-wrapper">
          <Mail size={18} />
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <label>Password</label>
        <div className="input-wrapper">
          <Lock size={18} />
          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <ErrorMessage message={error} />}

        <button
          className="primary-button"
          type="submit"
          disabled={submitting}
        >
          {submitting ? "Signing in..." : "Sign in"}
          <ArrowRight size={18} />
        </button>
      </form>

      <p className="auth-switch">
        Don't have an account? <Link to="/register">Create account</Link>
      </p>
    </AuthLayout>
  );
}

function Register() {
  const { register, user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const updateField = (event) => {
    setForm({
      ...form,
      [event.target.name]: event.target.value,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await register(form);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Unable to create your account. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div className="auth-heading">
        <span className="eyebrow">JOIN CIVICAI</span>
        <h2>Create your account</h2>
        <p>Report civic issues and track their progress.</p>
      </div>

      <form onSubmit={handleSubmit} className="auth-form">
        <label>Full name</label>
        <div className="input-wrapper">
          <UserRound size={18} />
          <input
            name="name"
            placeholder="Your full name"
            value={form.name}
            onChange={updateField}
            required
          />
        </div>

        <label>Email address</label>
        <div className="input-wrapper">
          <Mail size={18} />
          <input
            type="email"
            name="email"
            placeholder="Your email"
            value={form.email}
            onChange={updateField}
            required
          />
        </div>

        <label>Phone number</label>
        <div className="input-wrapper">
          <UserRound size={18} />
          <input
            type="tel"
            name="phone"
            placeholder="Your phone number"
            value={form.phone}
            onChange={updateField}
          />
        </div>

        <label>Password</label>
        <div className="input-wrapper">
          <Lock size={18} />
          <input
            type="password"
            name="password"
            placeholder="Minimum 8 characters"
            minLength={8}
            value={form.password}
            onChange={updateField}
            required
          />
        </div>

        {error && <ErrorMessage message={error} />}

        <button
          className="primary-button"
          type="submit"
          disabled={submitting}
        >
          {submitting ? "Creating account..." : "Create account"}
          <ArrowRight size={18} />
        </button>
      </form>

      <p className="auth-switch">
        Already registered? <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  );
}

function ErrorMessage({ message }) {
  return (
    <div className="error-message">
      <AlertCircle size={17} />
      <span>{message}</span>
    </div>
  );
}

function AuthLayout({ children }) {
  return (
    <div className="auth-page">
      <section className="auth-visual">
        <div className="brand">
          <div className="brand-icon">
            <ShieldCheck size={25} />
          </div>
          <span>CivicAI</span>
        </div>

        <div className="visual-content">
          <span className="eyebrow">SMARTER CIVIC GOVERNANCE</span>
          <h1>Building better cities, one report at a time.</h1>
          <p>
            A smarter way for citizens and municipal authorities
            to work together towards cleaner, safer communities.
          </p>

          <div className="visual-feature">
            <ShieldCheck size={20} />
            <span>Transparent complaint tracking</span>
          </div>
          <div className="visual-feature">
            <Building2 size={20} />
            <span>Connected municipal services</span>
          </div>
        </div>

        <p className="visual-footer">
          CivicAI · Pune Municipal Corporation
        </p>
      </section>

      <section className="auth-panel">
        <div className="auth-card">{children}</div>
      </section>
    </div>
  );
}

function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const portalDetails = {
    ADMIN: {
      title: "Admin Portal",
      description: "Manage municipal operations, officers and complaints.",
      icon: <ShieldCheck size={28} />,
    },
    OFFICER: {
      title: "Officer Portal",
      description: "View assigned complaints and update their progress.",
      icon: <Building2 size={28} />,
    },
    CITIZEN: {
      title: "Citizen Portal",
      description: "Report civic issues and track your complaints.",
      icon: <UserRound size={28} />,
    },
  };

  const details = portalDetails[user.role];

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  if (user.role === "CITIZEN") {
    return (
      <CitizenDashboard
        user={user}
        onLogout={handleLogout}
      />
    );
  }

  if (user.role === "ADMIN") {
  return (
    <AdminDashboard
      user={user}
      onLogout={handleLogout}
    />
  );
}

if (user.role === "OFFICER") {
  return (
    <OfficerDashboard
      user={user}
      onLogout={handleLogout}
    />
  );
}

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="brand">
          <div className="brand-icon">
            <ShieldCheck size={24} />
          </div>
          <span>CivicAI</span>
        </div>

        <button className="logout-button" onClick={handleLogout}>
          <LogOut size={17} />
          Sign out
        </button>
      </header>

      <main className="dashboard-content">
        <span className="eyebrow">PUNE MUNICIPAL CORPORATION</span>

        <div className="portal-icon">{details.icon}</div>

        <h1>{details.title}</h1>
        <p>{details.description}</p>

        <div className="user-card">
          <div>
            <span className="user-label">SIGNED IN AS</span>
            <h3>{user.name}</h3>
            <p>{user.email}</p>
          </div>

          <span className="role-badge">{user.role}</span>
        </div>

        <div className="next-step-card">
          <h3>Welcome to CivicAI</h3>
          <p>
            Your authentication is connected. The next step is
            connecting this portal to its complaint management
            and dashboard APIs.
          </p>
        </div>
      </main>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}