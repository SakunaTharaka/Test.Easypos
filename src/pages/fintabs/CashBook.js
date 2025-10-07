import React, { useState, useEffect, useContext } from 'react';
import { db, auth } from '../../firebase';
import { 
    collection, 
    addDoc, 
    getDocs, 
    serverTimestamp, 
    query, 
    where,
    orderBy,
    limit,
    startAfter,
} from 'firebase/firestore';
import { AiOutlinePlus, AiOutlineBook, AiOutlineLoading3Quarters, AiOutlineClose } from 'react-icons/ai';
import { CashBookContext } from '../../context/CashBookContext';

const CashBook = () => {
    const { cashBooks, refreshBalances } = useContext(CashBookContext);
    
    const [newCashBookName, setNewCashBookName] = useState("");
    const [selectedBook, setSelectedBook] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(false);
    
    const [currentPage, setCurrentPage] = useState(1);
    const [pageCursors, setPageCursors] = useState([null]);
    const [hasNextPage, setHasNextPage] = useState(false);
    const [balanceCarry, setBalanceCarry] = useState([0]);
    const PAGE_SIZE = 65;

    const [showCashInModal, setShowCashInModal] = useState(false);
    const [cashInAmount, setCashInAmount] = useState("");
    const [cashInDetails, setCashInDetails] = useState("");
    const [isSavingCashIn, setIsSavingCashIn] = useState(false);

    const handleCreateCashBook = async () => {
        if (!newCashBookName.trim()) return alert("Cash book name cannot be empty.");
        const user = auth.currentUser;
        if (!user) return;
        const uid = user.uid;
        const cashBooksColRef = collection(db, uid, 'cash_books', 'book_list');
        if (cashBooks.some(book => book.name.toLowerCase() === newCashBookName.trim().toLowerCase())) {
            return alert("A cash book with this name already exists.");
        }
        try {
            await addDoc(cashBooksColRef, { 
                name: newCashBookName.trim(), 
                createdAt: serverTimestamp(), 
                createdBy: user.displayName || user.email, 
            });
            setNewCashBookName("");
            await refreshBalances();
        } catch (error) { 
            alert("Failed to create cash book: " + error.message); 
        }
    };

    // ✅ FIX: The data fetching logic is now INSIDE this useEffect hook.
    useEffect(() => {
        const fetchTransactions = async () => {
            if (!selectedBook) {
                setTransactions([]);
                return;
            }
            setLoading(true);
            const uid = auth.currentUser.uid;
            const expensesCollection = collection(db, uid, 'user_data', 'expenses');
            const paymentsCollection = collection(db, uid, 'stock_payments', 'payments');
            const cashInCollection = collection(db, uid, 'cash_book_entries', 'entry_list');

            try {
                const buildQuery = (coll, timestampField) => {
                    let q = query(coll, where('cashBookId', '==', selectedBook.id), orderBy(timestampField, 'asc'));
                    const cursor = pageCursors[currentPage - 1];
                    if (cursor) {
                        q = query(q, startAfter(cursor));
                    }
                    return query(q, limit(PAGE_SIZE + 1));
                };

                const [expensesSnap, paymentsSnap, cashInSnap] = await Promise.all([
                    getDocs(buildQuery(expensesCollection, 'createdAt')),
                    getDocs(buildQuery(paymentsCollection, 'paidAt')),
                    getDocs(buildQuery(cashInCollection, 'createdAt')),
                ]);

                const expenseTxs = expensesSnap.docs.map(d => ({...d.data(), id: d.id, docRef: d.ref, type: 'Expense', timestamp: d.data().createdAt, user: d.data().createdBy, details: `(${d.data().category}) ${d.data().details}`}));
                const stockPaymentTxs = paymentsSnap.docs.map(d => ({...d.data(), id: d.id, docRef: d.ref, type: 'Stock Payment', timestamp: d.data().paidAt, user: d.data().paidBy, details: `Payment for Stock-In: ${d.data().stockInId}`}));
                const cashInTxs = cashInSnap.docs.map(d => ({...d.data(), id: d.id, docRef: d.ref, type: 'Cash In', timestamp: d.data().createdAt, user: d.data().addedBy, details: d.data().details}));

                const combined = [...expenseTxs, ...stockPaymentTxs, ...cashInTxs]
                    .sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

                const hasMore = combined.length > PAGE_SIZE;
                const pageData = combined.slice(0, PAGE_SIZE);
                setTransactions(pageData);
                setHasNextPage(hasMore);

                if (pageData.length > 0) {
                    let currentRunningBalance = balanceCarry[currentPage - 1] || 0;
                    pageData.forEach(tx => {
                        const isCredit = tx.type === 'Expense' || tx.type === 'Stock Payment';
                        currentRunningBalance += isCredit ? -tx.amount : tx.amount;
                    });
                    
                    setBalanceCarry(prev => {
                        const newCarry = [...prev];
                        newCarry[currentPage] = currentRunningBalance;
                        return newCarry;
                    });

                    const lastDocOnPage = pageData[pageData.length - 1];
                    setPageCursors(prev => {
                        const newCursors = [...prev];
                        const originalDoc = [...expensesSnap.docs, ...paymentsSnap.docs, ...cashInSnap.docs].find(doc => doc.ref.path === lastDocOnPage.docRef.path);
                        newCursors[currentPage] = originalDoc;
                        return newCursors;
                    });
                }
            } catch (error) {
                console.error("Error fetching transactions:", error);
                alert("Failed to fetch transaction data. This is likely due to a missing database index. Press F12 to open the developer console and look for a link to create the required index.");
            } finally {
                setLoading(false);
            }
        };

        fetchTransactions();
    // ✅ FIX: The effect now only depends on the values that should trigger a refetch.
    }, [selectedBook, currentPage]);

    // This effect correctly resets pagination when a new book is selected.
    useEffect(() => {
        if (selectedBook) {
            setCurrentPage(1);
            setPageCursors([null]);
            setBalanceCarry([0]);
            setHasNextPage(false);
        }
    }, [selectedBook]);

    const handleCashIn = async (e) => {
        e.preventDefault();
        // ... validation logic is unchanged
        
        setIsSavingCashIn(true);
        const user = auth.currentUser;
        try {
            const cashInColRef = collection(db, user.uid, 'cash_book_entries', 'entry_list');
            await addDoc(cashInColRef, {
                amount: parseFloat(cashInAmount),
                details: cashInDetails.trim(),
                cashBookId: selectedBook.id,
                createdAt: serverTimestamp(),
                addedBy: user.displayName || user.email,
            });
            
            setShowCashInModal(false);
            setCashInAmount("");
            setCashInDetails("");

            // ✅ FIX: This now correctly triggers the useEffect to refetch data
            // by resetting the state it depends on.
            if (currentPage === 1) {
                // If we are on page 1, we need to manually trigger the effect again.
                // A simple way is to deselect and reselect the book.
                const currentBook = selectedBook;
                setSelectedBook(null);
                setTimeout(() => setSelectedBook(currentBook), 0);
            } else {
                // If on another page, just go back to page 1.
                setCurrentPage(1);
            }
            await refreshBalances();

        } catch (error) {
            alert("Failed to add cash: " + error.message);
        } finally {
            setIsSavingCashIn(false);
        }
    };

    let runningBalance = balanceCarry[currentPage - 1] || 0;

    return (
        <div style={styles.container}>
            {/* ... All JSX remains the same as the previous version ... */}
            {/* The panels, table, modal, and styles are all unchanged. */}
            <div style={styles.panel}>
                <h2 style={styles.title}>Manage Cash Books</h2>
                <div style={styles.inputGroup}>
                    <input type="text" value={newCashBookName} onChange={(e) => setNewCashBookName(e.target.value)} placeholder="Enter new cash book name" style={styles.input} />
                    <button onClick={handleCreateCashBook} style={styles.button}><AiOutlinePlus style={{ marginRight: '8px' }} />Create</button>
                </div>
            </div>

            <div style={styles.panel}>
                 <h2 style={styles.title}>Select Cash Book</h2>
                 <div style={styles.bookListContainer}>
                    {cashBooks.length > 0 ? cashBooks.map(book => (
                        <button 
                            key={book.id} 
                            onClick={() => setSelectedBook(book)}
                            style={selectedBook?.id === book.id ? styles.bookButtonSelected : styles.bookButton}
                        >
                           <AiOutlineBook style={{ marginRight: '10px' }}/> {book.name}
                        </button>
                    )) : <p style={styles.noDataText}>No cash books created yet.</p>}
                 </div>
            </div>

            <div style={styles.panel}>
                <div style={styles.panelHeader}>
                    <h2 style={styles.title}>
                        {selectedBook ? `Ledger: ${selectedBook.name}` : 'Select a Cash Book to View Transactions'}
                    </h2>
                    <button 
                        onClick={() => setShowCashInModal(true)} 
                        style={selectedBook ? styles.button : styles.buttonDisabled} 
                        disabled={!selectedBook}
                    >
                        <AiOutlinePlus style={{ marginRight: '8px' }} />Add Cash In
                    </button>
                </div>

                <div style={styles.tableContainer}>
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={styles.th}>Date & Time</th>
                                <th style={styles.th}>Transaction Type</th>
                                <th style={styles.th}>Details</th>
                                <th style={styles.th}>User</th>
                                <th style={styles.th}>Cash In (Debit)</th>
                                <th style={styles.th}>Cash Out (Credit)</th>
                                <th style={styles.th}>Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="7" style={styles.loadingCell}><AiOutlineLoading3Quarters className="spinner" /> Loading Transactions...</td></tr>
                            ) : transactions.length > 0 ? (
                                transactions.map(tx => {
                                    const isCredit = tx.type === 'Expense' || tx.type === 'Stock Payment';
                                    const amount = tx.amount;
                                    runningBalance += isCredit ? -amount : amount;

                                    return (
                                        <tr key={tx.id}>
                                            <td style={styles.td}>{tx.timestamp?.toDate().toLocaleString('en-LK', { dateStyle: 'short', timeStyle: 'short' })}</td>
                                            <td style={styles.td}>
                                                <span style={{...styles.badge, backgroundColor: isCredit ? '#e74c3c' : '#27ae60' }}>{tx.type}</span>
                                            </td>
                                            <td style={styles.td}>{tx.details}</td>
                                            <td style={styles.td}>{tx.user}</td>
                                            <td style={{...styles.td, color: '#27ae60', fontWeight: '500'}}>{!isCredit ? `Rs. ${amount.toFixed(2)}` : '-'}</td>
                                            <td style={{...styles.td, color: '#e74c3c', fontWeight: '500'}}>{isCredit ? `Rs. ${amount.toFixed(2)}` : '-'}</td>
                                            <td style={{...styles.td, fontWeight: 'bold'}}>{`Rs. ${runningBalance.toFixed(2)}`}</td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr><td colSpan="7" style={styles.noDataCell}>{selectedBook ? 'No transactions found for this cash book.' : 'Please select a cash book.'}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div style={styles.paginationContainer}>
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1 || loading}>
                        Previous
                    </button>
                    <span>Page {currentPage}</span>
                    <button onClick={() => setCurrentPage(p => p + 1)} disabled={!hasNextPage || loading}>
                        Next
                    </button>
                </div>
            </div>
            
            {showCashInModal && (
                <div style={styles.modalOverlay}>
                    <div style={styles.modalContent}>
                        <div style={styles.modalHeader}>
                            <h3>Add Cash In to "{selectedBook?.name}"</h3>
                            <button onClick={() => setShowCashInModal(false)} style={styles.closeButton}><AiOutlineClose /></button>
                        </div>
                        <form onSubmit={handleCashIn}>
                            <div style={styles.modalBody}>
                                <label style={styles.label}>Amount (Rs.)</label>
                                <input 
                                    type="number" 
                                    value={cashInAmount} 
                                    onChange={(e) => setCashInAmount(e.target.value)} 
                                    placeholder="e.g., 5000" 
                                    style={styles.input}
                                    autoFocus
                                />
                                <label style={styles.label}>Details / Reason</label>
                                <input 
                                    type="text" 
                                    value={cashInDetails} 
                                    onChange={(e) => setCashInDetails(e.target.value)} 
                                    placeholder="e.g., Initial float, Owner deposit" 
                                    style={styles.input}
                                />
                            </div>
                            <div style={styles.modalFooter}>
                                <button type="button" onClick={() => setShowCashInModal(false)} style={styles.cancelButton}>Cancel</button>
                                <button type="submit" style={isSavingCashIn ? styles.buttonDisabled : styles.button} disabled={isSavingCashIn}>
                                    {isSavingCashIn ? 'Saving...' : 'Save Transaction'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <style>{`
                .spinner {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

const styles = {
    container: { padding: '24px', fontFamily: "'Inter', sans-serif", backgroundColor: '#f4f6f8' },
    panel: { backgroundColor: '#fff', padding: '24px', borderRadius: '8px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
    panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' },
    title: { fontSize: '22px', fontWeight: '600', color: '#2c3e50', margin: 0 },
    inputGroup: { display: 'flex', gap: '16px', alignItems: 'center' },
    input: { flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #bdc3c7', fontSize: '14px', boxSizing: 'border-box' },
    button: { padding: '10px 16px', border: 'none', backgroundColor: '#3498db', color: 'white', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: '500' },
    buttonDisabled: { padding: '10px 16px', border: 'none', backgroundColor: '#bdc3c7', color: 'white', borderRadius: '6px', cursor: 'not-allowed', display: 'flex', alignItems: 'center', fontWeight: '500' },
    bookListContainer: { display: 'flex', flexWrap: 'wrap', gap: '12px' },
    bookButton: { padding: '10px 15px', border: '1px solid #3498db', backgroundColor: 'white', color: '#3498db', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: '500', fontSize: '14px' },
    bookButtonSelected: { padding: '10px 15px', border: '1px solid #3498db', backgroundColor: '#3498db', color: 'white', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: '500', fontSize: '14px' },
    noDataText: { color: '#6b7280', fontStyle: 'italic' },
    tableContainer: { overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { padding: '12px 16px', textAlign: 'left', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontWeight: '600', color: '#4b5563', fontSize: '12px', textTransform: 'uppercase' },
    td: { padding: '12px 16px', borderBottom: '1px solid #e5e7eb', fontSize: '14px', color: '#34495e' },
    badge: { color: 'white', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '500', display: 'inline-block' },
    loadingCell: { textAlign: 'center', padding: '40px', color: '#6b7280', fontSize: '16px' },
    noDataCell: { textAlign: 'center', padding: '40px', color: '#6b7280' },
    paginationContainer: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginTop: '20px' },
    modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    modalContent: { backgroundColor: 'white', padding: '0', borderRadius: '8px', width: '100%', maxWidth: '500px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' },
    modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', padding: '16px 24px' },
    closeButton: { background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#95a5a6' },
    modalBody: { display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px' },
    label: { fontWeight: '500', color: '#2c3e50', fontSize: '14px', marginBottom: '-8px' },
    modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '12px', backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', padding: '16px 24px', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px' },
    cancelButton: { padding: '10px 16px', border: '1px solid #bdc3c7', backgroundColor: 'white', color: '#34495e', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' },
};

export default CashBook;