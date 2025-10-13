import React, { useState, useEffect, useCallback } from 'react';
import { db, auth } from '../../firebase';
import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  orderBy,
  writeBatch,
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';
import { FaChartBar, FaPen, FaSpinner, FaCheckCircle, FaExclamationTriangle, FaTrash, FaClipboardList, FaFileAlt, FaSync } from 'react-icons/fa';

// --- Reusable Toast Notification Component & Hook ---
const Toast = ({ message, type, onDismiss }) => {
  const toastStyles = {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '12px 20px',
    borderRadius: '8px',
    color: 'white',
    fontWeight: 500,
    zIndex: 2000,
    boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
    animation: 'fadeInOut 4s ease-in-out',
    backgroundColor: type === 'success' ? '#2ecc71' : '#e74c3c',
  };
  
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3900);
    return () => clearTimeout(timer);
  }, [onDismiss]);
  
  return <div style={toastStyles}>{message}</div>;
};

const useToast = () => {
  const [toasts, setToasts] = useState([]);
  
  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);
  
  const dismissToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };
  
  const ToastContainer = () => (
    <>
      <style>{`@keyframes fadeInOut { 0%, 100% { opacity: 0; bottom: 0px; } 10%, 90% { opacity: 1; bottom: 20px; } }`}</style>
      {toasts.map(toast => (<Toast key={toast.id} {...toast} onDismiss={() => dismissToast(toast.id)} />))}
    </>
  );
  
  return { addToast, ToastContainer };
};

// --- Helper Functions ---
const toDateString = (date) => {
  if (typeof date === 'string') return date;
  return date.toISOString().split('T')[0];
};

const getNextDateString = (dateStr) => {
  const date = new Date(dateStr + 'T00:00:00');
  date.setDate(date.getDate() + 1);
  return toDateString(date);
};

// --- Daily Entry Component ---
const DailyEntryView = ({ selectedDate, selectedShift, addToast }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [reportData, setReportData] = useState([]);
    const [inputValues, setInputValues] = useState({});
    const [savingStatus, setSavingStatus] = useState({});
    const [loading, setLoading] = useState(false);
    const [hasGenerated, setHasGenerated] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [refreshing, setRefreshing] = useState(false);
    
    const ITEMS_PER_PAGE = 25;

    useEffect(() => {
        if (!selectedDate || !selectedShift) {
            setReportData([]);
            return;
        }
        
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        setLoading(true);

        const dateShiftId = `${uid}_${selectedDate}_${selectedShift}`;
        const balancesRef = collection(db, 'daily_balances', dateShiftId, 'items');
        const q = query(balancesRef, where('saved', '==', 'no'));

        const unsubscribe = onSnapshot(q, 
            (snapshot) => {
                const items = snapshot.docs.map(docSnap => ({ docId: docSnap.id, ...docSnap.data() }));
                setReportData(items.sort((a, b) => a.itemName.localeCompare(b.itemName)));
                setLoading(false);
                setHasGenerated(true);
            },
            (error) => {
                console.error("Error listening to daily balances:", error);
                addToast("Error loading data: " + error.message, "error");
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [selectedDate, selectedShift, addToast]);

    const handleGenerateReport = useCallback(async () => {
        if (!selectedDate || !selectedShift) {
            addToast("Please select date and shift", "error");
            return;
        }
        
        setRefreshing(true);
        
        const uid = auth.currentUser.uid;
        const startTimestamp = Timestamp.fromDate(new Date(selectedDate + 'T00:00:00'));
        const endTimestamp = Timestamp.fromDate(new Date(selectedDate + 'T23:59:59'));
        
        try {
            // ✅ CORRECTED PATH: Path is now valid and consistent.
            const dateShiftId = `${uid}_${selectedDate}_${selectedShift}`;
            const balancesRef = collection(db, 'daily_balances', dateShiftId, 'items');
            
            const existingSnap = await getDocs(balancesRef);
            const existingItems = new Map();
            existingSnap.forEach(docSnap => {
                const data = docSnap.data();
                existingItems.set(data.itemId, { docId: docSnap.id, ...data });
            });

            const stockOutRef = collection(db, uid, 'inventory', 'stock_out');
            const stockOutQuery = query(stockOutRef, where('createdAt', '>=', startTimestamp), where('createdAt', '<=', endTimestamp), where('type', '==', 'buySell'));
            
            const invoicesRef = collection(db, uid, 'invoices', 'invoice_list');
            const invoicesQuery = query(invoicesRef, where('createdAt', '>=', startTimestamp), where('createdAt', '<=', endTimestamp), where('shift', '==', selectedShift));

            const [stockOutSnap, invoicesSnap] = await Promise.all([ getDocs(stockOutQuery), getDocs(invoicesQuery) ]);
            
            const stockOutsById = new Map();
            const salesById = new Map();
            const itemMasterList = new Map();

            stockOutSnap.forEach(docSnap => {
                const data = docSnap.data();
                if (data.itemId) {
                    stockOutsById.set(data.itemId, (stockOutsById.get(data.itemId) || 0) + Number(data.quantity));
                    if (!itemMasterList.has(data.itemId)) itemMasterList.set(data.itemId, { id: data.itemId, name: data.item });
                }
            });

            invoicesSnap.forEach(docSnap => {
                docSnap.data().items?.forEach(item => {
                    if (item.itemId) {
                        salesById.set(item.itemId, (salesById.get(item.itemId) || 0) + Number(item.quantity));
                        if (!itemMasterList.has(item.itemId)) itemMasterList.set(item.itemId, { id: item.itemId, name: item.itemName });
                    }
                });
            });

            const batch = writeBatch(db);
            let newItemsCount = 0;
            let updatedItemsCount = 0;

            for (const [itemId, itemDetails] of itemMasterList) {
                if (!itemDetails.name) continue;

                const todayStockOut = stockOutsById.get(itemId) || 0;
                const saleQty = salesById.get(itemId) || 0;
                const existingItem = existingItems.get(itemId);
                
                if (existingItem) {
                    if (existingItem.saved === 'no') {
                        const openingBalance = existingItem.openingBalance || 0;
                        const totalAvailable = openingBalance + todayStockOut;
                        const calculatedBalance = openingBalance + todayStockOut - saleQty;
                        
                        const itemDocRef = doc(balancesRef, existingItem.docId);
                        batch.update(itemDocRef, {
                            stockOutQty: todayStockOut, saleQty, totalAvailable, calculatedBalance,
                            updatedAt: serverTimestamp()
                        });
                        updatedItemsCount++;
                    }
                } else {
                    const prevDate = toDateString(new Date(new Date(selectedDate).getTime() - 86400000));
                    const prevDateShiftId = `${uid}_${prevDate}_${selectedShift}`;
                    const prevItemDocRef = doc(db, 'daily_balances', prevDateShiftId, 'items', itemId);
                    const prevItemSnap = await getDoc(prevItemDocRef);
                    
                    const openingBalance = prevItemSnap.exists() ? (prevItemSnap.data().actualBalance > 0 ? prevItemSnap.data().actualBalance : 0) : 0;
                    const totalAvailable = openingBalance + todayStockOut;
                    const calculatedBalance = openingBalance + todayStockOut - saleQty;

                    if (openingBalance > 0 || todayStockOut > 0 || saleQty > 0) {
                        const newItemDocRef = doc(balancesRef, itemId);
                        batch.set(newItemDocRef, {
                            itemId, itemName: itemDetails.name, shift: selectedShift, date: selectedDate,
                            openingBalance, stockOutQty: todayStockOut, saleQty, totalAvailable, calculatedBalance,
                            actualBalance: null, shortage: null, saved: 'no',
                            createdAt: serverTimestamp(), updatedAt: serverTimestamp()
                        });
                        newItemsCount++;
                    }
                }
            }

            await batch.commit();
            
            if (newItemsCount > 0 || updatedItemsCount > 0) {
                addToast(`Generated ${newItemsCount} new, updated ${updatedItemsCount} items`, "success");
            } else {
                addToast("All items are up to date", "success");
            }

        } catch (error) {
            console.error("Error generating daily report: ", error);
            addToast("Failed to generate report: " + error.message, "error");
        } finally {
            setRefreshing(false);
        }
    }, [selectedDate, selectedShift, addToast]);
    
    useEffect(() => {
        setHasGenerated(false);
    }, [selectedDate, selectedShift]);

    const handleInputChange = (itemId, value) => {
        setInputValues(prev => ({ ...prev, [itemId]: value }));
        setSavingStatus(prev => ({ ...prev, [itemId]: null }));
    };
    
    const handleAutoSave = async (item, actualBalanceValue) => {
        const actualBalance = Number(actualBalanceValue);
        if (isNaN(actualBalance) || actualBalanceValue === '') {
            addToast("Please enter a valid number", "error");
            return;
        }
        
        setSavingStatus(prev => ({ ...prev, [item.itemId]: 'saving' }));
        
        const uid = auth.currentUser.uid;
        const user = JSON.parse(localStorage.getItem("internalLoggedInUser"));
        const shortage = item.calculatedBalance - actualBalance;
        
        try {
            const batch = writeBatch(db);

            // ✅ CORRECTED PATH: All paths are now valid and consistent.
            const currentDayDateShiftId = `${uid}_${selectedDate}_${selectedShift}`;
            const currentDayDocRef = doc(db, 'daily_balances', currentDayDateShiftId, 'items', item.itemId);
            batch.update(currentDayDocRef, {
                actualBalance, shortage, saved: 'yes',
                savedBy: user?.username || "Admin", savedAt: serverTimestamp(), updatedAt: serverTimestamp()
            });

            if (actualBalance > 0) {
                const nextDate = getNextDateString(selectedDate);
                const nextDayDateShiftId = `${uid}_${nextDate}_${selectedShift}`;
                const nextDayDocRef = doc(db, 'daily_balances', nextDayDateShiftId, 'items', item.itemId);
                
                batch.set(nextDayDocRef, {
                    itemId: item.itemId, itemName: item.itemName, shift: selectedShift, date: nextDate,
                    openingBalance: actualBalance, stockOutQty: 0, saleQty: 0,
                    totalAvailable: actualBalance, calculatedBalance: actualBalance,
                    actualBalance: null, shortage: null, saved: 'no',
                    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
                }, { merge: true });
            }

            const reportDocId = `${selectedDate}_${selectedShift}_${item.itemId}`;
            const reportRef = doc(db, uid, 'reports', 'stock_balance_reports', reportDocId);
            batch.set(reportRef, {
                reportDate: selectedDate, shift: selectedShift, itemId: item.itemId, itemName: item.itemName, 
                openingStock: item.openingBalance || 0, stockOutQty: item.stockOutQty || 0, saleQty: item.saleQty || 0, 
                calculatedBalance: item.calculatedBalance, actualBalance, shortage, 
                savedBy: user?.username || "Admin", savedAt: serverTimestamp(),
            });

            await batch.commit();
            setSavingStatus(prev => ({ ...prev, [item.itemId]: 'saved' }));
            addToast(`✓ ${item.itemName} saved successfully`, "success");
            
            setInputValues(prev => {
                const newValues = { ...prev };
                delete newValues[item.itemId];
                return newValues;
            });

        } catch (error) {
            console.error("Error saving item: ", item.itemName, error);
            setSavingStatus(prev => ({ ...prev, [item.itemId]: 'error' }));
            addToast(`Failed to save ${item.itemName}: ${error.message}`, 'error');
        }
    };
    
    const filteredData = reportData.filter(item => 
        item.itemName && item.itemName.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
    const paginatedData = filteredData.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    return (
        <div style={styles.card}>
            <div style={styles.controls}>
                <input type="text" placeholder="Search item in report..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{...styles.input, width: 300}} />
                <div style={styles.infoBox}><span style={styles.infoText}>📊 Showing {filteredData.length} pending item{filteredData.length !== 1 ? 's' : ''}</span></div>
            </div>
            
            {loading && reportData.length === 0 ? (
                 <div style={styles.promptContainer}><FaSpinner className="spinner" size={48} color="#9ca3af" /><h3 style={styles.promptTitle}>Loading Data...</h3></div>
            ) : !loading && reportData.length === 0 && hasGenerated ? (
                <div style={styles.promptContainer}><FaCheckCircle size={48} color="#22c55e" /><h3 style={styles.promptTitle}>All Items Saved or No Activity</h3><p style={styles.promptText}>No pending 'Buy & Sell' items found for this date and shift.</p></div>
            ) : reportData.length === 0 && !hasGenerated ? (
                 <div style={styles.promptContainer}><FaClipboardList size={48} color="#9ca3af" /><h3 style={styles.promptTitle}>Generate Daily Entry Report</h3><p style={styles.promptText}>Click "Generate / Refresh Report" to load today's items.</p></div>
            ) : (
                <>
                    <div style={styles.tableContainer}>
                        <table style={styles.table}>
                            <thead style={styles.thead}>
                                <tr>
                                    <th style={styles.th}>Item Name</th><th style={styles.th}>Opening Balance</th><th style={styles.th}>Stock Out (Today)</th>
                                    <th style={styles.th}>Total Available</th><th style={styles.th}>Sales (Today)</th><th style={styles.th}>Calculated Balance</th>
                                    <th style={styles.th}>Actual Qty</th><th style={styles.th}>Shortage/Excess</th><th style={styles.th}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedData.map(item => {
                                    const actual = inputValues[item.itemId] || '';
                                    const shortage = actual !== '' ? item.calculatedBalance - Number(actual) : '';
                                    const status = savingStatus[item.itemId];
                                    return (
                                        <tr key={item.itemId}>
                                            <td style={styles.td}><strong>{item.itemName}</strong></td><td style={styles.td}>{item.openingBalance || 0}</td>
                                            <td style={styles.td}>{item.stockOutQty || 0}</td><td style={styles.td}>{item.totalAvailable || 0}</td>
                                            <td style={styles.td}>{item.saleQty || 0}</td><td style={{...styles.td, fontWeight: 'bold', color: '#2563eb'}}>{item.calculatedBalance}</td>
                                            <td style={styles.td}><input type="number" style={styles.actualInput} value={actual} onChange={e => handleInputChange(item.itemId, e.target.value)} onBlur={e => handleAutoSave(item, e.target.value)} onKeyPress={e => {if (e.key === 'Enter') {handleAutoSave(item, e.target.value);}}} placeholder="Enter qty" disabled={status === 'saving'}/></td>
                                            <td style={{...styles.td, color: shortage > 0 ? '#ef4444' : (shortage < 0 ? '#3b82f6' : '#22c55e'), fontWeight: 'bold'}}>{shortage !== '' ? shortage : '-'}</td>
                                            <td style={styles.tdStatus}>{status === 'saving' && (<FaSpinner className="spinner" title="Saving..." />)}{status === 'saved' && (<FaCheckCircle style={{ color: '#22c55e' }} title="Saved" />)}{status === 'error' && (<FaExclamationTriangle style={{ color: '#ef4444' }} title="Error!" />)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {totalPages > 1 && (<div style={styles.pagination}><button onClick={() => setCurrentPage(p => Math.max(1, p-1))} disabled={currentPage === 1} style={currentPage === 1 ? styles.paginationButtonDisabled : styles.paginationButton}>Previous</button><span style={styles.paginationInfo}>Page {currentPage} of {totalPages}</span><button onClick={() => setCurrentPage(p => Math.min(totalPages, p+1))} disabled={currentPage === totalPages} style={currentPage === totalPages ? styles.paginationButtonDisabled : styles.paginationButton}>Next</button></div>)}
                </>
            )}
            
            <div style={styles.generateButtonContainer}>
                <button onClick={handleGenerateReport} disabled={refreshing || !selectedDate || !selectedShift} style={refreshing || !selectedDate || !selectedShift ? styles.buttonDisabled : styles.button}>
                    {refreshing ? <FaSpinner className="spinner" /> : <FaSync />}
                    {refreshing ? 'Refreshing...' : 'Generate / Refresh Report'}
                </button>
            </div>
        </div>
    );
};


// --- Shortage Report View Component ---
const ShortageReportView = ({ addToast, onViewChange }) => {
    const [reportDate, setReportDate] = useState(toDateString(new Date()));
    const [selectedShift, setSelectedShift] = useState("");
    const [availableShifts, setAvailableShifts] = useState([]);
    const [shortageReport, setShortageReport] = useState([]);
    const [loading, setLoading] = useState(false);
    const [hasGenerated, setHasGenerated] = useState(false);

    useEffect(() => {
        const fetchShifts = async () => {
            const user = auth.currentUser;
            if (!user) return;
            const settingsRef = doc(db, user.uid, "settings");
            const settingsSnap = await getDoc(settingsRef);
            if (settingsSnap.exists()) {
                const shifts = settingsSnap.data().productionShifts || [];
                setAvailableShifts(shifts);
                if (shifts.length > 0) {
                    setSelectedShift(shifts[0]);
                }
            }
        };
        fetchShifts();
    }, []);

    const handleGenerateReport = useCallback(async () => {
        if (!reportDate || !selectedShift) {
            addToast("Please select date and shift", "error");
            return;
        }
        setLoading(true);
        setHasGenerated(true);
        setShortageReport([]);
        const uid = auth.currentUser.uid;
        const reportsRef = collection(db, uid, 'reports', 'stock_balance_reports');
        const q = query(reportsRef, where('reportDate', '==', reportDate), where('shift', '==', selectedShift), orderBy('itemName', 'asc'));
        try {
            const snap = await getDocs(q);
            const data = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
            setShortageReport(data);
            if (data.length === 0) {
                addToast("No saved reports found for the selected date and shift.", "error");
            } else {
                addToast(`Loaded ${data.length} report entries`, "success");
            }
        } catch (error) {
            console.error("Error generating shortage report: ", error);
            addToast("Failed to generate report. Check Firestore index.", "error");
        } finally {
            setLoading(false);
        }
    }, [reportDate, selectedShift, addToast]);

    useEffect(() => {
        setHasGenerated(false);
        setShortageReport([]);
    }, [reportDate, selectedShift]);
    
    const handleDeleteReport = async (report) => {
        if (!window.confirm(`Delete entry for "${report.itemName}"? This will make it editable again.`)) { return; }
        try {
            const uid = auth.currentUser.uid;
            const batch = writeBatch(db);
            const reportRef = doc(db, uid, 'reports', 'stock_balance_reports', report.id);
            batch.delete(reportRef);
            
            const dateShiftId = `${uid}_${report.reportDate}_${report.shift}`;
            const balanceDocRef = doc(db, 'daily_balances', dateShiftId, 'items', report.itemId);
            batch.update(balanceDocRef, {
                saved: 'no', actualBalance: null, shortage: null,
                savedBy: null, savedAt: null, updatedAt: serverTimestamp()
            });
            await batch.commit();
            setShortageReport(prev => prev.filter(r => r.id !== report.id));
            addToast("Report entry deleted successfully.", "success");
        } catch (error) {
            console.error("Error deleting report entry: ", error);
            addToast("Failed to delete report entry: " + error.message, "error");
        }
    };

    return (
        <div style={styles.card}>
            <div style={styles.controls}>
                <div><label style={styles.label}>Select Report Date:</label><input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} style={styles.input} /></div>
                <div><label style={styles.label}>Shift:</label><select value={selectedShift} onChange={e => setSelectedShift(e.target.value)} style={styles.input}><option value="">Select Shift</option>{availableShifts.map(s => (<option key={s} value={s}>{s}</option>))}</select></div>
                <button onClick={handleGenerateReport} disabled={loading || !reportDate || !selectedShift} style={loading || !reportDate || !selectedShift ? styles.buttonDisabled : styles.button}>{loading ? <FaSpinner className="spinner" /> : <FaFileAlt />}{loading ? 'Loading...' : 'View Report'}</button>
            </div>
            
            {!hasGenerated ? (
                <div style={styles.promptContainer}><FaFileAlt size={48} color="#9ca3af" /><h3 style={styles.promptTitle}>View Finalized Reports</h3><p style={styles.promptText}>Select a date and shift, then click "View Report" to see saved records.</p></div>
            ) : loading ? (
                 <div style={styles.tableContainer}><table style={styles.table}><tbody><tr><td colSpan="9" style={styles.noData}><FaSpinner className="spinner" style={{marginRight: '8px'}} />Loading Report...</td></tr></tbody></table></div>
            ) : shortageReport.length > 0 ? (
                <div style={styles.tableContainer}>
                    <div style={styles.reportSummary}><span>📋 Total Entries: <strong>{shortageReport.length}</strong></span><span>🔴 Shortages: <strong>{shortageReport.filter(r => r.shortage > 0).length}</strong></span><span>🔵 Excess: <strong>{shortageReport.filter(r => r.shortage < 0).length}</strong></span></div>
                    <table style={styles.table}>
                        <thead style={styles.thead}><tr><th style={styles.th}>Item Name</th><th style={styles.th}>Opening</th><th style={styles.th}>Stock Out</th><th style={styles.th}>Sales</th><th style={styles.th}>Calculated</th><th style={styles.th}>Actual</th><th style={styles.th}>Shortage/Excess</th><th style={styles.th}>Saved By</th><th style={styles.th}>Actions</th></tr></thead>
                        <tbody>
                            {shortageReport.map((report) => (
                                <tr key={report.id}>
                                    <td style={styles.td}><strong>{report.itemName}</strong></td><td style={styles.td}>{report.openingStock || 0}</td><td style={styles.td}>{report.stockOutQty || 0}</td>
                                    <td style={styles.td}>{report.saleQty || 0}</td><td style={styles.td}>{report.calculatedBalance}</td><td style={styles.td}>{report.actualBalance}</td>
                                    <td style={{...styles.td, color: report.shortage > 0 ? '#ef4444' : (report.shortage < 0 ? '#3b82f6' : '#22c55e'), fontWeight: 'bold', fontSize: '15px'}}>{report.shortage > 0 ? `-${report.shortage}` : report.shortage < 0 ? `+${Math.abs(report.shortage)}` : '0'}</td>
                                    <td style={styles.td}>{report.savedBy || 'N/A'}</td>
                                    <td style={styles.td}><button onClick={() => handleDeleteReport(report)} style={styles.deleteButton} title="Delete and make editable again"><FaTrash /></button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                 <div style={styles.promptContainer}><FaClipboardList size={48} color="#9ca3af" /><h3 style={styles.promptTitle}>No Reports Found</h3><p style={styles.promptText}>There are no saved report entries for the selected date and shift.</p></div>
            )}
        </div>
    );
};


// --- Main Orchestrator Component ---
const StockOutBal = () => {
    const [viewMode, setViewMode] = useState('entry');
    const [selectedDate, setSelectedDate] = useState(toDateString(new Date()));
    const [selectedShift, setSelectedShift] = useState("");
    const [availableShifts, setAvailableShifts] = useState([]);
    const { addToast, ToastContainer } = useToast();

    useEffect(() => {
        const fetchShifts = async () => {
            const user = auth.currentUser;
            if (!user) return;
            const settingsRef = doc(db, user.uid, "settings");
            const settingsSnap = await getDoc(settingsRef);
            if (settingsSnap.exists()) {
                const shifts = settingsSnap.data().productionShifts || [];
                setAvailableShifts(shifts);
                if (shifts.length > 0 && !selectedShift) {
                    setSelectedShift(shifts[0]);
                }
            }
        };
        fetchShifts();
    }, [selectedShift]);

    const handleViewChange = (mode, date) => {
        if (date) setSelectedDate(date);
        setViewMode(mode);
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div><h2 style={styles.title}>Daily Stock & Sales Balance</h2><p style={styles.subtitle}>Real-time balance tracking with automatic next-day opening balance creation.</p></div>
                <div style={styles.viewModeButtons}><button onClick={() => setViewMode('entry')} style={viewMode === 'entry' ? styles.toggleButtonActive : styles.toggleButton}><FaPen style={{marginRight: 8}} /> Daily Entry</button><button onClick={() => setViewMode('report')} style={viewMode === 'report' ? styles.toggleButtonActive : styles.toggleButton}><FaChartBar style={{marginRight: 8}} /> View Reports</button></div>
            </div>
            
            {viewMode === 'entry' && (
                 <div style={styles.dateControlContainer}>
                    <div><label style={styles.label}>Select Entry Date:</label><input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={styles.input} max={toDateString(new Date(Date.now() + 86400000))}/></div>
                    <div><label style={styles.label}>Shift:</label><select value={selectedShift} onChange={e => setSelectedShift(e.target.value)} style={styles.input}><option value="">Select Shift</option>{availableShifts.map(s => (<option key={s} value={s}>{s}</option>))}</select></div>
                 </div>
            )}
            
            {viewMode === 'entry' && (<DailyEntryView selectedDate={selectedDate} selectedShift={selectedShift} addToast={addToast} />)}
            {viewMode === 'report' && (<ShortageReportView addToast={addToast} onViewChange={handleViewChange} />)}
            
            <ToastContainer />
            <style>{`.spinner { animation: spin 1s linear infinite; display: inline-block; } @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
    );
};

const styles = {
    container: { fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", padding: '24px', backgroundColor: '#f3f4f6', minHeight: '100vh' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' },
    title: { margin: 0, fontSize: '28px', fontWeight: 700, color: '#111827', letterSpacing: '-0.5px' },
    subtitle: { margin: '6px 0 0', color: '#6b7280', fontSize: '14px', lineHeight: '1.5' },
    dateControlContainer: { marginBottom: '20px', display: 'flex', alignItems: 'flex-end', gap: '20px', flexWrap: 'wrap', backgroundColor: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)' },
    viewModeButtons: { display: 'flex', gap: '8px', backgroundColor: '#f9fafb', padding: '4px', borderRadius: '8px' },
    toggleButton: { padding: '10px 18px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '14px', color: '#6b7280', display: 'flex', alignItems: 'center', borderRadius: '6px', transition: 'all 0.2s', fontWeight: 500 },
    toggleButtonActive: { padding: '10px 18px', border: 'none', background: '#fff', cursor: 'pointer', fontSize: '14px', color: '#2563eb', fontWeight: '600', display: 'flex', alignItems: 'center', borderRadius: '6px', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)' },
    card: { background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)' },
    controls: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', paddingBottom: '20px', borderBottom: '2px solid #f3f4f6' },
    label: { fontWeight: 600, color: '#374151', display: 'block', marginBottom: '8px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' },
    input: { padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', minWidth: '180px', backgroundColor: '#fff', transition: 'all 0.2s' },
    button: { padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#2563eb', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: 600, gap: '8px', transition: 'all 0.2s', fontSize: '14px', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' },
    buttonDisabled: { padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#9ca3af', color: 'white', cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, opacity: 0.6 },
    tableContainer: { overflowX: 'auto', marginTop: '24px', borderRadius: '8px', border: '1px solid #e5e7eb' },
    table: { width: '100%', borderCollapse: 'collapse', minWidth: '1000px' },
    thead: { position: 'sticky', top: 0, zIndex: 10, background: '#f9fafb' },
    th: { padding: '14px 16px', background: '#f9fafb', borderBottom: '2px solid #e5e7eb', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: '12px', textTransform: 'uppercase', whiteSpace: 'nowrap', letterSpacing: '0.5px' },
    td: { padding: '14px 16px', borderBottom: '1px solid #f3f4f6', textAlign: 'left', verticalAlign: 'middle', fontSize: '14px', color: '#1f2937' },
    tdStatus: { padding: '14px 16px', borderBottom: '1px solid #f3f4f6', textAlign: 'center', verticalAlign: 'middle', fontSize: '18px' },
    actualInput: { width: '100px', padding: '10px 12px', border: '2px solid #e5e7eb', borderRadius: '6px', textAlign: 'center', fontSize: '14px', fontWeight: 600, transition: 'all 0.2s' },
    skeleton: { backgroundColor: '#e5e7eb', height: '20px', borderRadius: '4px', animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite' },
    pagination: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '16px', paddingTop: '20px', fontSize: '14px', marginTop: '16px', borderTop: '2px solid #f3f4f6' },
    paginationButton: { padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px', color: '#374151', fontWeight: 500, transition: 'all 0.2s' },
    paginationButtonDisabled: { padding: '8px 16px', border: '1px solid #e5e7eb', borderRadius: '6px', background: '#f9fafb', cursor: 'not-allowed', fontSize: '14px', color: '#9ca3af', fontWeight: 500 },
    paginationInfo: { color: '#6b7280', fontWeight: 500 },
    deleteButton: { background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px', padding: '6px 10px', borderRadius: '4px', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    promptContainer: { textAlign: 'center', padding: '80px 24px', color: '#6b7280' },
    promptTitle: { fontSize: '20px', fontWeight: 600, color: '#111827', marginTop: '16px', marginBottom: '8px' },
    promptText: { fontSize: '14px', marginTop: '8px', color: '#6b7280', lineHeight: '1.6' },
    generateButtonContainer: { paddingTop: '24px', marginTop: '24px', borderTop: '2px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end' },
    noData: { padding: '60px 24px', textAlign: 'center', color: '#6b7280', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    infoBox: { backgroundColor: '#eff6ff', padding: '10px 16px', borderRadius: '8px', border: '1px solid #bfdbfe' },
    infoText: { fontSize: '14px', color: '#1e40af', fontWeight: 500 },
    reportSummary: { display: 'flex', gap: '24px', padding: '16px', backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb', fontSize: '14px', fontWeight: 500, color: '#374151', flexWrap: 'wrap' }
};

const styleSheet = document.createElement("style");
styleSheet.innerText = ` @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } } input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { opacity: 1; } input[type="number"]:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); } button:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); } button:active:not(:disabled) { transform: translateY(0); } table tbody tr:hover { background-color: #f9fafb; } `;
document.head.appendChild(styleSheet);

export default StockOutBal;