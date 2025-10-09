import React, { useEffect, useState } from "react";
import { db, auth } from "../../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { AiOutlinePrinter } from "react-icons/ai";

const SalesIncome = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState({ cash: 0, card: 0, online: 0, creditRepayment: 0, grand: 0 });
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchInvoices = async (date) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !date) return;

    setLoading(true);
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      const customersRef = collection(db, uid, "customers", "customer_list");
      const creditCustomersQuery = query(customersRef, where("isCreditCustomer", "==", true));
      const creditCustomersSnap = await getDocs(creditCustomersQuery);
      const creditCustomerIds = new Set(creditCustomersSnap.docs.map(doc => doc.id));

      const invoicesColRef = collection(db, uid, "invoices", "invoice_list");
      
      let q = query(
        invoicesColRef,
        where("createdAt", ">=", Timestamp.fromDate(startOfDay)),
        where("createdAt", "<=", Timestamp.fromDate(endOfDay)),
        orderBy("createdAt", "desc")
      );
      
      const allInvoicesSnap = await getDocs(q);
      
      const validInvoices = allInvoicesSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(inv => {
            const isCreditRepayment = inv.paymentMethod === 'Credit-Repayment';
            const isFromCreditCustomer = creditCustomerIds.has(inv.customerId);
            return isCreditRepayment || !isFromCreditCustomer;
        });

      const newTotals = { cash: 0, card: 0, online: 0, creditRepayment: 0, grand: 0 };
      validInvoices.forEach(inv => {
          const total = inv.total || 0;
          newTotals.grand += total;
          
          if (inv.paymentMethod === 'Credit-Repayment') {
              newTotals.creditRepayment += total;
              // The actual method is stored in the `method` field of the repayment record
              switch (inv.method) {
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
                      // Fallback if method not specified on repayment, though it should be
                      newTotals.cash += total;
                      break;
              }
          } else {
              switch (inv.paymentMethod) {
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
                      newTotals.cash += total;
                      break;
              }
          }
      });
      setTotals(newTotals);
      setInvoices(validInvoices);

    } catch (error) {
      console.error("Error fetching sales income:", error);
      alert("An error occurred. Check the console (F12) for a database index creation link.");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchInvoices(selectedDate);
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
          <p style={styles.subHeader}>Review all sales income for a specific day. Initial credit sales are excluded, but credit repayments are included.</p>
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
          {loading ? <p style={{textAlign: 'center', padding: '20px'}}>Loading Invoices...</p> : (
              <table style={styles.table}>
                  <thead><tr>
                    <th style={styles.th}>Inv # / Ref #</th>
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
                              <td style={styles.td}>
                                {inv.paymentMethod === 'Credit-Repayment' ? `${inv.method} (Credit Repayment)` : inv.paymentMethod || 'N/A'}
                              </td>
                              <td style={styles.td}>{inv.issuedBy}</td>
                              <td style={styles.td}>{inv.createdAt?.toDate().toLocaleTimeString()}</td>
                          </tr>
                      )) : <tr><td colSpan="5" style={styles.noData}>No income recorded for the selected date.</td></tr>}
                  </tbody>
              </table>
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
             <div style={{...styles.totalRow, color: '#006400', fontSize: '14px', fontStyle: 'italic'}}>
                <span>(Including Credit Repayments):</span>
                <span>Rs. {totals.creditRepayment.toFixed(2)}</span>
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
    totalsSection: { marginTop: '24px', padding: '20px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' },
    totalRow: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: '16px', borderBottom: '1px solid #f0f0f0' },
    grandTotalRow: { display: 'flex', justifyContent: 'space-between', padding: '15px 0', marginTop: '10px', fontSize: '22px', fontWeight: '700', color: '#2c3e50' },
};

export default SalesIncome;

