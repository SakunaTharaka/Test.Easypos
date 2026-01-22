import React, { useState, useEffect, useCallback, useMemo, useContext } from "react";
import { db, auth } from "../../firebase";
import { 
  collection, 
  query, 
  getDocs, 
  serverTimestamp, 
  orderBy, 
  doc, 
  limit, 
  startAfter, 
  where,
  runTransaction
} from "firebase/firestore";
import { AiOutlineSearch, AiOutlineArrowLeft, AiOutlineArrowRight } from "react-icons/ai";
import Select from "react-select";
import { CashBookContext } from "../../context/CashBookContext";

const StockPayment = () => {
  const { cashBooks, cashBookBalances, refreshBalances } = useContext(CashBookContext);

  const [stockInRecords, setStockInRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pagination State
  const [page, setPage] = useState(1);
  const [lastVisible, setLastVisible] = useState(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const PAGE_SIZE = 20;

  // Filter State
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState("");

  // Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [currentItemForPayment, setCurrentItemForPayment] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [paymentsForHistory, setPaymentsForHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Wallets State (Stores Balance & Nickname for Card, Online, Cheque)
  const [wallets, setWallets] = useState({});

  // Fetch Wallets Data
  const fetchWallets = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      try {
          const colRef = collection(db, uid, "wallet", "accounts");
          const snapshot = await getDocs(colRef);
          const walletData = {};
          snapshot.forEach(doc => {
              walletData[doc.id] = {
                  balance: Number(doc.data().balance) || 0,
                  nickname: doc.data().nickname || ''
              };
          });
          setWallets(walletData);
      } catch (err) {
          console.error("Error fetching wallets:", err);
      }
  };

  useEffect(() => {
      fetchWallets();
  }, []);

  // Debounce Search Input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500); 
    return () => clearTimeout(handler);
  }, [search]);

  const getCurrentInternal = () => {
    try {
      const stored = localStorage.getItem("internalLoggedInUser");
      return stored ? JSON.parse(stored) : null;
    } catch (e) { return null; }
  };
  
  // --- FETCH DATA ---
  const fetchData = useCallback(async (direction = 'initial') => {
    setLoading(true);
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    try {
      const stockInColRef = collection(db, uid, "inventory", "stock_in");
      let constraints = [orderBy("createdAt", "desc")];

      if (selectedDate) {
        const startOfDay = new Date(selectedDate); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(selectedDate); endOfDay.setHours(23, 59, 59, 999);
        constraints.push(where("createdAt", ">=", startOfDay));
        constraints.push(where("createdAt", "<=", endOfDay));
      }

      if (debouncedSearch) {
          if(debouncedSearch.startsWith("SI-")) {
             constraints = [where("stockInId", "==", debouncedSearch)];
          }
      }

      if (direction === 'next' && lastVisible) {
          constraints.push(startAfter(lastVisible));
      }

      constraints.push(limit(PAGE_SIZE + 1));

      const q = query(stockInColRef, ...constraints);
      const stockInSnap = await getDocs(q);

      const items = stockInSnap.docs.map((doc) => {
        const data = doc.data();
        const totalValue = (data.lineItems || []).reduce((sum, item) => sum + (item.quantity || 0) * (item.price || 0), 0);
        const totalPaid = data.totalPaid || 0; 

        return { 
            id: doc.id, 
            ...data, 
            totalValue,
            totalPaid,
            balance: totalValue - totalPaid
        };
      });

      let displayItems = items;
      if (debouncedSearch && !debouncedSearch.startsWith("SI-")) {
          const lower = debouncedSearch.toLowerCase();
          displayItems = items.filter(i => 
              (i.supplierCompany || "").toLowerCase().includes(lower) || 
              (i.supplierName || "").toLowerCase().includes(lower)
          );
      }

      const hasNext = displayItems.length > PAGE_SIZE;
      if (hasNext) {
          displayItems.pop(); 
          setLastVisible(stockInSnap.docs[PAGE_SIZE - 1]);
      } else {
          setLastVisible(stockInSnap.docs[stockInSnap.docs.length - 1]);
      }
      
      setHasNextPage(hasNext);
      setStockInRecords(displayItems);

    } catch (error) {
      console.error("Error fetching stock payment data:", error);
    }
    setLoading(false);
  }, [debouncedSearch, selectedDate, lastVisible]);

  useEffect(() => {
    setPage(1);
    setLastVisible(null);
    fetchData('initial');
    // eslint-disable-next-line
  }, [debouncedSearch, selectedDate]);

  const handleNextPage = () => {
      setPage(p => p + 1);
      fetchData('next');
  };

  const handlePrevPage = () => {
     if(page > 1) {
         setPage(1);
         setLastVisible(null);
         fetchData('initial'); 
     }
  };

  const handleOpenPaymentModal = (record) => {
    setCurrentItemForPayment(record);
    setShowPaymentModal(true);
    fetchWallets(); // Refresh balances when modal opens
  };
  
  const handleOpenHistoryModal = async (stockInId, stockInDocId) => {
    setShowHistoryModal(true);
    setHistoryLoading(true);
    setPaymentsForHistory([]);
    
    const uid = auth.currentUser?.uid;
    try {
        const paymentsColRef = collection(db, uid, "stock_payments", "payments");
        const q = query(paymentsColRef, where("stockInId", "==", stockInId), orderBy("paidAt", "desc"));
        const snap = await getDocs(q);
        const history = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setPaymentsForHistory(history);
    } catch (err) {
        console.error("Error fetching history", err);
        alert("Failed to load history.");
    }
    setHistoryLoading(false);
  };
  
  const generatePaymentId = () => `P${Date.now().toString().slice(-7)}`;

  // --- SAVE PAYMENT WITH TRANSACTION ---
  const handleSavePayment = async (paymentData) => {
    if (!currentItemForPayment) return;
    const uid = auth.currentUser.uid;
    const user = getCurrentInternal();

    try {
        await runTransaction(db, async (transaction) => {
            // 1. Get references
            const stockDocRef = doc(db, uid, "inventory", "stock_in", currentItemForPayment.id);
            const paymentsColRef = collection(db, uid, "stock_payments", "payments");
            const newPaymentRef = doc(paymentsColRef); 

            // 2. Read current Stock Document
            const stockDoc = await transaction.get(stockDocRef);
            if (!stockDoc.exists()) throw new Error("Stock Document does not exist!");
            
            const currentTotalPaid = stockDoc.data().totalPaid || 0;
            const newTotalPaid = currentTotalPaid + paymentData.amount;

            // 3. READ Source Wallet if applicable (Cheque or Online/Card)
            let walletRef = null;
            let currentWalletBalance = 0;
            let walletLabelForError = "";

            if (paymentData.method === 'Cheque') {
                walletRef = doc(db, uid, "wallet", "accounts", "cheque");
                walletLabelForError = "Cheque Account";
            } 
            else if (paymentData.method === 'Online Payment') {
                // For Online Payment, we use the selected wallet ID (card, online, or cheque)
                walletRef = doc(db, uid, "wallet", "accounts", paymentData.walletId);
                walletLabelForError = paymentData.walletName; 
            }

            if (walletRef) {
                const walletSnap = await transaction.get(walletRef);
                if (!walletSnap.exists()) throw new Error(`${walletLabelForError} not found. Please initialize Accounts page first.`);
                
                currentWalletBalance = Number(walletSnap.data().balance) || 0;
                if (currentWalletBalance < paymentData.amount) {
                    throw new Error(`Insufficient funds in ${walletLabelForError}. Available: Rs. ${currentWalletBalance.toFixed(2)}`);
                }
            }

            // 4. Create Payment Document
            const paymentDoc = {
                paymentId: generatePaymentId(), 
                stockInId: currentItemForPayment.stockInId,
                stockInDocId: currentItemForPayment.id, 
                paidBy: user.username,
                paidAt: serverTimestamp(), 
                ...paymentData,
            };

            transaction.set(newPaymentRef, paymentDoc);

            // 5. Update Parent Stock Document
            transaction.update(stockDocRef, {
                totalPaid: newTotalPaid,
                lastPayer: user.username,
                lastPaymentAt: serverTimestamp()
            });

            // 6. Deduct from Wallet
            if (walletRef) {
                transaction.update(walletRef, {
                    balance: currentWalletBalance - paymentData.amount,
                    lastUpdated: serverTimestamp()
                });
            }
        });
        
        await refreshBalances();
        fetchWallets(); // Refresh local wallet state
        fetchData('current'); 
        
        alert("Payment saved successfully!");
    } catch (error) {
        alert("Transaction Failed: " + error.message);
    } finally {
        setShowPaymentModal(false);
        setCurrentItemForPayment(null);
    }
  };
  
  if (loading && page === 1) return <div style={styles.loadingContainer}>Loading data...</div>;

  return (
    <div style={styles.container}>
      {/* Balances Section */}
      <div style={styles.section}>
        <h2 style={styles.title}>Today's Cash Book Balances</h2>
        <div style={styles.balancesContainer}>
            {cashBooks.length > 0 ? cashBooks.map(book => (
                <div key={book.id} style={styles.balanceCard}>
                    <span style={styles.balanceLabel}>{book.name}</span>
                    <span style={styles.balanceAmount}>Rs. {(cashBookBalances[book.id] || 0).toFixed(2)}</span>
                </div>
            )) : <p>No cash books found.</p>}
        </div>
      </div>

      <h2 style={styles.title}>Stock Payments</h2>
      
      <div style={styles.controlsContainer}>
        <div style={{...styles.filterGroup, flexDirection: 'row', alignItems: 'center', gap: '10px'}}>
            <label>Select Date</label>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={styles.input}/>
            <button onClick={() => setSelectedDate('')} style={styles.clearButton}>Clear</button>
        </div>
        <div style={styles.filterGroup}>
          <label>Search by ID (Start with SI-)</label>
          <div style={styles.searchInputContainer}>
              <AiOutlineSearch style={styles.searchIcon}/>
              <input 
                  type="text" 
                  placeholder="Enter Stock ID (e.g. SI-1001)..." 
                  value={search} 
                  onChange={e => setSearch(e.target.value)} 
                  style={{...styles.input, paddingLeft: '35px'}}
              />
          </div>
        </div>
      </div>
      
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Stock In ID</th>
              <th style={styles.th}>Date</th>
              <th style={styles.th}>Company / Supplier</th>
              <th style={styles.th}>Total Value</th>
              <th style={styles.th}>Paid Amount</th>
              <th style={styles.th}>Balance</th>
              <th style={styles.th}>User Action</th>
              <th style={styles.th}>Last Payer</th>
            </tr>
          </thead>
          <tbody>
            {stockInRecords.map((rec) => {
              const balance = rec.balance; 
              const isPayable = balance > 1; 

              return (
                <tr key={rec.id}>
                  <td style={styles.td}>{rec.stockInId}</td>
                  <td style={styles.td}>{rec.createdAt?.toDate().toLocaleDateString()}</td>
                  <td style={styles.td}><div>{rec.supplierCompany}</div><div style={styles.subText}>{rec.supplierName}</div></td>
                  <td style={styles.td}>Rs. {rec.totalValue.toFixed(2)}</td>
                  <td style={styles.td}>Rs. {rec.totalPaid.toFixed(2)}</td>
                  <td style={{...styles.td, fontWeight: 'bold', color: isPayable ? '#e74c3c' : '#2ecc71'}}>Rs. {balance.toFixed(2)}</td>
                  <td style={styles.td}>
                    <div style={styles.actionButtonsContainer}>
                      {isPayable && (
                        <button onClick={() => handleOpenPaymentModal(rec)} style={styles.addPaymentButton}>Make Payment</button>
                      )}
                      <button onClick={() => handleOpenHistoryModal(rec.stockInId, rec.id)} style={styles.viewHistoryButton}>View Payments</button>
                    </div>
                  </td>
                  <td style={styles.td}>{rec.lastPayer || 'N/A'}</td>
                </tr>
              );
            })}
             {stockInRecords.length === 0 && !loading && (<tr><td colSpan="8" style={styles.noData}>No records found.</td></tr>)}
          </tbody>
        </table>
      </div>

      <div style={styles.paginationContainer}>
          <button onClick={handlePrevPage} disabled={page === 1 || loading} style={styles.pageBtn}>
              <AiOutlineArrowLeft /> Prev
          </button>
          <span style={styles.pageInfo}>Page {page}</span>
          <button onClick={handleNextPage} disabled={!hasNextPage || loading} style={styles.pageBtn}>
              Next <AiOutlineArrowRight />
          </button>
      </div>

      {showPaymentModal && 
        <PaymentModal 
            record={currentItemForPayment} 
            onSave={handleSavePayment} 
            onCancel={() => setShowPaymentModal(false)} 
            cashBooks={cashBooks} 
            cashBookBalances={cashBookBalances}
            wallets={wallets} // Passed Wallets
        />
      }
      {showHistoryModal && <PaymentHistoryModal payments={paymentsForHistory} loading={historyLoading} onClose={() => setShowHistoryModal(false)} />}
    </div>
  );
};

// --- MODAL COMPONENTS ---

const PaymentModal = ({ record, onSave, onCancel, cashBooks, cashBookBalances, wallets }) => {
    const [paymentType, setPaymentType] = useState(null);
    const [formData, setFormData] = useState({amount: '', receiverName: '', chequeNumber: '', referenceNumber: '', cashBook: null, selectedAccount: null});
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false); 

    const cashBookOptions = useMemo(() => cashBooks.map(book => ({ value: book.id, label: book.name })), [cashBooks]);
    
    // Account Options for Online Payment
    const accountOptions = useMemo(() => [
        { value: 'card', label: `Card Payment Bank ${wallets.card?.nickname ? `(${wallets.card.nickname})` : ''}`, balance: wallets.card?.balance || 0 },
        { value: 'online', label: `Online Payment Bank ${wallets.online?.nickname ? `(${wallets.online.nickname})` : ''}`, balance: wallets.online?.balance || 0 },
        { value: 'cheque', label: `Cheque Account ${wallets.cheque?.nickname ? `(${wallets.cheque.nickname})` : ''}`, balance: wallets.cheque?.balance || 0 }
    ], [wallets]);

    useEffect(() => {
        const { amount, cashBook, selectedAccount } = formData;
        const numAmount = parseFloat(amount);
        
        if (!amount || isNaN(numAmount)) {
            setError('');
            return;
        }

        if (paymentType === 'Cash' && cashBook) {
            const balance = cashBookBalances[cashBook.value] || 0;
            if (numAmount > balance) setError(`Amount exceeds cash book balance (Rs. ${balance.toFixed(2)})`);
            else if (numAmount > record.balance) setError(`Amount cannot exceed the stock balance of Rs. ${record.balance.toFixed(2)}`);
            else setError('');
        } 
        else if (paymentType === 'Cheque') {
            const balance = wallets.cheque?.balance || 0;
            if (numAmount > balance) setError(`Amount exceeds Cheque Account balance (Rs. ${balance.toFixed(2)})`);
            else if (numAmount > record.balance) setError(`Amount cannot exceed the stock balance of Rs. ${record.balance.toFixed(2)}`);
            else setError('');
        }
        else if (paymentType === 'Online Payment' && selectedAccount) {
            // Validate against selected account balance
            if (numAmount > selectedAccount.balance) setError(`Amount exceeds ${selectedAccount.label} balance (Rs. ${selectedAccount.balance.toFixed(2)})`);
            else if (numAmount > record.balance) setError(`Amount cannot exceed the stock balance of Rs. ${record.balance.toFixed(2)}`);
            else setError('');
        }
        else if (numAmount > record.balance) { 
            setError(`Amount cannot exceed the stock balance of Rs. ${record.balance.toFixed(2)}`); 
        } 
        else { setError(''); }
    }, [formData, paymentType, cashBookBalances, wallets, record.balance]);
    
    const isFormValid = () => {
        const amount = parseFloat(formData.amount);
        return (
            !error && 
            formData.receiverName.trim() && 
            formData.amount && amount > 0 && 
            paymentType && 
            (paymentType === 'Cash' ? formData.cashBook : true) && 
            (paymentType === 'Cheque' ? formData.chequeNumber.trim() : true) && 
            (paymentType === 'Online Payment' ? (formData.referenceNumber.trim() && formData.selectedAccount) : true)
        );
    };

    const handleSave = async () => {
        if (isSubmitting) return; 
        if (!isFormValid()) { alert('Please fill all required fields correctly.'); return; }
        
        setIsSubmitting(true); 

        const finalPaymentData = {
            amount: parseFloat(formData.amount), 
            method: paymentType, 
            receiverName: formData.receiverName.trim(),
            ...(paymentType === 'Cash' && { cashBookId: formData.cashBook.value, cashBookName: formData.cashBook.label }),
            ...(paymentType === 'Cheque' && { chequeNumber: formData.chequeNumber.trim() }),
            ...(paymentType === 'Online Payment' && { 
                referenceNumber: formData.referenceNumber.trim(),
                walletId: formData.selectedAccount.value, // Pass Wallet ID (card/online/cheque)
                walletName: formData.selectedAccount.label
            }),
        };
        
        try {
            await onSave(finalPaymentData);
        } catch(e) {
            setIsSubmitting(false); 
        }
    };

    const handlePaymentTypeChange = (type) => {
        setPaymentType(type);
        setFormData(prev => ({...prev, cashBook: null, selectedAccount: null}));
    };

    return (
        <div style={styles.modalOverlay}>
            <div style={styles.modal}>
                <h3 style={styles.modalTitle}>Add Payment for {record.stockInId}</h3>
                {!paymentType ? (
                    <div style={styles.paymentTypeSelection}>
                        <p>1. Select a payment method:</p>
                        <div style={styles.paymentTypeButtons}>
                            <button onClick={() => handlePaymentTypeChange('Cash')} style={styles.paymentTypeButton}>Cash</button>
                            <button onClick={() => handlePaymentTypeChange('Cheque')} style={styles.paymentTypeButton}>Cheque</button>
                            <button onClick={() => handlePaymentTypeChange('Online Payment')} style={styles.paymentTypeButton}>Online Payment</button>
                        </div>
                    </div>
                ) : (
                    <div style={styles.formGrid}>
                        <div style={{...styles.formGroup, gridColumn: 'span 2'}}>
                            <label>Payment Method</label>
                            <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                                <p style={styles.paymentTypeDisplay}>{paymentType}</p>
                                <button onClick={() => setPaymentType(null)} style={styles.changeButton} disabled={isSubmitting}>Change</button>
                            </div>
                        </div>
                        
                        {/* Cheque Info Box */}
                        {paymentType === 'Cheque' && (
                            <div style={{...styles.formGroup, gridColumn: 'span 2', background: '#e0f2fe', padding: '10px', borderRadius: '6px', fontSize: '13px', color: '#0284c7'}}>
                                <strong>Available Cheque Balance:</strong> Rs. {(wallets.cheque?.balance || 0).toFixed(2)}
                            </div>
                        )}

                        {/* Condition for Cash */}
                        {paymentType === 'Cash' && (
                            <div style={{...styles.formGroup, gridColumn: 'span 2'}}>
                                <label>Pay From Cash Book *</label>
                                <Select 
                                    options={cashBookOptions} 
                                    value={formData.cashBook} 
                                    onChange={option => setFormData(prev => ({...prev, cashBook: option}))} 
                                    placeholder="Select cash book..." 
                                    isDisabled={isSubmitting}
                                />
                            </div>
                        )}

                        {/* Condition for Online Payment (NEW) */}
                        {paymentType === 'Online Payment' && (
                            <div style={{...styles.formGroup, gridColumn: 'span 2'}}>
                                <label>Pay From Account *</label>
                                <Select 
                                    options={accountOptions} 
                                    value={formData.selectedAccount} 
                                    onChange={option => setFormData(prev => ({...prev, selectedAccount: option}))} 
                                    placeholder="Select account (Card/Online/Cheque)..." 
                                    isDisabled={isSubmitting}
                                />
                                {formData.selectedAccount && (
                                    <div style={{fontSize: '11px', color: '#666', marginTop: '4px'}}>
                                        Available Balance: Rs. {formData.selectedAccount.balance.toFixed(2)}
                                    </div>
                                )}
                            </div>
                        )}

                        {paymentType === 'Cheque' && (
                            <div style={{...styles.formGroup, gridColumn: 'span 2'}}>
                                <label>Cheque Number *</label>
                                <input type="text" value={formData.chequeNumber} onChange={e => setFormData({...formData, chequeNumber: e.target.value})} style={styles.modalInput} required disabled={isSubmitting}/>
                            </div>
                        )}
                        {paymentType === 'Online Payment' && (
                            <div style={{...styles.formGroup, gridColumn: 'span 2'}}>
                                <label>Reference Number *</label>
                                <input type="text" value={formData.referenceNumber} onChange={e => setFormData({...formData, referenceNumber: e.target.value})} style={styles.modalInput} required disabled={isSubmitting}/>
                            </div>
                        )}
                        <div style={{...styles.formGroup, gridColumn: 'span 2'}}>
                           <label>Receiver Name *</label>
                           <input type="text" value={formData.receiverName} onChange={e => setFormData({...formData, receiverName: e.target.value})} style={styles.modalInput} required disabled={isSubmitting}/>
                        </div>
                        <div style={{...styles.formGroup, gridColumn: 'span 2'}}>
                            <label>Amount to Pay *</label>
                            <input type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} style={styles.modalInput} required disabled={isSubmitting}/>
                            {error && <p style={styles.errorText}>{error}</p>}
                        </div>
                    </div>
                )}
                <div style={styles.modalActions}>
                    <button onClick={onCancel} style={styles.cancelButton} disabled={isSubmitting}>Cancel</button>
                    {paymentType && (
                        <button 
                            onClick={handleSave} 
                            style={!isFormValid() || isSubmitting ? {...styles.saveButtonModal, ...styles.saveButtonDisabled} : styles.saveButtonModal} 
                            disabled={!isFormValid() || isSubmitting}
                        >
                            {isSubmitting ? 'Processing...' : 'Save Payment'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const PaymentHistoryModal = ({ payments, loading, onClose }) => { 
    return (
        <div style={styles.modalOverlay}>
            <div style={{...styles.modal, maxWidth: '800px'}}>
                <h3 style={styles.modalTitle}>Payment History</h3>
                <table style={{...styles.table, minWidth: 'auto'}}>
                    <thead>
                        <tr>
                            <th style={styles.th}>Payment ID</th>
                            <th style={styles.th}>Date Paid</th>
                            <th style={styles.th}>Amount</th>
                            <th style={styles.th}>Method</th>
                            <th style={styles.th}>Paid From</th>
                            <th style={styles.th}>Receiver Name</th>
                            <th style={styles.th}>Paid By</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                             <tr><td colSpan="7" style={styles.loadingTd}>Loading history...</td></tr>
                        ) : payments.length > 0 ? payments.map(p => (
                            <tr key={p.id}>
                                <td style={{...styles.td, fontWeight: 'bold'}}>{p.paymentId || p.id}</td>
                                <td style={styles.td}>{p.paidAt?.toDate().toLocaleString()}</td>
                                <td style={styles.td}>Rs. {p.amount.toFixed(2)}</td>
                                <td style={styles.td}>{p.method}</td>
                                <td style={styles.td}>{p.cashBookName || p.walletName || 'N/A'}</td>
                                <td style={styles.td}>{p.receiverName}</td>
                                <td style={styles.td}>{p.paidBy}</td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan="7" style={styles.noData}>No payment history found.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
                <div style={styles.modalActions}>
                    <button onClick={onClose} style={styles.cancelButton}>Close</button>
                </div>
            </div>
        </div>
    );
};

const styles = {
    container: { padding: '24px', fontFamily: "'Inter', sans-serif" },
    section: { backgroundColor: '#fff', padding: '24px', borderRadius: '8px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
    title: { fontSize: '24px', fontWeight: '600', marginBottom: '20px' },
    loadingContainer: { textAlign: 'center', padding: '50px', fontSize: '18px' },
    controlsContainer: { display: 'flex', gap: '20px', marginBottom: '20px', padding: '20px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', flexWrap: 'wrap' },
    filterGroup: { display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: '250px' },
    searchInputContainer: { position: 'relative' },
    searchIcon: { position: 'absolute', top: '50%', left: '10px', transform: 'translateY(-50%)', color: '#9ca3af' },
    input: { padding: '10px', borderRadius: '6px', border: '1px solid #ddd', width: '100%', boxSizing: 'border-box' },
    clearButton: { padding: '0 15px', border: '1px solid #bdc3c7', backgroundColor: '#f8f9fa', color: '#34495e', borderRadius: '6px', cursor: 'pointer', height: '40px' },
    tableContainer: { backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'auto' },
    table: { width: '100%', borderCollapse: 'collapse', minWidth: '1100px' },
    th: { padding: '12px 16px', textAlign: 'left', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontWeight: '600', color: '#4b5563', fontSize: '12px', textTransform: 'uppercase' },
    td: { padding: '12px 16px', borderBottom: '1px solid #e5e7eb', verticalAlign: 'middle' },
    loadingTd: { textAlign: 'center', padding: '24px', color: '#9ca3af' },
    subText: { fontSize: '12px', color: '#6c757d' },
    addPaymentButton: { padding: '8px 12px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' },
    viewHistoryButton: { padding: '8px 12px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' },
    actionButtonsContainer: { display: 'flex', gap: '8px' },
    noData: { textAlign: 'center', padding: '32px', color: '#6b7280' },
    modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1001 },
    modal: { backgroundColor: 'white', padding: '25px', borderRadius: '12px', width: '90%', maxWidth: '500px', boxShadow: '0 5px 15px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' },
    modalTitle: { margin: '0 0 20px 0', textAlign: 'center', fontSize: '20px', fontWeight: '600' },
    modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '25px', paddingTop: '15px', borderTop: '1px solid #eee' },
    cancelButton: { padding: '10px 20px', backgroundColor: '#e0e0e0', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '16px' },
    saveButtonModal: { padding: '10px 20px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '16px' },
    saveButtonDisabled: { backgroundColor: '#95a5a6', cursor: 'not-allowed' },
    formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
    modalInput: { padding: '12px', borderRadius: '6px', border: '1px solid #ddd', width: '100%', boxSizing: 'border-box', fontSize: '14px' },
    paymentTypeDisplay: { fontWeight: 'bold', fontSize: '16px', margin: 0, color: '#2ecc71' },
    changeButton: { background: 'none', border: 'none', color: '#3498db', cursor: 'pointer', textDecoration: 'underline', fontSize: '14px' },
    errorText: { color: '#e74c3c', fontSize: '12px', margin: '5px 0 0 0' },
    paymentTypeSelection: { textAlign: 'center' },
    paymentTypeButtons: { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' },
    paymentTypeButton: { padding: '15px 20px', border: '2px solid #e9ecef', backgroundColor: '#f8f9fa', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: '500' },
    balancesContainer: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' },
    balanceCard: { backgroundColor: '#ecf0f1', padding: '16px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    balanceLabel: { color: '#2c3e50', fontWeight: '500' },
    balanceAmount: { color: '#2980b9', fontWeight: 'bold', fontSize: '18px' },
    paginationContainer: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginTop: '20px' },
    pageBtn: { display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer' },
    pageInfo: { fontSize: '14px', color: '#64748b' },
};

export default StockPayment;