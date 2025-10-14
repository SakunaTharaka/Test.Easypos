// fileName: StockOutBal.js

import React, { useState, useCallback } from 'react';
import { db, auth } from '../../firebase';
import { collection, getDocs, query, where, Timestamp, doc, setDoc, getDoc, serverTimestamp, deleteDoc, orderBy } from 'firebase/firestore';
import { FaSearch, FaSpinner, FaClipboardList, FaSave, FaBook, FaTrash } from 'react-icons/fa';

// --- Reusable Toast Notification ---
const Toast = ({ message, type, onDismiss }) => {
  const toastStyles = {
    position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
    padding: '12px 20px', borderRadius: '8px', color: 'white', fontWeight: 500,
    zIndex: 2000, boxShadow: '0 4px 15px rgba(0,0,0,0.2)', animation: 'fadeInOut 4s ease-in-out',
    backgroundColor: type === 'success' ? '#2ecc71' : '#e74c3c',
  };
  React.useEffect(() => {
    const timer = setTimeout(onDismiss, 3900);
    return () => clearTimeout(timer);
  }, [onDismiss]);
  return <div style={toastStyles}>{message}</div>;
};

// --- Helper Function ---
const toDateString = (date) => {
  if (typeof date === 'string') return date;
  return date.toISOString().split('T')[0];
};

// --- Main Component ---
const StockOutBal = () => {
    const [viewMode, setViewMode] = useState('summary'); // 'summary' or 'saved'
    const [toast, setToast] = useState(null);

    // State for Daily Summary
    const [summaryDate, setSummaryDate] = useState(toDateString(new Date()));
    const [summaryData, setSummaryData] = useState([]);
    const [actualQuantities, setActualQuantities] = useState({});
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [hasFetchedSummary, setHasFetchedSummary] = useState(false);

    // State for Saved Reports
    const [savedReportDate, setSavedReportDate] = useState(toDateString(new Date()));
    const [savedReportData, setSavedReportData] = useState([]);
    const [savedReportLoading, setSavedReportLoading] = useState(false);
    const [hasFetchedSaved, setHasFetchedSaved] = useState(false);

    const showToast = (message, type = 'success') => setToast({ message, type });

    const handleFetchSummary = useCallback(async () => {
        if (!summaryDate) { alert("Please select a date."); return; }
        setSummaryLoading(true);
        setHasFetchedSummary(true);
        setActualQuantities({});
        const uid = auth.currentUser.uid;
        const startTimestamp = Timestamp.fromDate(new Date(summaryDate + 'T00:00:00'));
        const endTimestamp = Timestamp.fromDate(new Date(summaryDate + 'T23:59:59'));
        try {
            const stockOutRef = collection(db, uid, 'inventory', 'stock_out');
            const stockOutQuery = query(stockOutRef, where('createdAt', '>=', startTimestamp), where('createdAt', '<=', endTimestamp), where('type', '==', 'buySell'));
            const invoicesRef = collection(db, uid, 'invoices', 'invoice_list');
            const invoicesQuery = query(invoicesRef, where('createdAt', '>=', startTimestamp), where('createdAt', '<=', endTimestamp));
            const [stockOutSnap, invoicesSnap] = await Promise.all([ getDocs(stockOutQuery), getDocs(invoicesQuery) ]);
            const summaryMap = {};
            stockOutSnap.forEach(docSnap => {
                const data = docSnap.data();
                const itemName = data.item;
                if (itemName) {
                    if (!summaryMap[itemName]) summaryMap[itemName] = { name: itemName, stockOutQty: 0, invoicedQty: 0 };
                    summaryMap[itemName].stockOutQty += Number(data.quantity);
                }
            });
            invoicesSnap.forEach(docSnap => {
                docSnap.data().items?.forEach(item => {
                    const itemName = item.itemName;
                    if (itemName) {
                        if (!summaryMap[itemName]) summaryMap[itemName] = { name: itemName, stockOutQty: 0, invoicedQty: 0 };
                        summaryMap[itemName].invoicedQty += Number(item.quantity);
                    }
                });
            });
            const combinedData = Object.values(summaryMap).sort((a, b) => a.name.localeCompare(b.name));
            setSummaryData(combinedData);
        } catch (error) {
            console.error("Error fetching summary: ", error);
            showToast("Failed to fetch summary: " + error.message, 'error');
        } finally {
            setSummaryLoading(false);
        }
    }, [summaryDate]);

    const handleActualQtyChange = (itemName, value) => {
        setActualQuantities(prev => ({ ...prev, [itemName]: value }));
    };

    const handleSaveReport = async () => {
        if (summaryData.length === 0) {
            alert("There is no data to save.");
            return;
        }
        const uid = auth.currentUser.uid;
        const reportId = `${summaryDate}_${Date.now()}`;
        const reportRef = doc(db, uid, 'reports', 'daily_summaries', reportId);
        
        const reportPayload = summaryData.map(item => {
            const balance = item.stockOutQty - item.invoicedQty;
            const actualQty = Number(actualQuantities[item.name]) || 0;
            const shortage = balance - actualQty;
            return { ...item, actualQty, shortage };
        });

        try {
            await setDoc(reportRef, {
                reportDate: summaryDate,
                items: reportPayload,
                savedAt: serverTimestamp(),
            });
            showToast("Report saved successfully!");
        } catch (error) {
            console.error("Error saving report: ", error);
            showToast("Failed to save report: " + error.message, 'error');
        }
    };

    const handleFetchSavedReport = async () => {
        if (!savedReportDate) { alert("Please select a date to view."); return; }
        setSavedReportLoading(true);
        setHasFetchedSaved(true);
        const uid = auth.currentUser.uid;
        const reportsRef = collection(db, uid, 'reports', 'daily_summaries');
        const q = query(reportsRef, where("reportDate", "==", savedReportDate), orderBy("savedAt", "desc"));
        try {
            const querySnapshot = await getDocs(q);
            const reports = querySnapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data()
            }));
            setSavedReportData(reports);
        } catch (error) {
            console.error("Error fetching saved reports: ", error);
            showToast("Failed to fetch reports: " + error.message, 'error');
        } finally {
            setSavedReportLoading(false);
        }
    };

    const handleDeleteReport = async (reportId) => {
        if (!window.confirm("Are you sure you want to delete this report permanently?")) {
            return;
        }
        const uid = auth.currentUser.uid;
        const reportRef = doc(db, uid, 'reports', 'daily_summaries', reportId);
        try {
            await deleteDoc(reportRef);
            setSavedReportData(prev => prev.filter(report => report.id !== reportId));
            showToast("Report deleted successfully.");
        } catch (error) {
            console.error("Error deleting report:", error);
            showToast("Failed to delete report: " + error.message, 'error');
        }
    };

    const renderSummaryView = () => (
        <div style={styles.card}>
            <div style={styles.controls}>
                <div>
                    <label style={styles.label}>Select Date:</label>
                    <input type="date" value={summaryDate} onChange={e => setSummaryDate(e.target.value)} style={styles.input} max={toDateString(new Date())}/>
                </div>
                 <button onClick={handleFetchSummary} disabled={summaryLoading || !summaryDate} style={summaryLoading || !summaryDate ? styles.buttonDisabled : styles.button}>
                    {summaryLoading ? <FaSpinner className="spinner" /> : <FaSearch />}
                    {summaryLoading ? 'Fetching...' : 'Fetch Summary'}
                </button>
            </div>

            {summaryLoading ? (
                <div style={styles.promptContainer}><FaSpinner className="spinner" size={48} color="#9ca3af" /><h3 style={styles.promptTitle}>Loading Summary...</h3></div>
            ) : !hasFetchedSummary ? (
                <div style={styles.promptContainer}><FaClipboardList size={48} color="#9ca3af" /><h3 style={styles.promptTitle}>Fetch Daily Summary</h3><p style={styles.promptText}>Select a date and click "Fetch Summary" to see the data.</p></div>
            ) : summaryData.length === 0 ? (
                <div style={styles.promptContainer}><h3 style={styles.promptTitle}>No Activity Found</h3><p style={styles.promptText}>No 'buySell' stock outs or sales were recorded on this date.</p></div>
            ) : (
                <>
                <div style={styles.tableContainer}>
                    <table style={styles.table}>
                        <thead style={styles.thead}>
                            <tr>
                                <th style={styles.th}>Item Name</th>
                                <th style={styles.th}>Total Stock Out</th>
                                <th style={styles.th}>Total Invoiced</th>
                                <th style={styles.th}>Balance</th>
                                <th style={styles.th}>Actual Qty</th>
                                <th style={styles.th}>Shortage</th>
                            </tr>
                        </thead>
                        <tbody>
                            {summaryData.map(item => {
                                const balance = item.stockOutQty - item.invoicedQty;
                                const actualQty = actualQuantities[item.name] || '';
                                const shortage = actualQty !== '' ? balance - Number(actualQty) : '';
                                return (
                                <tr key={item.name}>
                                    <td style={styles.td}><strong>{item.name}</strong></td>
                                    <td style={styles.td}>{item.stockOutQty}</td>
                                    <td style={styles.td}>{item.invoicedQty}</td>
                                    <td style={{...styles.td, fontWeight: 'bold'}}>{balance}</td>
                                    <td style={styles.td}>
                                        <input type="number" style={styles.actualInput} value={actualQty} onChange={(e) => handleActualQtyChange(item.name, e.target.value)} placeholder="0" />
                                    </td>
                                    <td style={{...styles.td, fontWeight: 'bold', color: shortage > 0 ? '#ef4444' : (shortage < 0 ? '#2563eb' : '#10b981')}}>
                                        {shortage !== '' ? shortage : '-'}
                                    </td>
                                </tr>
                            )})}
                        </tbody>
                    </table>
                </div>
                <div style={styles.footerControls}>
                    <button onClick={handleSaveReport} style={styles.saveButton}><FaSave style={{marginRight: '8px'}}/> Save Report</button>
                </div>
                </>
            )}
        </div>
    );

    const renderSavedReportsView = () => (
         <div style={styles.card}>
            <div style={styles.controls}>
                <div>
                    <label style={styles.label}>Select Report Date:</label>
                    <input type="date" value={savedReportDate} onChange={e => setSavedReportDate(e.target.value)} style={styles.input} max={toDateString(new Date())}/>
                </div>
                 <button onClick={handleFetchSavedReport} disabled={savedReportLoading || !savedReportDate} style={savedReportLoading || !savedReportDate ? styles.buttonDisabled : styles.button}>
                    {savedReportLoading ? <FaSpinner className="spinner" /> : <FaSearch />}
                    {savedReportLoading ? 'Fetching...' : 'View Reports'}
                </button>
            </div>
             {savedReportLoading ? (
                <div style={styles.promptContainer}><FaSpinner className="spinner" size={48} color="#9ca3af" /><h3 style={styles.promptTitle}>Loading Reports...</h3></div>
            ) : !hasFetchedSaved ? (
                <div style={styles.promptContainer}><FaClipboardList size={48} color="#9ca3af" /><h3 style={styles.promptTitle}>View Saved Reports</h3><p style={styles.promptText}>Select a date and click "View Reports" to see all saved summaries for that day.</p></div>
            ) : savedReportData.length === 0 ? (
                <div style={styles.promptContainer}><h3 style={styles.promptTitle}>No Reports Found</h3><p style={styles.promptText}>No summary reports were saved for the selected date.</p></div>
            ) : (
                savedReportData.map((report, index) => (
                    <div key={report.id} style={styles.reportWrapper}>
                        <div style={styles.reportHeader}>
                            <h4>Report {index + 1} (Saved on: {report.savedAt ? report.savedAt.toDate().toLocaleString() : 'N/A'})</h4>
                            <button onClick={() => handleDeleteReport(report.id)} style={styles.deleteButton} title="Delete this report"><FaTrash /></button>
                        </div>
                        <div style={styles.tableContainer}>
                            <table style={styles.table}>
                                <thead style={styles.thead}>
                                    <tr>
                                        <th style={styles.th}>Item Name</th>
                                        <th style={styles.th}>Net Stock Out (Stock Out - Actual)</th>
                                        <th style={styles.th}>Saved Invoiced</th>
                                        <th style={styles.th}>Saved Actual Qty</th>
                                        <th style={styles.th}>Saved Shortage</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* --- FIX IS HERE --- */}
                                    {report.items && Array.isArray(report.items) && report.items.map(item => {
                                        const netStockOut = item.stockOutQty - (item.actualQty || 0);
                                        return (
                                        <tr key={item.name}>
                                            <td style={styles.td}><strong>{item.name}</strong></td>
                                            <td style={styles.td}>{netStockOut}</td>
                                            <td style={styles.td}>{item.invoicedQty}</td>
                                            <td style={styles.td}>{item.actualQty}</td>
                                            <td style={{...styles.td, fontWeight: 'bold', color: item.shortage > 0 ? '#ef4444' : (item.shortage < 0 ? '#2563eb' : '#10b981')}}>
                                                {item.shortage}
                                            </td>
                                        </tr>
                                    )})}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))
            )}
        </div>
    );

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div>
                    <h2 style={styles.title}>Daily Buy/Sell Summary</h2>
                    <p style={styles.subtitle}>Fetch, review, and save daily sales and stock-out data.</p>
                </div>
                <div style={styles.viewModeButtons}>
                    <button onClick={() => setViewMode('summary')} style={viewMode === 'summary' ? styles.toggleButtonActive : styles.toggleButton}><FaClipboardList style={{marginRight: 8}}/> Daily Summary</button>
                    <button onClick={() => setViewMode('saved')} style={viewMode === 'saved' ? styles.toggleButtonActive : styles.toggleButton}><FaBook style={{marginRight: 8}}/> Saved Reports</button>
                </div>
            </div>
            
            {viewMode === 'summary' ? renderSummaryView() : renderSavedReportsView()}
            
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
            <style>{`
                .spinner { animation: spin 1s linear infinite; } 
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                @keyframes fadeInOut { 0%, 100% { opacity: 0; bottom: 0px; } 10%, 90% { opacity: 1; bottom: 20px; } }
            `}</style>
        </div>
    );
};

const styles = {
    // Styles are unchanged
    container: { fontFamily: "'Inter', sans-serif", padding: '24px', backgroundColor: '#f3f4f6', minHeight: '100vh' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' },
    title: { margin: 0, fontSize: '28px', fontWeight: 700, color: '#111827' },
    subtitle: { margin: '6px 0 0', color: '#6b7280', fontSize: '14px' },
    viewModeButtons: { display: 'flex', gap: '8px', backgroundColor: '#e5e7eb', padding: '4px', borderRadius: '8px' },
    toggleButton: { padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '14px', color: '#4b5563', display: 'flex', alignItems: 'center', borderRadius: '6px', transition: 'all 0.2s', fontWeight: 500 },
    toggleButtonActive: { padding: '8px 16px', border: 'none', background: '#fff', cursor: 'pointer', fontSize: '14px', color: '#1f2937', fontWeight: '600', display: 'flex', alignItems: 'center', borderRadius: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
    card: { background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
    controls: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '20px', paddingBottom: '20px', borderBottom: '2px solid #f3f4f6', marginBottom: '24px' },
    label: { fontWeight: 600, color: '#374151', display: 'block', marginBottom: '8px', fontSize: '13px' },
    input: { padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', minWidth: '200px' },
    button: { padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#2563eb', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: 600, gap: '8px', fontSize: '14px' },
    buttonDisabled: { padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#9ca3af', color: 'white', cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600 },
    tableContainer: { overflowX: 'auto', borderRadius: '8px', border: '1px solid #e5e7eb' },
    table: { width: '100%', borderCollapse: 'collapse', minWidth: '800px' },
    thead: { background: '#f9fafb' },
    th: { padding: '14px 16px', borderBottom: '2px solid #e5e7eb', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: '12px', textTransform: 'uppercase', whiteSpace: 'nowrap' },
    td: { padding: '14px 16px', borderBottom: '1px solid #f3f4f6', textAlign: 'left', verticalAlign: 'middle', fontSize: '14px', color: '#1f2937' },
    actualInput: { width: '100px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', textAlign: 'center' },
    promptContainer: { textAlign: 'center', padding: '60px 24px', color: '#6b7280' },
    promptTitle: { fontSize: '20px', fontWeight: 600, color: '#111827', marginTop: '16px' },
    promptText: { fontSize: '14px', marginTop: '8px', color: '#6b7280', maxWidth: '450px', margin: '8px auto 0' },
    footerControls: { paddingTop: '20px', marginTop: '20px', borderTop: '2px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end' },
    saveButton: { padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#10b981', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: 600, gap: '8px', fontSize: '14px' },
    reportWrapper: { marginBottom: '30px', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px' },
    reportHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
    deleteButton: { background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px', padding: '8px', borderRadius: '4px' },
};

export default StockOutBal;