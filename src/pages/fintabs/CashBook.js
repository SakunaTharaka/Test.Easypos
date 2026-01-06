import React, { useState, useEffect, useContext } from 'react';
import { db, auth } from '../../firebase';
import { 
    collection, addDoc, getDocs, updateDoc, deleteDoc, doc,
    serverTimestamp, query, where, orderBy, limit, startAfter 
} from 'firebase/firestore';
import { 
    AiOutlineBook, AiOutlineLoading3Quarters, AiOutlineEdit, 
    AiOutlineDelete, AiOutlineCheck, AiOutlineClose, AiFillLock 
} from 'react-icons/ai';
import { CashBookContext } from '../../context/CashBookContext';

const CashBook = () => {
    const { cashBooks, refreshBalances } = useContext(CashBookContext);
    const DEFAULT_BOOK_NAME = "Main Account Cashier";
    
    // UI State
    const [newCashBookName, setNewCashBookName] = useState("");
    const [selectedBook, setSelectedBook] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Rename State
    const [renamingBookId, setRenamingBookId] = useState(null);
    const [renameValue, setRenameValue] = useState("");

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [pageCursors, setPageCursors] = useState([null]);
    const [hasNextPage, setHasNextPage] = useState(false);
    const [balanceCarry, setBalanceCarry] = useState([0]);
    const PAGE_SIZE = 65;

    // --- 1. CREATE BOOK (Max 4 Limit) ---
    const handleCreateCashBook = async () => {
        if (!newCashBookName.trim()) return alert("Cash book name cannot be empty.");
        
        // Constraint: Max 4 Books
        if (cashBooks.length >= 4) {
            return alert("Limit Reached: You can only create up to 4 Cash Books.");
        }

        const user = auth.currentUser;
        if (!user) return;

        // Constraint: Unique Name
        if (cashBooks.some(book => book.name.toLowerCase() === newCashBookName.trim().toLowerCase())) {
            return alert("A cash book with this name already exists.");
        }

        try {
            await addDoc(collection(db, user.uid, 'cash_books', 'book_list'), { 
                name: newCashBookName.trim(), 
                createdAt: serverTimestamp(), 
                createdBy: user.displayName || 'Admin', 
            });
            setNewCashBookName("");
            await refreshBalances(); 
        } catch (error) { 
            alert("Failed to create cash book: " + error.message); 
        }
    };

    // --- 2. RENAME BOOK ---
    const startRename = (book) => {
        if (book.name === DEFAULT_BOOK_NAME) return alert("The Main Account Cashier cannot be renamed.");
        setRenamingBookId(book.id);
        setRenameValue(book.name);
    };

    const saveRename = async (bookId) => {
        if (!renameValue.trim()) return;
        try {
            const user = auth.currentUser;
            const bookRef = doc(db, user.uid, 'cash_books', 'book_list', bookId);
            await updateDoc(bookRef, { name: renameValue.trim() });
            setRenamingBookId(null);
            await refreshBalances();
        } catch (error) {
            alert("Failed to rename: " + error.message);
        }
    };

    // --- 3. DELETE BOOK (Protected Default & Balance 0 Check) ---
    const handleDeleteBook = async (book) => {
        // Constraint: Cannot delete default book
        if (book.name === DEFAULT_BOOK_NAME) {
            return alert("Restricted: The Main Account Cashier cannot be deleted.");
        }

        if (!window.confirm(`Are you sure you want to delete "${book.name}"?`)) return;

        setLoading(true);
        try {
            const user = auth.currentUser;
            const balance = await calculateTotalBalance(user.uid, book.id);

            // Constraint: Balance must be exactly 0
            if (Math.abs(balance) > 0.01) { 
                alert(`Cannot Delete: This cash book has a remaining balance of Rs. ${balance.toFixed(2)}. Please clear the balance first.`);
                setLoading(false);
                return;
            }

            await deleteDoc(doc(db, user.uid, 'cash_books', 'book_list', book.id));
            
            if (selectedBook?.id === book.id) setSelectedBook(null);
            await refreshBalances();
            alert("Cash book deleted successfully.");
        } catch (error) {
            alert("Error deleting book: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Helper: Calculate total balance for verification
    const calculateTotalBalance = async (uid, bookId) => {
        const qExp = query(collection(db, uid, 'user_data', 'expenses'), where('cashBookId', '==', bookId));
        const qPay = query(collection(db, uid, 'stock_payments', 'payments'), where('cashBookId', '==', bookId));
        const qInc = query(collection(db, uid, 'cash_book_entries', 'entry_list'), where('cashBookId', '==', bookId));
        
        const [expSnap, paySnap, incSnap] = await Promise.all([getDocs(qExp), getDocs(qPay), getDocs(qInc)]);
        
        let total = 0;
        incSnap.forEach(d => total += (d.data().amount || 0)); 
        expSnap.forEach(d => total -= (d.data().amount || 0)); 
        paySnap.forEach(d => total -= (d.data().amount || 0)); 
        
        return total;
    };

    // --- 4. FETCH TRANSACTIONS ---
    useEffect(() => {
        const fetchTransactions = async () => {
            if (!selectedBook) {
                setTransactions([]);
                return;
            }
            setLoading(true);
            const uid = auth.currentUser.uid;
            
            try {
                const buildQuery = (path, sortField) => {
                    let q = query(collection(db, uid, ...path), where('cashBookId', '==', selectedBook.id), orderBy(sortField, 'asc'));
                    if (pageCursors[currentPage - 1]) q = query(q, startAfter(pageCursors[currentPage - 1]));
                    return query(q, limit(PAGE_SIZE + 1));
                };

                const [expensesSnap, paymentsSnap, cashInSnap] = await Promise.all([
                    getDocs(buildQuery(['user_data', 'expenses'], 'createdAt')),
                    getDocs(buildQuery(['stock_payments', 'payments'], 'paidAt')),
                    getDocs(buildQuery(['cash_book_entries', 'entry_list'], 'createdAt')),
                ]);

                // Normalize Data
                const normalize = (doc, type, dateField, userField, detailField) => ({
                    ...doc.data(), id: doc.id, docRef: doc.ref, 
                    type, timestamp: doc.data()[dateField], 
                    user: doc.data()[userField], details: detailField ? doc.data()[detailField] : ''
                });

                const expenseTxs = expensesSnap.docs.map(d => normalize(d, d.data().category === 'Internal Transfer' ? 'Transfer Out' : 'Expense', 'createdAt', 'createdBy', 'details'));
                const stockPaymentTxs = paymentsSnap.docs.map(d => normalize(d, 'Stock Payment', 'paidAt', 'paidBy', null));
                const cashInTxs = cashInSnap.docs.map(d => normalize(d, d.data().details?.startsWith('Transfer from') ? 'Transfer In' : 'Cash In', 'createdAt', 'addedBy', 'details'));

                const combined = [...expenseTxs, ...stockPaymentTxs, ...cashInTxs]
                    .sort((a, b) => a.timestamp?.toMillis() - b.timestamp?.toMillis());

                const hasMore = combined.length > PAGE_SIZE;
                const pageData = combined.slice(0, PAGE_SIZE);
                setTransactions(pageData);
                setHasNextPage(hasMore);

                if (pageData.length > 0) {
                    let currentRunningBalance = balanceCarry[currentPage - 1] || 0;
                    pageData.forEach(tx => {
                        const isCredit = ['Expense', 'Stock Payment', 'Transfer Out'].includes(tx.type);
                        currentRunningBalance += isCredit ? -tx.amount : tx.amount;
                    });
                    
                    const newCarry = [...balanceCarry];
                    newCarry[currentPage] = currentRunningBalance;
                    setBalanceCarry(newCarry);

                    const lastDoc = pageData[pageData.length - 1];
                    const newCursors = [...pageCursors];
                    const allDocs = [...expensesSnap.docs, ...paymentsSnap.docs, ...cashInSnap.docs];
                    newCursors[currentPage] = allDocs.find(d => d.id === lastDoc.id);
                    setPageCursors(newCursors);
                }
            } catch (error) {
                console.error("Fetch error:", error);
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
            {/* --- TOP PANEL: MANAGE & SELECT --- */}
            <div style={styles.panel}>
                <div style={styles.headerRow}>
                    <h2 style={styles.title}>Cash Books ({cashBooks.length}/4)</h2>
                    <div style={styles.createGroup}>
                        <input 
                            type="text" 
                            value={newCashBookName} 
                            onChange={(e) => setNewCashBookName(e.target.value)} 
                            placeholder="New Cash Book Name" 
                            style={styles.input} 
                        />
                        <button onClick={handleCreateCashBook} style={styles.btnPrimary} disabled={cashBooks.length >= 4}>
                            + Create New
                        </button>
                    </div>
                </div>

                <div style={styles.bookGrid}>
                    {cashBooks.map(book => {
                        const isDefault = book.name === DEFAULT_BOOK_NAME;
                        return (
                            <div 
                                key={book.id} 
                                style={selectedBook?.id === book.id ? styles.bookCardActive : styles.bookCard}
                            >
                                {renamingBookId === book.id ? (
                                    <div style={styles.renameBox}>
                                        <input 
                                            value={renameValue} 
                                            onChange={(e) => setRenameValue(e.target.value)}
                                            style={styles.renameInput}
                                            autoFocus
                                        />
                                        <button onClick={() => saveRename(book.id)} style={styles.iconBtnSuccess}><AiOutlineCheck /></button>
                                        <button onClick={() => setRenamingBookId(null)} style={styles.iconBtnDanger}><AiOutlineClose /></button>
                                    </div>
                                ) : (
                                    <>
                                        <div style={styles.bookInfo} onClick={() => setSelectedBook(book)}>
                                            <div style={isDefault ? styles.iconBoxGold : styles.iconBoxBlue}>
                                                {isDefault ? <AiFillLock /> : <AiOutlineBook />}
                                            </div>
                                            <div style={styles.bookText}>
                                                <span style={styles.bookName}>{book.name}</span>
                                                <span style={styles.bookLabel}>{isDefault ? 'Primary Ledger' : 'Custom Ledger'}</span>
                                            </div>
                                        </div>
                                        
                                        {!isDefault && (
                                            <div style={styles.bookActions}>
                                                <button onClick={() => startRename(book)} style={styles.actionBtn} title="Rename">
                                                    <AiOutlineEdit />
                                                </button>
                                                <button onClick={() => handleDeleteBook(book)} style={{...styles.actionBtn, color: '#ef4444'}} title="Delete">
                                                    <AiOutlineDelete />
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })}
                    {cashBooks.length === 0 && <p style={styles.noData}>No cash books found. Create one to get started.</p>}
                </div>
            </div>

            {/* --- BOTTOM PANEL: TRANSACTIONS --- */}
            <div style={styles.panel}>
                <div style={styles.panelHeader}>
                    <h3 style={styles.subtitle}>
                        {selectedBook ? (
                            <span>Ledger: <span style={{color: '#2563eb'}}>{selectedBook.name}</span></span>
                        ) : 'Select a Cash Book to View Transactions'}
                    </h3>
                </div>

                <div style={styles.tableWrapper}>
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={styles.th}>Date</th>
                                <th style={styles.th}>Type</th>
                                <th style={styles.th}>Details</th>
                                <th style={styles.th}>User</th>
                                <th style={{...styles.th, textAlign: 'right'}}>In (Debit)</th>
                                <th style={{...styles.th, textAlign: 'right'}}>Out (Credit)</th>
                                <th style={{...styles.th, textAlign: 'right'}}>Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="7" style={styles.centerCell}><AiOutlineLoading3Quarters className="spin" /> Loading data...</td></tr>
                            ) : transactions.length > 0 ? (
                                transactions.map(tx => {
                                    const isCredit = ['Expense', 'Stock Payment', 'Transfer Out'].includes(tx.type);
                                    runningBalance += isCredit ? -tx.amount : tx.amount;
                                    return (
                                        <tr key={tx.id}>
                                            <td style={styles.td}>
                                                {tx.timestamp?.toDate().toLocaleDateString()}
                                                <div style={styles.time}>{tx.timestamp?.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                                            </td>
                                            <td style={styles.td}><span style={isCredit ? styles.badgeRed : styles.badgeGreen}>{tx.type}</span></td>
                                            <td style={styles.td}>{tx.details || '-'}</td>
                                            <td style={styles.td}>{tx.user}</td>
                                            <td style={{...styles.td, textAlign: 'right', color: '#10b981', fontWeight: '500'}}>{!isCredit ? tx.amount.toFixed(2) : '-'}</td>
                                            <td style={{...styles.td, textAlign: 'right', color: '#ef4444', fontWeight: '500'}}>{isCredit ? tx.amount.toFixed(2) : '-'}</td>
                                            <td style={{...styles.td, textAlign: 'right', fontWeight: '700', color: '#1f2937'}}>{runningBalance.toFixed(2)}</td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr><td colSpan="7" style={styles.centerCell}>{selectedBook ? 'No transactions found for this period.' : 'Please select a book above.'}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {selectedBook && (
                    <div style={styles.pagination}>
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1 || loading} style={styles.pageBtn}>Previous</button>
                        <span style={styles.pageInfo}>Page {currentPage}</span>
                        <button onClick={() => setCurrentPage(p => p + 1)} disabled={!hasNextPage || loading} style={styles.pageBtn}>Next</button>
                    </div>
                )}
            </div>
            
            <style>{`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
};

// --- STYLES ---
const styles = {
    container: { padding: '30px', fontFamily: "'Inter', sans-serif", backgroundColor: '#f8fafc', minHeight: '100vh' },
    panel: { backgroundColor: 'white', padding: '24px', borderRadius: '16px', marginBottom: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)' },
    
    headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '15px' },
    title: { fontSize: '1.25rem', fontWeight: '700', color: '#0f172a', margin: 0 },
    subtitle: { fontSize: '1.1rem', fontWeight: '600', color: '#334155', margin: 0 },
    
    createGroup: { display: 'flex', gap: '10px' },
    input: { padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', minWidth: '250px', fontSize: '0.9rem' },
    btnPrimary: { padding: '10px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem', transition: 'background 0.2s' },
    
    bookGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' },
    bookCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#fff', transition: 'all 0.2s ease', cursor: 'pointer' },
    bookCardActive: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '2px solid #3b82f6', borderRadius: '12px', background: '#eff6ff', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.15)' },
    
    bookInfo: { display: 'flex', alignItems: 'center', gap: '12px', flex: 1 },
    iconBoxBlue: { width: '36px', height: '36px', borderRadius: '8px', background: '#dbeafe', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' },
    iconBoxGold: { width: '36px', height: '36px', borderRadius: '8px', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' },
    
    bookText: { display: 'flex', flexDirection: 'column' },
    bookName: { fontWeight: '600', color: '#1e293b', fontSize: '0.95rem' },
    bookLabel: { fontSize: '0.75rem', color: '#64748b' },

    bookActions: { display: 'flex', gap: '6px' },
    actionBtn: { background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b', width: '32px', height: '32px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' },
    
    renameBox: { display: 'flex', gap: '8px', width: '100%', alignItems: 'center' },
    renameInput: { flex: 1, padding: '6px 10px', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid #cbd5e1' },
    iconBtnSuccess: { background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center' },
    iconBtnDanger: { background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center' },
    
    noData: { color: '#94a3b8', fontStyle: 'italic', padding: '20px' },
    
    tableWrapper: { overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
    th: { padding: '14px 20px', textAlign: 'left', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: '600', color: '#475569', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' },
    td: { padding: '14px 20px', borderBottom: '1px solid #f1f5f9', color: '#334155' },
    
    time: { fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' },
    badgeRed: { background: '#fef2f2', color: '#dc2626', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '600', border: '1px solid #fecaca' },
    badgeGreen: { background: '#f0fdf4', color: '#16a34a', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '600', border: '1px solid #bbf7d0' },
    
    centerCell: { textAlign: 'center', padding: '60px', color: '#94a3b8' },
    pagination: { display: 'flex', justifyContent: 'center', gap: '15px', alignItems: 'center', marginTop: '24px' },
    pageBtn: { padding: '8px 16px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', color: '#475569', fontWeight: '500' },
    pageInfo: { fontSize: '0.9rem', color: '#64748b', fontWeight: '500' },
};

export default CashBook;