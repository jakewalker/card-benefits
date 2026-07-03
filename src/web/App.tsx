/**
 * App shell: routes, bottom nav chrome, and a password-login overlay shown
 * only when the API client reports a 401 (AUTH_MODE=password fallback).
 */
import { useEffect, useState, type FormEvent } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { api, ApiClientError } from "./api";
import Dashboard from "./pages/Dashboard";
import CardsList from "./pages/CardsList";
import CardDetail from "./pages/CardDetail";
import CardForm from "./pages/CardForm";

export default function App() {
  const [authRequired, setAuthRequired] = useState(false);

  useEffect(() => {
    function handleUnauthorized() {
      setAuthRequired(true);
    }
    window.addEventListener("api:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("api:unauthorized", handleUnauthorized);
  }, []);

  if (authRequired) {
    return <LoginScreen onSuccess={() => setAuthRequired(false)} />;
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cards" element={<CardsList />} />
          <Route path="/cards/new" element={<CardForm />} />
          <Route path="/cards/:id" element={<CardDetail />} />
          <Route path="/cards/:id/edit" element={<CardForm />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}

function BottomNav() {
  return (
    <nav className="bottom-nav">
      <NavLink
        to="/"
        end
        className={({ isActive }) => `nav-item${isActive ? " nav-item-active" : ""}`}
      >
        Dashboard
      </NavLink>
      <NavLink
        to="/cards"
        className={({ isActive }) => `nav-item${isActive ? " nav-item-active" : ""}`}
      >
        Cards
      </NavLink>
      <NavLink
        to="/cards/new"
        className={({ isActive }) => `nav-item${isActive ? " nav-item-active" : ""}`}
      >
        Add
      </NavLink>
    </nav>
  );
}

function NotFound() {
  return (
    <div className="page">
      <p className="state-message">Page not found.</p>
    </div>
  );
}

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.login(password);
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.error : "Login failed — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-form" onSubmit={handleSubmit}>
        <h1 className="page-title">Card Benefits</h1>
        <p className="benefit-row-subtitle">Enter the app password to continue.</p>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={submitting || !password}>
          {submitting ? "Checking…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
