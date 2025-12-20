import React, { useState, useEffect, useContext } from 'react';
import { db, auth } from '../../firebase'; 
import { 
  collection, 
  addDoc, 
  getDocs, 
  serverTimestamp
} from 'firebase/firestore';
import { CashBookContext } from '../../context/CashBookContext';

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

  const uid = auth.currentUser ? auth.currentUser.uid : null;

  // --- 1. Fetch Data & Calculate Balances ---
  useEffect(() => {
    if (!uid) return;
    calculateBalances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, cashBookBalances]);

  const calculateBalances = async () => {
    setLoading(true);
    try {
      const invoicesRef = collection(db, uid, "invoices", "invoice_list");
      const invoicesSnap = await getDocs(invoicesRef);
      
      let totalCashIn = 0;
      let totalCardIn = 0;
      let totalOnlineIn = 0;

      invoicesSnap.forEach(doc => {
        const data = doc.data();
        const amt = parseFloat(data.total) || 0;
        
        let method = data.paymentMethod;
        if (data.paymentMethod === 'Credit-Repayment') {
            method = data.method;
        }

        if (method === 'Cash') totalCashIn += amt;
        else if (method === 'Card') totalCardIn += amt;
        else if (method === 'Online') totalOnlineIn += amt;
      });

      const transfersRef = collection(db, uid, "finance", "transfers");
      const transfersSnap = await getDocs(transfersRef);

      let cashTransferredOut = 0;
      let cardTransferredOut = 0;
      let onlineTransferredOut = 0;
      
      let cashTransferredIn = 0;
      let cardTransferredIn = 0;
      let onlineTransferredIn = 0;

      transfersSnap.forEach(doc => {
          const t = doc.data();
          const amt = parseFloat(t.amount) || 0;

          if (t.fromId === 'SALES_CASH') cashTransferredOut += amt;
          if (t.fromId === 'SALES_CARD') cardTransferredOut += amt;
          if (t.fromId === 'SALES_ONLINE') onlineTransferredOut += amt;

          if (t.toId === 'SALES_CASH') cashTransferredIn += amt;
          if (t.toId === 'SALES_CARD') cardTransferredIn += amt;
          if (t.toId === 'SALES_ONLINE') onlineTransferredIn += amt;
      });

      setSalesBalances({
          cash: totalCashIn + cashTransferredIn - cashTransferredOut,
          card: totalCardIn + cardTransferredIn - cardTransferredOut,
          online: totalOnlineIn + onlineTransferredIn - onlineTransferredOut
      });

    } catch (error) {
      console.error("Error calculating balances:", error);
    } finally {
      setLoading(false);
    }
  };

  const getAllOptions = () => {
      const options = [
          { value: 'SALES_CASH', label: 'Cash from Sale', type: 'BUCKET' },
          { value: 'SALES_CARD', label: 'Card Payment Bank', type: 'BUCKET' },
          { value: 'SALES_ONLINE', label: 'Online Payment Bank', type: 'BUCKET' }
      ];
      cashBooks.forEach(cb => {
          options.push({ value: cb.id, label: cb.name, type: 'CASHBOOK' });
      });
      return options;
  };

  // --- 2. Handle Transfer ---
  const handleTransfer = async (e) => {
    e.preventDefault();
    
    if (!transferFromId || !transferToId || !transferAmount) {
        alert("Please select Source, Destination, and Amount.");
        return;
    }
    if (transferFromId === transferToId) {
        alert("Source and Destination cannot be the same.");
        return;
    }
    
    const amt = parseFloat(transferAmount);
    if (isNaN(amt) || amt <= 0) {
        alert("Please enter a valid amount.");
        return;
    }

    const allOptions = getAllOptions();
    const transferFrom = allOptions.find(o => o.value === transferFromId);
    const transferTo = allOptions.find(o => o.value === transferToId);

    if (!transferFrom || !transferTo) {
        alert("Invalid account selection.");
        return;
    }

    setIsTransferring(true);
    try {
        const batchPromises = [];
        const timestamp = serverTimestamp();

        // 1. Record the Transfer (Log)
        batchPromises.push(addDoc(collection(db, uid, "finance", "transfers"), {
            fromId: transferFrom.value,
            fromLabel: transferFrom.label,
            toId: transferTo.value,
            toLabel: transferTo.label,
            amount: amt,
            description: transferDesc,
            createdAt: timestamp,
            createdBy: "Admin"
        }));

        // 2. Handle Cash Books Integration (Money Movement)
        // If SOURCE is a Cash Book -> Create Expense (Reduction)
        if (transferFrom.type === 'CASHBOOK') {
            batchPromises.push(addDoc(collection(db, uid, 'user_data', 'expenses'), {
                expenseId: `TRF-${Date.now()}`,
                category: 'Internal Transfer', // Key for CashBook.js to recognize
                amount: amt,
                details: `Transfer to ${transferTo.label} - ${transferDesc}`,
                cashBookId: transferFrom.value,
                cashBookName: transferFrom.label,
                createdAt: timestamp,
                createdBy: "System"
            }));
        }

        // If DESTINATION is a Cash Book -> Create Cash In Entry (Addition)
        if (transferTo.type === 'CASHBOOK') {
            batchPromises.push(addDoc(collection(db, uid, 'cash_book_entries', 'entry_list'), {
                amount: amt,
                details: `Transfer from ${transferFrom.label} - ${transferDesc}`,
                cashBookId: transferTo.value,
                createdAt: timestamp,
                addedBy: "System"
            }));
        }

        await Promise.all(batchPromises);
        
        alert("Transfer Successful!");
        setTransferAmount('');
        setTransferDesc('');
        setTransferFromId('');
        setTransferToId('');
        
        await refreshBalances(); 
        calculateBalances();     

    } catch (error) {
        console.error("Transfer failed:", error);
        alert("Transfer failed: " + error.message);
    } finally {
        setIsTransferring(false);
    }
  };

  return (
    <div style={styles.container}>
      
      {/* --- SECTION 1: ACCOUNT BALANCES --- */}
      <div style={styles.gridContainer}>
          <div style={styles.accountCard}>
              <div style={styles.cardIconBoxGreen}>Cash</div>
              <div>
                  <div style={styles.cardLabel}>Cash from Sale</div>
                  <div style={styles.cardBalance}>Rs. {loading ? '...' : salesBalances.cash.toFixed(2)}</div>
              </div>
          </div>

          <div style={styles.accountCard}>
              <div style={styles.cardIconBoxBlue}>Card</div>
              <div>
                  <div style={styles.cardLabel}>Card Payment Bank</div>
                  <div style={styles.cardBalance}>Rs. {loading ? '...' : salesBalances.card.toFixed(2)}</div>
              </div>
          </div>

          <div style={styles.accountCard}>
              <div style={styles.cardIconBoxPurple}>Online</div>
              <div>
                  <div style={styles.cardLabel}>Online Payment Bank</div>
                  <div style={styles.cardBalance}>Rs. {loading ? '...' : salesBalances.online.toFixed(2)}</div>
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
              )) : <p style={{color: '#888'}}>No cash books found. Create one in the Cash Book tab.</p>}
          </div>
      </div>

      {/* --- SECTION 3: TRANSFER MONEY --- */}
      <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Transfer Money</h3>
          <div style={styles.transferContainer}>
              <form onSubmit={handleTransfer} style={styles.transferForm}>
                  
                  <div style={styles.inputGroup}>
                      <label style={styles.label}>From Account</label>
                      <select 
                          style={styles.select}
                          value={transferFromId} 
                          onChange={(e) => setTransferFromId(e.target.value)}
                      >
                          <option value="">Select Source...</option>
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
                      <label style={styles.label}>To Account</label>
                      <select 
                          style={styles.select}
                          value={transferToId} 
                          onChange={(e) => setTransferToId(e.target.value)}
                      >
                          <option value="">Select Destination...</option>
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
                          type="number" 
                          step="0.01" 
                          value={transferAmount} 
                          onChange={e => setTransferAmount(e.target.value)} 
                          style={styles.input} 
                          placeholder="0.00"
                      />
                  </div>

                  <div style={styles.inputGroup}>
                      <label style={styles.label}>Reference / Note</label>
                      <input 
                          type="text" 
                          value={transferDesc} 
                          onChange={e => setTransferDesc(e.target.value)} 
                          style={styles.input} 
                          placeholder="Optional"
                      />
                  </div>

                  <button 
                      type="submit" 
                      style={isTransferring ? styles.transferBtnDisabled : styles.transferBtn} 
                      disabled={isTransferring}
                  >
                      {isTransferring ? 'Processing...' : 'Transfer Funds'}
                  </button>

              </form>
          </div>
      </div>

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
  cardIconBoxGreen: {
    width: '48px', height: '48px', borderRadius: '10px',
    background: '#dcfce7', color: '#16a34a',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 'bold', fontSize: '14px'
  },
  cardIconBoxBlue: {
    width: '48px', height: '48px', borderRadius: '10px',
    background: '#dbeafe', color: '#2563eb',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 'bold', fontSize: '14px'
  },
  cardIconBoxPurple: {
    width: '48px', height: '48px', borderRadius: '10px',
    background: '#f3e8ff', color: '#9333ea',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 'bold', fontSize: '14px'
  },
  cardLabel: { fontSize: '14px', color: '#64748b', fontWeight: '500' },
  cardBalance: { fontSize: '20px', color: '#0f172a', fontWeight: '700', marginTop: '4px' },
  
  section: {
    background: 'white',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '30px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    border: '1px solid #e2e8f0'
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: '20px',
    display: 'flex',
    alignItems: 'center'
  },
  cashBookGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '16px'
  },
  cashBookCard: {
    background: '#f8fafc',
    padding: '16px',
    borderRadius: '10px',
    border: '1px solid #e2e8f0',
    textAlign: 'center'
  },
  cashBookName: { fontSize: '14px', fontWeight: '600', color: '#475569' },
  cashBookBalance: { fontSize: '18px', fontWeight: '700', color: '#0f172a', marginTop: '8px' },

  transferContainer: {
    background: '#f8fafc',
    padding: '24px',
    borderRadius: '12px',
    border: '1px solid #e2e8f0'
  },
  transferForm: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '16px',
    flexWrap: 'wrap'
  },
  inputGroup: {
    flex: 1,
    minWidth: '200px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  label: { fontSize: '13px', fontWeight: '600', color: '#475569' },
  input: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box'
  },
  select: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    backgroundColor: 'white'
  },
  arrowContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: '10px'
  },
  transferBtn: {
    padding: '12px 24px',
    background: themeColors.primary,
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontWeight: '600',
    cursor: 'pointer',
    marginBottom: '1px',
    transition: 'background 0.2s'
  },
  transferBtnDisabled: {
    padding: '12px 24px',
    background: '#94a3b8',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontWeight: '600',
    cursor: 'not-allowed',
    marginBottom: '1px'
  }
};

export default Accounts;