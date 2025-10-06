import React, { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { doc, getDoc, updateDoc, collection, getDocs, setDoc, onSnapshot } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

// Import the new central data provider
import { CashBookProvider } from "../context/CashBookContext";

// Import all tab components
import Admin from "./tabs/Admin";
import Settings from "./tabs/Settings";
import Inventory from "./tabs/Inventory";
import PurchasingOrder from "./tabs/PurchasingOrder";
import StockOut from "./tabs/StockOut";
import StockBalance from "./tabs/StockBalance";
import Items from "./tabs/Items";
import Customers from "./tabs/Customers";
import PriceCat from "./tabs/PriceCat";
import AddProduction from "./tabs/AddProduction";
import ProductionBalance from "./tabs/ProductionBalance";

// Import the new Finance sub-tab components
import SalesIncome from "./fintabs/SalesIncome";
import StockPayment from "./fintabs/StockPayment";
import DaySaleBal from "./fintabs/Reconcile";
import Expenses from "./fintabs/Expenses";
import Summary from "./fintabs/Summary";
import CashBook from "./fintabs/CashBook"; 

// Import page components
import DashboardView from "./DashboardView";
import Invoice from "./Invoice";
import SalesReport from "./SalesReport";
import Help from "./Help";

const Dashboard = () => {
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPopup, setShowPopup] = useState(false);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [activeInventoryTab, setActiveInventoryTab] = useState("Stock-In");
  const [activeItemsCustomersTab, setActiveItemsCustomersTab] = useState("Items");
  const [showLoginPopup, setShowLoginPopup] = useState(false);
  const [internalUsers, setInternalUsers] = useState([]);
  const [internalLoggedInUser, setInternalLoggedInUser] = useState(null);
  const [loginInput, setLoginInput] = useState({ username: "", password: "" });
  const [showProductionTabs, setShowProductionTabs] = useState(false);

  const [activeFinanceTab, setActiveFinanceTab] = useState("Sales Income");


  useEffect(() => {
    let settingsListenerUnsubscribe = null;

    const authUnsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (!currentUser) {
        if (settingsListenerUnsubscribe) settingsListenerUnsubscribe();
        navigate("/");
        return;
      }
      
      const uid = currentUser.uid;
      
      const userInfoRefOnboarding = doc(db, "Userinfo", uid);
      const userDocSnap = await getDoc(userInfoRefOnboarding);
      
      if (!userDocSnap.exists() || !userDocSnap.data().status) {
        navigate("/user-details");
        return;
      }

      // START: ADDED SECURITY CHECK FOR TRIAL EXPIRATION
      const userData = userDocSnap.data();
      if (userData.status === 'trialing') {
        const trialEndDate = userData.trialEndDate?.toDate(); // Convert Firestore Timestamp

        if (trialEndDate) {
          const today = new Date();
          today.setHours(0, 0, 0, 0); // Normalize to start of today

          if (today > trialEndDate) {
            // Trial is expired! Block access and redirect.
            navigate("/billing");
            return; // IMPORTANT: Stop execution to prevent dashboard from loading.
          }
        }
      }
      // END: ADDED SECURITY CHECK FOR TRIAL EXPIRATION
      
      const savedInternalUser = JSON.parse(localStorage.getItem("internalLoggedInUser"));
      if (savedInternalUser) setInternalLoggedInUser(savedInternalUser);

      try {
        const settingsRef = doc(db, uid, "settings");
        settingsListenerUnsubscribe = onSnapshot(settingsRef, (docSnap) => {
          if (docSnap.exists()) {
            const settingsData = docSnap.data();
            setUserInfo(settingsData);
            setShowProductionTabs(settingsData.useShiftProduction === true);
          } else {
            setUserInfo({ companyName: "My Business" });
          }
        });

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
      if (settingsListenerUnsubscribe) { settingsListenerUnsubscribe(); }
      window.removeEventListener("storage", syncInternalState);
    };
  }, [navigate]);

  // The rest of the file (handleInternalLogin, render functions, styles) remains exactly the same.
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

  if (loading) return ( <div style={styles.loadingContainer}><div style={styles.loadingSpinner}></div><p style={styles.loadingText}>Loading dashboard...</p></div> );
  
  const allTabs = ["Dashboard", "Invoicing", "Inventory", "Sales Report", "Finance", "Items & Customers", "Admin", "Settings", "Help"];
  const visibleTabs = allTabs.filter(tab => !((tab === "Finance" || tab === "Admin" || tab === "Settings") && !internalLoggedInUser?.isAdmin));

  const renderTabContent = () => {
    if (!auth.currentUser && !loading) { return <p style={styles.accessDenied}>Please log in to continue.</p>; }
    if ((activeTab === "Finance" || activeTab === "Admin") && !internalLoggedInUser?.isAdmin) { return <p style={styles.accessDenied}>Access Denied: Admins only.</p>; }
    
    if (activeTab === "Settings" && !internalLoggedInUser?.isAdmin) { return <p style={styles.accessDenied}>Access Denied: Admins only.</p>; }

    switch (activeTab) {
      case "Dashboard": return <DashboardView internalUser={internalLoggedInUser} />;
      case "Invoicing": return <Invoice internalUser={internalLoggedInUser} />;
      case "Inventory": return (
        <div>
          <div style={styles.inventorySubTabs}>
            {[ "Stock-In", "Stock-Out", ...(showProductionTabs ? ["Add Production", "Production Balance"] : []), "Purchasing Order", "Stock Balance" ].map(tab => (
              <div key={tab} style={{...styles.inventorySubTab, ...(activeInventoryTab === tab ? styles.activeInventorySubTab : {})}} onClick={() => setActiveInventoryTab(tab)}>{tab}</div>
            ))}
          </div>
          <div style={styles.inventoryContent}>
            {activeInventoryTab === "Stock-In" && <Inventory internalUser={internalLoggedInUser} />}
            {activeInventoryTab === "Stock-Out" && <StockOut internalUser={internalLoggedInUser} />}
            {activeInventoryTab === "Add Production" && <AddProduction internalUser={internalLoggedInUser} />}
            {activeInventoryTab === "Production Balance" && <ProductionBalance />}
            {activeInventoryTab === "Purchasing Order" && <PurchasingOrder internalUser={internalLoggedInUser} />}
            {activeInventoryTab === "Stock Balance" && <StockBalance />}
          </div>
        </div>
      );
      case "Sales Report": return <SalesReport internalUser={internalLoggedInUser} />;
      case "Finance": return (
        <div>
          <div style={styles.inventorySubTabs}>
            {[ "Sales Income", "Stock Payments", "Reconcilation", "Expenses", "Summary", "Cash Book" ].map(tab => (
              <div key={tab} style={{...styles.inventorySubTab, ...(activeFinanceTab === tab ? styles.activeInventorySubTab : {})}} onClick={() => setActiveFinanceTab(tab)}>{tab}</div>
            ))}
          </div>
          <div style={styles.inventoryContent}>
            {activeFinanceTab === "Sales Income" && <SalesIncome />}
            {activeFinanceTab === "Stock Payments" && <StockPayment />}
            {activeFinanceTab === "Reconcilation" && <DaySaleBal />}
            {activeFinanceTab === "Expenses" && <Expenses />}
            {activeFinanceTab === "Summary" && <Summary />}
            {activeFinanceTab === "Cash Book" && <CashBook />}
          </div>
        </div>
      );
      case "Help": return <Help />;
      case "Settings": return <Settings />;
      case "Items & Customers": return (
        <div>
          <div style={styles.inventorySubTabs}>
            {["Items", "Customers", "Price Categories"].map(tab => (<div key={tab} style={{...styles.inventorySubTab, ...(activeItemsCustomersTab === tab ? styles.activeInventorySubTab : {})}} onClick={() => setActiveItemsCustomersTab(tab)}>{tab}</div>))}
          </div>
          <div style={styles.inventoryContent}>
            {activeItemsCustomersTab === "Items" && <Items internalUser={internalLoggedInUser} />}
            {activeItemsCustomersTab === "Customers" && <Customers internalUser={internalLoggedInUser} />}
            {activeItemsCustomersTab === "Price Categories" && <PriceCat internalUser={internalLoggedInUser} />}
          </div>
        </div>
      );
      case "Admin": return <Admin internalUsers={internalUsers} setInternalUsers={setInternalUsers} />;
      default: return null;
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.stickyHeader}>
        <div style={styles.navbar}>
          <div style={styles.logoContainer}>
            <div style={styles.logoPlaceholder}>{userInfo?.companyLogo ? (<img src={userInfo.companyLogo} alt="Company Logo" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }}/>) : (userInfo?.companyName?.charAt(0) || "B")}</div>
            <div style={styles.topInfo}>
              <h2 style={styles.companyName}>{userInfo?.companyName || "Business"}</h2>
              <p style={styles.wayneSystems}>Wayne Systems</p> 
            </div>
          </div>
          {internalUsers.length > 1 && internalLoggedInUser && (<button onClick={handleInternalLogout} style={styles.logoutBtn}><span style={styles.logoutText}>Logout</span><span style={styles.logoutIcon}>→</span></button>)}
        </div>
        <div style={styles.tabsContainer}><div style={styles.tabs}>{visibleTabs.map(tab => (<div key={tab} style={{...styles.tab, ...(activeTab === tab ? styles.activeTab : {})}} onClick={() => setActiveTab(tab)}>{tab}</div>))}</div></div>
      </div>
      
      <div style={styles.content}>
        <CashBookProvider>
          {renderTabContent()}
        </CashBookProvider>
      </div>
      
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
      {showLoginPopup && (<div style={styles.popupOverlay}><div style={styles.loginPopupBox}><h3 style={styles.loginTitle}>Internal User Login</h3><input type="text" placeholder="Username" value={loginInput.username} onChange={(e) => setLoginInput({ ...loginInput, username: e.target.value })} style={styles.loginInput} /><input type="password" placeholder="Password" value={loginInput.password} onChange={(e) => setLoginInput({ ...loginInput, password: e.target.value })} style={styles.loginInput} /><div style={styles.loginButtons}><button onClick={handleInternalLogin} style={styles.loginBtn}>Login</button><button onClick={async () => { await auth.signOut(); localStorage.clear(); navigate("/"); }} style={styles.systemLogoutBtn}>Logout from System</button></div></div></div>)}
    </div>
  );
};
// Styles (styles object remains the same)
const styles = {
    stickyHeader: { position: 'sticky', top: 0, zIndex: 1000, backgroundColor: '#fff' },
    wayneSystems: { fontSize: '12px', color: '#bdc3c7', margin: '2px 0 0 0', fontStyle: 'italic' },
    container: { fontFamily: "'Inter', sans-serif", background: "#f8f9fa", minHeight: "100vh" },
    loadingContainer: { display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100vh", color: "#7f8c8d" },
    loadingSpinner: { border: "3px solid rgba(52, 152, 219, 0.2)", borderTop: "3px solid #3498db", borderRadius: "50%", width: "50px", height: "50px", animation: "spin 1s linear infinite", marginBottom: "20px" },
    loadingText: { fontSize: "16px", fontWeight: "500" },
    navbar: { width: "100%", padding: "16px 24px", background: "linear-gradient(135deg, #2c3e50 0%, #1a2530 100%)", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", boxSizing: "border-box" },
    logoContainer: { display: "flex", alignItems: "center" },
    logoPlaceholder: { width: "52px", height: "52px", borderRadius: "12px", background: "linear-gradient(135deg, #3498db, #2c3e50)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "22px", fontWeight: "bold", marginRight: "16px" },
    topInfo: { display: "flex", flexDirection: "column", alignItems: "flex-start" },
    companyName: { margin: "0", fontSize: "22px", fontWeight: "700" },
    logoutBtn: { padding: "10px 18px", border: "none", borderRadius: "8px", background: "linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", fontWeight: "600", fontSize: "14px" },
    logoutText: { fontSize: "14px" },
    logoutIcon: { fontSize: "16px" },
    tabsContainer: { width: "100%", overflowX: "auto", background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" },
    tabs: { display: "flex", justifyContent: "flex-start", minWidth: "fit-content", padding: "0 24px", borderBottom: "1px solid #eaeaea" },
    tab: { padding: "16px 24px", cursor: "pointer", fontSize: "15px", color: "#7f8c8d", fontWeight: "500", whiteSpace: "nowrap", borderBottom: "3px solid transparent" },
    activeTab: { color: "#3498db", fontWeight: "600", borderBottom: "3px solid #3498db" },
    content: { padding: "28px 24px" },
    inventorySubTabs: { display: "flex", borderBottom: "1px solid #eaeaea", marginBottom: "24px", background: "#fff", borderRadius: "8px 8px 0 0", overflowX: "auto" },
    inventorySubTab: { padding: "14px 24px", cursor: "pointer", fontSize: "14px", fontWeight: "500", color: "#7f8c8d", whiteSpace: "nowrap" },
    activeInventorySubTab: { color: "#3498db", fontWeight: "600", borderBottom: "2px solid #3498db", backgroundColor: "#f8f9fa" },
    inventoryContent: { width: "100%", background: "#fff", borderRadius: "8px", boxShadow: "0 2px 10px rgba(0,0,0,0.05)" },
    accessDenied: { textAlign: "center", color: "#e74c3c", fontSize: "18px", padding: "40px", background: "#fff", borderRadius: "8px" },
    popupOverlay: { position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "rgba(0,0,0,0.7)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 2000, padding: "20px", boxSizing: "border-box" },
    popupBox: { width: "100%", maxWidth: "640px", padding: "32px", background: "#fff", borderRadius: "16px", textAlign: "center", display: "flex", flexDirection: "column", gap: "20px", maxHeight: "90vh", overflowY: "auto" },
    welcomeTitle: { margin: "0", color: "#2c3e50", fontSize: "28px", fontWeight: "700" },
    welcomeText: { margin: "0", color: "#7f8c8d", fontSize: "16px" },
    videoWrapper: { margin: "20px 0", borderRadius: "12px", overflow: "hidden", position: "relative", paddingTop: "56.25%" },
    popupBoxiframe: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
    gotItBtn: { marginTop: "10px", padding: "14px 28px", border: "none", borderRadius: "8px", background: "linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)", color: "#fff", cursor: "pointer", fontSize: "16px", fontWeight: "600" },
    loginPopupBox: { width: "100%", maxWidth: "420px", padding: "32px", background: "#fff", borderRadius: "16px", textAlign: "center", display: "flex", flexDirection: "column", gap: "20px", boxSizing: "border-box" },
    loginTitle: { margin: "0", color: "#2c3e50", fontSize: "24px", fontWeight: "700" },
    loginInput: { padding: "14px 16px", border: "1px solid #e0e0e0", borderRadius: "8px", fontSize: "15px", outline: "none" },
    loginButtons: { display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px" },
    loginBtn: { padding: "14px", border: "none", borderRadius: "8px", background: "linear-gradient(135deg, #3498db 0%, #2980b9 100%)", color: "#fff", cursor: "pointer", fontSize: "15px", fontWeight: "600" },
    systemLogoutBtn: { padding: "14px", border: "1px solid #e74c3c", borderRadius: "8px", background: "transparent", color: "#e74c3c", cursor: "pointer", fontSize: "15px", fontWeight: "600" },
};

const styleSheet = document.createElement("style");
styleSheet.innerText = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
document.head.appendChild(styleSheet);

export default Dashboard;