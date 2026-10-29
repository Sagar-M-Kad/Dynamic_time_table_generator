import Button from "@mui/material/Button";
import logo from "../logo.png";
import {
  Sparkles,
  Radio,
  History,
  Users,
  School,
  BookOpen,
  Settings2,
  X,
  FolderTree,
  Settings,
} from "lucide-react";

const Sidebar = ({ activePage, setActivePage, onLogout, isOpen, onClose }) => {
  const mainItems = [
    { id: "generate", label: "Generate AI", icon: Sparkles },
    { id: "live", label: "Live Status", icon: Radio },
    { id: "recent", label: "Recent TimeTables", icon: History },
  ];

  const manageItems = [
    { id: "academic", label: "Academic Structure", icon: FolderTree },
    { id: "teachers", label: "Teachers", icon: Users },
    { id: "rooms", label: "Rooms", icon: School },
    { id: "subjects", label: "Subjects & Electives", icon: BookOpen },
    { id: "constraints", label: "Constraints", icon: Settings2 },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  const handleNav = (id) => {
    setActivePage(id);
    onClose?.(); // close sidebar on mobile after selecting
  };

  return (
    <>
      {/* Overlay — only on mobile when sidebar is open */}
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}

      <div className={`sidebar ${isOpen ? "sidebar-open" : ""}`}>
        {/* Mobile close button */}
        <button
          className="sidebar-close-btn"
          onClick={onClose}
          aria-label="Close menu"
        >
          <X size={20} />
        </button>

        <h2>TimeTable AI</h2>

        <p className="nav-section-label">Operations</p>

        {mainItems.map((item) => (
          <div
            key={item.id}
            className={`nav-item ${activePage === item.id ? "active" : ""}`}
            onClick={() => handleNav(item.id)}
          >
            <item.icon
              size={18}
              strokeWidth={2}
              style={{ marginRight: 10, flexShrink: 0 }}
            />
            {item.label}
          </div>
        ))}

        <p className="nav-section-label" style={{ marginTop: 16 }}>
          Manage
        </p>

        {manageItems.map((item) => (
          <div
            key={item.id}
            className={`nav-item ${activePage === item.id ? "active" : ""}`}
            onClick={() => handleNav(item.id)}
          >
            <item.icon
              size={18}
              strokeWidth={2}
              style={{ marginRight: 10, flexShrink: 0 }}
            />
            {item.label}
          </div>
        ))}

        {/* Footer */}
        <div className="sidebar-footer">
          <img
            title="Team 17"
            className="sidebar-logo"
            src={logo}
            alt="Team logo"
          />
          <Button
            variant="contained"
            style={{
              flex: 1,
              color: "red",
              backgroundImage:
                "linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(255,230,230,1) 40%, rgba(255,200,200,1) 100%)",
              boxShadow: "none",
              minWidth: 0,
            }}
            onClick={onLogout}
          >
            Logout
          </Button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
