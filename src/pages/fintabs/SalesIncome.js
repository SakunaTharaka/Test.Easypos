import React, { useEffect, useState, useCallback } from "react";
import { db, auth } from "../../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp
} from "firebase/firestore";
import { AiOutlinePrinter, AiOutlineReload } from "react-icons/ai"; // ✅ Fixed: Removed AiOutlineSearch

const SalesIncome = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  
  // --- FILTERS ---
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedUser, setSelectedUser] = useState("All");

  // --- TOTALS STATE ---
  const [summary, setSummary] = useState({
      grossSales: 0,
      totalReturns: 0,
      netIncome: 0,
      netCash: 0,
      netCard: 0,
      netOnline: 0
  });

  const fetchData = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setLoading(true);
    try {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const invRef = collection(db, uid, "invoices", "invoice_list");
      const invQ = query(
        invRef,
        where("createdAt", ">=", Timestamp.fromDate(start)),
        where("createdAt", "<=", Timestamp.fromDate(end)),
        orderBy("createdAt", "desc")
      );

      const retRef = collection(db, uid, "returns", "return_list");
      const retQ = query(
        retRef,
        where("createdAt", ">=", Timestamp.fromDate(start)),
        where("createdAt", "<=", Timestamp.fromDate(end)),
        orderBy("createdAt", "desc")
      );

      const [invSnap, retSnap] = await Promise.all([getDocs(invQ), getDocs(retQ)]);

      const sales = invSnap.docs.map(doc => {
          const d = doc.data();
          return {
              id: doc.id,
              ref: d.invoiceNumber,
              type: 'SALE',
              date: d.createdAt,
              amount: Number(d.total) || 0,
              method: d.paymentMethod || 'Cash',
              user: d.issuedBy || 'Admin',
              isReturn: false
          };
      });

      const returns = retSnap.docs.map(doc => {
          const d = doc.data();
          return {
              id: doc.id,
              ref: d.returnId,
              type: 'RETURN',
              date: d.createdAt,
              amount: -Math.abs(Number(d.refundAmount) || 0),
              method: d.refundMethod || 'Cash',
              user: d.processedBy || 'Admin',
              isReturn: true
          };
      });

      const allTxns = [...sales, ...returns].sort((a, b) => {
           const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
           const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
           return dateB - dateA;
      });

      setTransactions(allTxns);
      
      const uniqueUsers = Array.from(new Set(allTxns.map(t => t.user))).filter(Boolean);
      setUsers(uniqueUsers);

    } catch (error) {
      console.error("Error loading report:", error);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
      let filtered = transactions;
      if (selectedUser !== "All") {
          filtered = transactions.filter(t => t.user === selectedUser);
      }

      const newSummary = filtered.reduce((acc, curr) => {
          const amt = curr.amount;
          const method = curr.method.toLowerCase();

          if (curr.isReturn) {
              acc.totalReturns += Math.abs(amt);
          } else {
              acc.grossSales += amt;
          }
          
          acc.netIncome += amt;

          if (method === 'cash') acc.netCash += amt;
          else if (method === 'card') acc.netCard += amt;
          else if (method === 'online') acc.netOnline += amt;
          else acc.netCash += amt;

          return acc;
      }, { grossSales: 0, totalReturns: 0, netIncome: 0, netCash: 0, netCard: 0, netOnline: 0 });

      setSummary(newSummary);

  }, [transactions, selectedUser]);

  return (
    <>
      <style>{`
        @media print {
          @page { 
            size: A4 portrait; 
            margin: 10mm; 
          }
          
          body * { 
            visibility: hidden; 
          }
          
          .printable-area, .printable-area * { 
            visibility: visible; 
          }
          
          .printable-area {
            position: absolute; 
            top: 0;
            left: 0;
            width: 100%;
            box-sizing: border-box; 
            padding: 0;
            margin: 0;
            background: white;
          }

          .non-printable { display: none !important; }
          
          /* Header */
          .print-header { 
            display: block !important; 
            text-align: center; 
            border-bottom: 2px solid #000; 
            margin-bottom: 20px; 
            padding-bottom: 10px;
          }

          /* --- CARDS ROW --- */
          .summary-grid {
             display: flex !important;
             justify-content: space-between;
             gap: 10px;
             margin-bottom: 15px !important;
             width: 100% !important;
          }
          
          .summary-card-print {
             border: 1px solid #ccc !important;
             padding: 10px !important;
             border-radius: 6px;
             flex: 1; 
             text-align: center;
          }
          
          .mini-cards-row {
             display: flex !important;
             justify-content: space-between;
             gap: 10px;
             margin-top: 10px;
             border-top: 1px dotted #ccc;
             padding-top: 10px;
             width: 100% !important;
          }
          
          .mini-card-print { 
            font-size: 11px !important; 
            color: #000; 
            flex: 1; 
            text-align: center;
          }

          /* --- TABLE FIXES --- */
          .table-container { 
            width: 100% !important;
            border: 1px solid #ddd; 
            border-radius: 0; 
            margin-top: 20px;
          }
          
          table { 
            width: 100% !important; 
            border-collapse: collapse; 
            font-size: 11px !important; 
            table-layout: fixed; 
          }
          
          th, td { 
            padding: 4px !important; 
            border: 1px solid #ccc; 
            word-wrap: break-word; 
          }
          
          th { background-color: #f0f0f0 !important; color: #000 !important; font-weight: bold; }
        }
      `}</style>

      <div className="printable-area" style={styles.container}>
        {/* Print Header */}
        <div className="print-header" style={{ display: 'none' }}>
            <h2>Sales & Returns Report</h2>
            <p style={{margin:'5px 0', fontSize: '12px'}}>Period: {startDate} to {endDate}</p>
            {selectedUser !== "All" && <p style={{margin:0, fontSize: '12px'}}>User: {selectedUser}</p>}
        </div>

        <div className="non-printable" style={styles.headerRow}>
            <div>
                <h2 style={styles.header}>Sales Income</h2>
                <p style={styles.subHeader}>Net income analysis with returns deduction.</p>
            </div>
            <button onClick={fetchData} style={styles.iconBtn}><AiOutlineReload /></button>
        </div>

        {/* --- CONTROLS --- */}
        <div className="non-printable" style={styles.controls}>
            <div style={styles.filterGroup}>
                <label style={styles.label}>From</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={styles.input} />
            </div>
            <div style={styles.filterGroup}>
                <label style={styles.label}>To</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={styles.input} />
            </div>
            <div style={styles.filterGroup}>
                <label style={styles.label}>User</label>
                <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)} style={styles.select}>
                    <option value="All">All Users</option>
                    {users.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
            </div>
            <button onClick={() => window.print()} style={styles.printBtn}>
                <AiOutlinePrinter /> Print
            </button>
        </div>

        {/* --- SUMMARY CARDS --- */}
        <div className="summary-grid" style={styles.summaryGrid}>
            <div className="summary-card-print" style={styles.card}>
                <span style={styles.cardLabel}>Gross Sales</span>
                <span style={styles.cardValueGreen}>Rs. {summary.grossSales.toFixed(2)}</span>
            </div>
            <div className="summary-card-print" style={styles.card}>
                <span style={styles.cardLabel}>Total Returns</span>
                <span style={styles.cardValueRed}>- Rs. {summary.totalReturns.toFixed(2)}</span>
            </div>
            <div className="summary-card-print" style={{...styles.card, background: '#eff6ff', borderColor: '#bfdbfe'}}>
                <span style={{...styles.cardLabel, color: '#1e40af'}}>Net Income</span>
                <span style={{...styles.cardValue, color: '#1e40af'}}>Rs. {summary.netIncome.toFixed(2)}</span>
            </div>
        </div>

        <div className="mini-cards-row" style={{...styles.summaryGrid, marginTop: '15px'}}>
             <div className="mini-card-print" style={styles.miniCard}>
                <span>Net Cash:</span> <strong>Rs. {summary.netCash.toFixed(2)}</strong>
             </div>
             <div className="mini-card-print" style={styles.miniCard}>
                <span>Net Card:</span> <strong>Rs. {summary.netCard.toFixed(2)}</strong>
             </div>
             <div className="mini-card-print" style={styles.miniCard}>
                <span>Net Online:</span> <strong>Rs. {summary.netOnline.toFixed(2)}</strong>
             </div>
        </div>

        {/* --- TABLE --- */}
        <div style={{marginTop: '30px'}}>
            <div className="table-container" style={styles.tableCard}>
                {loading ? <p style={{padding:'20px', textAlign:'center'}}>Loading...</p> : (
                    <table style={styles.table}>
                        <thead><tr>
                            <th style={styles.th} width="15%">Date</th>
                            <th style={styles.th} width="20%">Ref #</th>
                            <th style={styles.th} width="10%">Type</th>
                            <th style={{...styles.th, textAlign: 'right'}} width="20%">Amount</th>
                            <th style={styles.th} width="15%">Method</th>
                            <th style={styles.th} width="20%">User</th>
                        </tr></thead>
                        <tbody>
                            {transactions.length === 0 ? (
                                <tr><td colSpan="6" style={{padding:'20px', textAlign:'center', color:'#888'}}>No data found.</td></tr>
                            ) : (
                                transactions
                                .filter(t => selectedUser === "All" || t.user === selectedUser)
                                .map(t => (
                                    <tr key={t.id} style={{backgroundColor: t.isReturn ? '#fff5f5' : 'white'}}>
                                        <td style={styles.td}>
                                            {t.date?.toDate ? t.date.toDate().toLocaleDateString() : 'N/A'}
                                            <div style={{fontSize:'10px', color:'#999'}} className="non-printable">{t.date?.toDate ? t.date.toDate().toLocaleTimeString() : ''}</div>
                                        </td>
                                        <td style={styles.td}>{t.ref}</td>
                                        <td style={styles.td}>
                                            <span style={t.isReturn ? styles.badgeRed : styles.badgeGreen}>{t.type}</span>
                                        </td>
                                        <td style={{...styles.td, textAlign: 'right', fontWeight:'bold', color: t.isReturn ? '#dc2626' : '#16a34a'}}>
                                            {t.amount < 0 ? '-' : ''} Rs. {Math.abs(t.amount).toFixed(2)}
                                        </td>
                                        <td style={styles.td}>{t.method}</td>
                                        <td style={styles.td}>{t.user}</td>
                                    </tr>
                                ))
                            )}
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
    container: { padding: '24px', fontFamily: "'Inter', sans-serif", backgroundColor: '#f8f9fa', minHeight: '100vh' },
    headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
    header: { fontSize: '24px', fontWeight: '700', color: '#1f2937', margin: 0 },
    subHeader: { color: '#6b7280', fontSize: '14px', margin: '4px 0 0 0' },
    iconBtn: { border:'none', background:'none', fontSize:'20px', cursor:'pointer', color:'#666' },
    
    controls: { display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end', backgroundColor: 'white', padding: '16px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px' },
    filterGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
    label: { fontSize: '12px', fontWeight: '600', color: '#374151' },
    input: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' },
    select: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', minWidth: '150px' },
    printBtn: { padding: '8px 16px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '500' },
    
    summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' },
    card: { backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: '5px' },
    miniCard: { backgroundColor: 'white', padding: '15px', borderRadius: '8px', border: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', color: '#555' },
    cardLabel: { fontSize: '13px', textTransform: 'uppercase', color: '#6b7280', fontWeight: '600' },
    cardValue: { fontSize: '24px', fontWeight: '700', color: '#111827' },
    cardValueGreen: { fontSize: '24px', fontWeight: '700', color: '#16a34a' },
    cardValueRed: { fontSize: '24px', fontWeight: '700', color: '#dc2626' },

    tableCard: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', overflow: 'hidden' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { textAlign: 'left', padding: '12px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' },
    td: { padding: '12px 16px', borderBottom: '1px solid #e5e7eb', fontSize: '14px', color: '#374151' },
    badgeGreen: { backgroundColor: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700' },
    badgeRed: { backgroundColor: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700' }
};

export default SalesIncome;