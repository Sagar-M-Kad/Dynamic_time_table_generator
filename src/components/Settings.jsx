import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { toast } from "react-hot-toast";
import { setActiveApiKey } from "../services/aiService";
import Button from "@mui/material/Button";
import {
  Key,
  Plus,
  Trash2,
  CheckCircle,
  Circle,
  Eye,
  EyeOff,
  ShieldCheck,
  Zap,
} from "lucide-react";

const Settings = () => {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [selectingId, setSelectingId] = useState(null);

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("api_keys")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("Could not load API keys");
    else setKeys(data || []);
    setLoading(false);
  };

  // ── ADD ──────────────────────────────────────────────────────────────────
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name.trim() || !apiKey.trim())
      return toast.error("Please fill in both name and API key.");
    if (apiKey.trim().length < 5)
      return toast.error("Please enter a valid API key.");

    setAdding(true);

    // Auto-activate if no key is currently active
    const hasActiveKey = keys.some((k) => k.is_active);
    const shouldMakeActive = !hasActiveKey;

    if (shouldMakeActive) {
      await supabase
        .from("api_keys")
        .update({ is_active: false })
        .eq("is_active", true);
    }

    const { error } = await supabase.from("api_keys").insert([
      {
        name: name.trim(),
        api_key: apiKey.trim(),
        is_active: shouldMakeActive,
      },
    ]);

    if (error) {
      toast.error("Failed to save: " + error.message);
    } else {
      if (shouldMakeActive) {
        setActiveApiKey(apiKey.trim());
        toast.success(`API key "${name.trim()}" saved and set as active!`);
      } else {
        toast.success(`API key "${name.trim()}" saved!`);
      }
      setName("");
      setApiKey("");
      fetchKeys();
    }
    setAdding(false);
  };

  // ── SELECT (make active) ─────────────────────────────────────────────────
  const handleSelect = async (key) => {
    if (key.is_active) return; // already active
    setSelectingId(key.id);

    // Deactivate all active keys first
    await supabase
      .from("api_keys")
      .update({ is_active: false })
      .eq("is_active", true);

    // Activate chosen key
    const { error } = await supabase
      .from("api_keys")
      .update({ is_active: true })
      .eq("id", key.id);

    if (error) {
      toast.error("Could not activate key: " + error.message);
    } else {
      // Push the new key into aiService at runtime
      setActiveApiKey(key.api_key);
      toast.success(`"${key.name}" is now the active API key.`);
      fetchKeys();
    }
    setSelectingId(null);
  };

  // ── DELETE ───────────────────────────────────────────────────────────────
  const handleDelete = async (key) => {
    if (!window.confirm(`Delete API key "${key.name}"?`)) return;
    setDeletingId(key.id);

    const { error } = await supabase.from("api_keys").delete().eq("id", key.id);
    if (error) {
      toast.error("Could not delete: " + error.message);
    } else {
      if (key.is_active) setActiveApiKey(null); // clear from aiService if it was active
      toast.success(`"${key.name}" deleted.`);
      fetchKeys();
    }
    setDeletingId(null);
  };

  // Mask key for display safely regardless of length or prefix
  const maskKey = (k) => {
    if (!k) return "";
    if (k.length <= 12) return k.slice(0, 3) + "••••••••" + (k.length > 3 ? k.slice(-2) : "");
    return k.slice(0, 8) + "••••••••••••••••" + k.slice(-4);
  };

  const activeKey = keys.find((k) => k.is_active);

  return (
    <div>
      {/* <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 4px" }}> */}
      {/* ── ACTIVE KEY BANNER ── */}
      {/* {activeKey && (
        <div style={s.activeBanner}>
          <Zap size={16} color="#15803d" style={{ flexShrink: 0 }} />
          <span>
            Active key: <strong>{activeKey.name}</strong>
            &nbsp;·&nbsp;
            <span style={{ fontFamily: "monospace", fontSize: "0.82rem" }}>
              {maskKey(activeKey.api_key)}
            </span>
          </span>
        </div>
      )} */}

      {/* ── ADD FORM ── */}
      <div style={s.card}>
        {/* ── HEADER ── */}
        <div style={s.header}>
          <div style={s.headerIcon}>
            <ShieldCheck size={28} color="#6366f1" />
          </div>
          <div>
            <h2 style={s.title}>API Key Settings</h2>
            <p style={s.subtitle}>
              Manage your Gemini API keys. Only one key is active at a time -
              select which one the timetable generator should use.
            </p>
          </div>
        </div>
        <h3 style={s.sectionTitle}>
          <Plus size={16} style={{ marginRight: 6 }} />
          Add New API Key
        </h3>

        <div style={s.formGrid}>
          <div className="form-group">
            <label style={s.label}>Key Name</label>
            <input
              type="text"
              placeholder="e.g. Production Key"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={s.input}
            />
          </div>

          <div className="form-group">
            <label style={s.label}>Gemini API Key</label>
            <div style={{ position: "relative" }}>
              <input
                type={showKey ? "text" : "password"}
                placeholder="Enter API key..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                style={{
                  ...s.input,
                  paddingRight: 40,
                  fontFamily: "monospace",
                }}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                style={s.eyeBtn}
                tabIndex={-1}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>
        <Button
          variant="contained"
          onClick={handleAdd}
          disabled={adding || !name.trim() || !apiKey.trim()}
        >
          <Plus size={16} />
          {adding ? "Saving…" : "Save API Key"}
        </Button>
        {/* <button
          onClick={handleAdd}
          disabled={adding || !name.trim() || !apiKey.trim()}
          style={{
            ...s.addBtn,
            opacity: adding || !name.trim() || !apiKey.trim() ? 0.5 : 1,
          }}
        >
          <Plus size={16} />
          {adding ? "Saving…" : "Save API Key"}
        </button> */}
      </div>

      {/* ── KEY LIST ── */}
      <div style={s.card}>
        <h3 style={s.sectionTitle}>
          <Key size={16} style={{ marginRight: 6 }} />
          Saved Keys ({keys.length})
        </h3>

        {loading ? (
          <div>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  height: "80px",
                  width: "100%",
                  marginBottom: "15px",
                  borderRadius: "12px",
                  background: "#f6f7f8",
                  backgroundImage: `linear-gradient(
                      90deg,
                      #f6f7f8 0%,
                      #edeef1 20%,
                      #f6f7f8 40%,
                      #f6f7f8 100%
                    )`,
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "800px 100%",
                  animation: "shimmer 1.5s infinite linear",
                }}
              />
            ))}
          </div>
        ) : keys.length === 0 ? (
          <div style={s.empty}>
            <Key size={32} color="#cbd5e1" />
            <p style={{ color: "#94a3b8", marginTop: 8 }}>
              No API keys saved yet.
            </p>
          </div>
        ) : (
          keys.map((key) => (
            <div
              key={key.id}
              style={{
                ...s.keyRow,
                borderColor: key.is_active ? "#6366f1" : "#e2e8f0",
                background: key.is_active ? "#f5f3ff" : "#fff",
              }}
            >
              {/* Status icon */}
              <div style={{ flexShrink: 0 }}>
                {key.is_active ? (
                  <CheckCircle size={20} color="#6366f1" />
                ) : (
                  <Circle size={20} color="#cbd5e1" />
                )}
              </div>

              {/* Key info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={s.keyName}>{key.name}</span>
                  {/* {key.is_active && <span style={s.activePill}>ACTIVE</span>} */}
                </div>
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: "0.78rem",
                    color: "#64748b",
                    marginTop: 2,
                  }}
                >
                  {maskKey(key.api_key)}
                </div>
                <div
                  style={{
                    fontSize: "0.72rem",
                    color: "#94a3b8",
                    marginTop: 2,
                  }}
                >
                  Added{" "}
                  {new Date(key.created_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                {!key.is_active && (
                  <button
                    style={s.selectBtn}
                    disabled={selectingId === key.id}
                    onClick={() => handleSelect(key)}
                  >
                    {selectingId === key.id ? "…" : "Use This"}
                  </button>
                )}
                <button
                  style={s.deleteBtn}
                  disabled={deletingId === key.id}
                  onClick={() => handleDelete(key)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── HOW TO GET A KEY ── */}
      <div style={{ ...s.card }}>
        <h3 style={{ ...s.sectionTitle }}>How to get a Gemini API Key</h3>
        <ol
          style={{
            margin: 0,
            paddingLeft: 20,
            // color: "#166534",
            fontSize: "0.88rem",
            lineHeight: 1.8,
          }}
        >
          <li>
            Go to <strong>Google AI Studio</strong> →{" "}
            <a
              href="https://aistudio.google.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "none" }}
            >
              aistudio.google.com
            </a>
            {/* <code>aistudio.google.com</code> */}
          </li>
          <li>Sign in with your Google account</li>
          <li>
            Click <strong>"Get API Key"</strong> →{" "}
            <strong>"Create API key"</strong>
          </li>
          <li>Copy the key and paste it above</li>
        </ol>
      </div>
    </div>
  );
};

// ── STYLES ────────────────────────────────────────────────────────────────────
const s = {
  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 24,
  },
  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    background: "#ede9fe",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: { margin: 0, fontSize: "1.4rem", fontWeight: 700, color: "#1e293b" },
  subtitle: { margin: "4px 0 0", color: "#64748b", fontSize: "0.88rem" },
  activeBanner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 16px",
    background: "#dcfce7",
    borderRadius: 10,
    border: "1px solid #bbf7d0",
    marginBottom: 20,
    fontSize: "0.88rem",
    color: "#15803d",
  },
  card: {
    background: "#fff",
    borderRadius: 14,
    border: "1px solid #e2e8f0",
    padding: 24,
    marginBottom: 20,
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  },
  sectionTitle: {
    margin: "0 0 18px",
    fontSize: "0.95rem",
    fontWeight: 700,
    color: "#1e293b",
    display: "flex",
    alignItems: "center",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    marginBottom: 16,
  },
  label: {
    display: "block",
    marginBottom: 6,
    fontWeight: 600,
    fontSize: "0.85rem",
    color: "#374151",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    fontSize: "0.9rem",
    background: "#f8fafc",
    boxSizing: "border-box",
  },
  eyeBtn: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#94a3b8",
    padding: 0,
  },
  addBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 20px",
    borderRadius: 8,
    border: "none",
    background: "#6366f1",
    color: "#fff",
    fontWeight: 600,
    fontSize: "0.9rem",
    cursor: "pointer",
  },
  empty: { textAlign: "center", padding: "32px 0" },
  keyRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px solid",
    marginBottom: 10,
    transition: "all 0.2s",
  },
  keyName: { fontWeight: 700, fontSize: "0.95rem", color: "#1e293b" },
  activePill: {
    background: "#6366f1",
    color: "#fff",
    padding: "2px 8px",
    borderRadius: 20,
    fontSize: "0.65rem",
    fontWeight: 800,
  },
  selectBtn: {
    padding: "6px 14px",
    borderRadius: 8,
    border: "1px solid #6366f1",
    background: "#fff",
    color: "#6366f1",
    fontWeight: 600,
    fontSize: "0.82rem",
    cursor: "pointer",
  },
  deleteBtn: {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #fecaca",
    background: "#fff",
    color: "#ef4444",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
  },
};

export default Settings;
