import React, { useEffect, useState, useRef } from "react";
import { db, auth } from "../../firebase";
import { collection, addDoc, getDocs, query, doc, getDoc, serverTimestamp, where, deleteDoc } from "firebase/firestore";
import { AiOutlinePlus, AiOutlineDelete } from "react-icons/ai";
import Select from "react-select";

const AddProduction = ({ internalUser }) => {
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false); // 💡 1. New state for save loading
    const [shifts, setShifts] = useState([]);
    const [allItems, setAllItems] = useState([]);
    const [productionRecords, setProductionRecords] = useState([]);
    const [filteredRecords, setFilteredRecords] = useState([]);
    const [productionDate, setProductionDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedShift, setSelectedShift] = useState("");
    const [stagedItems, setStagedItems] = useState([]);
    const [currentItem, setCurrentItem] = useState(null);
    const [currentQty, setCurrentQty] = useState("");
    const [filterDate, setFilterDate] = useState("");
    const [filterShift, setFilterShift] = useState("");
    const quantityInputRef = useRef(null);
    const itemSelectRef = useRef(null);

    const getCurrentInternal = () => {
        try {
            const stored = localStorage.getItem("internalLoggedInUser");
            return stored ? JSON.parse(stored) : null;
        } catch (e) { return null; }
    };
    const isAdmin = getCurrentInternal()?.isAdmin === true;

    useEffect(() => {
        const user = auth.currentUser;
        if (!user) return;
        const uid = user.uid;

        const fetchData = async () => {
            setLoading(true);
            try {
                const settingsRef = doc(db, uid, "settings");
                const settingsSnap = await getDoc(settingsRef);
                if (settingsSnap.exists()) {
                    setShifts(settingsSnap.data().productionShifts || []);
                }

                const itemsColRef = collection(db, uid, "items", "item_list");
                const itemsQuery = query(itemsColRef, where("type", "==", "ourProduct"));
                const itemsSnap = await getDocs(itemsQuery);
                const itemsData = itemsSnap.docs.map(d => ({
                    value: d.id, label: `${d.data().name} (SKU: ${d.data().sku || 'N/A'})`,
                    id: d.id, name: d.data().name, sku: d.data().sku || 'N/A',
                }));
                setAllItems(itemsData);

                const prodColRef = collection(db, uid, "production", "production_records");
                const prodSnap = await getDocs(query(prodColRef));
                const recordsData = prodSnap.docs
                    .map(d => ({ 
                        id: d.id, 
                        ...d.data(),
                        productionDate: d.data().productionDate.toDate(),
                        createdAt: d.data().createdAt?.toDate() 
                    }))
                    .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
                setProductionRecords(recordsData);
                setFilteredRecords(recordsData);

            } catch (error) {
                alert("Error fetching initial data: " + error.message);
            }
            setLoading(false);
        };
        fetchData();
    }, []);

    useEffect(() => {
        let records = [...productionRecords];
        if (filterDate) {
            records = records.filter(r => r.productionDate.toISOString().split('T')[0] === filterDate);
        }
        if (filterShift) {
            records = records.filter(r => r.shift === filterShift);
        }
        setFilteredRecords(records);
    }, [filterDate, filterShift, productionRecords]);

    const handleAddItemToStage = () => {
        if (!currentItem || !currentQty || Number(currentQty) <= 0) {
            alert("Please select a valid item and enter a quantity greater than 0.");
            return;
        }
        setStagedItems([...stagedItems, { ...currentItem, quantity: Number(currentQty) }]);
        setCurrentItem(null);
        setCurrentQty("");
        itemSelectRef.current?.focus();
    };

    const handleInputKeyDown = (e) => {
        if (e.key === 'Enter' && e.target.name === 'quantity') {
            e.preventDefault();
            handleAddItemToStage();
        }
    };
    
    const handleSelectKeyDown = (e) => {
        if (e.key === 'Enter' && currentItem) {
            e.preventDefault();
            quantityInputRef.current?.focus();
        }
    };
    
    const handleDeleteStagedItem = (indexToDelete) => {
        setStagedItems(stagedItems.filter((_, index) => index !== indexToDelete));
    };

    const handleSaveProduction = async () => {
        if (!productionDate || !selectedShift || stagedItems.length === 0) {
            alert("Please select a date, shift, and add at least one item.");
            return;
        }
        const user = auth.currentUser;
        if (!user) {
            alert("You are not logged in.");
            return;
        }

        setIsSaving(true); // 💡 2. Set loading to true before starting
        try {
            const addedBy = internalUser?.username || "Admin";
            const prodColRef = collection(db, user.uid, "production", "production_records");
            
            const newRecordData = {
                productionDate: new Date(productionDate),
                shift: selectedShift,
                lineItems: stagedItems.map(({ value, label, ...item }) => item),
                addedBy,
                createdAt: serverTimestamp(),
            };

            const docRef = await addDoc(prodColRef, newRecordData);
            
            const newRecordForState = {
                ...newRecordData,
                id: docRef.id,
                createdAt: new Date()
            }
            setProductionRecords(prev => [newRecordForState, ...prev]);

            setStagedItems([]);
            setSelectedShift("");
            alert("Production run saved successfully!");

        } catch (error) {
            alert("Error saving production: " + error.message);
        } finally {
            setIsSaving(false); // 💡 3. Set loading to false after completion (success or fail)
        }
    };
    
    const handleDeleteProduction = async (recordId) => {
        if (!window.confirm("Are you sure you want to delete this production record? This cannot be undone.")) return;
        const user = auth.currentUser;
        if (!user) return;
        
        try {
            const docRef = doc(db, user.uid, "production", "production_records", recordId);
            await deleteDoc(docRef);
            // 💡 4. This line correctly filters the state, causing the list to update automatically.
            setProductionRecords(prev => prev.filter(rec => rec.id !== recordId));
            alert("Record deleted.");
        } catch(error) {
            alert("Error deleting record: " + error.message);
        }
    };

    if (loading) return <p>Loading Production Data...</p>;

    return (
        <div style={styles.container}>
            <div style={styles.formContainer}>
                <div style={styles.headerControls}>
                    <div style={styles.formGroup}><label>Production Date</label><input type="date" value={productionDate} onChange={e => setProductionDate(e.target.value)} style={styles.input}/></div>
                    <div style={styles.formGroup}><label>Shift</label><select value={selectedShift} onChange={e => setSelectedShift(e.target.value)} style={styles.input}><option value="">Select Shift</option>{shifts.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                </div>
                <div style={styles.itemEntry}>
                    <div style={{flex: 3}}><Select ref={itemSelectRef} options={allItems} value={currentItem} onChange={setCurrentItem} onKeyDown={handleSelectKeyDown} placeholder="Type or select a product to add..."/></div>
                    <div style={{flex: 1}}><input ref={quantityInputRef} name="quantity" type="number" placeholder="Production Qty" value={currentQty} onChange={e => setCurrentQty(e.target.value)} onKeyDown={handleInputKeyDown} style={styles.input}/></div>
                    <button onClick={handleAddItemToStage} style={styles.addButton}>Add</button>
                </div>
            </div>

            {stagedItems.length > 0 && (
                <div style={styles.stagingContainer}>
                    <h4>Items in this Production Run</h4>
                    <table style={styles.table}><thead style={styles.thead}><tr><th style={styles.th}>Product Name</th><th style={styles.th}>SKU</th><th style={styles.th}>Quantity</th><th style={styles.th}>Action</th></tr></thead>
                        <tbody>
                            {stagedItems.map((item, index) => (
                                <tr key={index}><td style={styles.td}>{item.name}</td><td style={styles.td}>{item.sku}</td><td style={styles.td}>{item.quantity}</td><td style={styles.td}><button onClick={() => handleDeleteStagedItem(index)} style={styles.deleteBtn}><AiOutlineDelete/></button></td></tr>
                            ))}
                        </tbody>
                    </table>
                    {/* 💡 5. Update save button to be disabled and show loading text when saving */}
                    <div style={{textAlign: 'right', marginTop: '16px'}}>
                        <button onClick={handleSaveProduction} style={styles.saveButton} disabled={isSaving}>
                            {isSaving ? 'Saving...' : 'Save Production Run'}
                        </button>
                    </div>
                </div>
            )}
            
            <hr style={styles.hr}/>

            <div style={styles.historyContainer}>
                <h3>Production History</h3>
                <div style={styles.filters}>
                    <div style={styles.formGroup}><label>Filter by Date</label><input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={styles.input}/></div>
                    <div style={styles.formGroup}><label>Filter by Shift</label><select value={filterShift} onChange={e => setFilterShift(e.target.value)} style={styles.input}><option value="">All Shifts</option>{shifts.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                </div>
                <table style={styles.table}>
                    <thead style={styles.thead}>
                        <tr>
                            <th style={styles.th}>Date</th>
                            <th style={styles.th}>Shift</th>
                            <th style={styles.th}>Product Name</th>
                            <th style={styles.th}>Quantity</th>
                            <th style={styles.th}>Added By</th>
                            {isAdmin && <th style={styles.th}>Action</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRecords.length > 0 ? (
                            filteredRecords.flatMap((rec) => 
                                rec.lineItems.map((item, itemIndex) => (
                                    <tr key={`${rec.id}-${itemIndex}`}>
                                        {itemIndex === 0 && (
                                            <>
                                                <td style={styles.td} rowSpan={rec.lineItems.length}>{rec.productionDate.toLocaleDateString()}</td>
                                                <td style={styles.td} rowSpan={rec.lineItems.length}>{rec.shift}</td>
                                            </>
                                        )}
                                        <td style={styles.td}>{item.name}</td>
                                        <td style={styles.td}>{item.quantity}</td>
                                        {itemIndex === 0 && (
                                            <>
                                                <td style={styles.td} rowSpan={rec.lineItems.length}>{rec.addedBy}</td>
                                                {isAdmin && <td style={styles.td} rowSpan={rec.lineItems.length}><button onClick={() => handleDeleteProduction(rec.id)} style={styles.deleteBtn}><AiOutlineDelete/></button></td>}
                                            </>
                                        )}
                                    </tr>
                                ))
                            )
                        ) : (
                            <tr><td colSpan={isAdmin ? 6 : 5} style={{textAlign: 'center', padding: '16px'}}>No production records found.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const styles = {
    container: { padding: '24px', fontFamily: "'Inter', sans-serif" },
    formContainer: { backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', marginBottom: '24px' },
    headerControls: { display: 'flex', gap: '20px', marginBottom: '20px' },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 },
    input: { padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' },
    itemEntry: { display: 'flex', gap: '10px', alignItems: 'center' },
    addButton: { padding: '10px 20px', border: 'none', background: '#3498db', color: 'white', borderRadius: '6px', cursor: 'pointer' },
    stagingContainer: { marginTop: '24px', backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px' },
    table: { width: '100%', borderCollapse: 'collapse' },
    thead: { backgroundColor: '#e9ecef' },
    th: { padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' },
    td: { padding: '12px', borderBottom: '1px solid #dee2e6', verticalAlign: 'top' },
    deleteBtn: { background: 'transparent', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '16px' },
    saveButton: { 
        padding: '12px 24px', 
        border: 'none', 
        background: '#2ecc71', 
        color: 'white', 
        borderRadius: '6px', 
        cursor: 'pointer', 
        fontSize: '16px',
        transition: 'background-color 0.2s', // Smooth transition for color change
    },
    hr: { border: 'none', borderTop: '1px solid #eee', margin: '32px 0' },
    historyContainer: {},
    filters: { display: 'flex', gap: '20px', marginBottom: '20px', backgroundColor: '#fff', padding: '16px', borderRadius: '8px' },
};

// Add a style rule for the disabled save button
const styleSheet = document.createElement("style");
styleSheet.innerText = `
  button:disabled {
    background-color: #95a5a6 !important;
    cursor: not-allowed;
  }
`;
document.head.appendChild(styleSheet);


export default AddProduction;