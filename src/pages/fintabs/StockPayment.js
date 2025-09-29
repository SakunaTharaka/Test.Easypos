import React, { useState, useEffect, useCallback, useMemo, useContext } from "react";
import { db, auth } from "../../firebase";
import { collection, query, getDocs, addDoc, serverTimestamp, orderBy, doc } from "firebase/firestore";
import { AiOutlineSearch, AiOutlineLock } from "react-icons/ai";
import Select from "react-select";
import { CashBookContext } from "../../context/CashBookContext";

const StockPayment = () => {
  const { cashBooks, cashBookBalances, reconciledDates, refreshBalances, loading: balancesLoading } = useContext(CashBookContext);

  const [stockInRecords, setStockInRecords] = useState([]);
  const [filteredRecords, setFilteredRecords] = useState([]);
  const [payments, setPayments] = useState({});
  const [allPayments, setAllPayments] = useState([]); 
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState("");

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [currentItemForPayment, setCurrentItemForPayment] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [paymentsForHistory, setPaymentsForHistory] = useState([]);

  const getCurrentInternal = () => {
    try {
      const stored = localStorage.getItem("internalLoggedInUser");
      return stored ? JSON.parse(stored) : null;
    } catch (e) { return null; }
  };
  
  const fetchData = useCallback(async () => {
    setLoading(true);
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    try {
      const stockInColRef = collection(db, uid, "inventory", "stock_in");
      const stockInSnap = await getDocs(query(stockInColRef, orderBy("createdAt", "desc")));
      const stockInData = stockInSnap.docs.map((doc) => ({ id: doc.id, ...doc.data(), totalValue: (doc.data().lineItems || []).reduce((sum, item) => sum + (item.quantity || 0) * (item.price || 0),0) }));
      setStockInRecords(stockInData);

      const paymentsColRef = collection(db, uid, "stock_payments", "payments");
      const paymentsSnap = await getDocs(query(paymentsColRef, orderBy("paidAt", "asc")));
      const paymentsData = paymentsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setAllPayments(paymentsData);
      
      const paymentsMap = {};
      paymentsData.forEach((p) => {
        if (!paymentsMap[p.stockInId]) { paymentsMap[p.stockInId] = { totalPaid: 0, lastPayer: "" }; }
        paymentsMap[p.stockInId].totalPaid += p.amount;
        paymentsMap[p.stockInId].lastPayer = p.paidBy;
      });
      setPayments(paymentsMap);

    } catch (error) {
      console.error("Error fetching stock payment data:", error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    let filtered = stockInRecords.filter((item) => {
      const searchTermMatch = search ? `${item.stockInId} ${item.supplierCompany} ${item.supplierName}`.toLowerCase().includes(search.toLowerCase()) : true;
      let dateMatch = true;
      if (selectedDate) {
        const startOfDay = new Date(selectedDate); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(selectedDate); endOfDay.setHours(23, 59, 59, 999);
        const itemDate = item.createdAt?.toDate();
        dateMatch = itemDate >= startOfDay && itemDate <= endOfDay;
      }
      return searchTermMatch && dateMatch;
    });
    setFilteredRecords(filtered);
  }, [search, selectedDate, stockInRecords]);
  
  const handleOpenPaymentModal = (record, balance) => {
    setCurrentItemForPayment({ ...record, balance });
    setShowPaymentModal(true);
  };
  
  const handleOpenHistoryModal = (stockInId) => {
    const relatedPayments = allPayments.filter(p => p.stockInId === stockInId);
    setPaymentsForHistory(relatedPayments);
    setShowHistoryModal(true);
  };
  
  const generatePaymentId = () => `P${Date.now().toString().slice(-7)}`;

  const handleSavePayment = async (paymentData) => {
    if (!currentItemForPayment) return;
    const uid = auth.currentUser.uid;
    const user = getCurrentInternal();

    try {
        const paymentDoc = {
            paymentId: generatePaymentId(), stockInId: currentItemForPayment.stockInId,
            stockInDocId: currentItemForPayment.id, paidBy: user.username,
            paidAt: serverTimestamp(), ...paymentData,
        };
        const paymentsColRef = collection(db, uid, "stock_payments", "payments");
        await addDoc(paymentsColRef, paymentDoc);
        
        await refreshBalances();
        await fetchData(); 
        
        alert("Payment saved successfully!");
    } catch (error) {
        alert("Error saving payment: " + error.message);
    } finally {
        setShowPaymentModal(false);
        setCurrentItemForPayment(null);
    }
  };
  
  const todayString = new Date().toISOString().split('T')[0];
  const isTodayReconciled = reconciledDates.has(todayString);

  if (loading || balancesLoading) return <div style={styles.loadingContainer}>Loading data...</div>;

  return (
    <div style={styles.container}>
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
          <label>Search by ID, Company or Supplier</label>
          <div style={styles.searchInputContainer}><AiOutlineSearch style={styles.searchIcon}/><input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{...styles.input, paddingLeft: '35px'}}/></div>
        </div>
      </div>
      
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Stock In ID</th><th style={styles.th}>Date</th><th style={styles.th}>Company / Supplier</th><th style={styles.th}>Total Value</th><th style={styles.th}>Paid Amount</th><th style={styles.th}>Balance</th><th style={styles.th}>User Action</th><th style={styles.th}>Last Payer</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.map((rec) => {
              const totalPaid = payments[rec.stockInId]?.totalPaid || 0;
              const balance = rec.totalValue - totalPaid;
              const isPayable = Math.round(balance * 100) > 0;

              return (
                <tr key={rec.id}>
                  <td style={styles.td}>{rec.stockInId}</td><td style={styles.td}>{rec.createdAt?.toDate().toLocaleDateString()}</td>
                  <td style={styles.td}><div>{rec.supplierCompany}</div><div style={styles.subText}>{rec.supplierName}</div></td>
                  <td style={styles.td}>Rs. {rec.totalValue.toFixed(2)}</td><td style={styles.td}>Rs. {totalPaid.toFixed(2)}</td>
                  <td style={{...styles.td, fontWeight: 'bold', color: isPayable ? '#e74c3c' : '#2ecc71'}}>Rs. {balance.toFixed(2)}</td>
                  <td style={styles.td}>
                    <div style={styles.actionButtonsContainer}>
                      {isPayable && !isTodayReconciled && (
                        <button onClick={() => handleOpenPaymentModal(rec, balance)} style={styles.addPaymentButton}>Make Payment</button>
                      )}
                      {isPayable && isTodayReconciled && (
                        <button style={styles.buttonDisabled} title={`Payments are locked for today (${todayString}) because it has been reconciled.`}>
                            <AiOutlineLock /> Payment Locked
                        </button>
                      )}
                      <button onClick={() => handleOpenHistoryModal(rec.stockInId)} style={styles.viewHistoryButton}>View Payments</button>
                    </div>
                  </td>
                  <td style={styles.td}>{payments[rec.stockInId]?.lastPayer || 'N/A'}</td>
                </tr>
              );
            })}
             {filteredRecords.length === 0 && (<tr><td colSpan="8" style={styles.noData}>No records found.</td></tr>)}
          </tbody>
        </table>
      </div>
      {showPaymentModal && <PaymentModal record={currentItemForPayment} onSave={handleSavePayment} onCancel={() => setShowPaymentModal(false)} cashBooks={cashBooks} cashBookBalances={cashBookBalances} />}
      {showHistoryModal && <PaymentHistoryModal payments={paymentsForHistory} onClose={() => setShowHistoryModal(false)} />}
    </div>
  );
};

// ✨ FIX: Properly formatted the modal components that were causing the syntax error
const PaymentModal = ({ record, onSave, onCancel, cashBooks, cashBookBalances }) => {
    const [paymentType, setPaymentType] = useState(null);
    const [formData, setFormData] = useState({amount: '', receiverName: '', chequeNumber: '', referenceNumber: '', cashBook: null,});
    const [error, setError] = useState('');
    const cashBookOptions = useMemo(() => cashBooks.map(book => ({ value: book.id, label: book.name })), [cashBooks]);

    useEffect(() => {
        const { amount, cashBook } = formData;
        if (amount && cashBook && paymentType === 'Cash') {
            const balance = cashBookBalances[cashBook.value] || 0;
            if (parseFloat(amount) > balance) { setError(`Amount exceeds cash book balance of Rs. ${balance.toFixed(2)}`); } 
            else if (parseFloat(amount) > record.balance) { setError(`Amount cannot exceed the stock balance of Rs. ${record.balance.toFixed(2)}`); } 
            else { setError(''); }
        } else if (amount && parseFloat(amount) > record.balance) { setError(`Amount cannot exceed the stock balance of Rs. ${record.balance.toFixed(2)}`); } 
        else { setError(''); }
    }, [formData.amount, formData.cashBook, paymentType, cashBookBalances, record.balance]);
    
    const isFormValid = () => {
        const amount = parseFloat(formData.amount);
        return (!error && formData.receiverName.trim() && formData.amount && amount > 0 && paymentType && (paymentType === 'Cash' ? formData.cashBook : true) && (paymentType !== 'Cheque' || formData.chequeNumber.trim()) && (paymentType !== 'Online Payment' || formData.referenceNumber.trim()));
    };

    const handleSave = () => {
        if (!isFormValid()) { alert('Please fill all required fields correctly.'); return; }
        const finalPaymentData = {
            amount: parseFloat(formData.amount), method: paymentType, receiverName: formData.receiverName.trim(),
            ...(paymentType === 'Cash' && { cashBookId: formData.cashBook.value, cashBookName: formData.cashBook.label }),
            ...(paymentType === 'Cheque' && { chequeNumber: formData.chequeNumber.trim() }),
            ...(paymentType === 'Online Payment' && { referenceNumber: formData.referenceNumber.trim() }),
        };
        onSave(finalPaymentData);
    };

    const handlePaymentTypeChange = (type) => {
        setPaymentType(type);
        if (type !== 'Cash') { setFormData(prev => ({...prev, cashBook: null})); }
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
                                <button onClick={() => setPaymentType(null)} style={styles.changeButton}>Change</button>
                            </div>
                        </div>
                        <div style={{...styles.formGroup, gridColumn: 'span 2'}}>
                            <label>Pay From Cash Book {paymentType === 'Cash' ? '*' : '(Cash Only)'}</label>
                            <Select 
                                options={cashBookOptions} 
                                value={formData.cashBook} 
                                onChange={option => setFormData(prev => ({...prev, cashBook: option}))} 
                                placeholder={paymentType === 'Cash' ? "Select cash book..." : "Not applicable"} 
                                isDisabled={paymentType !== 'Cash'}
                            />
                        </div>
                        {paymentType === 'Cheque' && (
                            <div style={{...styles.formGroup, gridColumn: 'span 2'}}>
                                <label>Cheque Number *</label>
                                <input type="text" value={formData.chequeNumber} onChange={e => setFormData({...formData, chequeNumber: e.target.value})} style={styles.modalInput} required />
                            </div>
                        )}
                        {paymentType === 'Online Payment' && (
                            <div style={{...styles.formGroup, gridColumn: 'span 2'}}>
                                <label>Reference Number *</label>
                                <input type="text" value={formData.referenceNumber} onChange={e => setFormData({...formData, referenceNumber: e.target.value})} style={styles.modalInput} required />
                            </div>
                        )}
                        <div style={{...styles.formGroup, gridColumn: 'span 2'}}>
                           <label>Receiver Name *</label>
                           <input type="text" value={formData.receiverName} onChange={e => setFormData({...formData, receiverName: e.target.value})} style={styles.modalInput} required/>
                        </div>
                        <div style={{...styles.formGroup, gridColumn: 'span 2'}}>
                            <label>Amount to Pay *</label>
                            <input type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} style={styles.modalInput} required/>
                            {error && <p style={styles.errorText}>{error}</p>}
                        </div>
                    </div>
                )}
                <div style={styles.modalActions}>
                    <button onClick={onCancel} style={styles.cancelButton}>Cancel</button>
                    {paymentType && <button onClick={handleSave} style={!isFormValid() ? {...styles.saveButtonModal, ...styles.saveButtonDisabled} : styles.saveButtonModal} disabled={!isFormValid()}>Save Payment</button>}
                </div>
            </div>
        </div>
    );
};

const PaymentHistoryModal = ({ payments, onClose }) => { 
    const stockInId = payments.length > 0 ? payments[0].stockInId : ''; 
    return (
        <div style={styles.modalOverlay}>
            <div style={{...styles.modal, maxWidth: '800px'}}>
                <h3 style={styles.modalTitle}>Payment History for {stockInId}</h3>
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
                        {payments.length > 0 ? payments.map(p => (
                            <tr key={p.id}>
                                <td style={{...styles.td, fontWeight: 'bold'}}>{p.paymentId || p.id}</td>
                                <td style={styles.td}>{p.paidAt?.toDate().toLocaleString()}</td>
                                <td style={styles.td}>Rs. {p.amount.toFixed(2)}</td>
                                <td style={styles.td}>{p.method}</td>
                                <td style={styles.td}>{p.cashBookName || 'N/A'}</td>
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
    buttonDisabled: { padding: '8px 12px', backgroundColor: '#bdc3c7', color: 'white', border: 'none', borderRadius: '4px', cursor: 'not-allowed', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' },
};

export default StockPayment;