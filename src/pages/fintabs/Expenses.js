import React, { useState, useEffect, useCallback, useMemo, useContext } from "react";
import { db, auth } from "../../firebase";
import { collection, query, getDocs, addDoc, serverTimestamp, orderBy, doc, getDoc, runTransaction, limit, startAfter, where, deleteDoc } from "firebase/firestore";
import { AiOutlineSearch, AiOutlineDelete } from "react-icons/ai";
import Select from "react-select";
import CreatableSelect from 'react-select/creatable';
import { CashBookContext } from "../../context/CashBookContext";

const Expenses = () => {
  const { cashBooks, cashBookBalances, reconciledDates, refreshBalances, loading: balancesLoading } = useContext(CashBookContext);

  const [expenseCategories, setExpenseCategories] = useState([]);
  const [formState, setFormState] = useState({ category: null, amount: "", details: "", cashBook: null });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  
  const [combinedData, setCombinedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [lastVisible, setLastVisible] = useState({});
  const PAGE_SIZE = 10;

  const getCurrentInternal = () => {
    try {
      const stored = localStorage.getItem("internalLoggedInUser");
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  };

  const categoryOptions = useMemo(() => 
    expenseCategories.map(cat => ({ value: cat, label: cat })),
    [expenseCategories]
  );
  const cashBookOptions = useMemo(() => 
    cashBooks.map(book => ({ value: book.id, label: book.name })),
    [cashBooks]
  );

  useEffect(() => {
    const setupPage = async () => {
      const user = auth.currentUser;
      if (!user) return;
      const uid = user.uid;
      try {
        const settingsDocRef = doc(db, uid, "settings");
        const settingsSnap = await getDoc(settingsDocRef);
        if (settingsSnap.exists()) {
          setExpenseCategories(settingsSnap.data().expenseCategories || []);
        }
      } catch (error) { console.error("Error fetching settings:", error); }
    };
    setupPage();
  }, []);

  const fetchData = useCallback(async (page, search, date) => {
    setLoading(true);
    const user = auth.currentUser;
    if (!user) { setLoading(false); return; }
    const uid = user.uid;

    try {
        let expensesData = [], paymentsData = [];
        const searchUpper = search.toUpperCase();
        const isExpenseIdSearch = searchUpper.startsWith('EXP');
        const isPaymentIdSearch = searchUpper.startsWith('P');
        const isStockInIdSearch = searchUpper.startsWith('SI-');
        const isIdSearch = isExpenseIdSearch || isPaymentIdSearch || isStockInIdSearch;
        const expensesCollection = collection(db, uid, 'user_data', 'expenses');
        const paymentsCollection = collection(db, uid, 'stock_payments', 'payments');

        if (!isIdSearch) {
            const collections = { expenses: expensesCollection, payments: paymentsCollection };
            const queries = {};
            for (const type in collections) {
                const timestampField = type === 'expenses' ? 'createdAt' : 'paidAt';
                let q = query(collections[type], orderBy(timestampField, 'desc'));
                if (date) {
                    const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
                    const endOfDay = new Date(date); endOfDay.setHours(23, 59, 59, 999);
                    q = query(q, where(timestampField, '>=', startOfDay), where(timestampField, '<=', endOfDay));
                }
                if (search) {
                    const searchField = type === 'expenses' ? 'details' : 'receiverName';
                    q = query(q, where(searchField, '>=', search), where(searchField, '<=', search + '\uf8ff'));
                }
                if (page > 1 && lastVisible[type]) { q = query(q, startAfter(lastVisible[type])); }
                queries[type] = query(q, limit(PAGE_SIZE / 2));
            }
            const [expensesSnap, paymentsSnap] = await Promise.all([getDocs(queries.expenses), getDocs(queries.payments)]);
            expensesData = expensesSnap.docs.map(d => ({ ...d.data(), id: d.id, type: 'Expense' }));
            paymentsData = paymentsSnap.docs.map(d => ({ ...d.data(), id: d.id, type: 'Payment', createdAt: d.data().paidAt }));
            setLastVisible({
                expenses: expensesSnap.docs[expensesSnap.docs.length - 1],
                payments: paymentsSnap.docs[paymentsSnap.docs.length - 1]
            });
        } else {
            if (isExpenseIdSearch) {
                const q = query(expensesCollection, where('expenseId', '==', search));
                expensesData = (await getDocs(q)).docs.map(d => ({ ...d.data(), id: d.id, type: 'Expense' }));
            }
            if (isPaymentIdSearch) {
                const q = query(paymentsCollection, where('paymentId', '==', search));
                paymentsData = (await getDocs(q)).docs.map(d => ({ ...d.data(), id: d.id, type: 'Payment', createdAt: d.data().paidAt }));
            }
            if (isStockInIdSearch) {
                const q = query(paymentsCollection, where('stockInId', '==', search));
                paymentsData = (await getDocs(q)).docs.map(d => ({ ...d.data(), id: d.id, type: 'Payment', createdAt: d.data().paidAt }));
            }
        }
        const combined = [...expensesData, ...paymentsData].sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
        setCombinedData(combined);
    } catch (error) {
        console.error("Error fetching data:", error);
        alert('Failed to fetch data. ' + error.message);
    }
    setLoading(false);
  }, [lastVisible]);

  useEffect(() => {
    setCurrentPage(1);
    setLastVisible({});
  }, [searchFilter, dateFilter]);
  
  useEffect(() => {
    fetchData(currentPage, searchFilter, dateFilter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchFilter, dateFilter, currentPage]);

  useEffect(() => {
      const { amount, cashBook } = formState;
      if (amount && cashBook) {
          const balance = cashBookBalances[cashBook.value] || 0;
          if (parseFloat(amount) > balance) {
              setFormError(`Amount exceeds the selected cash book balance of Rs. ${balance.toFixed(2)}`);
          } else {
              setFormError("");
          }
      } else {
          setFormError("");
      }
  }, [formState.amount, formState.cashBook, cashBookBalances]);

  const handleSelectChange = (name, selectedOption) => {
      setFormState(prev => ({...prev, [name]: selectedOption}));
  };

  const handleSaveExpense = async (e) => {
    e.preventDefault();
    if (!formState.category || !formState.amount || !formState.details || !formState.cashBook) { return alert("Please fill in all fields."); }
    if (formError) { return alert(`Cannot save: ${formError}`); }
    
    setIsSubmitting(true);
    const user = auth.currentUser;
    const internalUser = getCurrentInternal();
    
    if (!internalUser) {
        alert("Could not identify internal user. Please log out and log in again.");
        setIsSubmitting(false);
        return;
    }
    
    const uid = user.uid;

    try {
      const counterRef = doc(db, uid, "counters");
      await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let newCount = (counterDoc.exists() ? counterDoc.data().expenseCount : 0) + 1;
        const expenseId = `EXP${String(newCount).padStart(7, '0')}`;
        const expensesCollectionRef = collection(db, uid, 'user_data', 'expenses');
        const newExpenseRef = doc(expensesCollectionRef);
        transaction.set(newExpenseRef, {
          expenseId, category: formState.category.value, amount: parseFloat(formState.amount),
          details: formState.details, cashBookId: formState.cashBook.value,
          cashBookName: formState.cashBook.label, createdAt: serverTimestamp(),
          createdBy: internalUser.username
        });
        transaction.set(counterRef, { expenseCount: newCount }, { merge: true });
      });
      alert("Expense saved successfully!");
      setFormState({ category: null, amount: "", details: "", cashBook: null });
      await refreshBalances();
      fetchData(1, searchFilter, dateFilter);
    } catch (error) {
      console.error("Error saving expense:", error);
      alert("Failed to save expense: " + error.message);
    }
    setIsSubmitting(false);
  };
  
  const handleDelete = async (item) => {
      const itemDate = (item.createdAt || item.paidAt)?.toDate();
      if (!itemDate) {
          alert("Cannot delete: transaction has no valid date.");
          return;
      }
      const dateString = itemDate.toISOString().split('T')[0];

      if (reconciledDates.has(dateString)) {
          alert(`Cannot delete this transaction because the date ${dateString} has been reconciled and is locked.`);
          return;
      }

      if (!window.confirm(`Are you sure you want to delete this ${item.type}?`)) return;

      const uid = auth.currentUser.uid;
      const collectionPath = item.type === 'Expense' ? `/${uid}/user_data/expenses` : `/${uid}/stock_payments/payments`;
      const docRef = doc(db, collectionPath, item.id);

      try {
          await deleteDoc(docRef);
          alert(`${item.type} deleted successfully.`);
          await refreshBalances();
          fetchData(1, searchFilter, dateFilter);
      } catch (error) {
          alert(`Failed to delete ${item.type}: ${error.message}`);
      }
  };
  
  const isSaveDisabled = isSubmitting || !!formError || !formState.cashBook || !formState.amount;

  return (
    <div style={styles.container}>
      <div style={styles.section}>
        <h2 style={styles.title}>Today's Cash Book Balances</h2>
        <div style={styles.balancesContainer}>
            {balancesLoading ? <p>Loading balances...</p> : cashBooks.length > 0 ? cashBooks.map(book => (
                <div key={book.id} style={styles.balanceCard}>
                    <span style={styles.balanceLabel}>{book.name}</span>
                    <span style={styles.balanceAmount}>Rs. {(cashBookBalances[book.id] || 0).toFixed(2)}</span>
                </div>
            )) : <p>No cash books found.</p>}
        </div>
      </div>

      <div style={styles.section}>
        <h2 style={styles.title}>Add New Expense</h2>
        <form onSubmit={handleSaveExpense} style={styles.form}>
            <div style={{...styles.formGroup, flex: 1.5}}>
                <label style={styles.label}>Pay From Cash Book *</label>
                <Select options={cashBookOptions} value={formState.cashBook} onChange={(option) => handleSelectChange('cashBook', option)} placeholder="Select cash book..." styles={customSelectStyles} />
            </div>
            <div style={{...styles.formGroup, flex: 1.5}}>
                <label style={styles.label}>Category</label>
                <CreatableSelect isClearable options={categoryOptions} value={formState.category} onChange={(option) => handleSelectChange('category', option)} placeholder="Select or type..." styles={customSelectStyles} />
            </div>
            <div style={styles.formGroup}>
                <label style={styles.label}>Amount</label>
                <input type="number" name="amount" value={formState.amount} onChange={(e) => setFormState(prev=>({...prev, amount: e.target.value}))} style={styles.input} placeholder="0.00" step="0.01" />
            </div>
            <div style={{ ...styles.formGroup, flex: 2 }}>
                <label style={styles.label}>Reason / Details / Remark</label>
                <input type="text" name="details" value={formState.details} onChange={(e) => setFormState(prev=>({...prev, details: e.target.value}))} style={styles.input} placeholder="e.g., Office electricity bill" />
            </div>
            <button type="submit" style={isSaveDisabled ? {...styles.saveButton, ...styles.saveButtonDisabled} : styles.saveButton} disabled={isSaveDisabled}>
                {isSubmitting ? 'Saving...' : 'Save Expense'}
            </button>
        </form>
        {formError && <p style={styles.errorText}>{formError}</p>}
      </div>

      <div style={styles.section}>
        <h2 style={styles.title}>Transaction History</h2>
        <div style={styles.filtersContainer}>
            <div style={{ ...styles.formGroup, flex: 2 }}><div style={styles.searchInputContainer}><AiOutlineSearch style={styles.searchIcon}/><input type="text" placeholder="Search by details or any ID..." value={searchFilter} onChange={e => setSearchFilter(e.target.value)} style={{...styles.input, paddingLeft: '35px'}}/></div></div>
            <div style={{...styles.formGroup, flexDirection: 'row', alignItems: 'center', gap: '10px'}}><input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={styles.input}/><button onClick={() => setDateFilter('')} style={styles.clearButton}>Clear</button></div>
        </div>
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead><tr><th style={styles.th}>Date</th><th style={styles.th}>Payment/Exp ID</th><th style={styles.th}>Stock ID</th><th style={styles.th}>Type</th><th style={styles.th}>Details</th><th style={styles.th}>Amount</th><th style={styles.th}>Action</th></tr></thead>
            <tbody>
              {loading ? (<tr><td colSpan={7} style={styles.loadingCell}>Loading...</td></tr>) : combinedData.length > 0 ? (combinedData.map(item => (<tr key={item.id}><td style={styles.td}>{item.createdAt?.toDate().toLocaleDateString()}</td><td style={styles.td}>{item.paymentId || item.expenseId}</td><td style={styles.td}>{item.type === 'Payment' ? item.stockInId : 'N/A'}</td><td style={styles.td}><span style={{ ...styles.typeBadge, backgroundColor: item.type === 'Expense' ? '#e74c3c' : '#3498db' }}>{item.type}</span></td><td style={styles.td}><div>{item.details || item.receiverName}</div><div style={styles.subText}>{item.type === 'Expense' ? `Paid from: ${item.cashBookName || 'N/A'}` : `Method: ${item.method}`}</div></td><td style={{ ...styles.td, color: item.type === 'Expense' ? '#e74c3c' : '#27ae60', fontWeight: 'bold' }}>Rs. {item.amount.toFixed(2)}</td><td style={styles.td}><button onClick={() => handleDelete(item)} style={styles.deleteButton}><AiOutlineDelete size={16}/></button></td></tr>))) : (<tr><td colSpan={7} style={styles.loadingCell}>No records found.</td></tr>)}
            </tbody>
          </table>
        </div>
        <div style={styles.paginationContainer}><button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1 || loading}>Previous</button><span>Page {currentPage}</span><button onClick={() => setCurrentPage(p => p + 1)} disabled={combinedData.length < 1 || loading}>Next</button></div>
      </div>
    </div>
  );
};

const styles = { container: { padding: "24px", backgroundColor: "#f4f6f8" }, section: { backgroundColor: '#fff', padding: '24px', borderRadius: '8px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }, title: { fontSize: "22px", marginBottom: "20px", color: "#2c3e50", fontWeight: 600 }, form: { display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }, formGroup: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: '150px' }, label: { marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#34495e' }, input: { padding: '10px', borderRadius: '6px', border: '1px solid #bdc3c7', fontSize: '14px', width: '100%', boxSizing: 'border-box', height: '40px' }, saveButton: { padding: '10px 20px', marginTop: '30px', border: 'none', backgroundColor: '#2ecc71', color: 'white', borderRadius: '6px', cursor: 'pointer', height: '40px' }, saveButtonDisabled: { backgroundColor: '#95a5a6', cursor: 'not-allowed' }, filtersContainer: { display: 'flex', gap: '16px', marginBottom: '20px', alignItems: 'center' }, searchInputContainer: { position: 'relative' }, searchIcon: { position: 'absolute', top: '50%', left: '10px', transform: 'translateY(-50%)', color: '#9ca3af' }, clearButton: { padding: '0 15px', border: '1px solid #bdc3c7', backgroundColor: '#f8f9fa', color: '#34495e', borderRadius: '6px', cursor: 'pointer', height: '40px' }, tableContainer: { overflowX: 'auto' }, table: { width: '100%', borderCollapse: 'collapse' }, th: { padding: '12px 16px', textAlign: 'left', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontWeight: '600', color: '#4b5563', fontSize: '12px', textTransform: 'uppercase' }, td: { padding: '12px 16px', borderBottom: '1px solid #e5e7eb', verticalAlign: 'middle', fontSize: '14px' }, loadingCell: { textAlign: 'center', padding: '40px', color: '#7f8c8d' }, typeBadge: { color: 'white', padding: '4px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: '500' }, subText: { fontSize: '12px', color: '#7f8c8d', marginTop: '4px' }, deleteButton: { backgroundColor: '#fee2e2', border: 'none', color: '#ef4444', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color 0.2s' }, paginationContainer: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginTop: '20px' }, errorText: { color: '#e74c3c', marginTop: '10px', fontSize: '14px', fontWeight: '500', width: '100%' }, balancesContainer: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' }, balanceCard: { backgroundColor: '#ecf0f1', padding: '16px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, balanceLabel: { color: '#2c3e50', fontWeight: '500' }, balanceAmount: { color: '#2980b9', fontWeight: 'bold', fontSize: '18px' }, };
const customSelectStyles = { control: (provided) => ({ ...provided, minHeight: '40px', border: '1px solid #bdc3c7', borderRadius: '6px' }), option: (provided, state) => ({ ...provided, backgroundColor: state.isSelected ? '#3498db' : state.isFocused ? '#ecf0f1' : 'white', color: state.isSelected ? 'white' : '#34495e' }), };

export default Expenses;