import React, { useState, useEffect, useCallback } from "react";
import { db, auth } from "../../firebase";
import { collection, query, getDocs, addDoc, serverTimestamp, orderBy, where } from "firebase/firestore";
import { AiOutlineDollar, AiOutlineHistory } from "react-icons/ai";
import Select from "react-select";

const CreditCust = () => {
  const [allCreditCustomers, setAllCreditCustomers] = useState([]);
  const [allInvoices, setAllInvoices] = useState([]);
  const [allPayments, setAllPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // ✅ **1. State for the selected customer from the dropdown**
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [currentItemForPayment, setCurrentItemForPayment] = useState(null);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  const getCurrentInternal = () => {
    try {
      const stored = localStorage.getItem("internalLoggedInUser");
      return stored ? JSON.parse(stored) : null;
    } catch (e) { return null; }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }

    try {
      const customersRef = collection(db, uid, "customers", "customer_list");
      const creditCustomersQuery = query(customersRef, where("isCreditCustomer", "==", true));
      const customersSnap = await getDocs(creditCustomersQuery);
      const customersData = customersSnap.docs.map(doc => ({ value: doc.id, label: doc.data().name, ...doc.data() }));
      setAllCreditCustomers(customersData);

      const customerIds = customersData.map(c => c.value);
      if (customerIds.length > 0) {
        const invoicesRef = collection(db, uid, "invoices", "invoice_list");
        // Only fetch original credit invoices, not repayments
        const invoicesQuery = query(invoicesRef, where("customerId", "in", customerIds), where("paymentMethod", "==", "Credit"), orderBy("createdAt", "desc"));
        const invoicesSnap = await getDocs(invoicesQuery);
        setAllInvoices(invoicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } else {
        setAllInvoices([]);
      }
      
      const paymentsRef = collection(db, uid, "credit_payments", "payments");
      const paymentsSnap = await getDocs(query(paymentsRef, orderBy("paymentDate", "desc")));
      setAllPayments(paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

    } catch (error) {
      console.error("Error fetching credit data:", error);
      alert("An error occurred while fetching data. Check the console for details.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenPaymentModal = (invoice, totalPaid) => {
    setCurrentItemForPayment({ ...invoice, totalPaid });
    setShowPaymentModal(true);
  };
  
  const handleOpenHistoryModal = (invoiceId) => {
    const history = allPayments.filter(p => p.invoiceId === invoiceId);
    setPaymentHistory(history);
    setShowHistoryModal(true);
  };

  const handleSavePayment = async (paymentData) => {
    if (!currentItemForPayment) return;
    setIsSaving(true);
    const uid = auth.currentUser.uid;
    const user = getCurrentInternal();

    try {
        const paymentDoc = {
            customerId: currentItemForPayment.customerId,
            customerName: currentItemForPayment.customerName,
            invoiceId: currentItemForPayment.id,
            invoiceNumber: currentItemForPayment.invoiceNumber,
            paidBy: user.username,
            paymentDate: serverTimestamp(),
            ...paymentData,
        };
        const paymentsColRef = collection(db, uid, "credit_payments", "payments");
        await addDoc(paymentsColRef, paymentDoc);
        
        const invoicesColRef = collection(db, uid, "invoices", "invoice_list");
        await addDoc(invoicesColRef, {
            total: paymentData.amount,
            customerId: currentItemForPayment.customerId,
            customerName: currentItemForPayment.customerName,
            createdAt: serverTimestamp(),
            issuedBy: user.username,
            paymentMethod: 'Credit-Repayment',
            invoiceNumber: `PAY-${currentItemForPayment.invoiceNumber}`,
            items: [{ 
                itemName: `Payment for ${currentItemForPayment.invoiceNumber} via ${paymentData.method}`, 
                price: paymentData.amount, 
                quantity: 1 
            }],
            method: paymentData.method,
        });
        
        await fetchData();
        alert("Payment saved successfully!");
    } catch (error) {
        alert("Error saving payment: " + error.message);
    } finally {
        setIsSaving(false);
        setShowPaymentModal(false);
        setCurrentItemForPayment(null);
    }
  };
  
  // ✅ **2. Calculate unpaid invoices for the selected customer**
  const unpaidInvoices = selectedCustomer 
    ? allInvoices
        .filter(inv => inv.customerId === selectedCustomer.value)
        .map(invoice => {
            const totalPaidForInvoice = allPayments
                .filter(p => p.invoiceId === invoice.id)
                .reduce((sum, p) => sum + p.amount, 0);
            return { ...invoice, totalPaid: totalPaidForInvoice, balance: (invoice.total || 0) - totalPaidForInvoice };
        })
        .filter(invoice => Math.round(invoice.balance * 100) > 0) // Filter out fully paid invoices
    : [];

  if (loading) return <div style={styles.loadingContainer}>Loading Credit Data...</div>;

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Credit Customer Payments</h2>
      <div style={styles.controlsContainer}>
        <div style={styles.filterGroup}>
          <label>Select a Credit Customer</label>
          {/* ✅ **3. Replaced search input with a searchable dropdown** */}
          <Select
            options={allCreditCustomers}
            value={selectedCustomer}
            onChange={setSelectedCustomer}
            placeholder="Type to search for a customer..."
            isClearable
            styles={{ control: (base) => ({ ...base, height: '45px' })}}
          />
        </div>
      </div>
      
      {/* ✅ **4. Display invoices only when a customer is selected** */}
      {selectedCustomer && (
        <div style={styles.customerCard}>
            <div style={styles.customerHeader}>
                <span style={{fontWeight: 'bold', fontSize: '18px'}}>{selectedCustomer.label}</span>
                <span style={{color: '#e74c3c', fontWeight: 'bold', fontSize: '16px'}}>
                    Total Outstanding: Rs. {unpaidInvoices.reduce((sum, inv) => sum + inv.balance, 0).toFixed(2)}
                </span>
            </div>
            <div style={styles.invoiceTableWrapper}>
                <table style={{...styles.table, marginTop: '10px'}}>
                    <thead>
                        <tr>
                            <th style={styles.th}>Invoice #</th>
                            <th style={styles.th}>Date</th>
                            <th style={styles.th}>Inv. Total</th>
                            <th style={styles.th}>Paid</th>
                            <th style={styles.th}>Balance Due</th>
                            <th style={styles.th}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {unpaidInvoices.length > 0 ? unpaidInvoices.map(invoice => (
                            <tr key={invoice.id}>
                                <td style={styles.td}>{invoice.invoiceNumber}</td>
                                <td style={styles.td}>{invoice.createdAt?.toDate().toLocaleDateString()}</td>
                                <td style={styles.td}>Rs. {(invoice.total || 0).toFixed(2)}</td>
                                <td style={styles.td}>Rs. {invoice.totalPaid.toFixed(2)}</td>
                                <td style={{...styles.td, color: '#e74c3c', fontWeight: 'bold'}}>Rs. {invoice.balance.toFixed(2)}</td>
                                <td style={styles.td}>
                                    <div style={{display: 'flex', gap: '8px'}}>
                                        <button style={styles.addPaymentButton} title="Add Payment" onClick={() => handleOpenPaymentModal(invoice, invoice.totalPaid)}><AiOutlineDollar /></button>
                                        {invoice.totalPaid > 0 && <button style={styles.historyButton} title="View Payment History" onClick={() => handleOpenHistoryModal(invoice.id)}><AiOutlineHistory /></button>}
                                    </div>
                                </td>
                            </tr>
                        )) : (
                            <tr><td colSpan="6" style={styles.noData}>This customer has no outstanding credit invoices.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {showPaymentModal && <PaymentModal record={currentItemForPayment} onSave={handleSavePayment} onCancel={() => setShowPaymentModal(false)} isSaving={isSaving} />}
      {showHistoryModal && <PaymentHistoryModal payments={paymentHistory} onClose={() => setShowHistoryModal(false)}/>}
    </div>
  );
};

// ... (Modal components and styles remain largely the same)
const PaymentModal = ({ record, onSave, onCancel, isSaving }) => {
    const invoiceBalance = (record.total || 0) - record.totalPaid;
    const [formData, setFormData] = useState({amount: invoiceBalance.toFixed(2), paymentMethod: 'Cash', reference: ''});
    const [error, setError] = useState('');

    useEffect(() => {
        if (formData.amount && parseFloat(formData.amount) > invoiceBalance) { 
            setError(`Amount cannot exceed the invoice balance of Rs. ${invoiceBalance.toFixed(2)}`); 
        } else { setError(''); }
    }, [formData.amount, invoiceBalance]);
    
    const isFormValid = () => !error && parseFloat(formData.amount) > 0;

    const handleSave = () => {
        if (!isFormValid()) return;
        onSave({
            amount: parseFloat(formData.amount), 
            method: formData.paymentMethod,
            reference: formData.reference.trim(),
        });
    };

    return (
        <div style={styles.modalOverlay}>
            <div style={styles.modal}>
                <h3 style={styles.modalTitle}>Add Payment for {record.invoiceNumber}</h3>
                <div style={styles.formGrid}>
                     <div style={{...styles.formGroup, gridColumn: 'span 2', textAlign: 'center', background: '#f0f2f5', padding: '10px', borderRadius: '6px' }}>
                        <label style={{fontSize: '14px'}}>Invoice Balance</label>
                        <p style={{fontSize: '20px', fontWeight: 'bold', margin: 0, color: '#e74c3c'}}>Rs. {invoiceBalance.toFixed(2)}</p>
                    </div>
                    <div style={{...styles.formGroup, gridColumn: 'span 2'}}>
                        <label>Amount to Pay *</label>
                        <input type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} style={styles.modalInput} required autoFocus/>
                        {error && <p style={styles.errorText}>{error}</p>}
                    </div>
                    <div style={styles.formGroup}>
                       <label>Payment Method</label>
                       <Select 
                            options={[{value: 'Cash', label: 'Cash'}, {value: 'Card', label: 'Card'}, {value: 'Online', label: 'Online'}]}
                            defaultValue={{value: 'Cash', label: 'Cash'}}
                            onChange={opt => setFormData(prev => ({...prev, paymentMethod: opt.value}))}
                        />
                    </div>
                     <div style={styles.formGroup}>
                       <label>Reference (Optional)</label>
                       <input type="text" value={formData.reference} onChange={e => setFormData({...formData, reference: e.target.value})} style={styles.modalInput}/>
                    </div>
                </div>
                <div style={styles.modalActions}>
                    <button onClick={onCancel} style={styles.cancelButton}>Cancel</button>
                    <button onClick={handleSave} style={!isFormValid() || isSaving ? {...styles.saveButtonModal, ...styles.saveButtonDisabled} : styles.saveButtonModal} disabled={!isFormValid() || isSaving}>
                        {isSaving ? 'Saving...' : 'Save Payment'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const PaymentHistoryModal = ({ payments, onClose }) => (
    <div style={styles.modalOverlay}>
        <div style={{...styles.modal, maxWidth: '700px'}}>
            <h3 style={styles.modalTitle}>Payment History</h3>
            <table style={{...styles.table, minWidth: 'auto'}}>
                <thead>
                    <tr>
                        <th style={styles.th}>Date</th>
                        <th style={styles.th}>Amount</th>
                        <th style={styles.th}>Method</th>
                        <th style={styles.th}>User</th>
                    </tr>
                </thead>
                <tbody>
                    {payments.length > 0 ? payments.map((p, i) => (
                        <tr key={p.id}>
                            <td style={styles.td}>{p.paymentDate?.toDate().toLocaleString()}</td>
                            <td style={styles.td}>Rs. {p.amount.toFixed(2)}</td>
                            <td style={styles.td}>{p.method}</td>
                            <td style={styles.td}>{p.paidBy}</td>
                        </tr>
                    )) : <tr><td colSpan="4" style={styles.noData}>No payments found for this invoice.</td></tr>}
                </tbody>
            </table>
            <div style={styles.modalActions}>
                <button onClick={onClose} style={styles.cancelButton}>Close</button>
            </div>
        </div>
    </div>
);


const styles = {
    container: { padding: '24px', fontFamily: "'Inter', sans-serif" },
    title: { fontSize: '24px', fontWeight: '600', marginBottom: '20px' },
    loadingContainer: { textAlign: 'center', padding: '50px', fontSize: '18px' },
    controlsContainer: { display: 'flex', gap: '20px', marginBottom: '20px', padding: '20px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' },
    filterGroup: { display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 },
    searchInputContainer: { position: 'relative' },
    searchIcon: { position: 'absolute', top: '50%', left: '10px', transform: 'translateY(-50%)', color: '#9ca3af' },
    input: { padding: '10px', borderRadius: '6px', border: '1px solid #ddd', width: '100%', boxSizing: 'border-box' },
    customerListContainer: { display: 'flex', flexDirection: 'column', gap: '15px' },
    customerCard: { backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' },
    customerHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', cursor: 'pointer', borderBottom: '1px solid #e5e7eb' },
    invoiceTableWrapper: { padding: '15px', overflowX: 'auto' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { padding: '10px', textAlign: 'left', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontWeight: '600', color: '#4b5563', fontSize: '12px', textTransform: 'uppercase' },
    td: { padding: '10px', borderBottom: '1px solid #e5e7eb', verticalAlign: 'middle', fontSize: '14px' },
    addPaymentButton: { padding: '6px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' },
    historyButton: { padding: '6px', backgroundColor: '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' },
    noData: { textAlign: 'center', padding: '32px', color: '#6b7280' },
    modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1001 },
    modal: { backgroundColor: 'white', padding: '25px', borderRadius: '12px', width: '90%', maxWidth: '600px', boxShadow: '0 5px 15px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' },
    modalTitle: { margin: '0 0 20px 0', textAlign: 'center', fontSize: '20px', fontWeight: '600' },
    modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '25px', paddingTop: '15px', borderTop: '1px solid #eee' },
    cancelButton: { padding: '10px 20px', backgroundColor: '#e0e0e0', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '16px' },
    saveButtonModal: { padding: '10px 20px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '16px' },
    saveButtonDisabled: { backgroundColor: '#95a5a6', cursor: 'not-allowed' },
    formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
    modalInput: { padding: '12px', borderRadius: '6px', border: '1px solid #ddd', width: '100%', boxSizing: 'border-box', fontSize: '14px' },
    errorText: { color: '#e74c3c', fontSize: '12px', margin: '5px 0 0 0' },
};

export default CreditCust;

