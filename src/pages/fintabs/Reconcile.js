import React, { useState, useEffect, useCallback, useContext, useRef } from 'react';
import { db, auth } from '../../firebase';
import { 
    collection, query, where, getDocs, doc, setDoc, addDoc, 
    serverTimestamp, orderBy, limit, startAfter, endBefore, arrayUnion 
} from 'firebase/firestore';
import { CashBookContext } from '../../context/CashBookContext';
import { AiOutlineLock, AiOutlineUnlock, AiOutlineEye, AiOutlinePrinter, AiOutlineLeft, AiOutlineRight } from 'react-icons/ai';

// ✅ HELPER: Get Local Date String
const getLocalDate = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const ReconciliationReportModal = ({ report, onClose }) => {
    useEffect(() => {
        if (report) {
            document.body.classList.add('modal-open-for-print');
        }
        return () => {
            document.body.classList.remove('modal-open-for-print');
        };
    }, [report]);

    if (!report) return null;

    const summary = report.summary || {};
    const printReport = () => window.print();

    return (
        <>
            <style>{`
                @media print {
                    body.modal-open-for-print * { visibility: hidden; }
                    body.modal-open-for-print .print-area,
                    body.modal-open-for-print .print-area * { visibility: visible; }
                    body.modal-open-for-print .print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
                    .no-print { display: none !important; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
                    h3, h4 { text-align: center; margin-bottom: 10px; }
                }
            `}</style>
            <div style={styles.modalOverlay}>
                <div style={{...styles.modal, maxWidth: '900px'}}>
                    <div className="print-area">
                        <div style={styles.modalHeader}>
                            <div>
                                <h3 style={styles.modalTitle}>Reconciliation Report</h3>
                                <p style={styles.modalSubtitle}>Date: {report.reconciliationDate}</p>
                                <p style={styles.modalSubtitle}>Generated at: {report.reconciledAt?.toDate().toLocaleString()}</p>
                            </div>
                            <div className="no-print" style={{display: 'flex', gap: '10px'}}>
                                <button onClick={printReport} style={styles.printButton}><AiOutlinePrinter /> Print</button>
                                <button onClick={onClose} style={styles.closeButton}>Close</button>
                            </div>
                        </div>
                        <div style={styles.modalBody}>
                            {Object.entries(summary).map(([key, value]) => (
                                <div key={key} style={styles.reportSection}>
                                    <h4 style={styles.reportSectionTitle}>{key.replace(/([A-Z])/g, ' $1').toUpperCase()} - TOTAL: Rs. {(value.total || 0).toFixed(2)}</h4>
                                    {value.list && value.list.length > 0 ? (
                                        <table style={styles.reportTable}>
                                            <thead>
                                                <tr><th>ID</th><th>Details</th><th>User</th><th>Amount</th></tr>
                                            </thead>
                                            <tbody>
                                                {value.list.map((item, idx) => (
                                                    <tr key={idx}>
                                                        <td>{item.invoiceNumber || item.expenseId || item.paymentId || 'N/A'}</td>
                                                        <td>{item.details || item.customerName || item.receiverName || 'N/A'}</td>
                                                        <td>{item.issuedBy || item.createdBy || item.paidBy}</td>
                                                        <td>Rs. {(item.total || item.amount || 0).toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : <p style={styles.noData}>No transactions in this category.</p>}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};


const Reconcile = () => {
    const { reconciledDates, refreshBalances } = useContext(CashBookContext);
    
    const [selectedDate, setSelectedDate] = useState(getLocalDate());
    
    const [summaryData, setSummaryData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isReconciling, setIsReconciling] = useState(false);
    
    // History State
    const [reconciliationHistory, setReconciliationHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyPage, setHistoryPage] = useState(1);
    const [hasNextPage, setHasNextPage] = useState(false);
    
    const lastVisibleRef = useRef(null);
    const firstVisibleRef = useRef(null);
    
    const REPORTS_PER_PAGE = 40;
    const [showReportModal, setShowReportModal] = useState(false);
    const [selectedReport, setSelectedReport] = useState(null);

    const isDateReconciled = reconciledDates.has(selectedDate);

    const getCurrentInternal = () => {
      try {
        const stored = localStorage.getItem("internalLoggedInUser");
        return stored ? JSON.parse(stored) : null;
      } catch (e) { return null; }
    };
    
    const fetchSummaryData = useCallback(async (date) => {
        setLoading(true);
        const user = auth.currentUser;
        if (!user) { setLoading(false); return; }
        const uid = user.uid;
        
        const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date); endOfDay.setHours(23, 59, 59, 999);
        
        try {
            // 1. Check for the latest reconciliation on this date
            const historyRef = collection(db, uid, 'user_data', 'reconciliation_history');
            const latestHistoryQuery = query(
                historyRef,
                where('reconciliationDate', '==', date),
                orderBy('reconciledAt', 'desc'),
                limit(1)
            );
            const historySnap = await getDocs(latestHistoryQuery);

            let queryStartTime = startOfDay;
            let queryOperator = '>=';

            // If a report exists, only fetch items created AFTER the last report
            if (!historySnap.empty) {
                const lastReport = historySnap.docs[0].data();
                if (lastReport.reconciledAt) {
                    queryStartTime = lastReport.reconciledAt.toDate();
                    queryOperator = '>'; 
                }
            }

            // 2. Fetch Transactions
            const [invoicesSnap, expensesSnap, stockPaymentsSnap] = await Promise.all([
                getDocs(query(
                    collection(db, uid, 'invoices', 'invoice_list'), 
                    where('createdAt', queryOperator, queryStartTime), 
                    where('createdAt', '<=', endOfDay)
                )),
                
                getDocs(query(
                    collection(db, uid, 'user_data', 'expenses'), 
                    where('createdAt', queryOperator, queryStartTime), 
                    where('createdAt', '<=', endOfDay)
                )),
                
                getDocs(query(
                    collection(db, uid, 'stock_payments', 'payments'), 
                    where('paidAt', queryOperator, queryStartTime), 
                    where('paidAt', '<=', endOfDay)
                ))
            ]);

            // Map data with ID for locking later
            const allInvoices = invoicesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const allExpenses = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const allStockPayments = stockPaymentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            const cashSalesList = allInvoices.filter(i => i.paymentMethod === 'Cash');
            const cardSalesList = allInvoices.filter(i => i.paymentMethod === 'Card');
            const onlineSalesList = allInvoices.filter(i => i.paymentMethod === 'Online');

            setSummaryData({
                cardSales: { list: cardSalesList, total: cardSalesList.reduce((s,i) => s + (Number(i.total) || 0), 0) },
                onlineSales: { list: onlineSalesList, total: onlineSalesList.reduce((s,i) => s + (Number(i.total) || 0), 0) },
                cashSales: { list: cashSalesList, total: cashSalesList.reduce((s,i) => s + (Number(i.total) || 0), 0) },
                expenses: { list: allExpenses, total: allExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0) },
                stockPayments: { list: allStockPayments, total: allStockPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0) },
            });
        } catch (error) {
            console.error("Error fetching summary data:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchHistory = useCallback(async (date, direction = 'initial') => {
        setHistoryLoading(true);
        const uid = auth.currentUser.uid;
        const historyColRef = collection(db, uid, 'user_data', 'reconciliation_history');
        let q;

        const baseQuery = [
            where('reconciliationDate', '==', date),
            orderBy('reconciledAt', 'desc')
        ];

        if (direction === 'next' && lastVisibleRef.current) {
            q = query(historyColRef, ...baseQuery, startAfter(lastVisibleRef.current), limit(REPORTS_PER_PAGE));
        } else if (direction === 'prev' && firstVisibleRef.current) {
             q = query(historyColRef, ...baseQuery, endBefore(firstVisibleRef.current), limit(REPORTS_PER_PAGE));
        } else {
            q = query(historyColRef, ...baseQuery, limit(REPORTS_PER_PAGE));
        }

        try {
            const docSnap = await getDocs(q);
            const historyData = docSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            if (!docSnap.empty) {
                firstVisibleRef.current = docSnap.docs[0];
                lastVisibleRef.current = docSnap.docs[docSnap.docs.length - 1];
                setHasNextPage(historyData.length === REPORTS_PER_PAGE);
                setReconciliationHistory(historyData);
            } else {
                 if (direction === 'initial') {
                    setReconciliationHistory([]);
                    firstVisibleRef.current = null;
                    lastVisibleRef.current = null;
                 }
                 setHasNextPage(false);
            }
        } catch (error) {
            console.error("Error fetching history:", error);
        } finally {
            setHistoryLoading(false);
        }
    }, []);

    useEffect(() => {
        setHistoryPage(1);
        lastVisibleRef.current = null;
        firstVisibleRef.current = null;
        setHasNextPage(false);
        
        fetchSummaryData(selectedDate);
        fetchHistory(selectedDate, 'initial');
    }, [selectedDate, fetchSummaryData, fetchHistory]);

    const handlePageChange = (direction) => {
        if (direction === 'next') {
            setHistoryPage(p => p + 1);
            fetchHistory(selectedDate, 'next');
        } else if (historyPage > 1) {
            setHistoryPage(p => p - 1);
            fetchHistory(selectedDate, 'prev');
        }
    }
    
    // ✅ NEW: Reconcile Logic - Saves IDs to a single document
    const handleReconcile = async () => {
        if (!window.confirm("Save Reconciliation? This will lock the listed transactions from deletion.")) return;
        setIsReconciling(true);
        const user = auth.currentUser;
        const internalUser = getCurrentInternal();
        const uid = user.uid;
        
        try {
            // 1. Create the History Report (Snapshot of what happened)
            await addDoc(collection(db, uid, 'user_data', 'reconciliation_history'), {
                summary: summaryData,
                reconciliationDate: selectedDate,
                reconciledAt: serverTimestamp(),
                reconciledBy: internalUser?.username || user.email
            });

            // 2. Lock Documents (Collect IDs)
            const allItemsToLock = [
                ...summaryData.cardSales.list,
                ...summaryData.onlineSales.list,
                ...summaryData.cashSales.list,
                ...summaryData.expenses.list,
                ...summaryData.stockPayments.list
            ];

            const allIds = allItemsToLock.map(item => item.id).filter(id => id);

            if (allIds.length > 0) {
                // ✅ Store IDs in: uid -> user_data -> locked_documents -> {DATE}
                const lockedDocsRef = doc(db, uid, 'user_data', 'locked_documents', selectedDate);
                
                await setDoc(lockedDocsRef, {
                    lockedIds: arrayUnion(...allIds), // Append IDs to today's list
                    lastReconciledAt: serverTimestamp()
                }, { merge: true });
            }

            // 3. Mark Date as Reconciled (For UI Banner)
            if (!isDateReconciled) {
                await setDoc(doc(db, uid, 'user_data', 'reconciliations', selectedDate), {
                    reconciledAt: serverTimestamp(),
                    reconciledBy: internalUser?.username || user.email
                });
            }

            await refreshBalances();
            alert("Reconciliation saved! Items included are now locked.");
            fetchSummaryData(selectedDate);
            fetchHistory(selectedDate, 'initial');
        } catch (error) {
            console.error("Error during reconciliation:", error);
            alert("Failed to save report: " + error.message);
        } finally {
            setIsReconciling(false);
        }
    };
    
    const renderSummarySection = (title, items, total) => (
        <div style={styles.summaryCard}>
            <h3 style={styles.summaryTitle}>{title} - Total: Rs. {(total || 0).toFixed(2)}</h3>
            {items.length > 0 ? (
                <ul style={styles.summaryList}>
                    {items.map((item, idx) => (
                        <li key={idx} style={styles.summaryListItem}>
                          <span>{item.invoiceNumber || item.expenseId || item.paymentId || 'N/A'}</span>
                          <span>Rs. {(Number(item.total) || Number(item.amount) || 0).toFixed(2)}</span>
                          <span style={{color: '#6c757d'}}>by {item.issuedBy || item.createdBy || item.paidBy}</span>
                        </li>
                    ))}
                </ul>
            ) : <p style={styles.noData}>No new transactions.</p>}
        </div>
    );
    
    const hasDataToReconcile = summaryData && Object.values(summaryData).some(val => val.total > 0);

    return (
        <div style={styles.container}>
            {showReportModal && <ReconciliationReportModal report={selectedReport} onClose={() => setShowReportModal(false)} />}
            
            <div style={styles.header}>
                <div>
                    <h2 style={styles.title}>Daily Reconciliation</h2>
                    <p style={styles.subtitle}>Review, save, and lock daily financial transactions.</p>
                </div>
                <div style={styles.datePickerContainer}>
                    <label>Select Date:</label>
                    <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={styles.dateInput} max={getLocalDate()}/>
                </div>
            </div>

            <div style={styles.panel}>
                 <h3 style={styles.panelTitle}>New Transactions to Reconcile</h3>
                 {loading ? <p style={styles.noData}>Loading summary...</p> : summaryData && (
                    <div style={styles.grid}>
                        {renderSummarySection("Card Sales", summaryData.cardSales.list, summaryData.cardSales.total)}
                        {renderSummarySection("Online Sales", summaryData.onlineSales.list, summaryData.onlineSales.total)}
                        {renderSummarySection("Cash Sales", summaryData.cashSales.list, summaryData.cashSales.total)}
                        {renderSummarySection("Expenses", summaryData.expenses.list, summaryData.expenses.total)}
                        {renderSummarySection("Stock Payments", summaryData.stockPayments.list, summaryData.stockPayments.total)}
                    </div>
                )}
                <div style={styles.dayEndContainer}>
                    {isDateReconciled && <div style={styles.reconciledBanner}><AiOutlineLock /> This day has reports. Transactions are locked individually.</div>}
                    <button onClick={handleReconcile} style={!hasDataToReconcile || isReconciling || loading ? styles.reconcileButtonDisabled : styles.reconcileButton} disabled={!hasDataToReconcile || isReconciling || loading}>
                        {isDateReconciled ? <AiOutlineLock /> : <AiOutlineUnlock /> }
                        {isReconciling ? 'Saving...' : 'Save Reconciliation Report'}
                    </button>
                </div>
            </div>

            <div style={styles.panel}>
                <h3 style={styles.panelTitle}>Reconciliation History for {new Date(selectedDate).toLocaleDateString()}</h3>
                <div style={styles.tableContainer}>
                    <table style={styles.historyTable}>
                        <thead>
                            <tr>
                                <th style={styles.th}>Reconciled At</th>
                                <th style={styles.th}>Cash Sales</th>
                                <th style={styles.th}>Card Sales</th>
                                <th style={styles.th}>Expenses</th>
                                <th style={styles.th}>Stock Payments</th>
                                <th style={styles.th}>Reconciled By</th>
                                <th style={styles.th}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {historyLoading ? (<tr><td colSpan="7" style={styles.noData}>Loading history...</td></tr>) 
                            : reconciliationHistory.length > 0 ? reconciliationHistory.map(rec => (
                                <tr key={rec.id}>
                                    <td style={styles.td}>{rec.reconciledAt?.toDate().toLocaleString()}</td>
                                    <td style={styles.td}>Rs. {(rec.summary.cashSales.total || 0).toFixed(2)}</td>
                                    <td style={styles.td}>Rs. {(rec.summary.cardSales.total || 0).toFixed(2)}</td>
                                    <td style={styles.td}>Rs. {(rec.summary.expenses.total || 0).toFixed(2)}</td>
                                    <td style={styles.td}>Rs. {(rec.summary.stockPayments.total || 0).toFixed(2)}</td>
                                    <td style={styles.td}>{rec.reconciledBy}</td>
                                    <td style={styles.td}>
                                        <button onClick={() => { setSelectedReport(rec); setShowReportModal(true); }} style={styles.viewButton}>
                                            <AiOutlineEye /> View
                                        </button>
                                    </td>
                                </tr>
                            )) : (<tr><td colSpan="7" style={styles.noData}>No reconciliation reports found for this date.</td></tr>)}
                        </tbody>
                    </table>
                </div>
                <div style={styles.paginationContainer}>
                    <button onClick={() => handlePageChange('prev')} disabled={historyPage === 1} style={styles.pageButton}>
                        <AiOutlineLeft/> Previous
                    </button>
                    <span>Page {historyPage}</span>
                    <button onClick={() => handlePageChange('next')} disabled={!hasNextPage} style={styles.pageButton}>
                        Next <AiOutlineRight/>
                    </button>
                </div>
            </div>
        </div>
    );
};

const styles = {
    container: { padding: '24px', fontFamily: "'Inter', sans-serif", backgroundColor: '#f9fafb' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
    title: { fontSize: '28px', fontWeight: '700', color: '#111827', margin: 0 },
    subtitle: { fontSize: '16px', color: '#6b7280', marginTop: '4px' },
    panel: { backgroundColor: '#fff', padding: '24px', borderRadius: '12px', marginBottom: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)' },
    panelTitle: { fontSize: '20px', fontWeight: '600', color: '#1f2937', marginTop: '0', marginBottom: '20px', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' },
    datePickerContainer: { display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'white', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' },
    dateInput: { border: 'none', backgroundColor: 'transparent', fontSize: '14px', outline: 'none' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px' },
    noData: { textAlign: 'center', padding: '20px', color: '#6b7280' },
    summaryCard: { border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', backgroundColor: '#f9fafb' },
    summaryTitle: { fontSize: '16px', fontWeight: '600', borderBottom: '1px solid #e5e7eb', paddingBottom: '10px', marginBottom: '10px' },
    summaryList: { listStyle: 'none', padding: 0, margin: 0, fontSize: '14px', maxHeight: '200px', overflowY: 'auto' },
    summaryListItem: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f0f0f0' },
    dayEndContainer: { textAlign: 'center', marginTop: '30px', paddingTop: '20px', borderTop: '1px solid #f0f0f0' },
    reconcileButton: { padding: '12px 24px', border: 'none', backgroundColor: '#2563eb', color: 'white', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '16px', display: 'inline-flex', alignItems: 'center', gap: '8px', transition: 'background-color 0.2s' },
    reconcileButtonDisabled: { padding: '12px 24px', border: 'none', backgroundColor: '#9ca3af', color: 'white', borderRadius: '8px', cursor: 'not-allowed', fontWeight: '600', fontSize: '16px', display: 'inline-flex', alignItems: 'center', gap: '8px' },
    reconciledBanner: { backgroundColor: '#fef3c7', color: '#92400e', padding: '12px', borderRadius: '8px', fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '15px' },
    tableContainer: { overflowX: 'auto' },
    historyTable: { width: '100%', borderCollapse: 'collapse', },
    th: { padding: '12px', textAlign: 'left', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontWeight: '600', color: '#4b5563', fontSize: '12px', textTransform: 'uppercase' },
    td: { padding: '12px', borderBottom: '1px solid #e5e7eb' },
    viewButton: { padding: '6px 12px', backgroundColor: '#4b5563', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: 'background-color 0.2s' },
    paginationContainer: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', marginTop: '20px' },
    pageButton: { padding: '8px 12px', border: '1px solid #d1d5db', backgroundColor: 'white', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' },
    modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(17, 24, 39, 0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1001 },
    modal: { backgroundColor: 'white', padding: '25px', borderRadius: '12px', width: '90%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)', maxHeight: '90vh', overflowY: 'auto' },
    modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e5e7eb', paddingBottom: '15px', marginBottom: '15px' },
    modalTitle: { margin: 0, fontSize: '22px', fontWeight: '600' },
    modalSubtitle: { margin: '4px 0 0', color: '#6b7280' },
    modalBody: { maxHeight: '60vh', overflowY: 'auto' },
    closeButton: { padding: '8px 16px', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '6px', cursor: 'pointer' },
    printButton: { padding: '8px 16px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' },
    reportSection: { marginBottom: '20px' },
    reportSectionTitle: { borderBottom: '1px solid #eee', paddingBottom: '8px', fontSize: '16px', color: '#111827' },
    reportTable: { width: '100%', fontSize: '14px', border: '1px solid #ddd' }
};

export default Reconcile;