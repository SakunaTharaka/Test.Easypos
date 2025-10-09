import React, { useEffect, useState, useContext } from "react";
import { auth, db } from "../firebase";
import { collection, query, where, orderBy, getDocs, Timestamp, doc, deleteDoc } from "firebase/firestore";
import Select from "react-select";
import { AiOutlineEye, AiOutlineDelete, AiOutlineLock } from "react-icons/ai";
import { CashBookContext } from "../context/CashBookContext";

const SalesReport = ({ internalUser }) => {
  const { reconciledDates } = useContext(CashBookContext);
  const [allInvoices, setAllInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [allCustomers, setAllCustomers] = useState([]);
  
  // ✅ **1. New state to store IDs of credit customers for quick checking**
  const [creditCustomerIds, setCreditCustomerIds] = useState(new Set());

  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const invoicesPerPage = 35;
  const getCurrentInternal = () => { try { const stored = localStorage.getItem("internalLoggedInUser"); return stored ? JSON.parse(stored) : null; } catch (e) { return null; } };
  const isAdmin = getCurrentInternal()?.isAdmin === true;

  const fetchInvoices = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setLoading(true);
    try {
      const invoicesColRef = collection(db, uid, "invoices", "invoice_list");
      let q = query(invoicesColRef, orderBy("createdAt", "desc"));
      if (dateFrom && dateTo) { q = query(q, where("createdAt", ">=", Timestamp.fromDate(new Date(dateFrom))), where("createdAt", "<=", Timestamp.fromDate(new Date(dateTo + "T23:59:59")))); }
      if (selectedCustomers.length > 0) { const customerIds = selectedCustomers.map(c => c.value); q = query(q, where("customerId", "in", customerIds)); }
      
      const docSnap = await getDocs(q);
      const fetchedInvoices = docSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllInvoices(fetchedInvoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      alert("An error occurred while fetching invoices.");
    }
    setLoading(false);
  };

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    
    // ✅ **2. Update fetchCustomers to identify and store credit customer IDs**
    const fetchCustomers = async () => {
      const customersColRef = collection(db, uid, "customers", "customer_list");
      const snap = await getDocs(query(customersColRef));
      
      const customerOptions = [];
      const creditIds = new Set();
      
      snap.docs.forEach(d => {
        const customerData = d.data();
        customerOptions.push({ value: d.id, label: customerData.name });
        if (customerData.isCreditCustomer) {
          creditIds.add(d.id);
        }
      });

      setAllCustomers(customerOptions);
      setCreditCustomerIds(creditIds);
    };

    fetchCustomers();
    fetchInvoices();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    fetchInvoices();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, selectedCustomers]);

  const handleDelete = async (invoice) => {
    const itemDate = invoice.createdAt?.toDate();
    if (!itemDate) {
        alert("Cannot delete: invoice has no valid date.");
        return;
    }
    const dateString = itemDate.toISOString().split('T')[0];

    if (reconciledDates.has(dateString)) {
        alert(`Cannot delete this invoice because the date ${dateString} has been reconciled and is locked.`);
        return;
    }

    if (!isAdmin || !window.confirm("Are you sure you want to delete this invoice permanently?")) return;
    try {
        const uid = auth.currentUser.uid;
        await deleteDoc(doc(db, uid, "invoices", "invoice_list", invoice.id));
        alert("Invoice deleted.");
        fetchInvoices();
    } catch (error) {
        alert("Error deleting invoice: " + error.message);
    }
  };
  
  const handleViewInvoice = (invoiceId) => {
    const url = `/invoice/view/${invoiceId}`;
    window.open(url, '_blank');
  };

  const filteredInvoices = allInvoices.filter(inv => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return ( inv.invoiceNumber.toLowerCase().includes(term) || inv.customerName.toLowerCase().includes(term) || String(inv.total).includes(term) || inv.issuedBy.toLowerCase().includes(term) );
  });

  const totalPages = Math.ceil(filteredInvoices.length / invoicesPerPage);
  const currentDisplayInvoices = filteredInvoices.slice( (currentPage - 1) * invoicesPerPage, currentPage * invoicesPerPage );

  return (
    <div style={styles.container}>
      <div style={styles.headerContainer}><h2 style={styles.header}>Sales Report</h2><p style={styles.subHeader}>View, filter, and manage recent invoices.</p></div>
      <div style={styles.controlsContainer}>
          <div style={styles.filterGroup}><label>Date Range</label><div style={styles.dateInputs}><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{...styles.input, paddingLeft: '10px'}}/><span>to</span><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{...styles.input, paddingLeft: '10px'}}/></div></div>
          <div style={styles.filterGroup}><label>Customers</label><Select styles={selectStyles} options={allCustomers} isMulti onChange={setSelectedCustomers} placeholder="All Customers" /></div>
          <div style={styles.filterGroup}><label>Search Results</label><div style={styles.searchInputContainer}><input type="text" placeholder="Filter loaded results by Inv#, Customer, Total, or User..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={styles.input}/></div></div>
      </div>
      <div style={styles.tableContainer}>
          {loading ? <p style={{textAlign: 'center', padding: '20px'}}>Loading Invoices...</p> : (
          <table style={styles.table}>
              <thead><tr><th style={styles.th}>Inv #</th><th style={styles.th}>Customer</th><th style={styles.th}>Total Amount</th><th style={styles.th}>User</th><th style={styles.th}>Date</th><th style={styles.th}>Actions</th></tr></thead>
              <tbody>{currentDisplayInvoices.length > 0 ? currentDisplayInvoices.map(inv => {
                const isLocked = reconciledDates.has(inv.createdAt?.toDate().toISOString().split('T')[0]);
                // ✅ **3. Check if the invoice's customer is a credit customer**
                const isCredit = creditCustomerIds.has(inv.customerId);
                return (
                  <tr key={inv.id}>
                    <td style={styles.td}>{inv.invoiceNumber}</td>
                    {/* ✅ **4. Apply red color style if it's a credit customer** */}
                    <td style={{...styles.td, color: isCredit ? 'red' : 'inherit', fontWeight: isCredit ? '500' : 'normal' }}>{inv.customerName}</td>
                    <td style={styles.td}>Rs. {inv.total.toFixed(2)}</td>
                    <td style={styles.td}>{inv.issuedBy}</td>
                    <td style={styles.td}>{inv.createdAt?.toDate().toLocaleDateString()}</td>
                    <td style={styles.td}>
                        <div style={styles.actionButtons}>
                            <button onClick={() => handleViewInvoice(inv.id)} style={styles.actionButton} title="View Details"><AiOutlineEye/></button>
                            {isAdmin && (
                                <button onClick={() => handleDelete(inv)} style={{...styles.actionButton, color: isLocked ? '#95a5a6' : '#e74c3c'}} title={isLocked ? "Locked" : "Delete Invoice"} disabled={isLocked}>
                                    {isLocked ? <AiOutlineLock/> : <AiOutlineDelete/>}
                                </button>
                            )}
                        </div>
                    </td>
                  </tr>
                )
              }) : <tr><td colSpan="6" style={styles.noData}>No invoices found for the selected criteria.</td></tr>}</tbody>
          </table>
          )}
      </div>
      <div style={styles.pagination}>
        <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>Previous</button>
        <span>Page {currentPage} of {totalPages > 0 ? totalPages : 1}</span>
        <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages || totalPages === 0}>Next</button>
      </div>
    </div>
  );
};
const selectStyles = { control: (provided) => ({ ...provided, minWidth: '250px', border: '1px solid #ddd', borderRadius: '6px' })};
const styles = { container: { padding: '24px', fontFamily: "'Inter', sans-serif" }, headerContainer: { marginBottom: '20px' }, header: { fontSize: '24px', fontWeight: '600' }, subHeader: { color: '#6c757d' }, controlsContainer: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '20px', padding: '20px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }, filterGroup: { display: 'flex', flexDirection: 'column', gap: '8px' }, dateInputs: { display: 'flex', alignItems: 'center', gap: '8px' }, searchInputContainer: { position: 'relative' }, searchIcon: { position: 'absolute', top: '50%', left: '10px', transform: 'translateY(-50%)', color: '#9ca3af' }, input: { padding: '10px', borderRadius: '6px', border: '1px solid #ddd', width: '100%', boxSizing: 'border-box' }, tableContainer: { backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }, table: { width: '100%', borderCollapse: 'collapse' }, th: { padding: '12px 16px', textAlign: 'left', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontWeight: '600', color: '#4b5563', fontSize: '12px', textTransform: 'uppercase' }, td: { padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }, actionButtons: { display: 'flex', gap: '10px' }, actionButton: { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#3498db' }, noData: { textAlign: 'center', padding: '32px', color: '#6b7280' }, pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', padding: '20px' }, };
export default SalesReport;