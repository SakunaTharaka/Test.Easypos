import React, { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { collection, query, where, getDocs, Timestamp, doc, getDoc, onSnapshot } from "firebase/firestore";
// 💡 Added FaRegTimesCircle for the dismiss button
import { FaDollarSign, FaUserPlus, FaFileInvoice, FaExclamationTriangle, FaUserClock, FaRegTimesCircle } from "react-icons/fa";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { calculateStockBalances } from "../utils/inventoryUtils"; // 💡 Import the utility function

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler
);

const DashboardView = ({ internalUser }) => {
  const [stats, setStats] = useState({ totalSales: 0, newCustomers: 0, invoicesToday: 0 });
  
  // ✅ States are already here, we will now use them!
  const [lowStockItems, setLowStockItems] = useState([]);
  const [showLowStockAlert, setShowLowStockAlert] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [globalAnnouncement, setGlobalAnnouncement] = useState(null);
  const [salesChartData, setSalesChartData] = useState({ labels: [], datasets: [] });
  const [overdueCustomers, setOverdueCustomers] = useState([]);

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
        
        // --- Concurrently fetch all dashboard data ---
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
        const todayInvoicesQuery = query(collection(db, uid, "invoices", "invoice_list"), where("createdAt", ">=", Timestamp.fromDate(todayStart)), where("createdAt", "<=", Timestamp.fromDate(todayEnd)));
        const todayCustomersQuery = query(collection(db, uid, "customers", "customer_list"), where("createdAt", ">=", Timestamp.fromDate(todayStart)), where("createdAt", "<=", Timestamp.fromDate(todayEnd)));
        const settingsRef = doc(db, uid, "settings");
        
        const [invoicesSnap, customersSnap, settingsSnap] = await Promise.all([
            getDocs(todayInvoicesQuery),
            getDocs(todayCustomersQuery),
            getDoc(settingsRef)
        ]);
        
        // ... (KPI calculation logic remains the same) ...
        let totalSales = 0;
        let actualInvoiceCount = 0;
        invoicesSnap.forEach(doc => {
            const invoiceData = doc.data();
            totalSales += invoiceData.total || 0;
            if (invoiceData.paymentMethod !== 'Credit-Repayment') {
                actualInvoiceCount++;
            }
        });
        setStats({ totalSales, invoicesToday: actualInvoiceCount, newCustomers: customersSnap.size });

        // 💡 FIX: Fetch and process low stock items
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
                    // Check sessionStorage to see if the user already dismissed the alert
                    const isAlertDismissed = sessionStorage.getItem('lowStockAlertDismissed') === 'true';
                    if (!isAlertDismissed) {
                        setShowLowStockAlert(true);
                    }
                }
            }
        }
        
        // ... (Sales Chart and Overdue Customers logic remains the same) ...
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 6);
        weekAgo.setHours(0, 0, 0, 0);

        const creditCustomersQuery = query(collection(db, uid, "customers", "customer_list"), where("isCreditCustomer", "==", true));
        const weeklyInvoicesQuery = query(collection(db, uid, "invoices", "invoice_list"), where("createdAt", ">=", Timestamp.fromDate(weekAgo)));
        
        const [creditCustomersSnap, weeklyInvoicesSnap] = await Promise.all([
            getDocs(creditCustomersQuery),
            getDocs(weeklyInvoicesQuery)
        ]);
        const creditCustomerIds = new Set(creditCustomersSnap.docs.map(doc => doc.id));

        const validWeeklyInvoices = weeklyInvoicesSnap.docs
            .map(d => d.data())
            .filter(inv => inv.paymentMethod !== 'Credit' || creditCustomerIds.has(inv.customerId) === false);
        
        const dailySales = {};
        for (let i = 0; i < 7; i++) {
            const date = new Date(weekAgo);
            date.setDate(date.getDate() + i);
            const dateString = date.toISOString().split('T')[0];
            dailySales[dateString] = 0;
        }
        validWeeklyInvoices.forEach(inv => {
            const dateString = inv.createdAt.toDate().toISOString().split('T')[0];
            if (dailySales[dateString] !== undefined) {
                dailySales[dateString] += inv.total;
            }
        });
        
        const labels = Object.keys(dailySales).map(date => new Date(date).toLocaleDateString('en-US', { weekday: 'short' }));
        const dataPoints = Object.values(dailySales);

        setSalesChartData({
            labels,
            datasets: [{ 
                label: 'Sales', 
                data: dataPoints, 
                borderColor: '#3498db', 
                backgroundColor: 'rgba(52, 152, 219, 0.1)', 
                fill: true, 
                tension: 0.2 
            }]
        });

        const creditCustomers = creditCustomersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (creditCustomers.length > 0) {
            const creditInvoicesQuery = query(collection(db, uid, "invoices", "invoice_list"), where("customerId", "in", creditCustomers.map(c=>c.id)), where("paymentMethod", "==", "Credit"));
            const creditPaymentsQuery = query(collection(db, uid, "credit_payments", "payments"));

            const [creditInvoicesSnap, creditPaymentsSnap] = await Promise.all([
                getDocs(creditInvoicesQuery),
                getDocs(creditPaymentsQuery)
            ]);

            const paymentsByInvoice = {};
            creditPaymentsSnap.docs.forEach(doc => {
                const payment = doc.data();
                if (!paymentsByInvoice[payment.invoiceId]) paymentsByInvoice[payment.invoiceId] = 0;
                paymentsByInvoice[payment.invoiceId] += payment.amount;
            });
            
            const overdue = {};
            const today = new Date();
            today.setHours(0,0,0,0);

            creditInvoicesSnap.docs.forEach(doc => {
                const invoice = { id: doc.id, ...doc.data() };
                const totalPaid = paymentsByInvoice[invoice.id] || 0;
                const balance = invoice.total - totalPaid;

                if (balance > 0) {
                    const customer = creditCustomers.find(c => c.id === invoice.customerId);
                    const overdueDays = customer?.overdueDays || 30;
                    const invoiceDate = invoice.createdAt.toDate();
                    const dueDate = new Date(invoiceDate);
                    dueDate.setDate(invoiceDate.getDate() + overdueDays);
                    
                    if (dueDate < today) {
                        if (!overdue[invoice.customerName]) overdue[invoice.customerName] = 0;
                        overdue[invoice.customerName] += balance;
                    }
                }
            });
            setOverdueCustomers(Object.entries(overdue).map(([name, amount]) => ({ name, amount })));
        }


      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    const announcementRef = doc(db, 'global_settings', 'announcement');
    const unsubscribe = onSnapshot(announcementRef, (docSnap) => {
        if (docSnap.exists() && docSnap.data().isEnabled) {
            setGlobalAnnouncement(docSnap.data());
        } else {
            setGlobalAnnouncement(null);
        }
    });

    return () => unsubscribe();
  }, []);

  // 💡 FIX: Handler to dismiss the low stock alert
  const handleDismissLowStockAlert = () => {
    setShowLowStockAlert(false);
    sessionStorage.setItem('lowStockAlertDismissed', 'true');
  };


  if (loading) return (
    // ... (loading JSX remains the same) ...
    <div style={styles.loadingContainer}>
      <div style={styles.loadingSpinner}></div>
      <p>Loading Dashboard...</p>
    </div>
  );

  return (
    <div style={styles.container}>
      {/* ... (global announcement JSX remains the same) ... */}
      {globalAnnouncement && (
        <div style={styles.criticalAlert}>
            <div style={styles.criticalAlertHeader}>
                <FaExclamationTriangle className="pulse-icon" />
                <h3 style={styles.criticalAlertTitle}>Important Announcement</h3>
            </div>
            <p style={styles.criticalAlertText}>{globalAnnouncement.message}</p>
        </div>
      )}

      {/* 💡 FIX: Low Stock Alert Notification */}
      {showLowStockAlert && lowStockItems.length > 0 && (
        <div style={styles.lowStockAlert}>
            <div style={styles.lowStockAlertHeader}>
                <FaExclamationTriangle style={{ color: '#d46b08' }}/>
                <h4 style={styles.lowStockAlertTitle}>Low Stock Warning</h4>
            </div>
            <p style={styles.lowStockAlertText}>
                The following {lowStockItems.length} item(s) are running low: <strong>{lowStockItems.map(i => i.item).join(', ')}</strong>.
            </p>
            <button onClick={handleDismissLowStockAlert} style={styles.dismissButton}>
                <FaRegTimesCircle />
            </button>
        </div>
      )}

      <div style={styles.header}>
        {/* ... (header JSX remains the same) ... */}
        <h1 style={styles.title}>Hi, {internalUser?.username || "Admin"}!</h1>
        <p style={styles.subtitle}>Welcome back, here's a look at your business today.</p>
      </div>
      
      {/* ... (rest of the JSX for cards, charts, etc. remains the same) ... */}
      <div style={styles.cardsContainer}>
        <div style={styles.card}>
          <div style={{...styles.iconWrapper, background: 'linear-gradient(135deg, #68d391, #2f855a)'}}>
            <FaDollarSign size={24} />
          </div>
          <p style={styles.cardLabel}>Total Sales (Today)</p>
          <p style={styles.cardValue}>Rs. {stats.totalSales.toFixed(2)}</p>
        </div>
        <div style={styles.card}>
          <div style={{...styles.iconWrapper, background: 'linear-gradient(135deg, #63b3ed, #3182ce)'}}>
            <FaUserPlus size={24} />
          </div>
          <p style={styles.cardLabel}>New Customers</p>
          <p style={styles.cardValue}>{stats.newCustomers}</p>
        </div>
        <div style={styles.card}>
          <div style={{...styles.iconWrapper, background: 'linear-gradient(135deg, #f6ad55, #dd6b20)'}}>
            <FaFileInvoice size={24} />
          </div>
          <p style={styles.cardLabel}>Invoices Today</p>
          <p style={styles.cardValue}>{stats.invoicesToday}</p>
        </div>
      </div>

      <div style={styles.mainContent}>
        <div style={styles.activitySection}>
          <h3 style={styles.sectionTitle}><FaUserClock style={{marginRight: '8px'}}/> Overdue Customers</h3>
          {overdueCustomers.length > 0 ? (
            <ul style={styles.overdueList}>
              {overdueCustomers.map((cust, index) => (
                <li key={index} style={styles.overdueListItem}>
                  <span>{cust.name}</span>
                  <span style={styles.overdueAmount}>Rs. {cust.amount.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={styles.chartPlaceholder}>No overdue credit customers.</p>
          )}
        </div>
        <div style={styles.chartSection}>
          <h3 style={styles.sectionTitle}>Sales This Week</h3>
          <div style={styles.chartWrapper}>
            <Line options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }}}} data={salesChartData} />
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  // ... (all existing styles) ...
  container: { padding: '24px', fontFamily: "'Inter', sans-serif" },
  loadingContainer: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', flexDirection: 'column', gap: '20px' },
  loadingSpinner: { border: '4px solid #f3f3f3', borderTop: '4px solid #3498db', borderRadius: '50%', width: '50px', height: '50px', animation: 'spin 1s linear infinite' },
  criticalAlert: { backgroundColor: '#fff1f2', border: '1px solid #ffccc7', color: '#a8071a', borderRadius: '12px', padding: '20px', marginBottom: '24px', boxShadow: '0 4px 12px rgba(168,7,26,0.1)' },
  criticalAlertHeader: { display: 'flex', alignItems: 'center', gap: '12px' },
  criticalAlertTitle: { margin: 0, fontSize: '18px', fontWeight: '600' },
  criticalAlertText: { margin: '8px 0 0 0', fontSize: '15px', lineHeight: '1.5' },
  
  // 💡 FIX: Added styles for the new low stock alert
  lowStockAlert: {
    position: 'relative',
    backgroundColor: '#fffbe6',
    border: '1px solid #ffe58f',
    color: '#d46b08',
    borderRadius: '12px',
    padding: '16px 20px',
    marginBottom: '24px',
    boxShadow: '0 4px 12px rgba(212,107,8,0.1)',
  },
  lowStockAlertHeader: { display: 'flex', alignItems: 'center', gap: '12px' },
  lowStockAlertTitle: { margin: 0, fontSize: '16px', fontWeight: '600' },
  lowStockAlertText: { margin: '8px 0 0 0', fontSize: '14px', lineHeight: '1.5', paddingRight: '30px' },
  dismissButton: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    background: 'transparent',
    border: 'none',
    color: '#d46b08',
    cursor: 'pointer',
    fontSize: '20px',
    opacity: 0.7,
  },
  
  header: { marginBottom: '24px' },
  title: { fontSize: '32px', fontWeight: 'bold', color: '#111827', margin: 0 },
  subtitle: { fontSize: '16px', color: '#6b7280', marginTop: '4px' },
  cardsContainer: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px', marginBottom: '24px' },
  card: { backgroundColor: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '8px', transition: 'transform 0.2s, box-shadow 0.2s' },
  iconWrapper: { width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px', color: '#fff' },
  cardLabel: { fontSize: '14px', color: '#6b7280', margin: 0 },
  cardValue: { fontSize: '28px', fontWeight: 'bold', color: '#111827', margin: 0 },
  mainContent: { display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', alignItems: 'flex-start' },
  activitySection: { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' },
  sectionTitle: { fontSize: '18px', fontWeight: '600', padding: '20px 24px', margin: 0, borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center' },
  chartSection: { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' },
  chartPlaceholder: { height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontStyle: 'italic', padding: '24px' },
  chartWrapper: { position: 'relative', height: '300px', padding: '20px' },
  overdueList: { listStyle: 'none', margin: 0, padding: '10px 24px 24px 24px' },
  overdueListItem: { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f0f0f0' },
  overdueAmount: { fontWeight: 'bold', color: '#e74c3c' },
};

// ... (styleSheet append logic remains the same) ...
const styleSheet = document.createElement("style");
styleSheet.innerText = `
  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.2); } }
  .card:hover { transform: translateY(-5px); box-shadow: 0 10px 20px rgba(0,0,0,0.07); }
  .pulse-icon { animation: pulse 1.5s infinite; }
`;
document.head.appendChild(styleSheet);


export default DashboardView;