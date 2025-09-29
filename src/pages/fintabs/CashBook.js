import React, { useState, useEffect, useCallback, useContext } from 'react';
import { db, auth } from '../../firebase';
import { 
    collection, 
    addDoc, 
    getDocs, 
    serverTimestamp, 
    query, 
    orderBy, 
    doc,
    where,
    limit,
    Timestamp,
} from 'firebase/firestore';
import { AiOutlinePlus, AiOutlineLock } from 'react-icons/ai';
import { CashBookContext } from '../../context/CashBookContext';

const CashBook = () => {
    const { cashBooks, reconciledDates, refreshBalances } = useContext(CashBookContext);
    const [dailyData, setDailyData] = useState({});
    const [loading, setLoading] = useState(true);
    
    const [newCashBookName, setNewCashBookName] = useState("");
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    
    const [showAddCashModal, setShowAddCashModal] = useState(false);
    const [selectedBookForModal, setSelectedBookForModal] = useState(null);
    const [modalData, setModalData] = useState({ amount: '', date: new Date().toISOString().split('T')[0] });
    
    const isDateReconciled = reconciledDates.has(selectedDate);

    const fetchDailyData = useCallback(async (date) => {
        setLoading(true);
        const user = auth.currentUser;
        if (!user) { setLoading(false); return; }
        const uid = user.uid;

        try {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);

            const newDailyData = {};

            for (const book of cashBooks) {
                const snapshotQuery = query(
                    collection(db, uid, 'user_data', 'daily_cashbook_snapshots'),
                    where('cashBookId', '==', book.id),
                    where('date', '<', Timestamp.fromDate(startOfDay)),
                    orderBy('date', 'desc'),
                    limit(1)
                );
                const prevSnapshotSnap = await getDocs(snapshotQuery);
                const openingBalance = prevSnapshotSnap.empty ? 0 : prevSnapshotSnap.docs[0].data().closingBalance;

                const cashInQuery = query(collection(db, uid, 'cash_book_entries', 'entry_list'), where('cashBookId', '==', book.id), where('date', '>=', startOfDay), where('date', '<=', endOfDay));
                const expensesQuery = query(collection(db, uid, 'user_data', 'expenses'), where('cashBookId', '==', book.id), where('createdAt', '>=', startOfDay), where('createdAt', '<=', endOfDay));
                const stockPaymentsQuery = query(collection(db, uid, 'stock_payments', 'payments'), where('cashBookId', '==', book.id), where('method', '==', 'Cash'), where('paidAt', '>=', startOfDay), where('paidAt', '<=', endOfDay));

                const [cashInSnap, expensesSnap, stockPaymentsSnap] = await Promise.all([getDocs(cashInQuery), getDocs(expensesQuery), getDocs(stockPaymentsQuery)]);
                
                const cashInTxs = cashInSnap.docs.map(d => ({...d.data(), type: 'Cash In'}));
                const expenseTxs = expensesSnap.docs.map(d => ({...d.data(), type: 'Expense'}));
                const stockPaymentTxs = stockPaymentsSnap.docs.map(d => ({...d.data(), type: 'Stock Payment'}));

                const totalIn = cashInTxs.reduce((sum, tx) => sum + tx.amount, 0);
                const totalOut = [...expenseTxs, ...stockPaymentTxs].reduce((sum, tx) => sum + tx.amount, 0);
                
                newDailyData[book.id] = {
                    openingBalance,
                    totalIn,
                    totalOut,
                    closingBalance: openingBalance + totalIn - totalOut,
                };
            }
            setDailyData(newDailyData);
        } catch (error) {
            console.error("Error fetching daily cash book data:", error);
            alert("Failed to fetch data: " + error.message);
        }
        setLoading(false);
    }, [cashBooks]); // Depend on cashBooks from context

    useEffect(() => {
        if (cashBooks.length > 0) {
            fetchDailyData(selectedDate);
        }
    }, [selectedDate, fetchDailyData, cashBooks]);

    const handleCreateCashBook = async () => {
        if (!newCashBookName.trim()) return alert("Cash book name cannot be empty.");
        const user = auth.currentUser; const uid = user.uid;
        const cashBooksColRef = collection(db, uid, 'cash_books', 'book_list');
        if (cashBooks.some(book => book.name.toLowerCase() === newCashBookName.trim().toLowerCase())) { return alert("A cash book with this name already exists."); }
        try {
            await addDoc(cashBooksColRef, { name: newCashBookName.trim(), createdAt: serverTimestamp(), createdBy: user.displayName || user.email, });
            setNewCashBookName("");
            await refreshBalances(); // Refresh context instead of local fetch
        } catch (error) { alert("Failed to create cash book: " + error.message); }
    };

    const handleAddCash = async () => {
        if (!modalData.amount || isNaN(modalData.amount) || Number(modalData.amount) <= 0) return alert("Please enter a valid positive amount.");
        if (!modalData.date) return alert("Please select a date.");
        const user = auth.currentUser; const uid = user.uid;
        const transactionsColRef = collection(db, uid, 'cash_book_entries', 'entry_list');
        try {
            await addDoc(transactionsColRef, { cashBookId: selectedBookForModal.id, cashBookName: selectedBookForModal.name, amount: Number(modalData.amount), date: new Date(modalData.date), createdAt: serverTimestamp(), addedBy: user.displayName || user.email });
            setShowAddCashModal(false);
            setModalData({ amount: '', date: new Date().toISOString().split('T')[0] });
            await refreshBalances(); // Refresh context
        } catch (error) { alert("Failed to add cash: " + error.message); }
    };
    
    return (
        <div style={styles.container}>
            <div style={styles.section}>
                <h2 style={styles.title}>Manage Cash Books</h2>
                <div style={styles.inputGroup}>
                    <input type="text" value={newCashBookName} onChange={(e) => setNewCashBookName(e.target.value)} placeholder="Enter new cash book name" style={styles.input} />
                    <button onClick={handleCreateCashBook} style={styles.button}><AiOutlinePlus style={{ marginRight: '8px' }} />Create</button>
                </div>
            </div>

            <div style={styles.section}>
                <div style={styles.dailyHeader}>
                    <h2 style={styles.title}>Daily Cash Sheet</h2>
                    <div style={styles.datePickerContainer}>
                        <label>Select Date:</label>
                        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={styles.input} />
                    </div>
                </div>

                {isDateReconciled && (
                    <div style={styles.reconciledBanner}>
                        <AiOutlineLock /> This day has been reconciled and is locked from editing.
                    </div>
                )}

                {loading ? <p style={styles.noData}>Calculating daily balances...</p> : (
                    <div style={styles.cardsContainer}>
                        {cashBooks.map(book => {
                            const data = dailyData[book.id] || { openingBalance: 0, totalIn: 0, totalOut: 0, closingBalance: 0 };
                            return (
                                <div key={book.id} style={styles.card}>
                                    <div style={styles.cardHeader}>
                                        <h3>{book.name}</h3>
                                        <button onClick={() => { setSelectedBookForModal(book); setShowAddCashModal(true); }} style={styles.addCashButton} disabled={isDateReconciled}>Add Cash In</button>
                                    </div>
                                    <div style={styles.balanceRow}><span style={styles.balanceLabel}>Opening Balance:</span><span>Rs. {data.openingBalance.toFixed(2)}</span></div>
                                    <div style={{...styles.balanceRow, color: '#27ae60'}}><span style={styles.balanceLabel}>Today's Cash In:</span><span>+ Rs. {data.totalIn.toFixed(2)}</span></div>
                                    <div style={{...styles.balanceRow, color: '#e74c3c'}}><span style={styles.balanceLabel}>Today's Cash Out:</span><span>- Rs. {data.totalOut.toFixed(2)}</span></div>
                                    <div style={{...styles.balanceRow, ...styles.closingBalance}}><span style={styles.balanceLabel}>Closing Balance:</span><span>Rs. {data.closingBalance.toFixed(2)}</span></div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
            
            {showAddCashModal && (
                <div style={styles.modalOverlay}>
                    <div style={styles.modal}>
                        <h3 style={styles.modalTitle}>Add Cash to "{selectedBookForModal.name}"</h3>
                        <div style={styles.modalFormGroup}><label style={styles.label}>Date</label><input type="date" value={modalData.date} onChange={(e) => setModalData({...modalData, date: e.target.value})} style={styles.input}/></div>
                        <div style={styles.modalFormGroup}><label style={styles.label}>Amount to Add</label><input type="number" value={modalData.amount} onChange={(e) => setModalData({...modalData, amount: e.target.value})} placeholder="0.00" style={styles.input}/></div>
                        <div style={styles.modalActions}><button onClick={() => setShowAddCashModal(false)} style={styles.cancelButton}>Cancel</button><button onClick={handleAddCash} style={styles.button}>Add Cash</button></div>
                    </div>
                </div>
            )}
        </div>
    );
};
const styles = {
    container: { padding: '24px', fontFamily: "'Inter', sans-serif" },
    section: { backgroundColor: '#fff', padding: '24px', borderRadius: '8px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
    title: { fontSize: '22px', fontWeight: '600', color: '#2c3e50', margin: 0 },
    inputGroup: { display: 'flex', gap: '16px', alignItems: 'center', marginTop: '16px' },
    input: { flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #bdc3c7', fontSize: '14px' },
    button: { padding: '10px 16px', border: 'none', backgroundColor: '#3498db', color: 'white', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: '500' },
    dailyHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
    datePickerContainer: { display: 'flex', alignItems: 'center', gap: '10px' },
    cardsContainer: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '20px' },
    card: { border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px' },
    cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px', marginBottom: '12px' },
    balanceRow: { display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' },
    balanceLabel: { color: '#6b7280' },
    closingBalance: { fontWeight: 'bold', fontSize: '16px', borderTop: '1px solid #e5e7eb', paddingTop: '8px', marginTop: '8px' },
    addCashButton: { padding: '8px 12px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' },
    noData: { textAlign: 'center', padding: '32px', color: '#6b7280' },
    modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1001 },
    modal: { backgroundColor: 'white', padding: '25px', borderRadius: '12px', width: '90%', maxWidth: '400px', boxShadow: '0 5px 15px rgba(0,0,0,0.3)' },
    modalTitle: { margin: '0 0 20px 0', textAlign: 'center', fontSize: '20px', fontWeight: '600' },
    modalFormGroup: { marginBottom: '16px' },
    label: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' },
    modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' },
    cancelButton: { padding: '10px 20px', backgroundColor: '#e0e0e0', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' },
    reconciledBanner: { backgroundColor: '#fef3c7', color: '#92400e', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px' },
};
export default CashBook;