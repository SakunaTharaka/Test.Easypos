import React, { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { collection, query, where, getDocs, Timestamp, doc, getDoc } from "firebase/firestore";
import { FaDollarSign, FaUserPlus, FaFileInvoice, FaExclamationTriangle } from "react-icons/fa";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { calculateStockBalances } from "../utils/inventoryUtils";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler
);

const DashboardView = ({ internalUser }) => {
  const [stats, setStats] = useState({ totalSales: 0, newCustomers: 0, invoicesToday: 0 });
  const [lowStockItems, setLowStockItems] = useState([]);
  const [showLowStockAlert, setShowLowStockAlert] = useState(false);
  const [loading, setLoading] = useState(true);
  const [globalAnnouncement, setGlobalAnnouncement] = useState(null);
  const [salesChartData, setSalesChartData] = useState({ labels: [], datasets: [] });
  
  // Time and Greeting State
  const [currentTime, setCurrentTime] = useState(new Date());
  const [greeting, setGreeting] = useState("");
  const [subGreeting, setSubGreeting] = useState("");

  // Helper: Get Sri Lanka Date String for Doc ID
  const getSriLankaDate = () => {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' }); // YYYY-MM-DD
  };

  // 1. Clock & Greeting Effect
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);

    const hour = new Date().getHours();
    const user = internalUser?.username || "Admin";
    let mainGreet = "Hello";
    
    if (hour < 12) mainGreet = "Good Morning";
    else if (hour < 17) mainGreet = "Good Afternoon";
    else mainGreet = "Good Evening";

    setGreeting(`${mainGreet}, ${user}!`);

    const phrases = [
      "Ready to make today count?",
      "Here's what's happening today.",
      "Hope you're having a productive day!",
      "Let's get some work done.",
      "Your business overview is ready."
    ];
    setSubGreeting(phrases[Math.floor(Math.random() * phrases.length)]);

    return () => clearInterval(timer);
  }, [internalUser]);

  // 2. Data Fetching Effect
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const uid = user.uid;
        
        // --- A. Fetch Today's Stats from daily_stats (Optimized) ---
        const todayDateStr = getSriLankaDate();
        const dailyStatsRef = doc(db, uid, "daily_stats", "entries", todayDateStr);
        
        // --- B. Fetch New Customers (Today) ---
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
        const todayCustomersQuery = query(collection(db, uid, "customers", "customer_list"), where("createdAt", ">=", Timestamp.fromDate(todayStart)), where("createdAt", "<=", Timestamp.fromDate(todayEnd)));

        // --- C. Fetch Settings & Announcements ---
        const settingsRef = doc(db, uid, "settings");
        const announcementRef = doc(db, 'global_settings', 'announcement');

        // Execute Critical Reads
        const [dailyStatsSnap, customersSnap, settingsSnap, announcementSnap] = await Promise.all([
            getDoc(dailyStatsRef),
            getDocs(todayCustomersQuery),
            getDoc(settingsRef),
            getDoc(announcementRef)
        ]);
        
        // 1. Process Key Stats
        let totalSales = 0;
        let invoicesToday = 0;

        if (dailyStatsSnap.exists()) {
            const data = dailyStatsSnap.data();
            totalSales = data.totalSales || 0;
            invoicesToday = data.invoiceCount || 0; // ✅ Fetching count directly from doc
        }

        setStats({ 
            totalSales, 
            invoicesToday, 
            newCustomers: customersSnap.size 
        });

        // 2. Process Announcement
        if (announcementSnap.exists() && announcementSnap.data().isEnabled) {
            setGlobalAnnouncement(announcementSnap.data());
        } else {
            setGlobalAnnouncement(null);
        }

        // 3. Low Stock Logic
        if (settingsSnap.exists()) {
            const threshold = settingsSnap.data().stockReminder;
            const stockReminderThreshold = threshold === "Do not remind" ? null : parseInt(threshold);

            if (stockReminderThreshold !== null) {
                const allStock = await calculateStockBalances(db, uid);
                const lowItems = allStock.filter(item => {
                    if (item.totalStockIn <= 0) return false;
                    const percentage = (item.availableQty / item.totalStockIn) * 100;
                    return percentage <= stockReminderThreshold;
                });

                if (lowItems.length > 0) {
                    setLowStockItems(lowItems);
                    const isAlertDismissed = sessionStorage.getItem('lowStockAlertDismissed') === 'true';
                    if (!isAlertDismissed) setShowLowStockAlert(true);
                }
            }
        }
        
        // 4. Chart Logic (Last 7 Days)
        // Note: Kept as invoice query for historical accuracy if daily_stats wasn't populated before.
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 6);
        weekAgo.setHours(0, 0, 0, 0);

        const weeklyInvoicesQuery = query(collection(db, uid, "invoices", "invoice_list"), where("createdAt", ">=", Timestamp.fromDate(weekAgo)));
        const weeklyInvoicesSnap = await getDocs(weeklyInvoicesQuery);
        
        const dailySales = {};
        for (let i = 0; i < 7; i++) {
            const date = new Date(weekAgo);
            date.setDate(date.getDate() + i);
            const dateString = date.toISOString().split('T')[0];
            dailySales[dateString] = 0;
        }

        weeklyInvoicesSnap.forEach(doc => {
            const inv = doc.data();
            if (inv.createdAt) {
                const dateString = inv.createdAt.toDate().toISOString().split('T')[0];
                if (dailySales[dateString] !== undefined) {
                    dailySales[dateString] += inv.total;
                }
            }
        });
        
        const labels = Object.keys(dailySales).map(date => new Date(date).toLocaleDateString('en-US', { weekday: 'short' }));
        const dataPoints = Object.values(dailySales);

        setSalesChartData({
            labels,
            datasets: [{ 
                label: 'Sales', 
                data: dataPoints, 
                borderColor: '#6366f1', // Indigo
                backgroundColor: 'rgba(99, 102, 241, 0.1)', 
                fill: true, 
                tension: 0.3,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#6366f1',
                pointRadius: 4
            }]
        });

      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []); 

  const handleDismissLowStockAlert = () => {
    setShowLowStockAlert(false);
    sessionStorage.setItem('lowStockAlertDismissed', 'true');
  };

  const formattedDate = currentTime.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const formattedTime = currentTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  if (loading) return (
    <div style={styles.loadingContainer}>
      <div style={styles.loadingSpinner}></div>
      <p>Loading Dashboard...</p>
    </div>
  );

  return (
    <div style={styles.container}>
      {globalAnnouncement && (
        <div style={styles.criticalAlert}>
            <div style={styles.criticalAlertHeader}>
                <FaExclamationTriangle className="pulse-icon" />
                <h3 style={styles.criticalAlertTitle}>Important Announcement</h3>
            </div>
            <p style={styles.criticalAlertText}>{globalAnnouncement.message}</p>
        </div>
      )}

      {showLowStockAlert && lowStockItems.length > 0 && (
        <div style={styles.lowStockAlert}>
            <div style={styles.lowStockAlertHeader}>
                <FaExclamationTriangle style={{ color: '#d46b08' }}/>
                <h4 style={styles.lowStockAlertTitle}>Low Stock Warning</h4>
            </div>
            <p style={styles.lowStockAlertText}>
                The following {lowStockItems.length} item(s) are running low: <strong>{lowStockItems.map(i => i.item).join(', ')}</strong>.
            </p>
            <button onClick={handleDismissLowStockAlert} style={styles.dismissButton}>✕</button>
        </div>
      )}

      {/* --- NEW HEADER SECTION --- */}
      <div style={styles.header}>
        <div style={styles.headerContent}>
            <div>
                <h1 style={styles.title}>{greeting}</h1>
                <p style={styles.subtitle}>{subGreeting}</p>
            </div>
            <div style={styles.timeContainer}>
                <div style={styles.timeText}>{formattedTime}</div>
                <div style={styles.dateText}>{formattedDate}</div>
            </div>
        </div>
      </div>
      
      {/* --- KPI CARDS --- */}
      <div style={styles.cardsContainer}>
        <div style={styles.card}>
          <div style={{...styles.iconWrapper, background: 'linear-gradient(135deg, #10b981, #059669)'}}>
            <FaDollarSign size={22} color="white" />
          </div>
          <div style={styles.cardContent}>
            <p style={styles.cardLabel}>Total Sales (Today)</p>
            <p style={styles.cardValue}>Rs. {stats.totalSales.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        </div>
        <div style={styles.card}>
          <div style={{...styles.iconWrapper, background: 'linear-gradient(135deg, #3b82f6, #2563eb)'}}>
            <FaUserPlus size={22} color="white" />
          </div>
          <div style={styles.cardContent}>
            <p style={styles.cardLabel}>New Customers</p>
            <p style={styles.cardValue}>{stats.newCustomers}</p>
          </div>
        </div>
        <div style={styles.card}>
          <div style={{...styles.iconWrapper, background: 'linear-gradient(135deg, #f59e0b, #d97706)'}}>
            <FaFileInvoice size={22} color="white" />
          </div>
          <div style={styles.cardContent}>
             <p style={styles.cardLabel}>Invoices Today</p>
             <p style={styles.cardValue}>{stats.invoicesToday}</p>
          </div>
        </div>
      </div>

      {/* --- CHART SECTION --- */}
      <div style={styles.mainContent}>
        <div style={styles.chartSection}>
          <div style={styles.chartHeader}>
             <h3 style={styles.sectionTitle}>Sales Performance</h3>
             <span style={styles.chartSubtitle}>Last 7 Days</span>
          </div>
          <div style={styles.chartWrapper}>
            <Line 
                options={{ 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: '#f3f4f6' }, ticks: { font: { size: 10 } } },
                        x: { grid: { display: false }, ticks: { font: { size: 10 } } }
                    }
                }} 
                data={salesChartData} 
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: { padding: '24px', fontFamily: "'Inter', sans-serif", backgroundColor: '#f9fafb', minHeight: '100vh' },
  loadingContainer: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh', flexDirection: 'column', gap: '20px' },
  loadingSpinner: { border: '4px solid #f3f3f3', borderTop: '4px solid #3498db', borderRadius: '50%', width: '50px', height: '50px', animation: 'spin 1s linear infinite' },
  
  // Alerts
  criticalAlert: { backgroundColor: '#fff1f2', border: '1px solid #ffccc7', color: '#a8071a', borderRadius: '12px', padding: '20px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(168,7,26,0.05)' },
  criticalAlertHeader: { display: 'flex', alignItems: 'center', gap: '12px' },
  criticalAlertTitle: { margin: 0, fontSize: '18px', fontWeight: '600' },
  criticalAlertText: { margin: '8px 0 0 0', fontSize: '15px', lineHeight: '1.5' },
  lowStockAlert: { position: 'relative', backgroundColor: '#fffbe6', border: '1px solid #ffe58f', color: '#d46b08', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(212,107,8,0.05)' },
  lowStockAlertHeader: { display: 'flex', alignItems: 'center', gap: '12px' },
  lowStockAlertTitle: { margin: 0, fontSize: '16px', fontWeight: '600' },
  lowStockAlertText: { margin: '8px 0 0 0', fontSize: '14px', lineHeight: '1.5', paddingRight: '30px' },
  dismissButton: { position: 'absolute', top: '12px', right: '12px', background: 'transparent', border: 'none', color: '#d46b08', cursor: 'pointer', fontSize: '16px', opacity: 0.7 },

  // Header & Time
  header: { marginBottom: '32px', backgroundColor: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  headerContent: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' },
  title: { fontSize: '28px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.5px' },
  subtitle: { fontSize: '15px', color: '#6b7280', marginTop: '6px' },
  timeContainer: { textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },
  timeText: { fontSize: '32px', fontWeight: '800', color: '#3730a3', lineHeight: '1' },
  dateText: { fontSize: '14px', fontWeight: '600', color: '#6b7280', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' },

  // Cards
  cardsContainer: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '24px' },
  card: { backgroundColor: '#fff', padding: '24px', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '20px', transition: 'transform 0.2s', border: '1px solid #f3f4f6' },
  iconWrapper: { width: '56px', height: '56px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' },
  cardContent: { display: 'flex', flexDirection: 'column' },
  cardLabel: { fontSize: '13px', fontWeight: '600', color: '#6b7280', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' },
  cardValue: { fontSize: '26px', fontWeight: '800', color: '#111827', margin: '4px 0 0 0' },

  // Chart
  mainContent: { display: 'flex', flexDirection: 'column', gap: '24px' },
  chartSection: { backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '24px', border: '1px solid #f3f4f6' },
  chartHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  sectionTitle: { fontSize: '18px', fontWeight: '700', color: '#1f2937', margin: 0 },
  chartSubtitle: { fontSize: '12px', fontWeight: '600', color: '#9ca3af', backgroundColor: '#f3f4f6', padding: '4px 8px', borderRadius: '6px' },
  chartWrapper: { position: 'relative', height: '350px', width: '100%' },
};

// Add styles for animations
const styleSheet = document.createElement("style");
styleSheet.innerText = `
  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
  .card:hover { transform: translateY(-4px); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
  .pulse-icon { animation: pulse 2s infinite; }
`;
document.head.appendChild(styleSheet);

export default DashboardView;