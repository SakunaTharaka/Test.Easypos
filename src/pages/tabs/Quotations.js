import React, { useState, useEffect, useRef, useCallback } from "react";
import { db, auth } from "../../firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  runTransaction,
  orderBy,
  limit, 
  startAfter, // Import startAfter
  deleteDoc,
} from "firebase/firestore";
import Select from "react-select";
// Removed unused 'AiOutlinePlus'
import { AiOutlineEye, AiOutlineDelete, AiOutlineSearch, AiOutlineLeft, AiOutlineRight } from "react-icons/ai";

const ITEMS_PER_PAGE = 20; // Load 20 quotations at a time

// --- Reusable Quotation Viewer Modal with Print ---
const QuotationViewerModal = ({ quotation, onClose, companyInfo }) => {
    if (!quotation) return null;
    const createdAtDate = quotation.createdAt instanceof Date ? quotation.createdAt : quotation.createdAt?.toDate();

    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        const printContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Quotation ${quotation.quotationNumber}</title>
                <style>
                    @media print {
                        @page { margin: 0.5cm; }
                        body { margin: 0; }
                    }
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        padding: 20px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        min-height: 100vh;
                    }
                    .flyer-container {
                        max-width: 800px;
                        margin: 0 auto;
                        background: white;
                        border-radius: 12px;
                        overflow: hidden;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                    }
                    .header-banner {
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        padding: 30px;
                        color: white;
                        position: relative;
                        overflow: hidden;
                    }
                    .header-banner::before {
                        content: '';
                        position: absolute;
                        top: -50%;
                        right: -10%;
                        width: 300px;
                        height: 300px;
                        background: rgba(255,255,255,0.1);
                        border-radius: 50%;
                    }
                    .header-content {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        position: relative;
                        z-index: 1;
                    }
                    .company-info {
                        flex: 1;
                    }
                    .company-logo {
                        width: 100px;
                        height: 100px;
                        border-radius: 12px;
                        object-fit: cover;
                        background: white;
                        padding: 8px;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                    }
                    .company-name {
                        font-size: 28px;
                        font-weight: bold;
                        margin-bottom: 8px;
                        text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
                    }
                    .company-address {
                        font-size: 14px;
                        opacity: 0.95;
                        line-height: 1.5;
                    }
                    .quotation-title {
                        text-align: center;
                        font-size: 36px;
                        font-weight: bold;
                        margin: 20px 0;
                        color: white;
                        text-transform: uppercase;
                        letter-spacing: 2px;
                    }
                    .content-section {
                        padding: 30px;
                    }
                    .quotation-number {
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        padding: 15px 25px;
                        border-radius: 8px;
                        display: inline-block;
                        font-size: 20px;
                        font-weight: bold;
                        margin-bottom: 25px;
                        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                    }
                    .info-grid {
                        display: grid;
                        grid-template-columns: repeat(2, 1fr);
                        gap: 15px;
                        margin-bottom: 30px;
                        padding: 20px;
                        background: #f8f9fa;
                        border-radius: 8px;
                        border-left: 4px solid #667eea;
                    }
                    .info-item {
                        display: flex;
                        flex-direction: column;
                    }
                    .info-label {
                        font-size: 12px;
                        color: #6c757d;
                        font-weight: 600;
                        text-transform: uppercase;
                        margin-bottom: 4px;
                    }
                    .info-value {
                        font-size: 16px;
                        color: #2c3e50;
                        font-weight: 500;
                    }
                    .details-section {
                        margin-bottom: 25px;
                        padding: 15px;
                        background: #fff3cd;
                        border-left: 4px solid #ffc107;
                        border-radius: 4px;
                    }
                    .details-label {
                        font-weight: 600;
                        color: #856404;
                        margin-bottom: 8px;
                        font-size: 14px;
                    }
                    .details-text {
                        color: #664d03;
                        line-height: 1.6;
                    }
                    .items-table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 25px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                        border-radius: 8px;
                        overflow: hidden;
                    }
                    .items-table thead {
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                    }
                    .items-table th {
                        padding: 15px;
                        text-align: left;
                        font-weight: 600;
                        text-transform: uppercase;
                        font-size: 12px;
                        letter-spacing: 1px;
                    }
                    .items-table th:nth-child(2),
                    .items-table th:nth-child(3),
                    .items-table th:nth-child(4) {
                        text-align: right;
                    }
                    .items-table tbody tr {
                        border-bottom: 1px solid #e9ecef;
                        transition: background 0.2s;
                    }
                    .items-table tbody tr:nth-child(even) {
                        background: #f8f9fa;
                    }
                    .items-table td {
                        padding: 12px 15px;
                        color: #2c3e50;
                    }
                    .items-table td:nth-child(2),
                    .items-table td:nth-child(3),
                    .items-table td:nth-child(4) {
                        text-align: right;
                    }
                    .total-section {
                        background: linear-gradient(135deg, #2ecc71 0%, #27ae60 100%);
                        padding: 25px;
                        border-radius: 8px;
                        color: white;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        box-shadow: 0 4px 12px rgba(46, 204, 113, 0.3);
                    }
                    .total-label {
                        font-size: 20px;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                    }
                    .total-amount {
                        font-size: 32px;
                        font-weight: bold;
                    }
                    .footer {
                        text-align: center;
                        padding: 20px;
                        background: #f8f9fa;
                        color: #6c757d;
                        font-size: 13px;
                        border-top: 2px solid #e9ecef;
                    }
                    .footer-note {
                        margin-top: 10px;
                        font-style: italic;
                    }
                    @media print {
                        body { background: white; padding: 0; }
                        .flyer-container { box-shadow: none; }
                    }
                </style>
            </head>
            <body>
                <div class="flyer-container">
                    <div class="header-banner">
                        <div class="header-content">
                            <div class="company-info">
                                <div class="company-name">${companyInfo?.companyName || 'Company Name'}</div>
                                <div class="company-address">${companyInfo?.companyAddress || 'Company Address'}</div>
                                ${companyInfo?.phone ? `<div class="company-address">Tel: ${companyInfo.phone}</div>` : ''}
                                ${companyInfo?.email ? `<div class="company-address">Email: ${companyInfo.email}</div>` : ''}
                            </div>
                            ${companyInfo?.companyLogo ? `<img src="${companyInfo.companyLogo}" alt="Logo" class="company-logo" />` : ''}
                        </div>
                        <div class="quotation-title">Quotation</div>
                    </div>
                    
                    <div class="content-section">
                        <div class="quotation-number">${quotation.quotationNumber}</div>
                        
                        <div class="info-grid">
                            <div class="info-item">
                                <span class="info-label">Date</span>
                                <span class="info-value">${createdAtDate?.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Requested By</span>
                                <span class="info-value">${quotation.requestingPerson || 'N/A'}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Price Category</span>
                                <span class="info-value">${quotation.priceCategoryName}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Prepared By</span>
                                <span class="info-value">${quotation.createdBy}</span>
                            </div>
                        </div>
                        
                        ${quotation.details ? `
                        <div class="details-section">
                            <div class="details-label">Additional Details:</div>
                            <div class="details-text">${quotation.details}</div>
                        </div>
                        ` : ''}
                        
                        <table class="items-table">
                            <thead>
                                <tr>
                                    <th>Item Description</th>
                                    <th>Quantity</th>
                                    <th>Unit Price (Rs.)</th>
                                    <th>Total (Rs.)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${quotation.items.map(item => `
                                    <tr>
                                        <td><strong>${item.itemName}</strong></td>
                                        <td>${item.quantity}</td>
                                        <td>${item.price.toFixed(2)}</td>
                                        <td><strong>${(item.price * item.quantity).toFixed(2)}</strong></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        
                        <div class="total-section">
                            <span class="total-label">Grand Total</span>
                            <span class="total-amount">Rs. ${quotation.total.toFixed(2)}</span>
                        </div>
                    </div>
                    
                    <div class="footer">
                        <div>Thank you for your business!</div>
                        <div class="footer-note">This is a computer-generated quotation. Please contact us for any queries.</div>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        printWindow.document.write(printContent);
        printWindow.document.close();
        
        printWindow.onload = () => {
            setTimeout(() => {
                printWindow.print();
            }, 250);
        };
    };

    const modalStyles = {
        overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' },
        content: { background: 'white', padding: '30px', borderRadius: '8px', width: '90%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto', position: 'relative' },
        closeButton: { position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#666', zIndex: 10 },
        title: { marginTop: 0, borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '20px', fontSize: '22px', fontWeight: '600' },
        fieldLabel: { fontWeight: '600', color: '#333', marginRight: '8px'},
        fieldValue: { color: '#555'},
        infoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '10px', marginBottom: '20px'},
        table: { width: '100%', borderCollapse: 'collapse', marginTop: '15px', fontSize: '14px' },
        th: { background: '#f8f8f8', padding: '10px', border: '1px solid #ddd', textAlign: 'left', fontWeight: '600' },
        td: { padding: '10px', border: '1px solid #ddd', verticalAlign: 'top' },
        totalRow: { display: 'flex', justifyContent: 'flex-end', marginTop: '15px', fontWeight: 'bold', fontSize: '16px', marginBottom: '20px' },
        printButton: { 
            width: '100%', 
            padding: '14px 24px', 
            backgroundColor: '#3b82f6', 
            color: 'white', 
            border: 'none', 
            borderRadius: '8px', 
            cursor: 'pointer', 
            fontWeight: '600', 
            fontSize: '16px', 
            marginTop: '20px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: '10px',
            transition: 'background-color 0.2s'
        },
        printButtonHover: {
            backgroundColor: '#2563eb'
        }
    };

    return (
        <div style={modalStyles.overlay} onClick={onClose}>
            <div style={modalStyles.content} onClick={(e) => e.stopPropagation()}>
                <button style={modalStyles.closeButton} onClick={onClose}>&times;</button>
                <h2 style={modalStyles.title}>Quotation Details ({quotation.quotationNumber})</h2>
                
                <div style={modalStyles.infoGrid}>
                    <p><span style={modalStyles.fieldLabel}>Date:</span> <span style={modalStyles.fieldValue}>{createdAtDate?.toLocaleDateString()}</span></p>
                    <p><span style={modalStyles.fieldLabel}>Requested By:</span> <span style={modalStyles.fieldValue}>{quotation.requestingPerson || 'N/A'}</span></p>
                    <p><span style={modalStyles.fieldLabel}>Price Category:</span> <span style={modalStyles.fieldValue}>{quotation.priceCategoryName}</span></p>
                    <p><span style={modalStyles.fieldLabel}>Created By:</span> <span style={modalStyles.fieldValue}>{quotation.createdBy}</span></p>
                </div>
                
                {quotation.details && (
                    <div style={{marginBottom: '20px', padding: '12px', backgroundColor: '#fff3cd', borderRadius: '6px', borderLeft: '4px solid #ffc107'}}>
                        <span style={modalStyles.fieldLabel}>Details:</span> 
                        <span style={modalStyles.fieldValue}>{quotation.details}</span>
                    </div>
                )}

                <table style={modalStyles.table}>
                    <thead>
                        <tr>
                            <th style={modalStyles.th}>Item</th>
                            <th style={modalStyles.th}>Qty</th>
                            <th style={{...modalStyles.th, textAlign: 'right'}}>Price (Rs.)</th>
                            <th style={{...modalStyles.th, textAlign: 'right'}}>Total (Rs.)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {quotation.items.map((item, index) => (
                            <tr key={index}>
                                <td style={modalStyles.td}>{item.itemName}</td>
                                <td style={{...modalStyles.td, textAlign: 'center'}}>{item.quantity}</td>
                                <td style={{...modalStyles.td, textAlign: 'right'}}>{item.price.toFixed(2)}</td>
                                <td style={{...modalStyles.td, textAlign: 'right'}}>{(item.price * item.quantity).toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                
                <div style={modalStyles.totalRow}>
                    <span>Grand Total: Rs. {quotation.total.toFixed(2)}</span>
                </div>
                
                <button 
                    style={modalStyles.printButton} 
                    onClick={handlePrint}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9V2h12v7" />
                        <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                        <rect x="6" y="14" width="12" height="8" />
                    </svg>
                    Print Quotation
                </button>
            </div>
        </div>
    );
};

const Quotations = ({ internalUser }) => {
  const [priceCategories, setPriceCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [itemsInCategoryWithPrice, setItemsInCategoryWithPrice] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);

  const [itemInput, setItemInput] = useState("");
  const [selectedItemData, setSelectedItemData] = useState(null);
  const [displayPrice, setDisplayPrice] = useState("");
  const [qtyInput, setQtyInput] = useState(1);
  const [quotationItems, setQuotationItems] = useState([]);

  const [requestingPerson, setRequestingPerson] = useState("");
  const [details, setDetails] = useState("");

  const [quotationNumber, setQuotationNumber] = useState("");
  const [savedQuotations, setSavedQuotations] = useState([]);
  const [savedSearchTerm, setSavedSearchTerm] = useState("");

  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingQuotations, setLoadingQuotations] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Pagination State
  const [page, setPage] = useState(1);
  const [lastVisible, setLastVisible] = useState(null);
  const [pageHistory, setPageHistory] = useState([null]); // Store snapshot history for "Previous"
  const [isLastPage, setIsLastPage] = useState(false);

  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(false);
  const [viewingQuotation, setViewingQuotation] = useState(null);
  
  const [companyInfo, setCompanyInfo] = useState(null);

  const itemInputRef = useRef(null);
  const qtyInputRef = useRef(null);

  const getCurrentInternal = () => {
    if (internalUser && Object.keys(internalUser).length) return internalUser;
    try {
      const stored = localStorage.getItem("internalLoggedInUser");
      if (stored) return JSON.parse(stored);
    } catch {}
    return null;
  };

  const fetchProvisionalQuotationNumber = async () => {
    const user = auth.currentUser;
    if (!user) { setQuotationNumber("QTN-ERR"); return; }
    const today = new Date();
    const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const counterRef = doc(db, user.uid, "counters");
    try {
      const counterDoc = await getDoc(counterRef);
      const dailyCounter = counterDoc.exists() ? counterDoc.data().quotationCounters?.[datePrefix] || 0 : 0;
      const nextSeq = dailyCounter + 1;
      const provisionalNum = `QTN-${datePrefix}-${String(nextSeq).padStart(4, "0")}`;
      setQuotationNumber(provisionalNum);
    } catch (err) {
      console.error("Error fetching provisional quotation number:", err);
      setQuotationNumber(`QTN-${datePrefix}-ERR`);
    }
  };

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const fetchCats = async () => {
      try {
        const catColRef = collection(db, user.uid, "price_categories", "categories");
        const snap = await getDocs(query(catColRef, orderBy("name")));
        setPriceCategories(snap.docs.map(d => ({ value: d.id, label: d.data().name, ...d.data() })));
        
        const settingsDocRef = doc(db, user.uid, "settings");
        const settingsSnap = await getDoc(settingsDocRef);
        if (settingsSnap.exists()) {
          setCompanyInfo(settingsSnap.data());
        }
      } catch (err) {
        console.error("Error fetching categories:", err.message);
      }
    };
    fetchCats();
    fetchProvisionalQuotationNumber();
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!selectedCategory || !user) {
      setItemsInCategoryWithPrice([]);
      return;
    }
    const fetchPricedItems = async () => {
      setLoadingItems(true);
      try {
        const pricedItemsColRef = collection(db, user.uid, "price_categories", "priced_items");
        const q = query(pricedItemsColRef, where("categoryId", "==", selectedCategory.value));
        const itemsSnap = await getDocs(q);
        setItemsInCategoryWithPrice(itemsSnap.docs.map(d => ({ pricedItemId: d.id, price: d.data().price, itemInfo: d.data() })));
      } catch (err) { console.error("Error fetching priced items:", err.message); }
      setLoadingItems(false);
    };
    fetchPricedItems();
  }, [selectedCategory]);

  const fetchSavedQuotations = useCallback(async (direction = 'initial') => {
    const user = auth.currentUser;
    if (!user) return;
    setLoadingQuotations(true);
    
    try {
      const qtnColRef = collection(db, user.uid, "quotations", "quotation_list");
      
      let q = query(qtnColRef, orderBy("createdAt", "desc"), limit(ITEMS_PER_PAGE));

      if (direction === 'next' && lastVisible) {
          q = query(qtnColRef, orderBy("createdAt", "desc"), startAfter(lastVisible), limit(ITEMS_PER_PAGE));
      } else if (direction === 'prev' && page > 1) {
          // Retrieve the snapshot to start after from our history stack
          const prevPageStart = pageHistory[page - 2];
          q = query(qtnColRef, orderBy("createdAt", "desc"), startAfter(prevPageStart), limit(ITEMS_PER_PAGE));
      }

      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      setSavedQuotations(data);
      
      // Update pagination state
      if (data.length > 0) {
          setLastVisible(snap.docs[snap.docs.length - 1]);
          if (direction === 'next') {
              setPageHistory(prev => [...prev, snap.docs[0]]); // Push FIRST doc of this page to history
          }
      }
      
      setIsLastPage(data.length < ITEMS_PER_PAGE);

    } catch (err) { console.error("Error fetching saved quotations:", err); }
    setLoadingQuotations(false);
  }, [lastVisible, page, pageHistory]); // Dependencies for pagination

  // Initial Fetch
  useEffect(() => {
    fetchSavedQuotations('initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!itemInput.trim() || !selectedCategory) {
      setFilteredItems([]); setShowDropdown(false); return;
    }
    const filtered = itemsInCategoryWithPrice.filter(i =>
      i.itemInfo.itemName.toLowerCase().includes(itemInput.toLowerCase()) ||
      i.itemInfo.itemSKU?.toLowerCase().includes(itemInput.toLowerCase())
    );
    setFilteredItems(filtered); setSelectedIndex(0); setShowDropdown(filtered.length > 0);
  }, [itemInput, itemsInCategoryWithPrice, selectedCategory]);

  const handleItemKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(prev => (prev + 1) % filteredItems.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length); }
    else if (e.key === "Enter") { e.preventDefault(); if (filteredItems[selectedIndex]) handleItemSelect(filteredItems[selectedIndex]); }
  };
  const handleItemSelect = (itemData) => {
    setItemInput(itemData.itemInfo.itemName);
    setDisplayPrice(itemData.price.toFixed(2));
    setSelectedItemData(itemData);
    setShowDropdown(false);
    setTimeout(() => qtyInputRef.current?.focus(), 50);
  };
  const handleQtyKeyDown = (e) => { if (e.key === "Enter") { e.preventDefault(); addItemToQuotation(); } };
  const handleQtyChange = (e) => { const value = e.target.value; if (value === "" || /^[0-9]*\.?[0-9]*$/.test(value)) { setQtyInput(value); } };
  const addItemToQuotation = () => {
    if (!selectedItemData || !qtyInput || isNaN(qtyInput) || qtyInput <= 0 || !selectedCategory) return;
    const existingItemIndex = quotationItems.findIndex(item => item.itemId === selectedItemData.itemInfo.itemId);
    if (existingItemIndex > -1) {
      const updatedItems = [...quotationItems]; updatedItems[existingItemIndex].quantity += Number(qtyInput); setQuotationItems(updatedItems);
    } else {
      setQuotationItems(prev => [...prev, { itemId: selectedItemData.itemInfo.itemId, itemName: selectedItemData.itemInfo.itemName, price: selectedItemData.price, quantity: Number(qtyInput), }]);
    }
    setItemInput(""); setDisplayPrice(""); setQtyInput(1); setSelectedItemData(null); setShowDropdown(false); itemInputRef.current?.focus();
  };
  const removeQuotationItem = (index) => setQuotationItems(prev => prev.filter((_, i) => i !== index));

  const total = quotationItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleSaveQuotation = async () => {
    if (!selectedCategory || quotationItems.length === 0) { return alert("Please select a price category and add items."); }
    if (!requestingPerson.trim()) { return alert("Please enter the requesting person or company name."); }
    const user = auth.currentUser; if (!user) return alert("You are not logged in.");
    const internalUser = getCurrentInternal();
    setIsSaving(true);
    try {
      const counterRef = doc(db, user.uid, "counters");
      const qtnColRef = collection(db, user.uid, "quotations", "quotation_list");
      const newQuotationRef = doc(qtnColRef);
      await runTransaction(db, async (transaction) => {
        const today = new Date(); const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        const counterDoc = await transaction.get(counterRef); const dailyCounter = counterDoc.exists() ? counterDoc.data().quotationCounters?.[datePrefix] || 0 : 0;
        const nextSeq = dailyCounter + 1; const newQtnNum = `QTN-${datePrefix}-${String(nextSeq).padStart(4, "0")}`;
        transaction.set(counterRef, { quotationCounters: { [datePrefix]: nextSeq } }, { merge: true });
        const quotationDataForDb = {
          priceCategoryId: selectedCategory.value, priceCategoryName: selectedCategory.label, items: quotationItems, total: total, createdAt: serverTimestamp(), quotationNumber: newQtnNum, createdBy: internalUser?.username || "Admin",
          requestingPerson: requestingPerson.trim(), details: details.trim(),
        };
        transaction.set(newQuotationRef, quotationDataForDb);
      });
      alert("Quotation saved successfully!");
      setQuotationItems([]); setSelectedCategory(null); setItemInput(""); setDisplayPrice(""); setQtyInput(1); setSelectedItemData(null);
      setRequestingPerson(""); setDetails("");
      // Refresh list to top
      setPage(1); setLastVisible(null); setPageHistory([null]);
      await fetchProvisionalQuotationNumber(); 
      await fetchSavedQuotations('initial');
    } catch (error) { alert("Failed to save quotation: " + error.message); }
    finally { setIsSaving(false); }
  };

  const handleDeleteQuotation = async (quotationId) => {
      if (!window.confirm("Are you sure you want to delete this quotation? This cannot be undone.")) return;
      const user = auth.currentUser; if (!user) return alert("You are not logged in.");
      try {
          const qtnDocRef = doc(db, user.uid, "quotations", "quotation_list", quotationId);
          await deleteDoc(qtnDocRef);
          alert("Quotation deleted successfully.");
          fetchSavedQuotations(page === 1 ? 'initial' : 'prev'); // Refresh
      } catch (error) {
          console.error("Error deleting quotation:", error);
          alert("Failed to delete quotation: " + error.message);
      }
  };

  const handleNextPage = () => { if (!isLastPage) { setPage(p => p + 1); fetchSavedQuotations('next'); } };
  const handlePrevPage = () => { if (page > 1) { setPageHistory(prev => { const n = [...prev]; n.pop(); return n; }); setPage(p => p - 1); fetchSavedQuotations('prev'); } };

  // Client-side search within the FETCHED page
  const filteredSavedQuotations = savedQuotations.filter(qtn => {
      if (!savedSearchTerm.trim()) return true;
      const term = savedSearchTerm.toLowerCase();
      return (
          qtn.quotationNumber.toLowerCase().includes(term) ||
          (qtn.requestingPerson && qtn.requestingPerson.toLowerCase().includes(term))
      );
  });

  return (
    <div style={styles.container}>
      {isSaving && ( <div style={styles.savingOverlay}> Saving Quotation... </div> )}
      {viewingQuotation && ( <QuotationViewerModal quotation={viewingQuotation} onClose={() => setViewingQuotation(null)} companyInfo={companyInfo} /> )}

      <div style={styles.mainPanel}>
        <div style={styles.header}>
            <div style={{textAlign: 'left'}}> <h2 style={styles.title}>Create Quotation</h2> </div>
            <div style={{textAlign: 'right'}}> <div style={styles.invoiceLabel}>QUOTATION #</div> <div style={styles.invoiceNumber}>{quotationNumber}</div> </div>
            <div style={{textAlign: 'right'}}> <div style={styles.invoiceLabel}>CREATED BY</div> <div style={styles.invoiceNumber}>{getCurrentInternal()?.username || 'Admin'}</div> </div>
        </div>

        <div style={styles.detailsInputSection}>
             <div style={{flex: 1}}>
                 <label style={styles.label}>REQUESTING PERSON / COMPANY *</label>
                 <input type="text" value={requestingPerson} onChange={e => setRequestingPerson(e.target.value)} placeholder="Enter name or company..." style={styles.input} required />
             </div>
             <div style={{flex: 1}}>
                 <label style={styles.label}>DETAILS / REMARKS (Optional)</label>
                 <input type="text" value={details} onChange={e => setDetails(e.target.value)} placeholder="Any additional notes..." style={styles.input} />
             </div>
        </div>

        <div style={styles.inputSection}>
          <label style={styles.label}>SELECT PRICE CATEGORY *</label>
          <Select options={priceCategories} value={selectedCategory} onChange={(selectedOption) => { setSelectedCategory(selectedOption); setItemInput(""); setDisplayPrice(""); setQtyInput(1); setSelectedItemData(null); setQuotationItems([]); itemInputRef.current?.focus(); }} placeholder="Select a price category..." styles={{ control: base => ({...base, height: '45px'}) }} />
        </div>

        <div style={styles.itemEntrySection}>
             <div style={{position: 'relative', flex: 2}}>
                <label style={styles.label}>ADD ITEM *</label>
                <input ref={itemInputRef} value={itemInput} onChange={e => setItemInput(e.target.value)} onKeyDown={handleItemKeyDown} placeholder="Type item name or SKU..." style={styles.input} disabled={!selectedCategory || loadingItems} />
                {showDropdown && filteredItems.length > 0 && (
                <ul style={styles.dropdown}>
                    {filteredItems.map((i, idx) => ( <li key={i.pricedItemId} style={{ ...styles.dropdownItem, ...(idx === selectedIndex ? styles.dropdownItemSelected : {}) }} onClick={() => handleItemSelect(i)}> {i.itemInfo.itemName} <span style={styles.dropdownPrice}>Rs. {i.price.toFixed(2)}</span> </li> ))}
                </ul>
                )}
                {loadingItems && <div style={{position: 'absolute', top: '35px', left: '10px', color: '#888'}}>Loading items...</div>}
             </div>
            <div style={{width: '120px'}}>
                <label style={styles.label}>PRICE (Rs.)</label>
                <input type="text" value={displayPrice} readOnly style={{...styles.input, backgroundColor: '#eee', textAlign: 'right'}} />
            </div>
            <div style={{width: '100px'}}>
                <label style={styles.label}>QTY *</label>
                <input ref={qtyInputRef} value={qtyInput} onChange={handleQtyChange} onKeyDown={handleQtyKeyDown} onFocus={(e) => e.target.select()} type="text" inputMode="decimal" style={styles.input} disabled={!selectedItemData} />
            </div>
            <button onClick={addItemToQuotation} style={styles.addButton} disabled={!selectedItemData || qtyInput <= 0}> ADD </button>
        </div>

        <div style={styles.tableContainer}>
            <table style={styles.table}>
                <thead><tr><th style={styles.th}>ITEM</th><th style={styles.th}>QTY</th><th style={styles.th}>PRICE</th><th style={styles.th}>TOTAL</th><th style={styles.th}></th></tr></thead>
                <tbody>
                    {quotationItems.length === 0 ? ( <tr><td colSpan="5" style={styles.emptyState}>No items added to quotation</td></tr> ) : (
                      quotationItems.map((item, idx) => ( <tr key={idx}><td style={styles.td}>{item.itemName}</td><td style={styles.td}>{item.quantity}</td><td style={styles.td}>Rs. {item.price.toFixed(2)}</td><td style={styles.td}>Rs. {(item.price * item.quantity).toFixed(2)}</td><td style={styles.td}><button onClick={() => removeQuotationItem(idx)} style={styles.removeButton}>✕</button></td></tr> ))
                    )}
                </tbody>
            </table>
        </div>
        <div style={styles.footerSection}>
             <div style={styles.grandTotalRow}> <span>TOTAL</span> <span>Rs. {total.toFixed(2)}</span> </div>
            <button
                onClick={handleSaveQuotation}
                disabled={isSaving || quotationItems.length === 0 || !selectedCategory || !requestingPerson.trim()}
                style={{...styles.saveButton, ...(isSaving || quotationItems.length === 0 || !selectedCategory || !requestingPerson.trim() ? styles.saveButtonDisabled : {})}}
            > {isSaving ? 'SAVING...' : 'SAVE QUOTATION'} </button>
        </div>
      </div>

      <div style={styles.savedPanel}>
        <h3 style={styles.title}>Saved Quotations</h3>
        <div style={{ position: "relative", marginBottom: '16px' }}>
            <AiOutlineSearch style={{ position: "absolute", top: "10px", left: "10px", color: "#888" }} />
            <input type="text" placeholder="Search current page..." value={savedSearchTerm} onChange={(e) => setSavedSearchTerm(e.target.value)} style={{ width: "100%", padding: "8px 8px 8px 34px", borderRadius: 4, border: "1px solid #ddd", boxSizing: 'border-box' }} />
        </div>

         <div style={{...styles.tableContainer, height: 'calc(100% - 150px)'}}>
            <table style={{...styles.table, tableLayout: 'fixed'}}>
                <thead>
                    <tr>
                        <th style={{...styles.th, width: '130px'}}>QTN #</th>
                        <th style={{...styles.th, width: '100px'}}>Date</th>
                        <th style={{...styles.th}}>Requested By</th>
                        <th style={{...styles.th, width: '100px'}}>Total</th>
                        <th style={{...styles.th, width: '100px'}}>User</th>
                        <th style={{...styles.th, width: '80px'}}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                     {loadingQuotations ? ( <tr><td colSpan="6" style={styles.emptyState}>Loading...</td></tr> )
                     : filteredSavedQuotations.length === 0 ? ( <tr><td colSpan="6" style={styles.emptyState}>No quotations found.</td></tr> )
                     : (
                        filteredSavedQuotations.map(qtn => {
                            const createdAtDate = qtn.createdAt instanceof Date ? qtn.createdAt : qtn.createdAt?.toDate();
                            return (
                                <tr key={qtn.id}>
                                    <td style={{...styles.td, whiteSpace: 'nowrap'}}>{qtn.quotationNumber}</td>
                                    <td style={{...styles.td, whiteSpace: 'nowrap'}}>{createdAtDate?.toLocaleDateString()}</td>
                                    <td style={{...styles.td, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{qtn.requestingPerson}</td>
                                    <td style={{...styles.td, whiteSpace: 'nowrap'}}>Rs. {qtn.total.toFixed(2)}</td>
                                    <td style={{...styles.td, whiteSpace: 'nowrap'}}>{qtn.createdBy}</td>
                                    <td style={styles.td}>
                                        <div style={{display: 'flex', gap: '8px', justifyContent: 'center'}}>
                                            <button onClick={() => setViewingQuotation(qtn)} style={{...styles.viewButton, padding: '4px'}} title="View Details"><AiOutlineEye size={16} /></button>
                                            <button onClick={() => handleDeleteQuotation(qtn.id)} style={{...styles.deleteButtonSmall, padding: '4px'}} title="Delete Quotation"><AiOutlineDelete size={16} /></button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
         </div>
         {/* PAGINATION CONTROLS */}
         <div style={styles.paginationControls}>
             <button onClick={handlePrevPage} disabled={page === 1} style={{...styles.pageButton, opacity: page === 1 ? 0.5 : 1}}><AiOutlineLeft /> Prev</button>
             <span style={styles.pageInfo}>Page {page}</span>
             <button onClick={handleNextPage} disabled={isLastPage} style={{...styles.pageButton, opacity: isLastPage ? 0.5 : 1}}>Next <AiOutlineRight /></button>
         </div>
      </div>
    </div>
  );
};

const styles = {
    container: { display: 'flex', height: 'calc(100vh - 180px)', fontFamily: "'Inter', sans-serif", gap: '20px', padding: '20px', backgroundColor: '#f3f4f6' },
    mainPanel: { flex: 3, display: 'flex', flexDirection: 'column', gap: '20px', backgroundColor: 'white', padding: '24px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
    savedPanel: { flex: 2, display: 'flex', flexDirection: 'column', backgroundColor: 'white', padding: '24px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: '16px' },
    title: { fontSize: '22px', fontWeight: '600', color: '#1f2937', margin: 0 },
    invoiceLabel: { fontSize: '12px', color: '#6b7280', fontWeight: '600' },
    invoiceNumber: { fontSize: '18px', fontWeight: '700', color: '#1f2937' },
    inputSection: { marginBottom: '10px' },
    detailsInputSection: { display: 'flex', gap: '20px', marginBottom: '10px'},
    itemEntrySection: { display: 'flex', gap: '10px', alignItems: 'flex-end' },
    label: { display: 'block', fontSize: '12px', fontWeight: '600', color: '#4b5563', marginBottom: '8px' },
    input: { width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' },
    dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #d1d5db', borderRadius: '0 0 6px 6px', maxHeight: '200px', overflowY: 'auto', zIndex: 100, listStyle: 'none', margin: 0, padding: 0 },
    dropdownItem: { padding: '10px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between' },
    dropdownItemSelected: { backgroundColor: '#e0e7ff', color: '#3730a3' },
    dropdownPrice: { color: '#6b7280', fontSize: '12px' },
    addButton: { padding: '12px 24px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', height: '45px' },
    tableContainer: { flex: 1, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px', marginTop: '10px' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { padding: '10px', textAlign: 'left', color: '#6b7280', fontSize: '12px', fontWeight: '600', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb', position: 'sticky', top: 0, zIndex: 1 },
    td: { padding: '10px', borderBottom: '1px solid #e5e7eb' },
    emptyState: { textAlign: 'center', color: '#9ca3af', padding: '20px' },
    removeButton: { background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' },
    footerSection: { borderTop: '1px solid #e5e7eb', paddingTop: '16px', marginTop: 'auto' },
    grandTotalRow: { display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '20px', color: '#16a34a', marginBottom: '16px' },
    saveButton: { width: '100%', padding: '16px', backgroundColor: '#2563eb', color: 'white', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', borderRadius: '6px' },
    saveButtonDisabled: { backgroundColor: '#9ca3af', cursor: 'not-allowed' },
    savingOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255, 255, 255, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, fontSize: '18px', fontWeight: '600' },
    viewButton: { background: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' },
    deleteButtonSmall: { background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' },
    paginationControls: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '10px 0', borderTop: '1px solid #e5e7eb' },
    pageButton: { display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 16px', border: '1px solid #d1d5db', backgroundColor: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', color: '#374151' },
    pageInfo: { fontSize: '14px', color: '#6b7280', fontWeight: '500' },
};

export default Quotations;