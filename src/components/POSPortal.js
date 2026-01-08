import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom"; 
import { auth, db, provider } from "../firebase"; 
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth"; 
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore"; 
import { FaCalculator, FaFileInvoice, FaTools, FaChartLine, FaSignOutAlt } from "react-icons/fa";

// ✅ 1. IMPORT THE CONTEXT PROVIDER
import { CashBookProvider } from "../context/CashBookContext";

// Import your pages
import Invoice from "../pages/Invoice";
import SalesReport from "../pages/SalesReport";
import Orders from "../pages/tabs/Orders";
import Services from "../pages/tabs/Services";

// ✅ IMPORT APP LOGO
import companyLogoImg from '../logo.jpeg'; 

// ✅ 2. DEFINE THEME COLORS (From Dashboard.js)
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

  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [internalUser, setInternalUser] = useState(null);
  const [adminUid, setAdminUid] = useState(null);
  
  // Settings & Toggles
  const [settings, setSettings] = useState(null);
  const [enableServiceOrders, setEnableServiceOrders] = useState(false); // Default false until loaded

  // --- STATE FOR STEP 1: MAIN ADMIN LOGIN ---
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");

  // --- STATE FOR STEP 2: STAFF LOGIN ---
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Navigation State
  const [currentTab, setCurrentTab] = useState("POS");

  // 1. Listen for Main Auth Changes (Firebase)
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setAdminUid(user.uid);
        fetchSettings(user.uid);
      } else {
        setAdminUid(null);
        setSettings(null);
        // Clear internal session if main auth is lost
        localStorage.removeItem("posInternalUser");
        setIsAuthenticated(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Fetch Settings (Logo & Toggles)
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

  // 3. PERSISTENCE: Check LocalStorage for Internal User
  useEffect(() => {
      const savedUser = localStorage.getItem("posInternalUser");
      if (savedUser) {
          try {
              const parsed = JSON.parse(savedUser);
              if (parsed && parsed.username) {
                  setInternalUser(parsed);
                  setIsAuthenticated(true);
              }
          } catch (e) {
              localStorage.removeItem("posInternalUser");
          }
      }
  }, []);

  // --- HANDLER: STEP 1 (Main Admin Login - Email) ---
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setAdminError("");
    setAdminLoading(true);
    try {
      await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
    } catch (err) {
      console.error(err);
      setAdminError("Invalid Email or Password.");
    } finally {
      setAdminLoading(false);
    }
  };

  // --- HANDLER: STEP 1 (Main Admin Login - Google) ---
  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userDocRef = doc(db, "Userinfo", user.uid);
      const docSnap = await getDoc(userDocRef);

      if (!docSnap.exists()) {
        navigate("/user-details");
      } 
      
    } catch (error) {
      console.error(error);
      setAdminError("Google login failed.");
    }
  };

  // --- HANDLER: STEP 2 (Staff Login) ---
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
      // Corrected Path: admin -> admin_details
      const usersRef = collection(db, adminUid, "admin", "admin_details");
      
      const q = query(
        usersRef, 
        where("username", "==", username), 
        where("password", "==", password)
      );
      
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const userData = querySnapshot.docs[0].data();
        const fullUser = { ...userData, id: querySnapshot.docs[0].id };
        
        setInternalUser(fullUser); 
        setIsAuthenticated(true);
        
        // ✅ SAVE TO LOCAL STORAGE
        localStorage.setItem("posInternalUser", JSON.stringify(fullUser));
      } else {
        setError("Invalid username or password.");
      }
    } catch (err) {
      console.error("Staff Login Error:", err);
      setError("Login Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 3. Handle Logout (Internal Only)
  const handleLogout = () => {
    setIsAuthenticated(false);
    setInternalUser(null);
    setUsername("");
    setPassword("");
    setCurrentTab("POS");
    // ✅ CLEAR LOCAL STORAGE
    localStorage.removeItem("posInternalUser");
  };

  // 4. Handle System Logout (Main Auth)
  const handleSystemLogout = async () => {
      if(window.confirm("*** Are you sure you want to de-authorize this device? ***")) {
          await auth.signOut();
          localStorage.clear(); // Clear everything
          window.location.reload();
      }
  };

  // --- RENDER: AUTH SCREENS (Step 1 & 2) ---
  if (!isAuthenticated) {
    return (
      <div style={styles.pageContainer}>
        {/* === STEP 1: MAIN ADMIN LOGIN === */}
        {!adminUid ? (
          <div style={styles.card}>
            {/* ✅ UPDATED: USE LOGO IMAGE INSTEAD OF ICON */}
            <div style={styles.headerIcon}>
               <img src={companyLogoImg} alt="Logo" style={styles.loginLogo} />
            </div>
            <h2 style={styles.title}>Authorize Device</h2>
            <p style={styles.subtitle}>Sign in with the Owner Account to enable this POS terminal.</p>

            <div style={styles.formContainer}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Owner Email</label>
                <input
                  type="email"
                  placeholder="Enter owner email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  style={styles.input}
                  autoFocus
                />
              </div>
              
              <div style={styles.inputGroup}>
                <label style={styles.label}>Owner Password</label>
                <input
                  type="password"
                  placeholder="Enter password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  style={styles.input}
                />
              </div>

              {adminError && <div style={styles.errorMsg}>{adminError}</div>}
              
              <button onClick={handleAdminLogin} style={styles.primaryButton} disabled={adminLoading}>
                {adminLoading ? "Authorizing..." : "Authorize Device"}
              </button>

              <div style={styles.divider}>
                <span style={styles.dividerText}>OR</span>
              </div>

              <button onClick={handleGoogleLogin} style={styles.googleButton}>
                <svg style={styles.googleIcon} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="20px" height="20px">
                  <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
                  <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
                  <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
                  <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
                </svg>
                Sign in with Google
              </button>
            </div>
          </div>
        ) : (
          // === STEP 2: STAFF LOGIN ===
          <div style={styles.card}>
            {/* ✅ UPDATED: USE LOGO IMAGE INSTEAD OF ICON */}
            <div style={styles.headerIcon}>
               <img src={companyLogoImg} alt="Logo" style={styles.loginLogo} />
            </div>
            <h2 style={styles.title}>POS Terminal</h2>
            <div style={styles.successBadge}>
               Device Authorized
            </div>
            <p style={styles.subtitle}>Enter your staff credentials to unlock.</p>

            <div style={styles.formContainer}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Staff Username</label>
                <input
                  type="text"
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  style={styles.input}
                  autoFocus
                />
              </div>
              
              <div style={styles.inputGroup}>
                <label style={styles.label}>Password / PIN</label>
                <input
                  type="password"
                  placeholder="Enter PIN or Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={styles.input}
                />
              </div>

              {error && <div style={styles.errorMsg}>{error}</div>}
              
              <button onClick={handleStaffLogin} style={styles.primaryButton} disabled={loading}>
                {loading ? "Verifying..." : "Unlock Terminal"}
              </button>

              {/* ✅ UPDATED: SYSTEM LOGOUT AS A PROPER BUTTON */}
              <button onClick={handleSystemLogout} style={styles.systemLogoutButton}>
                  Logout from System 
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ✅ CRITICAL FIX: IF AUTH IS NOT READY, SHOW LOADER DO NOT RENDER INVOICE YET
  if (isAuthenticated && !adminUid) {
      return (
          <div style={{...styles.pageContainer, flexDirection: 'column'}}>
              <div style={{ width: '40px', height: '40px', border: '4px solid #e2e8f0', borderTop: `4px solid ${themeColors.primary}`, borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
              <p style={{marginTop: 20, color: '#64748b', fontWeight: '500'}}>Restoring Session...</p>
              <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          </div>
      );
  }

  // --- RENDER: POS INTERFACE ---
  return (
    // ✅ 3. WRAP IN CASHBOOK PROVIDER
    <CashBookProvider>
        <div style={styles.portalContainer}>
            {/* FIXED TOP HEADER */}
            <div style={styles.navBar}>
                <div style={styles.navLeft}>
                    {/* ✅ LOGIC: SHOW COMPANY LOGO IF AVAILABLE */}
                    <div style={styles.logoPlaceholder}>
                        {settings?.companyLogo ? (
                            <img src={settings.companyLogo} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }} />
                        ) : ( settings?.companyName?.charAt(0) || "B" )}
                    </div>
                    <div>
                        <div style={styles.navBrand}>{settings?.companyName || "POS Terminal"}</div>
                        <div style={styles.navSubBrand}>Wayne Systems</div>
                    </div>
                </div>

                <div style={styles.navTabs}>
                    <button 
                        style={currentTab === 'POS' ? styles.tabActive : styles.tab} 
                        onClick={() => setCurrentTab('POS')}
                    >
                        <FaCalculator style={{marginRight: 8}} /> POS
                    </button>
                    
                    {/* ✅ LOGIC: HIDE TABS IF DISABLED IN SETTINGS */}
                    {enableServiceOrders && (
                        <>
                            <button 
                                style={currentTab === 'ORDERS' ? styles.tabActive : styles.tab} 
                                onClick={() => setCurrentTab('ORDERS')}
                            >
                                <FaFileInvoice style={{marginRight: 8}} /> Orders
                            </button>
                            <button 
                                style={currentTab === 'SERVICES' ? styles.tabActive : styles.tab} 
                                onClick={() => setCurrentTab('SERVICES')}
                            >
                                <FaTools style={{marginRight: 8}} /> Services
                            </button>
                        </>
                    )}
                    
                    <button 
                        style={currentTab === 'SALES' ? styles.tabActive : styles.tab} 
                        onClick={() => setCurrentTab('SALES')}
                    >
                        <FaChartLine style={{marginRight: 8}} /> Sales Report
                    </button>
                </div>

                <div style={styles.navRight}>
                    <div style={styles.navUser}>
                        User: <strong>{internalUser?.username || "Staff"}</strong>
                    </div>
                    {/* ✅ APP LOGO ON RIGHT */}
                    <img src={companyLogoImg} alt="App Logo" style={styles.headerLogo} />
                    
                    <button onClick={handleLogout} style={styles.logoutBtn}>
                        <FaSignOutAlt style={{marginRight: 6}} /> Logout
                    </button>
                </div>
            </div>

            <div style={styles.contentArea}>
                {currentTab === 'POS' && <Invoice internalUser={internalUser} />}
                
                {/* Only render if enabled */}
                {enableServiceOrders && currentTab === 'ORDERS' && <Orders internalUser={internalUser} />}
                {enableServiceOrders && currentTab === 'SERVICES' && <Services internalUser={internalUser} />}
                
                {currentTab === 'SALES' && <SalesReport internalUser={internalUser} />}
            </div>
        </div>
    </CashBookProvider>
  );
};

// --- STYLES (THEME APPLIED + FIXED HEADER) ---
const styles = {
  // Page Layout (Login Screens)
  pageContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    backgroundColor: themeColors.light,
    fontFamily: "'Inter', sans-serif",
    padding: "20px"
  },
  card: {
    backgroundColor: "white",
    borderRadius: "16px",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.1)",
    padding: "40px",
    width: "100%",
    maxWidth: "420px",
    textAlign: "center"
  },
  headerIcon: { marginBottom: "20px", display: "flex", justifyContent: "center" },
  
  // NEW LOGO STYLE FOR LOGIN SCREEN
  loginLogo: { width: '80px', height: '80px', objectFit: 'contain', borderRadius: '12px' },

  title: { textAlign: "center", marginBottom: "5px", color: themeColors.dark, fontSize: "28px", fontWeight: "800", marginTop: 0 },
  subtitle: { textAlign: "center", color: "#64748b", marginBottom: "30px", fontSize: "15px" },
  successBadge: { background: '#d1fae5', color: '#065f46', padding: '6px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 'bold', display: 'inline-block', marginBottom: '15px' },
  
  formContainer: { display: "flex", flexDirection: "column", textAlign: "left" },
  inputGroup: { marginBottom: "20px" },
  label: { display: "block", marginBottom: "8px", fontSize: "14px", color: "#475569", fontWeight: "600" },
  input: { width: "100%", padding: "14px", borderRadius: "10px", border: "2px solid #e2e8f0", fontSize: "16px", boxSizing: "border-box", transition: "border 0.2s", outline: "none" },
  
  primaryButton: { padding: "16px", borderRadius: "10px", border: "none", background: themeColors.headerGradient, color: "#fff", cursor: "pointer", fontSize: "16px", fontWeight: "700", marginTop: "10px", transition: "transform 0.2s", width: "100%", boxShadow: "0 4px 15px rgba(0, 161, 255, 0.3)" },
  
  // NEW BUTTON STYLE FOR SYSTEM LOGOUT
  systemLogoutButton: { marginTop: "15px", padding: "12px", background: "white", border: "1px solid #ef4444", color: "#ef4444", borderRadius: "10px", fontSize: "14px", fontWeight: "600", cursor: "pointer", width: "100%", transition: "all 0.2s" },

  errorMsg: { color: themeColors.danger, fontSize: "13px", background: "#fee2e2", padding: "12px", borderRadius: "8px", marginBottom: "20px", textAlign: "center" },

  // Google Button
  divider: { display: "flex", alignItems: "center", margin: "24px 0", textAlign: "center", width: '100%' },
  dividerText: { padding: "0 10px", color: "#94a3b8", fontSize: "13px", background: '#fff', position: 'relative', margin: '0 auto', fontWeight: '500' },
  googleButton: { display: "flex", alignItems: "center", justifyContent: "center", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "white", color: "#334155", cursor: "pointer", fontSize: "15px", fontWeight: "600", transition: "background 0.2s", width: "100%" },
  googleIcon: { marginRight: "10px" },

  // Portal Layout (THEME APPLIED)
  portalContainer: { height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', sans-serif", overflow: 'hidden', background: themeColors.light },
  
  // NAVBAR (Using Dashboard Gradients + FIXED POSITION)
  navBar: { 
    position: 'fixed', // ✅ FIXED HEADER
    top: 0, left: 0, right: 0,
    height: '80px', 
    background: themeColors.headerGradient, 
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', 
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)', zIndex: 1000,
    backdropFilter: 'blur(10px)'
  },
  navLeft: { display: 'flex', alignItems: 'center', gap: '16px' },
  
  // LOGO STYLES
  logoPlaceholder: { width: "52px", height: "52px", borderRadius: "12px", background: 'rgba(255,255,255,0.2)', display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "22px", fontWeight: "bold", flexShrink: 0, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' },
  headerLogo: { height: '48px', width: '48px', objectFit: 'cover', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' },

  navBrand: { color: 'white', fontSize: '20px', fontWeight: '700', letterSpacing: '-0.5px' },
  navSubBrand: { color: 'rgba(255,255,255,0.8)', fontSize: '12px' },

  navTabs: { display: 'flex', gap: '5px', height: '100%' },
  tab: { 
    background: 'transparent', color: 'rgba(255,255,255,0.7)', border: 'none', padding: '0 20px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', height: '100%', display: 'flex', alignItems: 'center', borderBottom: '4px solid transparent', transition: 'all 0.2s' 
  },
  tabActive: { 
    background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', padding: '0 20px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', height: '100%', display: 'flex', alignItems: 'center', borderBottom: '4px solid white' 
  },
  
  navRight: { display: 'flex', alignItems: 'center', gap: '20px' },
  navUser: { color: 'white', fontSize: '14px', background: 'rgba(255,255,255,0.15)', padding: '8px 12px', borderRadius: '8px', fontWeight: '500' },

  logoutBtn: { 
    background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', 
    padding: '8px 16px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', fontSize: '13px', backdropFilter: 'blur(10px)' 
  },
  
  // ✅ ADDED MARGIN-TOP TO COMPENSATE FOR FIXED HEADER
  contentArea: { flex: 1, overflowY: 'auto', background: themeColors.light, position: 'relative', marginTop: '80px' }
};

export default POSPortal;