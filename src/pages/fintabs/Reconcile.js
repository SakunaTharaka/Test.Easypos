import React, { useState, useEffect, useCallback, useContext } from 'react';
import { db, auth } from '../../firebase';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { CashBookContext } from '../../context/CashBookContext';
import { AiOutlineLock, AiOutlineUnlock } from 'react-icons/ai';

const Reconcile = () => {
    const { reconciledDates, refreshBalances } = useContext(CashBookContext);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [summaryData, setSummaryData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isReconciling, setIsReconciling] = useState(false);

    const isDateReconciled = reconciledDates.has(selectedDate);

    const fetchReconciliationData = useCallback(async (date) => {
        setLoading(true);
        const user = auth.currentUser;
        if (!user) { setLoading(false); return; }
        const uid = user.uid;
        
        const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date); endOfDay.setHours(23, 59, 59, 999);
        
        try {
            const invoicesQuery = query(collection(db, uid, 'invoices', 'invoice_list'), where('createdAt', '>=', startOfDay), where('createdAt', '<=', endOfDay));
            const expensesQuery = query(collection(db, uid, 'user_data', 'expenses'), where('createdAt', '>=', startOfDay), where('createdAt', '<=', endOfDay));
            const stockPaymentsQuery = query(collection(db, uid, 'stock_payments', 'payments'), where('paidAt', '>=', startOfDay), where('paidAt', '<=', endOfDay));

            const [invoicesSnap, expensesSnap, stockPaymentsSnap] = await Promise.all([
                getDocs(invoicesQuery), getDocs(expensesQuery), getDocs(stockPaymentsQuery)
            ]);

            const allInvoices = invoicesSnap.docs.map(d => d.data());
            const allExpenses = expensesSnap.docs.map(d => d.data());
            const allStockPayments = stockPaymentsSnap.docs.map(d => d.data());

            const cardSales = allInvoices.filter(inv => inv.paymentMethod === 'Card');
            const onlineSales = allInvoices.filter(inv => inv.paymentMethod === 'Online');
            const cashSales = allInvoices.filter(inv => inv.paymentMethod === 'Cash');

            setSummaryData({
                cardSales: { list: cardSales, total: cardSales.reduce((sum, inv) => sum + inv.total, 0) },
                onlineSales: { list: onlineSales, total: onlineSales.reduce((sum, inv) => sum + inv.total, 0) },
                cashSales: { list: cashSales, total: cashSales.reduce((sum, inv) => sum + inv.total, 0) },
                expenses: { list: allExpenses, total: allExpenses.reduce((sum, exp) => sum + exp.amount, 0) },
                stockPayments: { list: allStockPayments, total: allStockPayments.reduce((sum, p) => sum + p.amount, 0) },
            });

        } catch (error) {
            console.error("Error fetching reconciliation data:", error);
            alert("Failed to fetch reconciliation data.");
        } finally {
            setLoading(false);
        }
    }, []);
    
    useEffect(() => {
        fetchReconciliationData(selectedDate);
    }, [selectedDate, fetchReconciliationData]);

    const handleReconcile = async () => {
        if (!window.confirm(`This will LOCK all transactions for ${new Date(selectedDate).toLocaleDateString()}. You will not be able to add or delete any invoices, payments, or expenses for this date. Are you sure?`)) return;
        setIsReconciling(true);
        const user = auth.currentUser;
        const uid = user.uid;
        
        try {
            const reconciliationRef = doc(db, uid, 'user_data', 'reconciliations', selectedDate);
            await setDoc(reconciliationRef, {
                reconciledAt: serverTimestamp(),
                reconciledBy: user.displayName || user.email
            });

            await refreshBalances();
            alert("Day reconciled and locked successfully!");

        } catch (error) {
            console.error("Error during reconciliation:", error);
            alert("Reconciliation failed: " + error.message);
        } finally {
            setIsReconciling(false);
        }
    };

    const renderSummarySection = (title, items, total, idField, userField) => (
        <div style={styles.summaryCard}>
            <h3 style={styles.summaryTitle}>{title} - Total: Rs. {total.toFixed(2)}</h3>
            {items.length > 0 ? (
                <ul style={styles.summaryList}>
                    {items.map((item, idx) => (
                        <li key={idx}>
                          <span>{item[idField] || item.invoiceNumber || 'N/A'}</span>
                          <span>Rs. {item.total?.toFixed(2) || item.amount?.toFixed(2)}</span>
                          <span>by {item[userField]}</span>
                        </li>
                    ))}
                </ul>
            ) : <p style={styles.noData}>No transactions.</p>}
        </div>
    );

    return (
        <div style={styles.container}>
            <div style={styles.section}>
                <div style={styles.dailyHeader}>
                    <h2 style={styles.title}>Daily Reconciliation</h2>
                    <div style={styles.datePickerContainer}>
                        <label>Select Date:</label>
                        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={styles.input} />
                    </div>
                </div>

                {loading ? <p style={styles.noData}>Loading summary for {new Date(selectedDate).toLocaleDateString()}...</p> : summaryData && (
                    <div style={styles.grid}>
                        {renderSummarySection("Card Sales", summaryData.cardSales.list, summaryData.cardSales.total, 'invoiceNumber', 'issuedBy')}
                        {renderSummarySection("Online Sales", summaryData.onlineSales.list, summaryData.onlineSales.total, 'invoiceNumber', 'issuedBy')}
                        {renderSummarySection("Cash Sales", summaryData.cashSales.list, summaryData.cashSales.total, 'invoiceNumber', 'issuedBy')}
                        {renderSummarySection("Expenses", summaryData.expenses.list, summaryData.expenses.total, 'expenseId', 'createdBy')}
                        {renderSummarySection("Stock Payments", summaryData.stockPayments.list, summaryData.stockPayments.total, 'paymentId', 'paidBy')}
                    </div>
                )}

                <div style={styles.dayEndContainer}>
                    {isDateReconciled ? (
                        <div style={styles.reconciledBanner}><AiOutlineLock /> This day has been reconciled and is locked.</div>
                    ) : (
                        <button onClick={handleReconcile} style={styles.reconcileButton} disabled={isReconciling || loading}>
                            <AiOutlineUnlock /> {isReconciling ? 'Reconciling...' : `Reconcile & Lock ${new Date(selectedDate).toLocaleDateString()}`}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
const styles = {
    container: { padding: '24px', fontFamily: "'Inter', sans-serif" },
    section: { backgroundColor: '#fff', padding: '24px', borderRadius: '8px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
    title: { fontSize: '22px', fontWeight: '600', color: '#2c3e50', margin: 0 },
    dailyHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
    datePickerContainer: { display: 'flex', alignItems: 'center', gap: '10px' },
    input: { padding: '10px', borderRadius: '6px', border: '1px solid #bdc3c7', fontSize: '14px' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px' },
    summaryCard: { border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px' },
    summaryTitle: { fontSize: '16px', fontWeight: '600', borderBottom: '1px solid #e5e7eb', paddingBottom: '10px', marginBottom: '10px' },
    summaryList: { listStyle: 'none', padding: 0, margin: 0, fontSize: '14px', maxHeight: '200px', overflowY: 'auto' },
    dayEndContainer: { textAlign: 'center', marginTop: '30px', paddingTop: '20px', borderTop: '1px solid #f0f0f0' },
    reconcileButton: { padding: '12px 24px', border: 'none', backgroundColor: '#27ae60', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '16px', display: 'inline-flex', alignItems: 'center', gap: '8px' },
    reconciledBanner: { backgroundColor: '#d1fae5', color: '#065f46', padding: '12px', borderRadius: '8px', fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '8px' },
    noData: { textAlign: 'center', padding: '20px', color: '#6b7280' },
};
export default Reconcile;