import { useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "../supabaseClient";

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const adminUser = process.env.REACT_APP_ADMIN_USER || "admin";
    const adminPass = process.env.REACT_APP_ADMIN_PASS || "admin123";

    // 1. Check local admin credential
    if (username.trim() === adminUser && password === adminPass) {
      toast.success("Welcome back, Administrator!");
      setLoading(false);
      onLogin();
      return;
    }

    // 2. Fallback to Supabase Auth if configured
    try {
      const email = username.includes("@") ? username.trim() : `${username.trim()}@college.edu`;
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!authErr && data.user) {
        toast.success(`Welcome back, ${data.user.email}!`);
        setLoading(false);
        onLogin();
        return;
      }
    } catch (err) {
      console.warn("Supabase auth check bypassed:", err.message);
    }

    setLoading(false);
    setError("Invalid credentials. Please verify your login details.");
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h2 style={{ color: "var(--primary-color, #4f46e5)", marginBottom: "10px" }}>
          TimeTable AI
        </h2>
        <p style={{ color: "gray", marginBottom: "25px" }}>
          Academic Scheduling Portal
        </p>

        <form onSubmit={handleLoginSubmit}>
          <div className="form-group" style={{ textAlign: "left" }}>
            <label>Username / Email</label>
            <input
              type="text"
              placeholder="admin or user@college.edu"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div
            className="form-group"
            style={{ textAlign: "left", marginTop: "15px" }}
          >
            <label>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p style={{ color: "red", marginTop: 10, fontSize: "0.85rem" }}>{error}</p>}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: "100%", marginTop: "25px", height: "46px" }}
          >
            {loading ? "Verifying…" : "Login to Portal"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
