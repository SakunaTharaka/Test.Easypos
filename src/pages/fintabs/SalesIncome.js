import React, { useEffect, useState } from "react";
import { db, auth } from "../../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  startAfter,
  Timestamp,
} from "firebase/firestore";
import { AiOutlinePrinter } from "react-icons/ai";

const SalesIncome = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  // State to hold the detailed totals
  const [totals, setTotals] = useState({ cash: 0, card: 0, online: 0, grand: 0 });
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  const fetchInvoices = async (date, loadMore = false) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !date) return;

    setLoading(true);
    try {
      const invoicesColRef = collection(db, uid, "invoices", "invoice_list");
      
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      let q = query(
        invoicesColRef,
        where("createdAt", ">=", Timestamp.fromDate(startOfDay)),
        where("createdAt", "<=", Timestamp.fromDate(endOfDay)),
        orderBy("createdAt", "desc")
      );

      if (loadMore && lastVisible) {
        q = query(q, startAfter(lastVisible), limit(50));
      } else {
        q = query(q, limit(50));
      }

      const docSnap = await getDocs(q);
      const fetchedInvoices = docSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (loadMore) {
        setInvoices(prev => [...prev, ...fetchedInvoices]);
      } else {
        setInvoices(fetchedInvoices);
        // Calculate all totals on the initial load
        const newTotals = { cash: 0, card: 0, online: 0, grand: 0 };
        const allInvoicesQuery = query(invoicesColRef, where("createdAt", ">=", Timestamp.fromDate(startOfDay)), where("createdAt", "<=", Timestamp.fromDate(endOfDay)));
        const allInvoicesSnap = await getDocs(allInvoicesQuery);
        
        allInvoicesSnap.forEach(doc => {
            const data = doc.data();
            const total = data.total || 0;
            newTotals.grand += total;
            
            // Categorize income by payment method
            switch (data.paymentMethod) {
                case 'Cash':
                    newTotals.cash += total;
                    break;
                case 'Card':
                    newTotals.card += total;
                    break;
                case 'Online':
                    newTotals.online += total;
                    break;
                default:
                    // Fallback for older invoices without a payment method
                    newTotals.cash += total;
                    break;
            }
        });
        setTotals(newTotals);
      }
      
      if (!docSnap.empty) {
        setLastVisible(docSnap.docs[docSnap.docs.length - 1]);
        setHasMore(docSnap.docs.length === 50);
      } else {
        if (!loadMore) setInvoices([]); // Clear if no initial results
        setHasMore(false);
      }

    } catch (error) {
      console.error("Error fetching sales income:", error);
      alert("An error occurred. Check the console (F12) for a database index creation link.");
    }
    setLoading(false);
  };

  useEffect(() => {
    setLastVisible(null);
    setHasMore(true);
    fetchInvoices(selectedDate);
  }, [selectedDate]);


  return (
    <>
      <style>{`
        @media print {
          .non-printable { display: none !important; }
          .printable-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          body { background-color: #fff; }
          .report-header {
            text-align: center;
            margin-bottom: 20px;
          }
          .table-container { box-shadow: none !important; border: 1px solid #ccc; }
          .totals-section { border-top: 2px solid #333; padding-top: 15px; }
        }
      `}</style>
      <div className="printable-area" style={styles.container}>
        <div className="report-header" style={{ display: 'none' }}>
            <h2>Sales Income Report</h2>
            <p>Date: {new Date(selectedDate).toLocaleDateString()}</p>
        </div>
        <div className="non-printable" style={styles.headerContainer}>
          <h2 style={styles.header}>Sales Income</h2>
          <p style={styles.subHeader}>Review all sales income for a specific day.</p>
        </div>

        <div className="non-printable" style={styles.controlsContainer}>
          <div style={styles.filterGroup}>
            <label>Select Date</label>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={styles.input} />
          </div>
          <button onClick={() => window.print()} style={styles.printButton}>
            <AiOutlinePrinter style={{ marginRight: '8px' }} />
            Print Report
          </button>
        </div>

        <div style={styles.tableContainer} className="table-container">
          {loading && invoices.length === 0 ? <p style={{textAlign: 'center', padding: '20px'}}>Loading Invoices...</p> : (
              <table style={styles.table}>
                  <thead><tr>
                    <th style={styles.th}>Inv #</th>
                    <th style={styles.th}>Amount</th>
                    <th style={styles.th}>Payment Method</th>
                    <th style={styles.th}>User</th>
                    <th style={styles.th}>Time</th>
                  </tr></thead>
                  <tbody>
                      {invoices.length > 0 ? invoices.map(inv => (
                          <tr key={inv.id}>
                              <td style={styles.td}>{inv.invoiceNumber}</td>
                              <td style={styles.td}>Rs. {inv.total.toFixed(2)}</td>
                              <td style={styles.td}>{inv.paymentMethod || 'N/A'}</td>
                              <td style={styles.td}>{inv.issuedBy}</td>
                              <td style={styles.td}>{inv.createdAt?.toDate().toLocaleTimeString()}</td>
                          </tr>
                      )) : <tr><td colSpan="5" style={styles.noData}>No invoices found for the selected date.</td></tr>}
                  </tbody>
              </table>
          )}
          {loading && invoices.length > 0 && <p style={{textAlign: 'center', padding: '10px'}}>Loading more...</p>}
          {hasMore && !loading && (
              <div className="non-printable" style={styles.loadMoreContainer}>
                  <button onClick={() => fetchInvoices(selectedDate, true)} style={styles.loadMoreButton}>Load More</button>
              </div>
          )}
        </div>

        <div style={styles.totalsSection} className="totals-section">
            <div style={styles.totalRow}>
                <span>Cash Payment Total:</span>
                <span>Rs. {totals.cash.toFixed(2)}</span>
            </div>
            <div style={styles.totalRow}>
                <span>Card Payment Total:</span>
                <span>Rs. {totals.card.toFixed(2)}</span>
            </div>
            <div style={styles.totalRow}>
                <span>Online Transfer Total:</span>
                <span>Rs. {totals.online.toFixed(2)}</span>
            </div>
            <div style={styles.grandTotalRow}>
                <span>Grand Total for {new Date(selectedDate).toLocaleDateString()}:</span>
                <span>Rs. {totals.grand.toFixed(2)}</span>
            </div>
        </div>
      </div>
    </>
  );
};

const styles = {
    container: { padding: '24px', fontFamily: "'Inter', sans-serif" },
    headerContainer: { marginBottom: '20px' },
    header: { fontSize: '24px', fontWeight: '600' },
    subHeader: { color: '#6c757d' },
    controlsContainer: { display: 'flex', gap: '16px', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px', padding: '16px', backgroundColor: '#fff', borderRadius: '8px' },
    filterGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
    input: { padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' },
    printButton: { padding: '10px 16px', border: 'none', backgroundColor: '#3498db', color: 'white', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' },
    tableContainer: { backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', overflow: 'hidden' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { padding: '12px 16px', textAlign: 'left', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontWeight: '600' },
    td: { padding: '12px 16px', borderBottom: '1px solid #e5e7eb' },
    noData: { textAlign: 'center', padding: '32px', color: '#6b7280' },
    loadMoreContainer: { padding: '20px', textAlign: 'center' },
    loadMoreButton: { padding: '10px 20px', border: '1px solid #3498db', color: '#3498db', backgroundColor: 'white', borderRadius: '6px', cursor: 'pointer' },
    totalsSection: { marginTop: '24px', padding: '20px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' },
    totalRow: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: '16px', borderBottom: '1px solid #f0f0f0' },
    grandTotalRow: { display: 'flex', justifyContent: 'space-between', padding: '15px 0', marginTop: '10px', fontSize: '22px', fontWeight: '700', color: '#2c3e50' },
};

export default SalesIncome;