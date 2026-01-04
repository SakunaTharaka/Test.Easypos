import React, { useState, useEffect, useContext } from 'react';
import { db, auth } from '../../firebase'; 
import { 
  collection, 
  getDocs, 
  serverTimestamp,
  query,
  orderBy,
  where,
  limit,
  startAfter,
  doc,
  runTransaction 
} from 'firebase/firestore';
import { CashBookContext } from '../../context/CashBookContext';
import { AiOutlineSearch, AiOutlineArrowLeft, AiOutlineArrowRight, AiOutlineReload } from 'react-icons/ai'; 

const Accounts = () => {
  const { cashBooks, cashBookBalances, refreshBalances } = useContext(CashBookContext);
  
  const [loading, setLoading] = useState(true);
  const [isTransferring, setIsTransferring] = useState(false);

  // Balances State
  const [salesBalances, setSalesBalances] = useState({
    cash: 0,
    card: 0,
    online: 0
  });

  // Transfer Form State
  const [transferFromId, setTransferFromId] = useState('');
  const [transferToId, setTransferToId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDesc, setTransferDesc] = useState('');

  // History State
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [filterDate, setFilterDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCursors, setPageCursors] = useState([null]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const PAGE_SIZE = 30;

  const uid = auth.currentUser ? auth.currentUser.uid : null;

  // --- Fetch Wallets ---
  const fetchWalletBalances = async () => {
    if (!uid) return;
    setLoading(true);
    try {
        const walletColRef = collection(db, uid, "wallet", "accounts");
        const snapshot = await getDocs(walletColRef);
        
        const newBalances = { cash: 0, card: 0, online: 0 };
        snapshot.forEach(doc => {
            if (doc.id === 'cash') newBalances.cash = Number(doc.data().balance) || 0;
            if (doc.id === 'card') newBalances.card = Number(doc.data().balance) || 0;
            if (doc.id === 'online') newBalances.online = Number(doc.data().balance) || 0;
        });

        setSalesBalances(newBalances);
    } catch (error) {
        console.error("Error fetching wallet balances:", error);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    fetchWalletBalances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // --- Fetch History ---
  useEffect(() => {
    if(!uid) return;
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, currentPage, filterDate]); 

  const fetchHistory = async () => {
      setHistoryLoading(true);
      try {
          let q = collection(db, uid, "finance", "transfers");
          let constraints = [orderBy("createdAt", "desc")];

          if (filterDate) {
               const start = new Date(filterDate); start.setHours(0,0,0,0);
               const end = new Date(filterDate); end.setHours(23,59,59,999);
               constraints.push(where("createdAt", ">=", start));
               constraints.push(where("createdAt", "<=", end));
          }

          const cursor = pageCursors[currentPage - 1];
          if (cursor) constraints.push(startAfter(cursor));
          constraints.push(limit(PAGE_SIZE));

          const finalQuery = query(q, ...constraints);
          const snap = await getDocs(finalQuery);

          const data = snap.docs.map(d => ({id: d.id, ...d.data()}));
          setHistory(data);
          setHasNextPage(snap.docs.length === PAGE_SIZE);

          if (snap.docs.length > 0) {
               const lastVisible = snap.docs[snap.docs.length - 1];
               setPageCursors(prev => {
                  const newCursors = [...prev];
                  if(!newCursors[currentPage]) newCursors[currentPage] = lastVisible;
                  return newCursors;
               });
          }
      } catch (err) {
          console.error("Error fetching history:", err);
      }
      setHistoryLoading(false);
  };

  const getAllOptions = () => {
      const options = [
          { value: 'SALES_CASH', label: 'Cash from Sale', type: 'WALLET', walletId: 'cash' },
          { value: 'SALES_CARD', label: 'Card Payment Bank', type: 'WALLET', walletId: 'card' },
          { value: 'SALES_ONLINE', label: 'Online Payment Bank', type: 'WALLET', walletId: 'online' }
      ];
      cashBooks.forEach(cb => {
          options.push({ value: cb.id, label: cb.name, type: 'CASHBOOK' });
      });
      return options;
  };

  // --- Handle Transfer / Deposit / Withdrawal ---
  const handleTransfer = async (e) => {
    e.preventDefault();
    if (!uid) return;
    
    // --- 🛑 VALIDATION: PREVENT DEPOSIT -> WITHDRAWAL ---
    if (transferFromId === 'DEPOSIT_CASH' && transferToId === 'WITHDRAWAL_CASH') {
        return alert("Operation Not Allowed: You cannot select 'Deposit to Business' and 'Withdrawal Cash' at the same time. Please select a valid internal account.");
    }

    if (!transferFromId || !transferToId || !transferAmount) return alert("Please select Source, Destination, and Amount.");
    if (transferFromId === transferToId) return alert("Source and Destination cannot be the same.");
    
    const amt = parseFloat(transferAmount);
    if (isNaN(amt) || amt <= 0) return alert("Please enter a valid amount.");

    const allOptions = getAllOptions();
    
    // Resolve Objects
    let transferFrom = null;
    let transferTo = null;

    // 1. Resolve Source
    if (transferFromId === 'DEPOSIT_CASH') {
        transferFrom = { value: 'DEPOSIT_CASH', label: 'Deposit to Business', type: 'EXTERNAL_SOURCE' };
    } else {
        transferFrom = allOptions.find(o => o.value === transferFromId);
    }

    // 2. Resolve Destination
    if (transferToId === 'WITHDRAWAL_CASH') {
        transferTo = { value: 'WITHDRAWAL_CASH', label: 'Withdrawal Cash', type: 'EXTERNAL_DEST' };
    } else {
        transferTo = allOptions.find(o => o.value === transferToId);
    }

    if (!transferFrom || !transferTo) return alert("Invalid account selection.");

    // Pre-check for CashBooks (Only if NOT a deposit)
    if (transferFrom.type === 'CASHBOOK') {
        const currentBalance = cashBookBalances[transferFrom.value] || 0;
        if (currentBalance < amt) return alert(`Insufficient funds in ${transferFrom.label}.`);
    }

    setIsTransferring(true);
    try {
        await runTransaction(db, async (transaction) => {
            const timestamp = serverTimestamp();
            
            // --- SOURCE LOGIC ---
            let currentSourceBalance = 0;
            let sourceWalletRef = null;

            if (transferFrom.type === 'WALLET') {
                sourceWalletRef = doc(db, uid, "wallet", "accounts", transferFrom.walletId);
                const sDoc = await transaction.get(sourceWalletRef);
                if (!sDoc.exists()) throw "Source wallet not found.";
                currentSourceBalance = Number(sDoc.data().balance) || 0;
                if (currentSourceBalance < amt) throw `Insufficient funds in ${transferFrom.label}.`;
                
                // Deduct
                transaction.set(sourceWalletRef, { balance: currentSourceBalance - amt, lastUpdated: timestamp }, { merge: true });
            } 
            else if (transferFrom.type === 'CASHBOOK') {
                // Cashbook balance is calculated, so we just add an EXPENSE record to reduce it
                const expRef = doc(collection(db, uid, 'user_data', 'expenses'));
                transaction.set(expRef, {
                    expenseId: `TRF-${Date.now()}`,
                    category: transferTo.type === 'EXTERNAL_DEST' ? 'Withdrawal' : 'Internal Transfer',
                    amount: amt,
                    details: transferTo.type === 'EXTERNAL_DEST' ? `Withdrawal: ${transferDesc}` : `Transfer to ${transferTo.label}`,
                    cashBookId: transferFrom.value,
                    cashBookName: transferFrom.label,
                    createdAt: timestamp,
                    createdBy: "System"
                });
            }
            // If EXTERNAL_SOURCE (Deposit), we do nothing to the source.

            // --- DESTINATION LOGIC ---
            let currentDestBalance = 0;
            let destWalletRef = null;

            if (transferTo.type === 'WALLET') {
                destWalletRef = doc(db, uid, "wallet", "accounts", transferTo.walletId);
                const dDoc = await transaction.get(destWalletRef);
                if (dDoc.exists()) currentDestBalance = Number(dDoc.data().balance) || 0;
                
                // Add
                transaction.set(destWalletRef, { balance: currentDestBalance + amt, lastUpdated: timestamp }, { merge: true });
            }
            else if (transferTo.type === 'CASHBOOK') {
                // Add Entry to CashBook
                const entryRef = doc(collection(db, uid, 'cash_book_entries', 'entry_list'));
                transaction.set(entryRef, {
                    amount: amt,
                    details: transferFrom.type === 'EXTERNAL_SOURCE' ? `Deposit: ${transferDesc}` : `Transfer from ${transferFrom.label}`,
                    cashBookId: transferTo.value,
                    createdAt: timestamp,
                    addedBy: "System"
                });
            }
            // If EXTERNAL_DEST (Withdrawal), we do nothing to the destination.

            // --- LOG TRANSACTION ---
            const transferRef = doc(collection(db, uid, "finance", "transfers"));
            transaction.set(transferRef, {
                fromId: transferFrom.value,
                fromLabel: transferFrom.label,
                toId: transferTo.value,
                toLabel: transferTo.label,
                amount: amt,
                description: transferDesc || (transferFrom.type === 'EXTERNAL_SOURCE' ? 'Deposit' : 'Transfer'),
                createdAt: timestamp,
                createdBy: "Admin"
            });
        });
        
        alert("Transaction Successful!");
        setTransferAmount('');
        setTransferDesc('');
        setTransferFromId('');
        setTransferToId('');
        
        await refreshBalances(); 
        fetchWalletBalances();   
        
        setCurrentPage(1);
        setPageCursors([null]);
        fetchHistory();     

    } catch (error) {
        console.error("Transaction failed:", error);
        const msg = typeof error === 'string' ? error : (error.message || "Unknown error");
        alert("Transaction failed: " + msg);
    } finally {
        setIsTransferring(false);
    }
  };

  const displayedHistory = history.filter(item => {
      if (!searchTerm) return true;
      const lower = searchTerm.toLowerCase();
      return (
          item.description?.toLowerCase().includes(lower) ||
          item.fromLabel?.toLowerCase().includes(lower) ||
          item.toLabel?.toLowerCase().includes(lower) ||
          item.amount?.toString().includes(lower)
      );
  });
  
  const handleNextPage = () => { if (hasNextPage) setCurrentPage(p => p + 1); };
  const handlePrevPage = () => { if (currentPage > 1) setCurrentPage(p => p - 1); };
  const handleDateFilterChange = (e) => {
      setFilterDate(e.target.value);
      setCurrentPage(1);
      setPageCursors([null]);
  };

  return (
    <div style={styles.container}>
      
      {/* --- SECTION 1: ACCOUNT BALANCES --- */}
      <div style={styles.headerRow}>
         <h3 style={{...styles.sectionTitle, marginBottom: 0}}>Wallet Balances</h3>
         <button onClick={fetchWalletBalances} style={styles.refreshBtn} title="Refresh Balances">
            <AiOutlineReload className={loading ? 'spin' : ''} /> Refresh
         </button>
      </div>

      <div style={styles.gridContainer}>
          <div style={styles.accountCard}>
              <div style={styles.cardIconBoxGreen}>Cash</div>
              <div>
                  <div style={styles.cardLabel}>Cash from Sale</div>
                  <div style={styles.cardBalance}>Rs. {salesBalances.cash.toFixed(2)}</div>
              </div>
          </div>

          <div style={styles.accountCard}>
              <div style={styles.cardIconBoxBlue}>Card</div>
              <div>
                  <div style={styles.cardLabel}>Card Payment Bank</div>
                  <div style={styles.cardBalance}>Rs. {salesBalances.card.toFixed(2)}</div>
              </div>
          </div>

          <div style={styles.accountCard}>
              <div style={styles.cardIconBoxPurple}>Online</div>
              <div>
                  <div style={styles.cardLabel}>Online Payment Bank</div>
                  <div style={styles.cardBalance}>Rs. {salesBalances.online.toFixed(2)}</div>
              </div>
          </div>
      </div>
      
      {/* --- SECTION 2: CASH BOOKS --- */}
      <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Cash Books</h3>
          <div style={styles.cashBookGrid}>
              {cashBooks.length > 0 ? cashBooks.map(book => (
                  <div key={book.id} style={styles.cashBookCard}>
                      <div style={styles.cashBookName}>{book.name}</div>
                      <div style={styles.cashBookBalance}>Rs. {(cashBookBalances[book.id] || 0).toFixed(2)}</div>
                  </div>
              )) : <p style={{color: '#888'}}>No cash books found.</p>}
          </div>
      </div>

      {/* --- SECTION 3: TRANSFER / DEPOSIT / WITHDRAW --- */}
      <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Manage Funds</h3>
          <div style={styles.transferContainer}>
              <form onSubmit={handleTransfer} style={styles.transferForm}>
                  
                  <div style={styles.inputGroup}>
                      <label style={styles.label}>From (Source)</label>
                      <select 
                          style={styles.select}
                          value={transferFromId} 
                          onChange={(e) => setTransferFromId(e.target.value)}
                      >
                          <option value="">Select Source...</option>
                          {/* ✅ ADDED DEPOSIT OPTION HERE */}
                          <option value="DEPOSIT_CASH" style={{fontWeight: 'bold', color: '#16a34a'}}>➕ Deposit to Business</option>
                          
                          <optgroup label="Sales Buckets">
                              <option value="SALES_CASH">Cash from Sale</option>
                              <option value="SALES_CARD">Card Payment Bank</option>
                              <option value="SALES_ONLINE">Online Payment Bank</option>
                          </optgroup>
                          <optgroup label="Cash Books">
                              {cashBooks.map(cb => (
                                  <option key={cb.id} value={cb.id}>{cb.name}</option>
                              ))}
                          </optgroup>
                      </select>
                  </div>

                  <div style={styles.arrowContainer}>
                      <span style={{fontSize: '24px', color: '#94a3b8', fontWeight: 'bold'}}>→</span>
                  </div>

                  <div style={styles.inputGroup}>
                      <label style={styles.label}>To (Destination)</label>
                      <select 
                          style={styles.select}
                          value={transferToId} 
                          onChange={(e) => setTransferToId(e.target.value)}
                      >
                          <option value="">Select Destination...</option>
                          {/* ✅ ADDED WITHDRAWAL OPTION HERE */}
                          <option value="WITHDRAWAL_CASH" style={{fontWeight: 'bold', color: '#ef4444'}}>➖ Withdrawal Cash</option>
                          
                          <optgroup label="Sales Buckets">
                              <option value="SALES_CASH">Cash from Sale</option>
                              <option value="SALES_CARD">Card Payment Bank</option>
                              <option value="SALES_ONLINE">Online Payment Bank</option>
                          </optgroup>
                          <optgroup label="Cash Books">
                              {cashBooks.map(cb => (
                                  <option key={cb.id} value={cb.id}>{cb.name}</option>
                              ))}
                          </optgroup>
                      </select>
                  </div>

                  <div style={styles.inputGroup}>
                      <label style={styles.label}>Amount (Rs.)</label>
                      <input 
                          type="number" step="0.01" 
                          value={transferAmount} onChange={e => setTransferAmount(e.target.value)} 
                          style={styles.input} placeholder="0.00"
                      />
                  </div>

                  <div style={styles.inputGroup}>
                      <label style={styles.label}>Reference / Note</label>
                      <input 
                          type="text" value={transferDesc} onChange={e => setTransferDesc(e.target.value)} 
                          style={styles.input} placeholder="Optional"
                      />
                  </div>

                  <button type="submit" style={isTransferring ? styles.transferBtnDisabled : styles.transferBtn} disabled={isTransferring}>
                      {isTransferring ? 'Processing...' : 'Execute Transaction'}
                  </button>
              </form>
          </div>
      </div>
      
      {/* --- SECTION 4: HISTORY --- */}
      <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Transaction History</h3>
          <div style={styles.controlsRow}>
              <div style={styles.searchBox}>
                  <AiOutlineSearch style={{color: '#94a3b8'}} />
                  <input type="text" placeholder="Search..." style={styles.simpleInput} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              <div style={styles.dateBox}>
                  <label style={{fontSize: '13px', fontWeight: '600', color: '#64748b'}}>Filter Date:</label>
                  <input type="date" style={styles.simpleInput} value={filterDate} onChange={handleDateFilterChange} />
                  {filterDate && <button onClick={() => { setFilterDate(""); setCurrentPage(1); setPageCursors([null]); }} style={styles.clearBtn}>Clear</button>}
              </div>
          </div>
          <div style={styles.tableWrapper}>
              <table style={styles.table}>
                  <thead>
                      <tr>
                          <th style={styles.th}>Date</th>
                          <th style={styles.th}>From</th>
                          <th style={styles.th}>To</th>
                          <th style={styles.th}>Amount</th>
                          <th style={styles.th}>Reference</th>
                      </tr>
                  </thead>
                  <tbody>
                      {historyLoading ? (
                          <tr><td colSpan="5" style={styles.loadingTd}>Loading transactions...</td></tr>
                      ) : displayedHistory.length > 0 ? (
                          displayedHistory.map(tx => (
                              <tr key={tx.id}>
                                  <td style={styles.td}>{tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleString() : 'N/A'}</td>
                                  <td style={styles.td}><span style={styles.tag}>{tx.fromLabel}</span></td>
                                  <td style={styles.td}><span style={{...styles.tag, background: '#dcfce7', color: '#16a34a'}}>{tx.toLabel}</span></td>
                                  <td style={{...styles.td, fontWeight: 'bold'}}>Rs. {tx.amount?.toFixed(2)}</td>
                                  <td style={{...styles.td, color: '#64748b'}}>{tx.description || '-'}</td>
                              </tr>
                          ))
                      ) : (
                          <tr><td colSpan="5" style={styles.loadingTd}>No transactions found.</td></tr>
                      )}
                  </tbody>
              </table>
          </div>
          <div style={styles.paginationRow}>
              <button onClick={handlePrevPage} disabled={currentPage === 1 || historyLoading} style={styles.pageBtn}><AiOutlineArrowLeft /> Prev</button>
              <span style={styles.pageInfo}>Page {currentPage}</span>
              <button onClick={handleNextPage} disabled={!hasNextPage || historyLoading} style={styles.pageBtn}>Next <AiOutlineArrowRight /></button>
          </div>
      </div>

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

const themeColors = { 
  primary: '#00A1FF', 
  secondary: '#6c5ce7',
  success: '#00b894',
  text: '#2d3436',
  border: '#dfe6e9',
  bg: '#f9fafb'
};

const styles = {
  container: {
    padding: '24px',
    fontFamily: "'Inter', sans-serif",
    maxWidth: '1200px',
    margin: '0 auto',
    backgroundColor: themeColors.bg,
    minHeight: '80vh'
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px'
  },
  refreshBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    background: 'white',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#475569',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  gridContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '20px',
    marginBottom: '30px'
  },
  accountCard: {
    background: 'white',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    border: '1px solid #f1f5f9'
  },
  cardIconBoxGreen: { width: '48px', height: '48px', borderRadius: '10px', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '14px' },
  cardIconBoxBlue: { width: '48px', height: '48px', borderRadius: '10px', background: '#dbeafe', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '14px' },
  cardIconBoxPurple: { width: '48px', height: '48px', borderRadius: '10px', background: '#f3e8ff', color: '#9333ea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '14px' },
  cardLabel: { fontSize: '14px', color: '#64748b', fontWeight: '500' },
  cardBalance: { fontSize: '20px', color: '#0f172a', fontWeight: '700', marginTop: '4px' },
  
  section: { background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '30px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0' },
  sectionTitle: { fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center' },
  
  cashBookGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' },
  cashBookCard: { background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0', textAlign: 'center' },
  cashBookName: { fontSize: '14px', fontWeight: '600', color: '#475569' },
  cashBookBalance: { fontSize: '18px', fontWeight: '700', color: '#0f172a', marginTop: '8px' },

  transferContainer: { background: '#f8fafc', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' },
  transferForm: { display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' },
  inputGroup: { flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '13px', fontWeight: '600', color: '#475569' },
  input: { padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', width: '100%', boxSizing: 'border-box' },
  select: { padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', width: '100%', boxSizing: 'border-box', backgroundColor: 'white' },
  arrowContainer: { display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: '10px' },
  transferBtn: { padding: '12px 24px', background: themeColors.primary, color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', marginBottom: '1px', transition: 'background 0.2s' },
  transferBtnDisabled: { padding: '12px 24px', background: '#94a3b8', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'not-allowed', marginBottom: '1px' },
  
  controlsRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' },
  searchBox: { display: 'flex', alignItems: 'center', gap: '10px', background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: 1, minWidth: '250px' },
  dateBox: { display: 'flex', alignItems: 'center', gap: '10px' },
  simpleInput: { border: 'none', background: 'transparent', outline: 'none', fontSize: '14px', width: '100%' },
  clearBtn: { padding: '4px 8px', fontSize: '12px', background: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  tableWrapper: { overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  th: { padding: '12px 16px', textAlign: 'left', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: '600' },
  td: { padding: '12px 16px', borderBottom: '1px solid #e2e8f0', color: '#334155' },
  loadingTd: { textAlign: 'center', padding: '24px', color: '#94a3b8' },
  tag: { padding: '4px 8px', borderRadius: '4px', background: '#f1f5f9', fontSize: '12px', fontWeight: '500', color: '#475569' },
  paginationRow: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '20px' },
  pageBtn: { display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer' },
  pageInfo: { fontSize: '14px', color: '#64748b' }
};

export default Accounts;