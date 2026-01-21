import React, { useEffect, useState, useContext } from "react";
import { auth, db } from "../firebase";
import { 
    collection, query, where, orderBy, getDocs, Timestamp, doc,
    limit, startAfter, endBefore, limitToLast, runTransaction, serverTimestamp
} from "firebase/firestore";
import Select from "react-select";
import { AiOutlineEye, AiOutlineDelete } from "react-icons/ai";
import { CashBookContext } from "../context/CashBookContext";

// Define Theme Colors (Matches Dashboard.js)
const themeColors = { primary: '#00A1FF', secondary: '#F089D7', dark: '#1a2530', light: '#f8f9fa', success: '#10b981', danger: '#ef4444' };

const SalesReport = ({ internalUser }) => {
  const { reconciledDates } = useContext(CashBookContext);
  const [currentInvoices, setCurrentInvoices] = useState([]); 
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [allCustomers, setAllCustomers] = useState([]);
  
  // New State for Deleting Buffer
  const [isDeleting, setIsDeleting] = useState(false);

  // Filters
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All"); 

  // Pagination
  const [lastVisibleDoc, setLastVisibleDoc] = useState(null);
  const [firstVisibleDoc, setFirstVisibleDoc] = useState(null);
  const [isNextPageAvailable, setIsNextPageAvailable] = useState(false); 
  const ITEMS_PER_PAGE = 20;

  const handleView = (invoiceId) => { window.open(`/invoice/view/${invoiceId}`, '_blank'); };

  useEffect(() => {
    // Inject Styles for Animations (Matches Dashboard.js)
    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      @keyframes color-rotate { 
          0% { border-top-color: ${themeColors.primary}; border-right-color: ${themeColors.secondary}; } 
          50% { border-top-color: ${themeColors.secondary}; border-right-color: ${themeColors.primary}; } 
          100% { border-top-color: ${themeColors.primary}; border-right-color: ${themeColors.secondary}; } 
      }
    `;
    document.head.appendChild(styleSheet);
    
    // Cleanup on unmount (optional, but good practice if checking for duplicates)
    return () => {
       // document.head.removeChild(styleSheet); // Often omitted in single-page apps to avoid flash, but logically correct
    };
  }, []);

  useEffect(() => {
    const fetchCustomers = async () => {
      const user = auth.currentUser;
      if (!user) return;
      const q = query(collection(db, user.uid, "customers", "customer_list"));
      const snapshot = await getDocs(q);
      setAllCustomers(snapshot.docs.map(doc => ({ value: doc.id, label: doc.data().name })));
    };
    fetchCustomers();
  }, []);

  useEffect(() => { 
      fetchInvoices(); 
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomers, dateFrom, dateTo, searchTerm, statusFilter, internalUser]); 

  const fetchInvoices = async (direction = "first") => {
    const user = auth.currentUser;
    if (!user) return;
    setLoading(true);

    try {
      let q = collection(db, user.uid, "invoices", "invoice_list");
      let constraints = [orderBy("createdAt", "desc")]; 

      if (selectedCustomers.length > 0) constraints.push(where("customerId", "in", selectedCustomers.map(c => c.value)));
      if (dateFrom) { const start = new Date(dateFrom); start.setHours(0,0,0,0); constraints.push(where("createdAt", ">=", Timestamp.fromDate(start))); }
      if (dateTo) { const end = new Date(dateTo); end.setHours(23,59,59,999); constraints.push(where("createdAt", "<=", Timestamp.fromDate(end))); }
      if (statusFilter !== "All") constraints.push(where("status", "==", statusFilter));

      if (direction === "next" && lastVisibleDoc) { constraints.push(startAfter(lastVisibleDoc)); constraints.push(limit(ITEMS_PER_PAGE)); } 
      else if (direction === "prev" && firstVisibleDoc) { constraints = [orderBy("createdAt", "desc"), ...constraints.filter(c => c.type !== 'orderBy'), endBefore(firstVisibleDoc), limitToLast(ITEMS_PER_PAGE)]; } 
      else { constraints.push(limit(ITEMS_PER_PAGE)); }

      const finalQuery = query(q, ...constraints);
      const snapshot = await getDocs(finalQuery);

      if (!snapshot.empty) {
          let docs = snapshot.docs.map(d => ({...d.data(), id: d.id}));
          if (searchTerm) {
              const lower = searchTerm.toLowerCase();
              docs = docs.filter(d => d.invoiceNumber.toLowerCase().includes(lower) || d.customerName.toLowerCase().includes(lower));
          }
          setCurrentInvoices(docs);
          setFirstVisibleDoc(snapshot.docs[0]);
          setLastVisibleDoc(snapshot.docs[snapshot.docs.length - 1]);
          setIsNextPageAvailable(snapshot.docs.length === ITEMS_PER_PAGE);
      } else {
          setCurrentInvoices([]);
          setIsNextPageAvailable(false);
      }
    } catch (err) { console.error("Error:", err); }
    setLoading(false);
  };

  const handleNextPage = () => { if (!isNextPageAvailable) return; setCurrentPage(p => p + 1); fetchInvoices("next"); };
  const handlePrevPage = () => { if (currentPage <= 1) return; setCurrentPage(p => p - 1); fetchInvoices("prev"); };

  // --- DELETE HANDLER ---
  const handleDelete = async (invoice) => {
      if (!internalUser?.isAdmin) {
          alert("Access Denied: You do not have permission to delete invoices.");
          return;
      }

      const user = auth.currentUser;
      if (!user) return;

      if (invoice.createdAt) {
          const dateVal = invoice.createdAt.toDate ? invoice.createdAt.toDate() : new Date(invoice.createdAt);
          const dateStr = dateVal.toISOString().split('T')[0];
          if (reconciledDates && reconciledDates.has(dateStr)) {
              alert(`Cannot delete invoice from ${dateStr} because it has been reconciled and locked.`);
              return;
          }
      }

      if (!window.confirm(`Delete Invoice ${invoice.invoiceNumber}? This will deduct the amount from your wallet and reverse daily sales.`)) return;

      // START BUFFERING
      setIsDeleting(true);

      try {
          // STEP 1: PRE-FETCH KOT REFERENCES
          let kotDocsToDeleteRefs = [];
          if (invoice.createdAt && invoice.invoiceNumber) {
             try {
                const dateVal = invoice.createdAt.toDate ? invoice.createdAt.toDate() : new Date(invoice.createdAt);
                const dailyDateString = dateVal.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
                
                const kotColRef = collection(db, user.uid, "kot", dailyDateString);
                const kotQuery = query(kotColRef, where("invoiceNumber", "==", invoice.invoiceNumber));
                const kotSnapshot = await getDocs(kotQuery); 
                
                if (!kotSnapshot.empty) {
                    kotDocsToDeleteRefs = kotSnapshot.docs.map(doc => doc.ref);
                }
             } catch (kotErr) {
                 console.warn("Could not fetch KOT docs:", kotErr);
             }
          }

          // STEP 2: RUN TRANSACTION
          await runTransaction(db, async (transaction) => {
              const invoiceRef = doc(db, user.uid, "invoices", "invoice_list", invoice.id);
              const invoiceSnap = await transaction.get(invoiceRef);
              if (!invoiceSnap.exists()) throw new Error("Invoice does not exist."); 
              const invData = invoiceSnap.data();

              let dailyStatsRef = null;
              if (invData.createdAt) {
                  const dateVal = invData.createdAt.toDate ? invData.createdAt.toDate() : new Date(invData.createdAt);
                  const dailyDateString = dateVal.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
                  dailyStatsRef = doc(db, user.uid, "daily_stats", "entries", dailyDateString);
              }

              let walletRef = null;
              let salesMethodField = null;
              let amountToReverseSales = 0;
              let amountToReverseCOGS = Number(invData.totalCOGS) || 0;

              if (!invData.type) { 
                  amountToReverseSales = Number(invData.total) || 0;
              } else {
                  amountToReverseSales = Number(invData.received) || 0;
              }

              if (amountToReverseSales > 0) {
                  let walletDocId = null;
                  if (invData.paymentMethod === 'Cash') { walletDocId = 'cash'; salesMethodField = 'totalSales_cash'; }
                  else if (invData.paymentMethod === 'Card') { walletDocId = 'card'; salesMethodField = 'totalSales_card'; }
                  else if (invData.paymentMethod === 'Online') { walletDocId = 'online'; salesMethodField = 'totalSales_online'; }
                  
                  if (walletDocId) {
                      walletRef = doc(db, user.uid, "wallet", "accounts", walletDocId);
                  }
              }

              let dailyStatsSnap = null;
              if (dailyStatsRef) {
                  dailyStatsSnap = await transaction.get(dailyStatsRef);
              }

              let walletSnap = null;
              if (walletRef) {
                  walletSnap = await transaction.get(walletRef);
              }

              if (dailyStatsRef && dailyStatsSnap && dailyStatsSnap.exists()) {
                  const currentStats = dailyStatsSnap.data();
                  const currentSales = Number(currentStats.totalSales) || 0;
                  const currentCOGS = Number(currentStats.totalCOGS) || 0;
                  const currentInvoiceCount = Number(currentStats.invoiceCount) || 0;
                  
                  const updateData = {
                      totalSales: currentSales - amountToReverseSales,
                      totalCOGS: currentCOGS - amountToReverseCOGS,
                      invoiceCount: Math.max(0, currentInvoiceCount - 1),
                      lastUpdated: serverTimestamp()
                  };

                  if (salesMethodField) {
                      const currentMethodSales = Number(currentStats[salesMethodField]) || 0;
                      updateData[salesMethodField] = currentMethodSales - amountToReverseSales;
                  }

                  transaction.set(dailyStatsRef, updateData, { merge: true });
              }

              if (walletRef && walletSnap && walletSnap.exists()) {
                  const currentBalance = Number(walletSnap.data().balance) || 0;
                  transaction.set(walletRef, {
                      balance: currentBalance - amountToReverseSales,
                      lastUpdated: serverTimestamp()
                  }, { merge: true });
              }

              if (invData.type === 'SERVICE' && invData.relatedJobId) {
                  const jobRef = doc(db, user.uid, "data", "service_jobs", invData.relatedJobId);
                  transaction.delete(jobRef);
              }
              if (invData.type === 'ORDER' && invData.relatedOrderId) {
                  const orderRef = doc(db, user.uid, "data", "orders", invData.relatedOrderId);
                  transaction.delete(orderRef);
              }

              kotDocsToDeleteRefs.forEach((ref) => {
                  transaction.delete(ref);
              });

              transaction.delete(invoiceRef);
          });

          setCurrentInvoices(prev => prev.filter(i => i.id !== invoice.id));

      } catch (err) {
          console.error(err);
          alert("Error deleting invoice: " + err.message); 
      } finally {
          // STOP BUFFERING
          setIsDeleting(false);
      }
  };

  return (
    <div style={styles.container}>
      {/* --- DELETING OVERLAY --- */}
      {isDeleting && (
        <div style={styles.overlay}>
            <div style={styles.spinner}></div>
            <p>Processing...</p>
        </div>
      )}

      <div style={styles.headerContainer}><h1 style={styles.header}>Sales Report</h1></div>
      <div style={styles.controlsContainer}>
        <div style={styles.searchInputContainer}><label style={styles.label}>Search</label><input style={styles.input} placeholder="Invoice/Customer" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
        <div style={styles.filterGroup}><label style={styles.label}>Date Range</label><div style={styles.dateInputs}><input type="date" style={styles.input} value={dateFrom} onChange={e => setDateFrom(e.target.value)} /><span>-</span><input type="date" style={styles.input} value={dateTo} onChange={e => setDateTo(e.target.value)} /></div></div>
        <div style={styles.filterGroup}><label style={styles.label}>Customer</label><Select isMulti options={allCustomers} value={selectedCustomers} onChange={setSelectedCustomers} placeholder="All Customers" /></div>
        
        <div style={styles.filterGroup}>
            <label style={styles.label}>Status</label>
            <select style={styles.input} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="All">All</option>
                <option value="Paid">Paid</option>
                <option value="Pending">Pending</option>
            </select>
        </div>
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
                <th style={styles.th}>Invoice #</th>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Customer</th>
                <th style={styles.th}>User</th>
                <th style={styles.th}>Amount</th>
                <th style={styles.th}>Status</th>
                <th style={{...styles.th, textAlign: 'right'}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} style={{padding:20, textAlign:'center'}}>Loading...</td></tr> : currentInvoices.map((inv) => {
                
                const isServiceOrOrder = inv.type === 'SERVICE' || inv.type === 'ORDER';
                const displayStatus = isServiceOrOrder ? (inv.status || 'Pending') : "Walk-in Paid";
                
                const isPaid = displayStatus === 'Paid' || displayStatus === 'Walk-in Paid' || displayStatus === 'Completed';
                const statusBg = isPaid ? '#d1fae5' : '#fee2e2';
                const statusColor = isPaid ? '#065f46' : '#991b1b';

                return (
                    <tr key={inv.id} style={styles.tr}>
                        <td style={styles.td}>{inv.invoiceNumber}</td>
                        <td style={styles.td}>{inv.createdAt?.toDate ? inv.createdAt.toDate().toLocaleDateString() : 'N/A'}</td>
                        <td style={styles.td}>{inv.customerName}</td>
                        <td style={styles.td}>{inv.issuedBy || 'System'}</td>
                        <td style={styles.td}><strong>{inv.total?.toFixed(2)}</strong></td>
                        <td style={styles.td}>
                            <span style={{ padding:'4px 8px', borderRadius:4, fontSize:11, background: statusBg, color: statusColor }}>
                                {displayStatus}
                            </span>
                        </td>
                        <td style={{...styles.td, textAlign: 'right'}}>
                            <button style={styles.iconBtn} onClick={() => handleView(inv.id)}><AiOutlineEye size={18} color="#3b82f6" /></button>
                            <button 
                                style={{...styles.iconBtn, opacity: internalUser?.isAdmin ? 1 : 0.5, cursor: internalUser?.isAdmin ? 'pointer' : 'not-allowed'}} 
                                onClick={() => handleDelete(inv)}
                                title={internalUser?.isAdmin ? "Delete Invoice" : "Only Admins can delete"}
                            >
                                <AiOutlineDelete size={18} color="#ef4444" />
                            </button>
                        </td>
                    </tr>
                );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20, gap: 10 }}>
          <button onClick={handlePrevPage} disabled={currentPage === 1} style={styles.pageBtn}>Previous</button><span>Page {currentPage}</span><button onClick={handleNextPage} disabled={!isNextPageAvailable} style={styles.pageBtn}>Next</button>
      </div>
    </div>
  );
};

const styles = {
    container: { padding: '20px', fontFamily: "'Inter', sans-serif", background: '#f3f4f6', minHeight: '100vh' },
    headerContainer: { marginBottom: '20px' },
    header: { fontSize: '24px', fontWeight: '600', color: '#1f2937' },
    controlsContainer: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px', padding: '20px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' },
    filterGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
    dateInputs: { display: 'flex', alignItems: 'center', gap: '10px' },
    searchInputContainer: { display: 'flex', flexDirection: 'column', gap: '5px' },
    label: { fontSize: '12px', fontWeight: 'bold', color: '#374151', textTransform: 'uppercase' },
    input: { padding: '8px 12px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '14px', width: '100%', boxSizing: 'border-box' },
    tableContainer: { backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflowX: 'auto' },
    table: { width: '100%', borderCollapse: 'collapse', minWidth: '800px' },
    th: { padding: '12px 16px', textAlign: 'left', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontWeight: '600', color: '#4b5563', fontSize: '12px', textTransform: 'uppercase' },
    td: { padding: '12px 16px', borderBottom: '1px solid #e5e7eb', fontSize: '14px', color: '#1f2937', verticalAlign: 'middle' },
    tr: { '&:hover': { backgroundColor: '#f9fafb' } },
    iconBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: '4px', marginRight: '5px' },
    pageBtn: { padding: '8px 16px', background: 'white', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' },
    
    // NEW STYLES FOR OVERLAY (MATCHING DASHBOARD.JS)
    overlay: { 
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
        backgroundColor: 'rgba(255, 255, 255, 0.9)', 
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
        zIndex: 9999, color: '#64748b', fontSize: '18px', fontWeight: '600' 
    },
    spinner: { 
        border: `4px solid rgba(0, 161, 255, 0.1)`, 
        borderTop: `4px solid ${themeColors.primary}`, 
        borderRight: `4px solid ${themeColors.secondary}`, 
        borderRadius: "50%", 
        width: "60px", height: "60px", 
        animation: "spin 1s linear infinite, color-rotate 2s linear infinite", 
        marginBottom: "24px" 
    }
};

export default SalesReport;