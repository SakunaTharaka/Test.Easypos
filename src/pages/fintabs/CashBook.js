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
import { AiOutlineBook, AiOutlineLoading3Quarters } from 'react-icons/ai'; // Only kept used icons
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

                // Map 'Internal Transfer' expenses as 'Transfer Out'
                const expenseTxs = expensesSnap.docs.map(d => {
                    const data = d.data();
                    const isTransfer = data.category === 'Internal Transfer';
                    return {
                        ...data, 
                        id: d.id, 
                        docRef: d.ref, 
                        type: isTransfer ? 'Transfer Out' : 'Expense', 
                        timestamp: data.createdAt, 
                        user: data.createdBy, 
                        details: `(${data.category}) ${data.details}`
                    };
                });

                const stockPaymentTxs = paymentsSnap.docs.map(d => ({...d.data(), id: d.id, docRef: d.ref, type: 'Stock Payment', timestamp: d.data().paidAt, user: d.data().paidBy, details: `Payment for Stock-In: ${d.data().stockInId}`}));
                
                // Map Transfers In (from Account page)
                const cashInTxs = cashInSnap.docs.map(d => {
                    const data = d.data();
                    // Identify transfers by details string convention from Account page
                    const isTransferIn = data.details && data.details.startsWith('Transfer from'); 
                    return {
                        ...data, 
                        id: d.id, 
                        docRef: d.ref, 
                        type: isTransferIn ? 'Transfer In' : 'Cash In', 
                        timestamp: data.createdAt, 
                        user: data.addedBy, 
                        details: data.details
                    };
                });

                const combined = [...expenseTxs, ...stockPaymentTxs, ...cashInTxs]
                    .sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

                const hasMore = combined.length > PAGE_SIZE;
                const pageData = combined.slice(0, PAGE_SIZE);
                setTransactions(pageData);
                setHasNextPage(hasMore);

                if (pageData.length > 0) {
                    let currentRunningBalance = balanceCarry[currentPage - 1] || 0;
                    pageData.forEach(tx => {
                        // Expense, Stock Payment, and Transfer Out reduce balance
                        const isCredit = tx.type === 'Expense' || tx.type === 'Stock Payment' || tx.type === 'Transfer Out';
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
                alert("Failed to fetch transaction data.");
            } finally {
                setLoading(false);
            }
        };

        fetchTransactions();
    }, [selectedBook, currentPage]);

    useEffect(() => {
        if (selectedBook) {
            setCurrentPage(1);
            setPageCursors([null]);
            setBalanceCarry([0]);
            setHasNextPage(false);
        }
    }, [selectedBook]);

    let runningBalance = balanceCarry[currentPage - 1] || 0;

    return (
        <div style={styles.container}>
            <div style={styles.panel}>
                <h2 style={styles.title}>Manage Cash Books</h2>
                <div style={styles.inputGroup}>
                    <input type="text" value={newCashBookName} onChange={(e) => setNewCashBookName(e.target.value)} placeholder="Enter new cash book name" style={styles.input} />
                    <button onClick={handleCreateCashBook} style={styles.button}>Create</button>
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
                    {/* ADD CASH BUTTON REMOVED */}
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
                                    const isCredit = tx.type === 'Expense' || tx.type === 'Stock Payment' || tx.type === 'Transfer Out';
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
};

export default CashBook;