// src/pages/tabs/ProductionBalance.js
import React, { useEffect, useState } from "react";
import { db, auth } from "../../firebase";
import { collection, getDocs, query, where, doc, getDoc, Timestamp } from "firebase/firestore";
import { AiOutlineReload } from "react-icons/ai";

const ProductionBalance = () => {
    const [loading, setLoading] = useState(true);
    const [balanceData, setBalanceData] = useState([]);
    const [availableShifts, setAvailableShifts] = useState([]);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedShift, setSelectedShift] = useState("");

    useEffect(() => {
        const user = auth.currentUser;
        if (!user) return;
        const uid = user.uid;

        // Fetch available shifts from settings
        const fetchShifts = async () => {
            const settingsRef = doc(db, uid, "settings");
            const settingsSnap = await getDoc(settingsRef);
            if (settingsSnap.exists()) {
                const shifts = settingsSnap.data().productionShifts || [];
                setAvailableShifts(shifts);
                if (shifts.length > 0) {
                    setSelectedShift(shifts[0]); // Default to the first shift
                }
            }
        };
        fetchShifts();
    }, []);

    const fetchBalanceData = async () => {
        const user = auth.currentUser;
        if (!user || !selectedDate || !selectedShift) {
            setBalanceData([]);
            return;
        };

        setLoading(true);
        try {
            const uid = user.uid;
            const startOfDay = new Date(selectedDate);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(selectedDate);
            endOfDay.setHours(23, 59, 59, 999);
            
            const startTimestamp = Timestamp.fromDate(startOfDay);
            const endTimestamp = Timestamp.fromDate(endOfDay);

            // ✅ 1. Fetch Master List of 'ourProduct' items first to create a filter
            const itemsColRef = collection(db, uid, "items", "item_list");
            const itemsQuery = query(itemsColRef, where("type", "==", "ourProduct"));
            const itemsSnap = await getDocs(itemsQuery);
            const itemNameMap = new Map();
            const ourProductIds = new Set();
            itemsSnap.docs.forEach(doc => {
                itemNameMap.set(doc.id, doc.data().name);
                ourProductIds.add(doc.id);
            });

            // If no products are defined, no need to query further.
            if (ourProductIds.size === 0) {
                setBalanceData([]);
                setLoading(false);
                return;
            }

            // 2. Fetch Production Data for date and shift
            const prodColRef = collection(db, uid, "production", "production_records");
            const prodQuery = query(prodColRef, 
                where("productionDate", ">=", startTimestamp), 
                where("productionDate", "<=", endTimestamp),
                where("shift", "==", selectedShift)
            );
            const prodSnap = await getDocs(prodQuery);
            const productionMap = new Map();
            prodSnap.docs.forEach(doc => {
                const items = doc.data().lineItems || [];
                items.forEach(item => {
                    // ✅ Filter: Only count if the item is one of 'ourProduct's
                    if (ourProductIds.has(item.id)) {
                        const currentQty = productionMap.get(item.id) || 0;
                        productionMap.set(item.id, currentQty + (Number(item.quantity) || 0));
                    }
                });
            });

            // 3. Fetch Invoice (Billed) Data for date and shift
            // This captures invoices that explicitly have a shift assigned
            const invColRef = collection(db, uid, "invoices", "invoice_list");
            const invQuery = query(invColRef, 
                where("createdAt", ">=", startTimestamp), 
                where("createdAt", "<=", endTimestamp),
                where("shift", "==", selectedShift)
            );
            const invSnap = await getDocs(invQuery);
            const billedMap = new Map();
            invSnap.docs.forEach(doc => {
                const items = doc.data().items || [];
                items.forEach(item => {
                    // Items in invoices might use 'itemId' or 'id' depending on source
                    const itemId = item.itemId || item.id;
                    if (ourProductIds.has(itemId)) {
                        const currentQty = billedMap.get(itemId) || 0;
                        billedMap.set(itemId, currentQty + (Number(item.quantity) || 0));
                    }
                });
            });

            // ✅ 3.5 Fetch Orders (NEW ADDITION)
            // Orders from the Orders page usually don't have a shift, so we fetch by Date
            const ordersColRef = collection(db, uid, "data", "orders");
            const ordersQuery = query(ordersColRef, 
                where("createdAt", ">=", startTimestamp), 
                where("createdAt", "<=", endTimestamp)
            );
            const ordersSnap = await getDocs(ordersQuery);
            ordersSnap.docs.forEach(doc => {
                const items = doc.data().items || [];
                items.forEach(item => {
                    // Check both itemId and id to be safe
                    const itemId = item.itemId || item.id;
                    if (ourProductIds.has(itemId)) {
                        const currentQty = billedMap.get(itemId) || 0;
                        billedMap.set(itemId, currentQty + (Number(item.quantity) || 0));
                    }
                });
            });
            
            // 4. Merge and Calculate Balance
            const allItemIds = new Set([...productionMap.keys(), ...billedMap.keys()]);
            const finalData = Array.from(allItemIds).map(itemId => {
                const productionQty = productionMap.get(itemId) || 0;
                const billedQty = billedMap.get(itemId) || 0;
                const difference = productionQty - billedQty;
                
                let status = `(${Math.abs(difference)} ${difference > 0 ? 'Excess' : 'Shortage'})`;
                if (difference === 0) status = "(Balanced)";

                return {
                    id: itemId,
                    itemName: itemNameMap.get(itemId) || 'Unknown Item',
                    productionQty,
                    billedQty,
                    difference,
                    status
                };
            }).sort((a, b) => a.itemName.localeCompare(b.itemName)); // Sort alphabetically

            setBalanceData(finalData);

        } catch (error) {
            console.error("Error fetching balance data:", error);
            alert("Error fetching balance data. A Firestore index might be required. See console for details.");
        }
        setLoading(false);
    };
    
    // Fetch data when date or shift changes
    useEffect(() => {
        fetchBalanceData();
    }, [selectedDate, selectedShift]);

    const getRowStyle = (item) => {
        if (item.billedQty > item.productionQty) return styles.yellowRow; // Shortage
        if (item.billedQty < item.productionQty) return styles.redRow;   // Excess
        if (item.billedQty === item.productionQty && item.productionQty > 0) return styles.greenRow; // Balanced
        return {};
    };

    return (
        <div style={styles.container}>
            <div style={styles.headerContainer}>
                <h2 style={styles.header}>Production Balance Report</h2>
                <p style={styles.subHeader}>Compare produced vs. billed items for a specific date and shift.</p>
            </div>
            <div style={styles.controlsContainer}>
                <div style={styles.formGroup}><label>Date</label><input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={styles.input}/></div>
                <div style={styles.formGroup}><label>Shift</label><select value={selectedShift} onChange={e => setSelectedShift(e.target.value)} style={styles.input}><option value="">Select Shift</option>{availableShifts.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                <button style={styles.refreshButton} onClick={fetchBalanceData}><AiOutlineReload/> Refresh</button>
            </div>

            <div style={styles.tableContainer}>
                {loading ? (
                    <p style={{padding:'20px'}}>Loading report...</p>
                ) : (
                    <table style={styles.table}>
                        <thead><tr><th style={styles.th}>Item Name</th><th style={styles.th}>Production Qty</th><th style={styles.th}>Billed Qty</th><th style={styles.th}>Difference</th><th style={styles.th}>Status</th></tr></thead>
                        <tbody>
                            {balanceData.map(item => (
                                <tr key={item.id} style={getRowStyle(item)}>
                                    <td style={styles.td}>{item.itemName}</td>
                                    <td style={styles.td}>{item.productionQty}</td>
                                    <td style={styles.td}>{item.billedQty}</td>
                                    <td style={styles.td}>{item.difference > 0 ? `+${item.difference}` : item.difference}</td>
                                    <td style={styles.td}>{item.status}</td>
                                </tr>
                            ))}
                            {balanceData.length === 0 && <tr><td colSpan="5" style={{textAlign: 'center', padding: '20px'}}>No 'Our Product' items found with production or sales activity for the selected date and shift.</td></tr>}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

const styles = {
    container: { padding: '24px', fontFamily: "'Inter', sans-serif" },
    headerContainer: { marginBottom: '20px' },
    header: { fontSize: '24px', fontWeight: '600' },
    subHeader: { color: '#6c757d' },
    controlsContainer: { display: 'flex', gap: '16px', alignItems: 'flex-end', marginBottom: '20px', padding: '16px', backgroundColor: '#fff', borderRadius: '8px' },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
    input: { padding: '10px', borderRadius: '6px', border: '1px solid #ddd' },
    refreshButton: { padding: '10px 16px', border: 'none', backgroundColor: '#3498db', color: 'white', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' },
    tableContainer: { backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', overflow: 'hidden' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { padding: '12px', textAlign: 'left', backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6', fontWeight: '600' },
    td: { padding: '12px', borderBottom: '1px solid #dee2e6' },
    greenRow: { backgroundColor: '#e6ffed' },
    redRow: { backgroundColor: '#fff1f0' },
    yellowRow: { backgroundColor: '#fffbe6' },
};

export default ProductionBalance;