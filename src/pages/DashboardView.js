import React, { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { collection, query, where, getDocs, Timestamp, doc, getDoc, onSnapshot } from "firebase/firestore";
import { FaDollarSign, FaUserPlus, FaFileInvoice, FaExclamationTriangle } from "react-icons/fa";

const DashboardView = ({ internalUser }) => {
  const [stats, setStats] = useState({ totalSales: 0, newCustomers: 0, invoicesToday: 0 });
  const [lowStockItems, setLowStockItems] = useState([]);
  const [showLowStockAlert, setShowLowStockAlert] = useState(false);
  const [loading, setLoading] = useState(true);
  const [globalAnnouncement, setGlobalAnnouncement] = useState(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    const isAlertDismissed = sessionStorage.getItem('lowStockAlertDismissed') === 'true';

    const fetchData = async () => {
      try {
        const uid = user.uid;
        
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const todayInvoicesQuery = query(
          collection(db, uid, "invoices", "invoice_list"),
          where("createdAt", ">=", Timestamp.fromDate(startOfDay)),
          where("createdAt", "<=", Timestamp.fromDate(endOfDay))
        );
        const todayCustomersQuery = query(
          collection(db, uid, "customers", "customer_list"),
          where("createdAt", ">=", Timestamp.fromDate(startOfDay)),
          where("createdAt", "<=", Timestamp.fromDate(endOfDay))
        );
        
        const [invoicesSnap, customersSnap] = await Promise.all([
            getDocs(todayInvoicesQuery),
            getDocs(todayCustomersQuery)
        ]);

        let totalSales = 0;
        let actualInvoiceCount = 0;

        // ✅ **FIX: Loop through docs to calculate sales and count original invoices separately**
        invoicesSnap.forEach(doc => {
            const invoiceData = doc.data();
            totalSales += invoiceData.total || 0;

            if (invoiceData.paymentMethod !== 'Credit-Repayment') {
                actualInvoiceCount++;
            }
        });

        setStats({
            totalSales: totalSales,
            invoicesToday: actualInvoiceCount, // Use the corrected count
            newCustomers: customersSnap.size
        });

        const settingsRef = doc(db, uid, "settings");
        const stockInRef = collection(db, uid, "inventory", "stock_in");
        const stockOutRef = collection(db, uid, "inventory", "stock_out");

        const [settingsSnap, stockInSnap, stockOutSnap] = await Promise.all([
            getDoc(settingsRef),
            getDocs(stockInRef),
            getDocs(stockOutRef)
        ]);

        const stockReminderThreshold = settingsSnap.exists() ? parseInt(settingsSnap.data().stockReminder) : null;
        
        if (stockReminderThreshold && !isNaN(stockReminderThreshold)) {
            const itemsMap = {};
            stockInSnap.docs.forEach(doc => {
                doc.data().lineItems?.forEach(item => {
                    if (!itemsMap[item.name]) itemsMap[item.name] = { totalStockIn: 0, totalStockOut: 0 };
                    itemsMap[item.name].totalStockIn += Number(item.quantity);
                });
            });
            stockOutSnap.docs.forEach(doc => {
                const item = doc.data();
                if (itemsMap[item.item]) {
                    itemsMap[item.item].totalStockOut += Number(item.quantity);
                }
            });

            const lowItems = [];
            for (const itemName in itemsMap) {
                const item = itemsMap[itemName];
                const availableQty = item.totalStockIn - item.totalStockOut;
                if (item.totalStockIn > 0) {
                    const percentage = (availableQty / item.totalStockIn) * 100;
                    if (percentage <= stockReminderThreshold) {
                        lowItems.push({ name: itemName, qty: availableQty });
                    }
                }
            }
            setLowStockItems(lowItems);
            if (lowItems.length > 0 && !isAlertDismissed) {
                setShowLowStockAlert(true);
            }
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

  const handleDismissLowStockAlert = () => {
    sessionStorage.setItem('lowStockAlertDismissed', 'true');
    setShowLowStockAlert(false);
  };

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
            <div style={styles.alertHeader}>
                <FaExclamationTriangle style={{ color: '#d46b08' }} />
                <h3 style={styles.alertTitle}>Low Stock Warning</h3>
            </div>
            <p style={styles.alertText}>The following items are running low:</p>
            <ul style={styles.alertItemList}>
                {lowStockItems.map(item => <li key={item.name}>{item.name} (Qty: {item.qty})</li>)}
            </ul>
            <button onClick={handleDismissLowStockAlert} style={styles.alertDismissBtn}>Dismiss</button>
        </div>
      )}

      <div style={styles.header}>
        <h1 style={styles.title}>Hi, {internalUser?.username || "Admin"}!</h1>
        <p style={styles.subtitle}>Welcome back, here's a look at your business today.</p>
      </div>

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
          <h3 style={styles.sectionTitle}>Recent Activity</h3>
          <p style={styles.chartPlaceholder}>Recent invoices will be displayed here.</p>
        </div>
        <div style={styles.chartSection}>
          <h3 style={styles.sectionTitle}>Sales This Week</h3>
          <p style={styles.chartPlaceholder}>Your sales chart will be displayed here.</p>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: { padding: '24px', fontFamily: "'Inter', sans-serif" },
  loadingContainer: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' },
  loadingSpinner: { border: '4px solid #f3f3f3', borderTop: '4px solid #3498db', borderRadius: '50%', width: '50px', height: '50px', animation: 'spin 1s linear infinite' },
  criticalAlert: { backgroundColor: '#fff1f2', border: '1px solid #ffccc7', color: '#a8071a', borderRadius: '12px', padding: '20px', marginBottom: '24px', boxShadow: '0 4px 12px rgba(168,7,26,0.1)' },
  criticalAlertHeader: { display: 'flex', alignItems: 'center', gap: '12px' },
  criticalAlertTitle: { margin: 0, fontSize: '18px', fontWeight: '600' },
  criticalAlertText: { margin: '8px 0 0 0', fontSize: '15px', lineHeight: '1.5' },
  lowStockAlert: { backgroundColor: '#fffbe6', border: '1px solid #ffe58f', borderRadius: '12px', padding: '20px', marginBottom: '24px', position: 'relative' },
  alertHeader: { display: 'flex', alignItems: 'center', gap: '12px', color: '#92400e' },
  alertTitle: { margin: 0, fontSize: '18px', fontWeight: '600' },
  alertText: { margin: '8px 0', color: '#b45309' },
  alertItemList: { margin: '8px 0 8px 20px', padding: 0, color: '#92400e', fontSize: '14px' },
  alertDismissBtn: { position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#b45309' },
  header: { marginBottom: '24px' },
  title: { fontSize: '32px', fontWeight: 'bold', color: '#111827', margin: 0 },
  subtitle: { fontSize: '16px', color: '#6b7280', marginTop: '4px' },
  cardsContainer: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px', marginBottom: '24px' },
  card: { backgroundColor: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '8px', transition: 'transform 0.2s, box-shadow 0.2s' },
  iconWrapper: { width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px', color: '#fff' },
  cardLabel: { fontSize: '14px', color: '#6b7280', margin: 0 },
  cardValue: { fontSize: '28px', fontWeight: 'bold', color: '#111827', margin: 0 },
  mainContent: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', alignItems: 'flex-start' },
  activitySection: { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' },
  sectionTitle: { fontSize: '18px', fontWeight: '600', padding: '20px 24px', margin: 0, borderBottom: '1px solid #e5e7eb' },
  chartSection: { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' },
  chartPlaceholder: { height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontStyle: 'italic', padding: '24px' },
};

const styleSheet = document.createElement("style");
styleSheet.innerText = `
  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.2); } }
  .card:hover { transform: translateY(-5px); box-shadow: 0 10px 20px rgba(0,0,0,0.07); }
  .pulse-icon { animation: pulse 1.5s infinite; }
`;
document.head.appendChild(styleSheet);

export default DashboardView;
