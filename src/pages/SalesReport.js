import React, { useEffect, useState, useContext } from "react";
import { auth, db } from "../firebase";
import { 
    collection, query, where, orderBy, getDocs, Timestamp, doc, deleteDoc,
    limit, startAfter, endBefore, limitToLast, runTransaction, serverTimestamp
} from "firebase/firestore";
import Select from "react-select";
import { AiOutlineEye, AiOutlineDelete, AiOutlineLock } from "react-icons/ai";
import { CashBookContext } from "../context/CashBookContext";

const SalesReport = ({ internalUser }) => {
  const { reconciledDates } = useContext(CashBookContext);
  const [currentInvoices, setCurrentInvoices] = useState([]); 
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [allCustomers, setAllCustomers] = useState([]);
  
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
    const fetchCustomers = async () => {
      const user = auth.currentUser;
      if (!user) return;
      const q = query(collection(db, user.uid, "customers", "customer_list"));
      const snapshot = await getDocs(q);
      setAllCustomers(snapshot.docs.map(doc => ({ value: doc.id, label: doc.data().name })));
    };
    fetchCustomers();
  }, []);

  useEffect(() => { fetchInvoices(); }, [selectedCustomers, dateFrom, dateTo, searchTerm, statusFilter, internalUser]); 

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

  // --- DELETE HANDLER (FIXED: ALL READS BEFORE WRITES) ---
  const handleDelete = async (invoice) => {
      const user = auth.currentUser;
      if (!user) return;

      if (invoice.createdAt) {
          const dateVal = invoice.createdAt.toDate ? invoice.createdAt.toDate() : new Date(invoice.createdAt);
          const dateStr = dateVal.toISOString().split('T')[0];
          if (reconciledDates.has(dateStr)) {
              alert(`Cannot delete invoice from ${dateStr} because it has been reconciled and locked.`);
              return;
          }
      }

      if (!window.confirm(`Delete Invoice ${invoice.invoiceNumber}? This will deduct the amount from your wallet and reverse daily sales.`)) return;

      try {
          await runTransaction(db, async (transaction) => {
              // =========================================================
              // PHASE 1: ALL READS (Must be done before any write)
              // =========================================================

              // 1. Read Invoice
              const invoiceRef = doc(db, user.uid, "invoices", "invoice_list", invoice.id);
              const invoiceSnap = await transaction.get(invoiceRef);
              if (!invoiceSnap.exists()) throw "Invoice does not exist.";
              const invData = invoiceSnap.data();

              // Determine references needed for secondary reads
              let dailyStatsRef = null;
              if (invData.createdAt) {
                  const dateVal = invData.createdAt.toDate ? invData.createdAt.toDate() : new Date(invData.createdAt);
                  const dailyDateString = dateVal.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
                  dailyStatsRef = doc(db, user.uid, "daily_stats", "entries", dailyDateString);
              }

              let walletRef = null;
              let amountToReverseSales = 0;
              let amountToReverseCOGS = Number(invData.totalCOGS) || 0;

              // Calculate reversal amounts
              if (!invData.type) { 
                  // Standard Invoice
                  amountToReverseSales = Number(invData.total) || 0;
              } else {
                  // Service/Order
                  amountToReverseSales = Number(invData.received) || 0;
              }

              // Determine Wallet Reference
              if (amountToReverseSales > 0) {
                  let walletDocId = null;
                  if (invData.paymentMethod === 'Cash') walletDocId = 'cash';
                  else if (invData.paymentMethod === 'Card') walletDocId = 'card';
                  else if (invData.paymentMethod === 'Online') walletDocId = 'online';
                  
                  if (walletDocId) {
                      walletRef = doc(db, user.uid, "wallet", "accounts", walletDocId);
                  }
              }

              // 2. Read Daily Stats (if applicable)
              let dailyStatsSnap = null;
              if (dailyStatsRef) {
                  dailyStatsSnap = await transaction.get(dailyStatsRef);
              }

              // 3. Read Wallet (if applicable)
              let walletSnap = null;
              if (walletRef) {
                  walletSnap = await transaction.get(walletRef);
              }

              // =========================================================
              // PHASE 2: ALL WRITES
              // =========================================================

              // 4. Update Daily Stats
              if (dailyStatsRef && dailyStatsSnap && dailyStatsSnap.exists()) {
                  const currentStats = dailyStatsSnap.data();
                  const currentSales = Number(currentStats.totalSales) || 0;
                  const currentCOGS = Number(currentStats.totalCOGS) || 0;

                  transaction.set(dailyStatsRef, {
                      totalSales: currentSales - amountToReverseSales,
                      totalCOGS: currentCOGS - amountToReverseCOGS,
                      lastUpdated: serverTimestamp()
                  }, { merge: true });
              }

              // 5. Update Wallet
              if (walletRef && walletSnap && walletSnap.exists()) {
                  const currentBalance = Number(walletSnap.data().balance) || 0;
                  transaction.set(walletRef, {
                      balance: currentBalance - amountToReverseSales,
                      lastUpdated: serverTimestamp()
                  }, { merge: true });
              }

              // 6. Delete Related Documents (Jobs/Orders)
              if (invData.type === 'SERVICE' && invData.relatedJobId) {
                  const jobRef = doc(db, user.uid, "data", "service_jobs", invData.relatedJobId);
                  transaction.delete(jobRef);
              }
              if (invData.type === 'ORDER' && invData.relatedOrderId) {
                  const orderRef = doc(db, user.uid, "data", "orders", invData.relatedOrderId);
                  transaction.delete(orderRef);
              }

              // 7. Delete the Invoice
              transaction.delete(invoiceRef);
          });

          // Update UI
          setCurrentInvoices(prev => prev.filter(i => i.id !== invoice.id));

      } catch (err) {
          console.error(err);
          alert("Error deleting invoice: " + err.message); // If error persists, it will show exact reason
      }
  };

  return (
    <div style={styles.container}>
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
          <thead><tr><th style={styles.th}>Invoice #</th><th style={styles.th}>Date</th><th style={styles.th}>Customer</th><th style={styles.th}>Amount</th><th style={styles.th}>Status</th><th style={{...styles.th, textAlign: 'right'}}>Actions</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{padding:20, textAlign:'center'}}>Loading...</td></tr> : currentInvoices.map((inv) => (
                <tr key={inv.id} style={styles.tr}>
                    <td style={styles.td}>{inv.invoiceNumber}</td>
                    <td style={styles.td}>{inv.createdAt?.toDate ? inv.createdAt.toDate().toLocaleDateString() : 'N/A'}</td>
                    <td style={styles.td}>{inv.customerName}</td>
                    <td style={styles.td}><strong>{inv.total?.toFixed(2)}</strong></td>
                    <td style={styles.td}><span style={{padding:'4px 8px', borderRadius:4, fontSize:11, background: inv.status==='Paid'?'#d1fae5':'#fee2e2', color: inv.status==='Paid'?'#065f46':'#991b1b'}}>{inv.status}</span></td>
                    <td style={{...styles.td, textAlign: 'right'}}><button style={styles.iconBtn} onClick={() => handleView(inv.id)}><AiOutlineEye size={18} color="#3b82f6" /></button><button style={styles.iconBtn} onClick={() => handleDelete(inv)}><AiOutlineDelete size={18} color="#ef4444" /></button></td>
                </tr>
            ))}
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
    pageBtn: { padding: '8px 16px', background: 'white', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }
};

export default SalesReport;