import React, { useState, useEffect, useCallback, useContext } from 'react';
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
import { AiOutlinePlus, AiOutlineBook, AiOutlineLoading3Quarters } from 'react-icons/ai';
import { CashBookContext } from '../../context/CashBookContext';

const CashBook = () => {
    const { cashBooks, refreshBalances } = useContext(CashBookContext);
    
    // Panel 1: Create Cash Book
    const [newCashBookName, setNewCashBookName] = useState("");

    // Panel 2 & 3: Select and View Cash Book
    const [selectedBook, setSelectedBook] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // State for server-side pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageCursors, setPageCursors] = useState([null]); // Stores the cursor for the start of each page
    const [hasNextPage, setHasNextPage] = useState(false);
    const [balanceCarry, setBalanceCarry] = useState([0]); // Stores the running balance between pages
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

    const fetchTransactions = useCallback(async (bookId, page) => {
        if (!bookId) return;
        setLoading(true);
        const uid = auth.currentUser.uid;
        const expensesCollection = collection(db, uid, 'user_data', 'expenses');
        const paymentsCollection = collection(db, uid, 'stock_payments', 'payments');
        const cashInCollection = collection(db, uid, 'cash_book_entries', 'entry_list');

        try {
            const buildQuery = (coll, timestampField) => {
                let q = query(coll, where('cashBookId', '==', bookId), orderBy(timestampField, 'asc'));
                const cursor = pageCursors[page - 1];
                if (cursor) {
                    q = query(q, startAfter(cursor));
                }
                return query(q, limit(PAGE_SIZE));
            };

            const expensesQuery = buildQuery(expensesCollection, 'createdAt');
            const paymentsQuery = buildQuery(paymentsCollection, 'paidAt');
            const cashInQuery = buildQuery(cashInCollection, 'createdAt');

            const [expensesSnap, paymentsSnap, cashInSnap] = await Promise.all([
                getDocs(expensesQuery),
                getDocs(paymentsQuery),
                getDocs(cashInQuery)
            ]);

            const expenseTxs = expensesSnap.docs.map(d => ({...d.data(), id: d.id, doc: d, type: 'Expense', timestamp: d.data().createdAt, user: d.data().createdBy, details: `(${d.data().category}) ${d.data().details}`}));
            const stockPaymentTxs = paymentsSnap.docs.map(d => ({...d.data(), id: d.id, doc: d, type: 'Stock Payment', timestamp: d.data().paidAt, user: d.data().paidBy, details: `Payment for Stock-In: ${d.data().stockInId}`}));
            const cashInTxs = cashInSnap.docs.map(d => ({...d.data(), id: d.id, doc: d, type: 'Cash In', timestamp: d.data().createdAt, user: d.data().addedBy, details: 'Cash deposited'}));

            const combined = [...expenseTxs, ...stockPaymentTxs, ...cashInTxs]
                .sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

            const pageData = combined.slice(0, PAGE_SIZE);
            setTransactions(pageData);

            if (pageData.length > 0) {
                let currentRunningBalance = balanceCarry[page - 1] || 0;
                pageData.forEach(tx => {
                    const isCredit = tx.type === 'Expense' || tx.type === 'Stock Payment';
                    currentRunningBalance += isCredit ? -tx.amount : tx.amount;
                });

                setBalanceCarry(prev => {
                    const newCarry = [...prev];
                    newCarry[page] = currentRunningBalance;
                    return newCarry;
                });

                const lastDocOnPage = pageData[pageData.length - 1];
                setPageCursors(prev => {
                    const newCursors = [...prev];
                    newCursors[page] = lastDocOnPage.doc;
                    return newCursors;
                });
            }
            
            setHasNextPage(combined.length > PAGE_SIZE);

        } catch (error) {
            console.error("Error fetching transactions:", error);
            // This improved message guides you to the solution for database index errors.
            alert("Failed to fetch transaction data. This is likely due to a missing database index. Press F12 to open the developer console and look for a link to create the required index.");
        } finally {
            setLoading(false);
        }
    }, [pageCursors, balanceCarry]);

    useEffect(() => {
        if (selectedBook) {
            fetchTransactions(selectedBook.id, currentPage);
        } else {
            setTransactions([]);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            {/* Panel 1: Create Cash Book */}
            <div style={styles.panel}>
                <h2 style={styles.title}>Manage Cash Books</h2>
                <div style={styles.inputGroup}>
                    <input type="text" value={newCashBookName} onChange={(e) => setNewCashBookName(e.target.value)} placeholder="Enter new cash book name" style={styles.input} />
                    <button onClick={handleCreateCashBook} style={styles.button}><AiOutlinePlus style={{ marginRight: '8px' }} />Create</button>
                </div>
            </div>

            {/* Panel 2: Select Cash Book */}
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

            {/* Panel 3: View Cash Book Data */}
            <div style={styles.panel}>
                <h2 style={styles.title}>
                    {selectedBook ? `Ledger: ${selectedBook.name}` : 'Select a Cash Book to View Transactions'}
                </h2>
                <div style={styles.tableContainer}>
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={styles.th}>Date & Time</th>
                                <th style={styles.th}>Transaction ID</th>
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
                                            <td style={styles.td}>{tx.timestamp?.toDate().toLocaleString()}</td>
                                            <td style={styles.td}>
                                                <div>{tx.expenseId || tx.paymentId || 'N/A'}</div>
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
    title: { fontSize: '22px', fontWeight: '600', color: '#2c3e50', margin: '0 0 16px 0' },
    inputGroup: { display: 'flex', gap: '16px', alignItems: 'center' },
    input: { flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #bdc3c7', fontSize: '14px' },
    button: { padding: '10px 16px', border: 'none', backgroundColor: '#3498db', color: 'white', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: '500' },
    bookListContainer: { display: 'flex', flexWrap: 'wrap', gap: '12px' },
    bookButton: { padding: '10px 15px', border: '1px solid #3498db', backgroundColor: 'white', color: '#3498db', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: '500', fontSize: '14px' },
    bookButtonSelected: { padding: '10px 15px', border: '1px solid #3498db', backgroundColor: '#3498db', color: 'white', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: '500', fontSize: '14px' },
    noDataText: { color: '#6b7280', fontStyle: 'italic' },
    tableContainer: { overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { padding: '12px 16px', textAlign: 'left', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontWeight: '600', color: '#4b5563', fontSize: '12px', textTransform: 'uppercase' },
    td: { padding: '12px 16px', borderBottom: '1px solid #e5e7eb', fontSize: '14px', color: '#34495e' },
    badge: { color: 'white', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '500', display: 'inline-block', marginTop: '4px' },
    loadingCell: { textAlign: 'center', padding: '40px', color: '#6b7280', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' },
    noDataCell: { textAlign: 'center', padding: '40px', color: '#6b7280' },
    paginationContainer: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginTop: '20px' },
};

export default CashBook;