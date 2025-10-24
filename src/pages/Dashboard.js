import React, { useEffect, useState, lazy, Suspense } from "react";
import { auth, db } from "../firebase";
import { doc, getDoc, updateDoc, collection, getDocs, setDoc } from "firebase/firestore";
import { useNavigate, Navigate } from "react-router-dom";
import { FaExclamationCircle } from 'react-icons/fa';

import { CashBookProvider } from "../context/CashBookContext";

// IMPORTED YOUR LOGO
import companyLogo from '../logo.jpeg';

// Lazy-loaded components
const Admin = lazy(() => import("./tabs/Admin"));
const Settings = lazy(() => import("./tabs/Settings"));
const Inventory = lazy(() => import("./tabs/Inventory"));
const PurchasingOrder = lazy(() => import("./tabs/PurchasingOrder"));
const StockOut = lazy(() => import("./tabs/StockOut"));
const StockBalance = lazy(() => import("./tabs/StockBalance"));
const Items = lazy(() => import("./tabs/Items"));
const Customers = lazy(() => import("./tabs/Customers"));
const PriceCat = lazy(() => import("./tabs/PriceCat"));
const AddProduction = lazy(() => import("./tabs/AddProduction"));
const ProductionBalance = lazy(() => import("./tabs/ProductionBalance"));
const SalesIncome = lazy(() => import("./fintabs/SalesIncome"));
const StockPayment = lazy(() => import("./fintabs/StockPayment"));
const DaySaleBal = lazy(() => import("./fintabs/Reconcile"));
const Expenses = lazy(() => import("./fintabs/Expenses"));
const Summary = lazy(() => import("./fintabs/Summary"));
const CashBook = lazy(() => import("./fintabs/CashBook"));
const CreditCust = lazy(() => import("./fintabs/CreditCust"));
const DashboardView = lazy(() => import("./DashboardView"));
const Invoice = lazy(() => import("./Invoice"));
const SalesReport = lazy(() => import("./SalesReport"));
const Help = lazy(() => import("./Help"));
const StockOutBal = lazy(() => import("./tabs/StockOutBal"));


const Dashboard = () => {
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPopup, setShowPopup] = useState(false);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [activeInventoryTab, setActiveInventoryTab] = useState("Purchasing Order"); 
  const [activeItemsCustomersTab, setActiveItemsCustomersTab] = useState("Items");
  const [showLoginPopup, setShowLoginPopup] = useState(false);
  const [internalUsers, setInternalUsers] = useState([]);
  const [internalLoggedInUser, setInternalLoggedInUser] = useState(null);
  const [loginInput, setLoginInput] = useState({ username: "", password: "" });
  const [showProductionTabs, setShowProductionTabs] = useState(false);
  const [activeFinanceTab, setActiveFinanceTab] = useState("Sales Income");
  const [isAnnouncementActive, setIsAnnouncementActive] = useState(false);
  const [maintainCreditCustomers, setMaintainCreditCustomers] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [maintenanceStatus, setMaintenanceStatus] = useState({
    loading: true,
    isActive: false,
  });

  // useEffects
  useEffect(() => {
    const fetchMaintenanceStatus = async () => {
      const maintRef = doc(db, 'global_settings', 'maintenance');
      try {
        const docSnap = await getDoc(maintRef);
        if (docSnap.exists()) {
          setMaintenanceStatus({ loading: false, isActive: docSnap.data().isActive });
        } else {
          setMaintenanceStatus({ loading: false, isActive: false });
        }
      } catch (error) {
        console.error("Error fetching maintenance status:", error);
        setMaintenanceStatus({ loading: false, isActive: false });
      }
    };
    fetchMaintenanceStatus();
  }, []);

  useEffect(() => {
    if (maintenanceStatus.loading || maintenanceStatus.isActive) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const authUnsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (!currentUser) {
        navigate("/");
        return;
      }
      const uid = currentUser.uid;
      const announcementRef = doc(db, 'global_settings', 'announcement');
      try {
        const annocementSnap = await getDoc(announcementRef);
        setIsAnnouncementActive(annocementSnap.exists() && annocementSnap.data().isEnabled);
      } catch (error) {
        console.error("Error fetching announcement:", error);
        setIsAnnouncementActive(false);
      }
      const userInfoRefOnboarding = doc(db, "Userinfo", uid);
      const userDocSnap = await getDoc(userInfoRefOnboarding);
      if (!userDocSnap.exists() || !userDocSnap.data().status) {
        navigate("/user-details");
        return;
      }
      const userData = userDocSnap.data();
      if (userData.status === 'trialing') {
        const trialEndDate = userData.trialEndDate?.toDate();
        if (trialEndDate) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (today > trialEndDate) {
            navigate("/billing");
            return;
          }
        }
      }
      const savedInternalUser = JSON.parse(localStorage.getItem("internalLoggedInUser"));
      if (savedInternalUser) setInternalLoggedInUser(savedInternalUser);
      try {
        const settingsRef = doc(db, uid, "settings");
        try {
          const settingsSnap = await getDoc(settingsRef);
          if (settingsSnap.exists()) {
            const settingsData = settingsSnap.data();
            setUserInfo(settingsData);
            const inventoryType = settingsData.inventoryType || "Buy and Sell only";
            setShowProductionTabs(inventoryType === "Production Selling only" || inventoryType === "We doing both");
            setMaintainCreditCustomers(settingsData.maintainCreditCustomers === true);
          } else {
            setUserInfo({ companyName: "My Business" });
          }
        } catch (error) {
           console.error("Error fetching user settings:", error);
           setUserInfo({ companyName: "My Business" });
        }
        const userInfoDocRef = doc(db, uid, "Userinfo");
        const userInfoSnap = await getDoc(userInfoDocRef);
        if (userInfoSnap.exists() && userInfoSnap.data().firstLoginShown === false) {
           setShowPopup(true);
           await updateDoc(userInfoDocRef, { firstLoginShown: true });
        }
        const internalUsersColRef = collection(db, uid, "admin", "admin_details");
        const internalUsersSnap = await getDocs(internalUsersColRef);
        if (internalUsersSnap.empty) {
            const masterUser = { username: "admin", password: "123", isAdmin: true, isMaster: true };
            await setDoc(doc(internalUsersColRef, "admin"), masterUser);
            const newAdminUser = { id: "admin", ...masterUser };
            setInternalUsers([newAdminUser]);
            setInternalLoggedInUser(newAdminUser);
            localStorage.setItem("internalLoggedInUser", JSON.stringify(newAdminUser));
        } else {
            const users = internalUsersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            setInternalUsers(users);
            if (!savedInternalUser) {
                if (users.length > 1) setShowLoginPopup(true);
                else if (users.length === 1) {
                    setInternalLoggedInUser(users[0]);
                    localStorage.setItem("internalLoggedInUser", JSON.stringify(users[0]));
                }
            }
        }
      } catch (error) {
        alert("Error fetching dashboard data: " + error.message);
      }
      setLoading(false);
    });
    const syncInternalState = (e) => {
      if (e.key === "internalLoggedInUser") {
        const val = JSON.parse(e.newValue);
        if (!val) { setInternalLoggedInUser(null); setLoginInput({ username: "", password: "" }); setShowLoginPopup(true); }
        else { setInternalLoggedInUser(val); setShowLoginPopup(false); }
      }
    };
    window.addEventListener("storage", syncInternalState);
    return () => {
      authUnsubscribe();
      window.removeEventListener("storage", syncInternalState);
    };
  }, [navigate, maintenanceStatus]);

  // Helper Functions
  const handleInternalLogin = () => {
    const matchedUser = internalUsers.find((u) => u.username === loginInput.username && u.password === loginInput.password);
    if (!matchedUser) { alert("Invalid credentials"); return; }
    setInternalLoggedInUser(matchedUser);
    localStorage.setItem("internalLoggedInUser", JSON.stringify(matchedUser));
    setShowLoginPopup(false);
    setLoginInput({ username: "", password: "" });
  };

  const handleInternalLogout = () => {
    setInternalLoggedInUser(null);
    localStorage.removeItem("internalLoggedInUser");
    if (internalUsers.length > 1) setShowLoginPopup(true);
  };
  
  // Loading/Maintenance Screens
  if (maintenanceStatus.loading) {
    return <div style={styles.loadingContainer}><div style={styles.loadingSpinner}></div></div>;
  }
  if (maintenanceStatus.isActive) {
    return <Navigate to="/maintenance" replace />;
  }
  if (loading) return ( <div style={styles.loadingContainer}><div style={styles.loadingSpinner}></div><p style={styles.loadingText}>Loading dashboard...</p></div> );
  
  const allTabs = ["Dashboard", "Invoicing", "Inventory", "Sales Report", "Finance", "Items & Customers", "Admin", "Settings", "Help"];
  const visibleTabs = allTabs.filter(tab => !((tab === "Finance" || tab === "Admin" || tab === "Settings") && !internalLoggedInUser?.isAdmin));

  // Render sticky sub-tabs
  const renderSubTabs = () => {
    let subTabs = [];
    let activeSubTab = "";
    let setActiveSubTab = () => {};

    if (activeTab === "Inventory") {
      subTabs = ["Purchasing Order", "Stock-In", "Stock-Out", "Stores Balance", "Buy&Sell Balance"];
      if (showProductionTabs) {
        subTabs.push("Add Production", "Production Balance");
      }
      activeSubTab = activeInventoryTab;
      setActiveSubTab = setActiveInventoryTab;
    } else if (activeTab === "Finance") {
      subTabs = ["Sales Income", "Stock Payments"];
      if (maintainCreditCustomers) {
        subTabs.push("Credit Customer Cash");
      }
      subTabs.push("Reconcilation", "Expenses", "Summary", "Cash Book");
      activeSubTab = activeFinanceTab;
      setActiveSubTab = setActiveFinanceTab;
    } else if (activeTab === "Items & Customers") {
      subTabs = ["Items", "Customers", "Price Categories"];
      activeSubTab = activeItemsCustomersTab;
      setActiveSubTab = setActiveItemsCustomersTab;
    } else {
      return null;
    }

    return (
      <div style={styles.subTabsContainer}>
        <div style={styles.inventorySubTabs}>
          {subTabs.map(tab => (
            <div 
              key={tab} 
              style={{
                ...styles.inventorySubTab, 
                ...(activeSubTab === tab ? styles.activeInventorySubTab : {})
              }} 
              onClick={() => setActiveSubTab(tab)}
            >
              {tab}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render tab content
  const renderTabContent = () => {
    if (!auth.currentUser && !loading) { return <p style={styles.accessDenied}>Please log in to continue.</p>; }
    if ((activeTab === "Finance" || activeTab === "Admin") && !internalLoggedInUser?.isAdmin) { return <p style={styles.accessDenied}>Access Denied: Admins only.</p>; }
    if (activeTab === "Settings" && !internalLoggedInUser?.isAdmin) { return <p style={styles.accessDenied}>Access Denied: Admins only.</p>; }
    
    switch (activeTab) {
      case "Dashboard": return <DashboardView internalUser={internalLoggedInUser} />;
      case "Invoicing": return <Invoice internalUser={internalLoggedInUser} />;
      case "Inventory":
        return (
          <div style={styles.inventoryContent}>
            {activeInventoryTab === "Stock-In" && <Inventory internalUser={internalLoggedInUser} />}
            {activeInventoryTab === "Stock-Out" && <StockOut internalUser={internalLoggedInUser} />}
            {activeInventoryTab === "Buy&Sell Balance" && <StockOutBal />}
            {activeInventoryTab === "Add Production" && showProductionTabs && <AddProduction internalUser={internalLoggedInUser} />}
            {activeInventoryTab === "Production Balance" && showProductionTabs && <ProductionBalance />}
            {activeInventoryTab === "Purchasing Order" && <PurchasingOrder internalUser={internalLoggedInUser} />}
            {activeInventoryTab === "Stores Balance" && <StockBalance />}
          </div>
        );
      case "Sales Report": return <SalesReport internalUser={internalLoggedInUser} />;
      case "Finance": 
        return (
          <div style={styles.inventoryContent}>
            {activeFinanceTab === "Sales Income" && <SalesIncome />}
            {activeFinanceTab === "Stock Payments" && <StockPayment />}
            {activeFinanceTab === "Credit Customer Cash" && maintainCreditCustomers && <CreditCust />}
            {activeFinanceTab === "Reconcilation" && <DaySaleBal />}
            {activeFinanceTab === "Expenses" && <Expenses />}
            {activeFinanceTab === "Summary" && <Summary />}
            {activeFinanceTab === "Cash Book" && <CashBook />}
          </div>
        );
      case "Help": return <Help />;
      case "Settings": return <Settings />;
      case "Items & Customers": return (
        <div style={styles.inventoryContent}>
          {activeItemsCustomersTab === "Items" && <Items internalUser={internalLoggedInUser} />}
          {activeItemsCustomersTab === "Customers" && <Customers internalUser={internalLoggedInUser} maintainCreditCustomers={maintainCreditCustomers} />}
          {activeItemsCustomersTab === "Price Categories" && <PriceCat internalUser={internalLoggedInUser} />}
        </div>
      );
      case "Admin": return <Admin internalUsers={internalUsers} setInternalUsers={setInternalUsers} />;
      default: return null;
    }
  };

  const loadingFallback = (
    <div style={{...styles.loadingContainer, height: '50vh', color: '#7f8c8d'}}>
      <div style={styles.loadingSpinner}></div>
      <p style={styles.loadingText}>Loading...</p>
    </div>
  );

  // Main JSX Render
  return (
    <div style={styles.container}>
      {/* Invisible hover trigger area */}
      <div
        style={styles.sidebarTriggerArea}
        onMouseEnter={() => setIsSidebarOpen(true)}
      />

      {/* Sidebar */}
      <div
        style={{
          ...styles.sidebar,
          ...(isSidebarOpen ? styles.sidebarOpen : styles.sidebarClosed),
        }}
        onMouseLeave={() => setIsSidebarOpen(false)}
      >
        {/* === SIDEBAR HEADER REMOVED === */}

        <div style={styles.sidebarTabs}>
          {visibleTabs.map((tab) => (
            <div
              key={tab}
              style={{
                ...styles.sidebarTab,
                ...(activeTab === tab ? styles.sidebarActiveTab : {}),
              }}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div style={styles.mainContentWrapper}>
        {/* Fixed Top Header */}
        <div style={styles.topBar}>
          <div style={styles.headerLeft}>
            {/* === LOGO AND NAME MOVED HERE === */}
            <div style={styles.logoPlaceholder}>
              {userInfo?.companyLogo ? (
                <img
                  src={userInfo.companyLogo}
                  alt="Logo"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: "8px",
                  }}
                />
              ) : (
                userInfo?.companyName?.charAt(0) || "B"
              )}
            </div>
            <div style={styles.topInfo}>
              <h2 style={styles.companyName}>
                {userInfo?.companyName || "Business"}
              </h2>
              <p style={styles.wayneSystems}>Wayne Systems</p>
            </div>
            {/* === END OF MOVED CONTENT === */}
          </div>
          
          <div style={styles.headerCenter}>
            {isAnnouncementActive && (
              <div style={styles.blinkingIndicator}>
                <FaExclamationCircle style={{ marginRight: "8px" }} />
                SYSTEM ALERT
              </div>
            )}
          </div>

          <div style={styles.headerRight}>
            {internalLoggedInUser && (
              <div style={styles.userBadge}>
                {/* === AVATAR REMOVED === */}
                <span style={styles.userName}>{internalLoggedInUser.username}</span>
              </div>
            )}

            {/* === YOUR LOGO ADDED HERE === */}
            <img src={companyLogo} alt="Logo" style={styles.headerLogo} />

            {internalUsers.length > 1 && internalLoggedInUser && (
              <button onClick={handleInternalLogout} style={styles.logoutBtn}>
                <span style={styles.logoutText}>Logout</span>
                <span style={styles.logoutIcon}>→</span>
              </button>
            )}
          </div>
        </div>
        
        {/* Sticky Sub-tabs */}
        {renderSubTabs()}

        {/* Content */}
        <div style={styles.content}>
          <Suspense fallback={loadingFallback}>
            <CashBookProvider>{renderTabContent()}</CashBookProvider>
          </Suspense>
        </div>
      </div>

      {/* Popups */}
      {showPopup && (
        <div style={styles.popupOverlay}>
            <div style={styles.popupBox}>
                <h2 style={styles.welcomeTitle}>Welcome to {userInfo?.companyName || "EasyPOS"} 🎉</h2>
                <p style={styles.welcomeText}>Here's a quick video guide to get you started:</p>
                <div style={styles.videoWrapper}>
                    <iframe 
                        style={styles.popupBoxiframe}
                        src="https://youtu.be/DiA2LuJcN4A?si=gOhg0jRYo8ANvZkI" 
                        title="Welcome Video" 
                        frameBorder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowFullScreen
                    />
                </div>
                <button onClick={() => setShowPopup(false)} style={styles.gotItBtn}>Got it</button>
            </div>
        </div>
      )}
      {showLoginPopup && (<div style={styles.popupOverlay}><div style={styles.loginPopupBox}><h3 style={styles.loginTitle}>Internal User Login</h3><input type="text" placeholder="Username" value={loginInput.username} onChange={(e) => setLoginInput({ ...loginInput, username: e.g.target.value })} style={styles.loginInput} /><input type="password" placeholder="Password" value={loginInput.password} onChange={(e) => setLoginInput({ ...loginInput, password: e.target.value })} style={styles.loginInput} /><div style={styles.loginButtons}><button onClick={handleInternalLogin} style={styles.loginBtn}>Login</button><button onClick={async () => { await auth.signOut(); localStorage.clear(); navigate("/"); }} style={styles.systemLogoutBtn}>Logout from System</button></div></div></div>)}
    </div>
  );
};

// MODERN STYLES

const themeColors = {
  primary: '#00A1FF',
  secondary: '#F089D7',
  dark: '#1a2530',
  light: '#f8f9fa',
  // This gradient is now the *base* for the glass effect
  headerGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  success: '#10b981',
  danger: '#ef4444',
};

const styles = {
    // CORE LAYOUT
    container: { 
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", 
      background: themeColors.light, 
      minHeight: "100vh",
      display: 'flex',
      flexDirection: 'row',
    },
    mainContentWrapper: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflowY: 'auto',
      position: 'relative',
      marginLeft: '0',
    },
    content: { 
      padding: "28px 24px",
      flex: 1,
      marginTop: '80px',
    },

    // SIDEBAR (Updated)
    sidebarTriggerArea: {
      position: 'fixed',
      top: 0,
      left: 0,
      bottom: 0,
      width: '20px',
      zIndex: 2001,
    },
    sidebar: {
      position: 'fixed',
      top: 0,
      left: 0,
      bottom: 0,
      width: '260px',
      // UPDATED: Used header gradient colors with 85% opacity for glass effect
      background: `linear-gradient(180deg, rgba(102, 126, 234, 0.85) 0%, rgba(118, 75, 162, 0.85) 100%)`,
      // ADDED: Backdrop filter for the glass effect
      backdropFilter: 'blur(10px)',
      // ADDED: Subtle border for glass edge definition
      borderRight: '1px solid rgba(255, 255, 255, 0.15)',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 2000,
      transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      boxShadow: '4px 0 20px rgba(0, 0, 0, 0.15)',
    },
    sidebarOpen: {
      transform: 'translateX(0)',
    },
    sidebarClosed: {
      transform: 'translateX(-100%)',
    },
    // === sidebarHeader style REMOVED ===
    logoPlaceholder: { 
      width: "52px", 
      height: "52px", 
      borderRadius: "12px", 
      background: `linear-gradient(135deg, ${themeColors.primary}, ${themeColors.secondary})`,
      display: "flex", 
      alignItems: "center", 
      justifyContent: "center", 
      color: "white", 
      fontSize: "22px", 
      fontWeight: "bold", 
      marginRight: "16px",
      flexShrink: 0,
      boxShadow: '0 4px 12px rgba(0, 161, 255, 0.3)',
    },
    sidebarTabs: {
      display: 'flex',
      flexDirection: 'column',
      padding: '16px 0',
      // ADDED: Padding top to give space now that header is gone
      paddingTop: '24px', 
    },
    sidebarTab: {
      padding: '16px 24px',
      cursor: 'pointer',
      fontSize: '15px',
      // UPDATED: Brighter, semi-transparent text for inactive tabs
      color: 'rgba(255, 255, 255, 0.7)',
      fontWeight: '500',
      borderLeft: '4px solid transparent',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      whiteSpace: 'nowrap',
    },
    sidebarActiveTab: {
      color: '#fff',
      fontWeight: '600',
      // UPDATED: Modern white-glass highlight for active tab
      background: 'rgba(255, 255, 255, 0.15)',
      // UPDATED: Solid white border for active tab
      borderLeft: `4px solid #fff`,
    },
    
    // MODERN FIXED TOP HEADER (Updated)
    topBar: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: '80px',
      padding: '0 32px',
      // UPDATED: Used header gradient colors with 85% opacity to enable glass effect
      background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.85) 0%, rgba(118, 75, 162, 0.85) 100%)',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
      // This backdrop filter will now be visible
      backdropFilter: 'blur(10px)',
    },
    
    headerLeft: {
      display: 'flex',
      alignItems: 'center',
      flex: 1,
    },
    
    // === activeTabDisplay style REMOVED ===
    // === tabIcon style REMOVED ===
    // === activeTabText style REMOVED ===
    
    headerCenter: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
    },
    
    headerRight: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      flex: 1,
      justifyContent: 'flex-end',
    },
    
    userBadge: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      // UPDATED PADDING
      padding: '8px 12px',
      background: 'rgba(255, 255, 255, 0.15)',
      borderRadius: '12px',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
    },
    
    userAvatar: {
      width: '36px',
      height: '36px',
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #ffd89b 0%, #19547b 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontWeight: '700',
      fontSize: '14px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
    },
    
    userName: {
      color: '#fff',
      fontWeight: '600',
      fontSize: '14px',
    },

    // UPDATED LOGO STYLE
    headerLogo: {
      height: '52px',
      width: '52px',
      objectFit: 'cover', // Added object-fit
      borderRadius: '8px', // Matched 8px radius from placeholder's inner image
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
    },
    
    // STICKY SUB-TABS
    subTabsContainer: {
      position: 'fixed',
      top: '80px',
      left: 0,
      right: 0,
      zIndex: 999,
      background: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(10px)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      borderBottom: '1px solid rgba(234, 234, 234, 0.8)',
    },
    inventorySubTabs: { 
      display: "flex", 
      overflowX: "auto",
      padding: '0 32px',
    },
    inventorySubTab: { 
      padding: "16px 24px", 
      cursor: "pointer", 
      fontSize: "14px", 
      fontWeight: "500", 
      color: "#64748b", 
      whiteSpace: "nowrap",
      borderBottom: '3px solid transparent',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      position: 'relative',
    },
    activeInventorySubTab: { 
      color: themeColors.primary,
      fontWeight: "700", 
      borderBottom: `3px solid ${themeColors.primary}`,
      background: 'rgba(0, 161, 255, 0.05)',
    },
    
    // CONTENT
    inventoryContent: { 
      width: "100%", 
      background: "#fff", 
      borderRadius: "12px", 
      boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
      overflow: 'hidden',
    },

    // SHARED STYLES
    topInfo: { 
      display: "flex", 
      flexDirection: "column", 
      alignItems: "flex-start" 
    },
    companyName: { 
      margin: "0", 
      fontSize: "22px", 
      fontWeight: "700", 
      color: '#fff',
      letterSpacing: '-0.5px',
    },
    wayneSystems: { 
      fontSize: '12px', 
      color: 'rgba(255, 255, 255, 0.7)', 
      margin: '4px 0 0 0', 
      fontStyle: 'italic',
      fontWeight: '400',
    },
    blinkingIndicator: { 
      display: 'flex', 
      alignItems: 'center', 
      padding: '10px 20px', 
      backgroundColor: 'rgba(239, 68, 68, 0.95)', 
      color: 'white', 
      borderRadius: '10px', 
      fontSize: '13px', 
      fontWeight: '700', 
      textTransform: 'uppercase', 
      animation: 'blinker 1.5s linear infinite', 
      letterSpacing: '1px',
      boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
      border: '1px solid rgba(255, 255, 255, 0.3)',
    },
    logoutBtn: { 
      padding: "12px 20px", 
      border: "none", 
      borderRadius: "10px", 
      background: "rgba(255, 255, 255, 0.2)", 
      color: "#fff", 
      cursor: "pointer", 
      display: "flex", 
      alignItems: "center", 
      gap: "8px", 
      fontWeight: "600", 
      fontSize: "14px",
      transition: 'all 0.3s ease',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      backdropFilter: 'blur(10px)',
    },
    logoutText: { 
      fontSize: "14px" 
    },
    logoutIcon: { 
      fontSize: "16px",
      transition: 'transform 0.3s ease',
    },

    // LOADING & POPUPS
    loadingContainer: { 
      display: "flex", 
      flexDirection: "column", 
      justifyContent: "center", 
      alignItems: "center", 
      height: "100vh", 
      color: "#64748b",
      background: themeColors.light,
    },
    loadingSpinner: { 
      border: `4px solid rgba(0, 161, 255, 0.1)`,
      borderTop: `4px solid ${themeColors.primary}`,
      borderRight: `4px solid ${themeColors.secondary}`,
      borderRadius: "50%", 
      width: "60px", 
      height: "60px", 
      animation: "spin 1s linear infinite, color-rotate 2s linear infinite",
      marginBottom: "24px" 
    },
    loadingText: { 
      fontSize: "16px", 
      fontWeight: "600",
      color: "#64748b",
    },
    accessDenied: { 
      textAlign: "center", 
      color: themeColors.danger, 
      fontSize: "18px", 
      padding: "48px", 
      background: "#fff", 
      borderRadius: "12px",
      fontWeight: "600",
    },
    popupOverlay: { 
      position: "fixed", 
      top: 0, 
      left: 0, 
      width: "100vw", 
      height: "100vh", 
      background: "rgba(0,0,0,0.75)", 
      display: "flex", 
      justifyContent: "center", 
      alignItems: "center", 
      zIndex: 2002, 
      padding: "20px", 
      boxSizing: "border-box",
      backdropFilter: 'blur(4px)',
    },
    popupBox: { 
      width: "100%", 
      maxWidth: "640px", 
      padding: "40px", 
      background: "#fff", 
      borderRadius: "20px", 
      textAlign: "center", 
      display: "flex", 
      flexDirection: "column", 
      gap: "24px", 
      maxHeight: "90vh", 
      overflowY: "auto",
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
    },
    welcomeTitle: { 
      margin: "0", 
      color: "#1e293b", 
      fontSize: "32px", 
      fontWeight: "800",
      letterSpacing: '-0.5px',
    },
    welcomeText: { 
      margin: "0", 
      color: "#64748b", 
      fontSize: "16px",
      fontWeight: "500",
    },
    videoWrapper: { 
      margin: "20px 0", 
      borderRadius: "16px", 
      overflow: "hidden", 
      position: "relative", 
      paddingTop: "56.25%",
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
    },
    popupBoxiframe: { 
      position: "absolute", 
      top: 0, 
      left: 0, 
      width: "100%", 
      height: "100%" 
    },
    gotItBtn: { 
      marginTop: "10px", 
      padding: "16px 32px", 
      border: "none", 
      borderRadius: "12px", 
      background: `linear-gradient(135deg, ${themeColors.success} 0%, #059669 100%)`, 
      color: "#fff", 
      cursor: "pointer", 
      fontSize: "16px", 
      fontWeight: "700",
      transition: 'all 0.3s ease',
      boxShadow: '0 4px 16px rgba(16, 185, 129, 0.3)',
    },
    loginPopupBox: { 
      width: "100%", 
      maxWidth: "420px", 
      padding: "40px", 
      background: "#fff", 
      borderRadius: "20px", 
      textAlign: "center", 
      display: "flex", 
      flexDirection: "column", 
      gap: "20px", 
      boxSizing: "border-box",
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
    },
    loginTitle: { 
      margin: "0", 
      color: "#1e293b", 
      fontSize: "28px", 
      fontWeight: "800",
      letterSpacing: '-0.5px',
    },
    loginInput: { 
      padding: "16px 18px", 
      border: "2px solid #e2e8f0", 
      borderRadius: "12px", 
      fontSize: "15px", 
      outline: "none",
      transition: 'all 0.3s ease',
      fontWeight: "500",
    },
    loginButtons: { 
      display: "flex", 
      flexDirection: "column", 
      gap: "12px", 
      marginTop: "8px" 
    },
    loginBtn: { 
      padding: "16px", 
      border: "none", 
      borderRadius: "12px", 
      background: `linear-gradient(135deg, ${themeColors.primary}, ${themeColors.secondary})`,
      color: "#fff", 
      cursor: "pointer", 
      fontSize: "16px", 
      fontWeight: "700",
      transition: 'all 0.3s ease',
      boxShadow: '0 4px 16px rgba(0, 161, 255, 0.3)',
    },
    systemLogoutBtn: { 
      padding: "16px", 
      border: "2px solid #ef4444", 
      borderRadius: "12px", 
      background: "transparent", 
      color: "#ef4444", 
      cursor: "pointer", 
      fontSize: "15px", 
      fontWeight: "700",
      transition: 'all 0.3s ease',
    },
};

// KEYFRAMES
const styleSheet = document.createElement("style");
styleSheet.innerText = `
  @keyframes spin { 
    0% { transform: rotate(0deg); } 
    100% { transform: rotate(360deg); } 
  }
  @keyframes blinker { 
    50% { opacity: 0.7; } 
  }
  @keyframes color-rotate {
    0% { border-top-color: ${themeColors.primary}; border-right-color: ${themeColors.secondary}; }
    50% { border-top-color: ${themeColors.secondary}; border-right-color: ${themeColors.primary}; }
    100% { border-top-color: ${themeColors.primary}; border-right-color: ${themeColors.secondary}; }
  }
  
  /* Hover effects */
  button:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
  }
  
  /* Input focus effect */
  input:focus {
    border-color: ${themeColors.primary};
    box-shadow: 0 0 0 3px rgba(0, 161, 255, 0.1);
  }
  
  /* Scrollbar styling */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  
  ::-webkit-scrollbar-track {
    background: #f1f5f9;
  }
  
  ::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 4px;
  }
  
  ::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }
`;
document.head.appendChild(styleSheet);

export default Dashboard;