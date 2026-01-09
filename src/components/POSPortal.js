import React, { useState, useEffect } from "react";
// ✅ ADD Navigate to imports
import { useNavigate, Navigate } from "react-router-dom"; 
import { auth, db, provider } from "../firebase"; 
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth"; 
import { collection, query, where, getDocs, doc, getDoc, onSnapshot } from "firebase/firestore"; 
import { FaCalculator, FaFileInvoice, FaTools, FaChartLine, FaSignOutAlt } from "react-icons/fa";
import { CashBookProvider } from "../context/CashBookContext";

// Import your pages
import Invoice from "../pages/Invoice";
import SalesReport from "../pages/SalesReport";
import Orders from "../pages/tabs/Orders";
import Services from "../pages/tabs/Services";
import companyLogoImg from '../logo.jpeg'; 

const themeColors = { 
  primary: '#00A1FF', 
  secondary: '#F089D7', 
  dark: '#1a2530', 
  light: '#f8f9fa', 
  headerGradient: 'linear-gradient(135deg, rgba(102, 126, 234, 0.95) 0%, rgba(118, 75, 162, 0.95) 100%)', 
  success: '#10b981', 
  danger: '#ef4444', 
};

const POSPortal = () => {
  const navigate = useNavigate(); 

  // --- ACCESS CONTROL STATE ---
  const [maintenanceMode, setMaintenanceMode] = useState({ active: false, loading: true });
  const [trialStatus, setTrialStatus] = useState({ expired: false });

  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [internalUser, setInternalUser] = useState(null);
  const [adminUid, setAdminUid] = useState(null);
  
  // Settings
  const [settings, setSettings] = useState(null);
  const [enableServiceOrders, setEnableServiceOrders] = useState(false); 

  // Admin Login State
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");

  // Staff Login State
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [currentTab, setCurrentTab] = useState("POS");

  // 1. MAINTENANCE CHECK
  useEffect(() => {
    const maintRef = doc(db, 'global_settings', 'maintenance');
    const unsubscribe = onSnapshot(maintRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().isActive) {
        setMaintenanceMode({ active: true, loading: false });
      } else {
        setMaintenanceMode({ active: false, loading: false });
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. AUTH & TRIAL CHECK
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setAdminUid(user.uid);
        await Promise.all([fetchSettings(user.uid), checkTrialStatus(user)]);
      } else {
        setAdminUid(null);
        setSettings(null);
        setTrialStatus({ expired: false });
        localStorage.removeItem("posInternalUser");
        setIsAuthenticated(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchSettings = async (uid) => {
      try {
          const settingsRef = doc(db, uid, "settings");
          const settingsSnap = await getDoc(settingsRef);
          if (settingsSnap.exists()) {
              const data = settingsSnap.data();
              setSettings(data);
              setEnableServiceOrders(data.enableServiceOrders === true);
          }
      } catch (err) {
          console.error("Error loading settings:", err);
      }
  };

  const checkTrialStatus = async (user) => {
      try {
          const userRef = doc(db, 'Userinfo', user.uid);
          const docSnap = await getDoc(userRef);

          if (docSnap.exists()) {
              const userData = docSnap.data();
              const trialEndDate = userData.trialEndDate?.toDate();

              if (trialEndDate) {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0); 
                  if (today > trialEndDate) {
                      setTrialStatus({ expired: true });
                  }
              }
          }
      } catch (err) {
          console.error("Error checking trial:", err);
      }
  };

  // 3. PERSISTENCE
  useEffect(() => {
      const savedUser = localStorage.getItem("posInternalUser");
      if (savedUser) {
          try {
              const parsed = JSON.parse(savedUser);
              if (parsed?.username) {
                  setInternalUser(parsed);
                  setIsAuthenticated(true);
              }
          } catch (e) {
              localStorage.removeItem("posInternalUser");
          }
      }
  }, []);

  // Handlers
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setAdminError("");
    setAdminLoading(true);
    try {
      await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
    } catch (err) {
      setAdminError("Invalid Email or Password.");
    } finally {
      setAdminLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const userDocRef = doc(db, "Userinfo", result.user.uid);
      const docSnap = await getDoc(userDocRef);
      if (!docSnap.exists()) navigate("/user-details");
    } catch (error) {
      setAdminError("Google login failed.");
    }
  };

  const handleStaffLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!adminUid) {
      setError("Device not authorized. Please log in as Admin first.");
      setLoading(false);
      return;
    }

    try {
      const usersRef = collection(db, adminUid, "admin", "admin_details");
      const q = query(usersRef, where("username", "==", username), where("password", "==", password));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const fullUser = { ...querySnapshot.docs[0].data(), id: querySnapshot.docs[0].id };
        setInternalUser(fullUser); 
        setIsAuthenticated(true);
        localStorage.setItem("posInternalUser", JSON.stringify(fullUser));
      } else {
        setError("Invalid username or password.");
      }
    } catch (err) {
      setError("Login Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setInternalUser(null);
    localStorage.removeItem("posInternalUser");
  };

  const handleSystemLogout = async () => {
      if(window.confirm("*** De-authorize device? ***")) {
          await auth.signOut();
          localStorage.clear(); 
          window.location.reload();
      }
  };

  // ==========================================
  // 🛑 BLOCKING LOGIC
  // ==========================================

  // 1. Loading
  if (maintenanceMode.loading) {
      return <div style={styles.loadingContainer}><div style={styles.loadingSpinner}></div></div>;
  }

  // 2. MAINTENANCE
  if (maintenanceMode.active) {
      return (
        <div style={styles.pageContainer}>
          <div style={styles.card}>
            <FaTools size={60} style={{ color: '#f6ad55', margin: '0 auto 20px' }} />
            <h2 style={styles.title}>Maintenance Break</h2>
            <p style={styles.subtitle}>We are improving the system. Please wait.</p>
          </div>
        </div>
      );
  }

  // 3. 🛡️ TRIAL EXPIRED -> REDIRECT TO BILLING PAGE
  // If the admin is logged in (device authorized) AND trial is expired...
  if (adminUid && trialStatus.expired) {
      // ✅ FORCE REDIRECT: This prevents staying on /pos
      // 'replace' ensures they can't click "Back" to return here.
      return <Navigate to="/billing" replace />;
  }

  // ==========================================
  // 🚀 NORMAL FLOW
  // ==========================================

  if (!isAuthenticated) {
    return (
      <div style={styles.pageContainer}>
        {!adminUid ? (
          <div style={styles.card}>
            <div style={styles.headerIcon}><img src={companyLogoImg} alt="Logo" style={styles.loginLogo} /></div>
            <h2 style={styles.title}>Authorize Device</h2>
            <p style={styles.subtitle}>Sign in with Owner Account.</p>
            <div style={styles.formContainer}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Owner Email</label>
                <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} style={styles.input} autoFocus />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Owner Password</label>
                <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} style={styles.input} />
              </div>
              {adminError && <div style={styles.errorMsg}>{adminError}</div>}
              <button onClick={handleAdminLogin} style={styles.primaryButton} disabled={adminLoading}>
                {adminLoading ? "Authorizing..." : "Authorize Device"}
              </button>
              <div style={styles.divider}><span style={styles.dividerText}>OR</span></div>
              <button onClick={handleGoogleLogin} style={styles.googleButton}>Sign in with Google</button>
            </div>
          </div>
        ) : (
          <div style={styles.card}>
            <div style={styles.headerIcon}><img src={companyLogoImg} alt="Logo" style={styles.loginLogo} /></div>
            <h2 style={styles.title}>POS Terminal</h2>
            <div style={styles.successBadge}>Device Authorized</div>
            <p style={styles.subtitle}>Enter staff credentials.</p>
            <div style={styles.formContainer}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Username</label>
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} style={styles.input} autoFocus />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Password / PIN</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={styles.input} />
              </div>
              {error && <div style={styles.errorMsg}>{error}</div>}
              <button onClick={handleStaffLogin} style={styles.primaryButton} disabled={loading}>
                {loading ? "Verifying..." : "Unlock Terminal"}
              </button>
              <button onClick={handleSystemLogout} style={styles.systemLogoutButton}>Logout from System</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isAuthenticated && !adminUid) {
      return <div style={styles.loadingContainer}><div style={styles.loadingSpinner}></div><p>Restoring Session...</p></div>;
  }

  return (
    <CashBookProvider>
        <div style={styles.portalContainer}>
            <div style={styles.navBar}>
                <div style={styles.navLeft}>
                    <div style={styles.logoPlaceholder}>
                        {settings?.companyLogo ? <img src={settings.companyLogo} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }} /> : ( settings?.companyName?.charAt(0) || "B" )}
                    </div>
                    <div>
                        <div style={styles.navBrand}>{settings?.companyName || "POS Terminal"}</div>
                        <div style={styles.navSubBrand}>Wayne Systems</div>
                    </div>
                </div>
                <div style={styles.navTabs}>
                    <button style={currentTab === 'POS' ? styles.tabActive : styles.tab} onClick={() => setCurrentTab('POS')}><FaCalculator style={{marginRight: 8}} /> POS</button>
                    {enableServiceOrders && (
                        <>
                            <button style={currentTab === 'ORDERS' ? styles.tabActive : styles.tab} onClick={() => setCurrentTab('ORDERS')}><FaFileInvoice style={{marginRight: 8}} /> Orders</button>
                            <button style={currentTab === 'SERVICES' ? styles.tabActive : styles.tab} onClick={() => setCurrentTab('SERVICES')}><FaTools style={{marginRight: 8}} /> Services</button>
                        </>
                    )}
                    <button style={currentTab === 'SALES' ? styles.tabActive : styles.tab} onClick={() => setCurrentTab('SALES')}><FaChartLine style={{marginRight: 8}} /> Sales Report</button>
                </div>
                <div style={styles.navRight}>
                    <div style={styles.navUser}>User: <strong>{internalUser?.username || "Staff"}</strong></div>
                    <img src={companyLogoImg} alt="App Logo" style={styles.headerLogo} />
                    <button onClick={handleLogout} style={styles.logoutBtn}><FaSignOutAlt style={{marginRight: 6}} /> Logout</button>
                </div>
            </div>
            <div style={styles.contentArea}>
                {currentTab === 'POS' && <Invoice internalUser={internalUser} />}
                {enableServiceOrders && currentTab === 'ORDERS' && <Orders internalUser={internalUser} />}
                {enableServiceOrders && currentTab === 'SERVICES' && <Services internalUser={internalUser} />}
                {currentTab === 'SALES' && <SalesReport internalUser={internalUser} />}
            </div>
        </div>
    </CashBookProvider>
  );
};

// --- STYLES ---
const styles = {
  loadingContainer: { display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100vh", background: themeColors.light },
  pageContainer: { display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", backgroundColor: themeColors.light, fontFamily: "'Inter', sans-serif", padding: "20px" },
  card: { backgroundColor: "white", borderRadius: "16px", boxShadow: "0 20px 60px rgba(0, 0, 0, 0.1)", padding: "40px", width: "100%", maxWidth: "420px", textAlign: "center" },
  headerIcon: { marginBottom: "20px", display: "flex", justifyContent: "center" },
  loginLogo: { width: '80px', height: '80px', objectFit: 'contain', borderRadius: '12px' },
  title: { textAlign: "center", marginBottom: "5px", color: themeColors.dark, fontSize: "28px", fontWeight: "800", marginTop: 0 },
  subtitle: { textAlign: "center", color: "#64748b", marginBottom: "30px", fontSize: "15px" },
  successBadge: { background: '#d1fae5', color: '#065f46', padding: '6px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 'bold', display: 'inline-block', marginBottom: '15px' },
  formContainer: { display: "flex", flexDirection: "column", textAlign: "left" },
  inputGroup: { marginBottom: "20px" },
  label: { display: "block", marginBottom: "8px", fontSize: "14px", color: "#475569", fontWeight: "600" },
  input: { width: "100%", padding: "14px", borderRadius: "10px", border: "2px solid #e2e8f0", fontSize: "16px", boxSizing: "border-box", outline: "none" },
  primaryButton: { padding: "16px", borderRadius: "10px", border: "none", background: themeColors.headerGradient, color: "#fff", cursor: "pointer", fontSize: "16px", fontWeight: "700", marginTop: "10px", width: "100%", boxShadow: "0 4px 15px rgba(0, 161, 255, 0.3)" },
  systemLogoutButton: { marginTop: "15px", padding: "12px", background: "white", border: "1px solid #ef4444", color: "#ef4444", borderRadius: "10px", fontSize: "14px", fontWeight: "600", cursor: "pointer", width: "100%" },
  errorMsg: { color: themeColors.danger, fontSize: "13px", background: "#fee2e2", padding: "12px", borderRadius: "8px", marginBottom: "20px", textAlign: "center" },
  divider: { display: "flex", alignItems: "center", margin: "24px 0", textAlign: "center", width: '100%' },
  dividerText: { padding: "0 10px", color: "#94a3b8", fontSize: "13px", background: '#fff', position: 'relative', margin: '0 auto', fontWeight: '500' },
  googleButton: { display: "flex", alignItems: "center", justifyContent: "center", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "white", color: "#334155", cursor: "pointer", fontSize: "15px", fontWeight: "600", width: "100%" },
  
  portalContainer: { height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', sans-serif", overflow: 'hidden', background: themeColors.light },
  navBar: { position: 'fixed', top: 0, left: 0, right: 0, height: '80px', background: themeColors.headerGradient, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', zIndex: 1000, backdropFilter: 'blur(10px)' },
  navLeft: { display: 'flex', alignItems: 'center', gap: '16px' },
  logoPlaceholder: { width: "52px", height: "52px", borderRadius: "12px", background: 'rgba(255,255,255,0.2)', display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "22px", fontWeight: "bold", flexShrink: 0 },
  headerLogo: { height: '48px', width: '48px', objectFit: 'cover', borderRadius: '8px' },
  navBrand: { color: 'white', fontSize: '20px', fontWeight: '700' },
  navSubBrand: { color: 'rgba(255,255,255,0.8)', fontSize: '12px' },
  navTabs: { display: 'flex', gap: '5px', height: '100%' },
  tab: { background: 'transparent', color: 'rgba(255,255,255,0.7)', border: 'none', padding: '0 20px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', height: '100%', display: 'flex', alignItems: 'center', borderBottom: '4px solid transparent' },
  tabActive: { background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', padding: '0 20px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', height: '100%', display: 'flex', alignItems: 'center', borderBottom: '4px solid white' },
  navRight: { display: 'flex', alignItems: 'center', gap: '20px' },
  navUser: { color: 'white', fontSize: '14px', background: 'rgba(255,255,255,0.15)', padding: '8px 12px', borderRadius: '8px', fontWeight: '500' },
  logoutBtn: { background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', padding: '8px 16px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', fontSize: '13px' },
  contentArea: { flex: 1, overflowY: 'auto', background: themeColors.light, position: 'relative', marginTop: '80px' },
  loadingSpinner: { border: "3px solid rgba(52, 152, 219, 0.2)", borderTop: `4px solid ${themeColors.primary}`, borderRadius: "50%", width: "40px", height: "40px", animation: "spin 1s linear infinite" },
};

export default POSPortal;