import React, { useEffect, useState } from "react";
import { db, auth } from "../../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
  doc,
  getDoc
} from "firebase/firestore";
import { AiOutlinePrinter } from "react-icons/ai";

const SalesIncome = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState({ cash: 0, card: 0, online: 0, grand: 0 });
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  // Helper: Get Date in Sri Lanka Time (Matches format used in Orders/Invoice pages)
  const getSriLankaDateString = (dateInput) => {
    const date = new Date(dateInput);
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' }); // Returns YYYY-MM-DD
  };

  const fetchData = async (date) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !date) return;

    setLoading(true);
    try {
      // 1. Fetch Totals from Daily Stats (The source of truth)
      // Note: We use the helper to ensure the ID matches exactly how it was saved
      const dailyDateString = getSriLankaDateString(date);
      const dailyStatsRef = doc(db, uid, "daily_stats", "entries", dailyDateString);
      const dailyStatsSnap = await getDoc(dailyStatsRef);

      if (dailyStatsSnap.exists()) {
          const stats = dailyStatsSnap.data();
          setTotals({
              cash: Number(stats.totalSales_cash) || 0,
              card: Number(stats.totalSales_card) || 0,
              online: Number(stats.totalSales_online) || 0,
              grand: Number(stats.totalSales) || 0
          });
      } else {
          setTotals({ cash: 0, card: 0, online: 0, grand: 0 });
      }

      // 2. Fetch Invoice List for the Table (Visual reference only)
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      const invoicesColRef = collection(db, uid, "invoices", "invoice_list");
      
      let q = query(
        invoicesColRef,
        where("createdAt", ">=", Timestamp.fromDate(startOfDay)),
        where("createdAt", "<=", Timestamp.fromDate(endOfDay)),
        orderBy("createdAt", "desc")
      );
      
      const allInvoicesSnap = await getDocs(q);
      
      const simpleInvoices = allInvoicesSnap.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
      }));

      setInvoices(simpleInvoices);

    } catch (error) {
      console.error("Error fetching sales income:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData(selectedDate);
  }, [selectedDate]);


  return (
    <>
      <style>{`
        @media print {
          .non-printable { display: none !important; }
          .printable-area { position: absolute; left: 0; top: 0; width: 100%; }
          body { background-color: #fff; }
          .report-header { text-align: center; margin-bottom: 20px; display: block !important; }
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
          <p style={styles.subHeader}>Review daily sales totals.</p>
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

        {/* Totals Section First for better visibility */}
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

        <div style={{marginTop: '30px'}}>
            <h3 style={{fontSize: '16px', marginBottom: '10px', color: '#666'}}>Transaction Details</h3>
            <div style={styles.tableContainer} className="table-container">
            {loading ? <p style={{textAlign: 'center', padding: '20px'}}>Loading Data...</p> : (
                <table style={styles.table}>
                    <thead><tr>
                        <th style={styles.th}>Inv # / Ref #</th>
                        <th style={styles.th}>Total Value</th>
                        <th style={styles.th}>Received</th>
                        <th style={styles.th}>Payment Method</th>
                        <th style={styles.th}>Issued By</th>
                        <th style={styles.th}>Time</th>
                    </tr></thead>
                    <tbody>
                        {invoices.length > 0 ? invoices.map(inv => (
                            <tr key={inv.id}>
                                <td style={styles.td}>{inv.invoiceNumber}</td>
                                <td style={styles.td}>Rs. {inv.total?.toFixed(2)}</td>
                                <td style={styles.td}>Rs. {inv.received?.toFixed(2)}</td>
                                <td style={styles.td}>{inv.paymentMethod || 'N/A'}</td>
                                <td style={styles.td}>{inv.issuedBy}</td>
                                <td style={styles.td}>{inv.createdAt?.toDate ? inv.createdAt.toDate().toLocaleTimeString() : 'N/A'}</td>
                            </tr>
                        )) : <tr><td colSpan="6" style={styles.noData}>No transactions found for this date.</td></tr>}
                    </tbody>
                </table>
            )}
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
    th: { padding: '12px 16px', textAlign: 'left', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontWeight: '600', fontSize: '13px' },
    td: { padding: '12px 16px', borderBottom: '1px solid #e5e7eb', fontSize: '14px' },
    noData: { textAlign: 'center', padding: '32px', color: '#6b7280' },
    totalsSection: { marginTop: '0', padding: '20px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' },
    totalRow: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: '16px', borderBottom: '1px solid #f0f0f0' },
    grandTotalRow: { display: 'flex', justifyContent: 'space-between', padding: '15px 0', marginTop: '10px', fontSize: '22px', fontWeight: '700', color: '#2c3e50' },
};

export default SalesIncome;