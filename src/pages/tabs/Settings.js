import React, { useEffect, useState } from "react";
import { auth, db } from "../../firebase";
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { AiOutlineEdit, AiOutlineDelete, AiOutlineUpload, AiOutlineLogout } from "react-icons/ai";

const CLOUD_NAME = "davjh8sjg";
const UPLOAD_PRESET = "user_images";

const AVAILABLE_UNITS = [
  "Single Pcs", "Units", "Kg", "Litre", "Metre", 
  "Sqft", "Yards", "Feets", "Bottle", "Can", 
  "Tub", "Packet", "Boxes"
];

const inventoryTypeDescriptions = {
  "Buy and Sell only": "Choose this if you primarily buy finished goods and sell them without modification.",
  "Production Selling only": "Choose this if you manufacture or produce your own items to sell.",
  "We doing both": "Choose this for a hybrid model where you both produce items and buy/sell other finished goods."
};

const Settings = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  const [userInfo, setUserInfo] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [formInput, setFormInput] = useState({
    fullName: "",
    email: "",
    phone: "",
    companyAddress: "",
    companyName: "",
    companyLogo: "",
  });
  const [inventoryType, setInventoryType] = useState("Buy and Sell only");
  const [itemCategories, setItemCategories] = useState([]);
  const [newCategory, setNewCategory] = useState("");
  const [stockReminder, setStockReminder] = useState("Do not remind");
  const [selectedUnits, setSelectedUnits] = useState([]);
  const [logoUploading, setLogoUploading] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [defaultCustomerId, setDefaultCustomerId] = useState("");
  const [useShiftProduction, setUseShiftProduction] = useState(false);
  const [productionShifts, setProductionShifts] = useState([]);
  const [editingShift, setEditingShift] = useState(null);

  // ✅ NEW: Expire Maintain State
  const [expireMaintain, setExpireMaintain] = useState(false);

  const [expenseCategories, setExpenseCategories] = useState([]);
  const [newExpenseCategory, setNewExpenseCategory] = useState("");
  
  const [autoPrintInvoice, setAutoPrintInvoice] = useState(false);
  const [offerDelivery, setOfferDelivery] = useState(false);
  const [openCashDrawerWithPrint, setOpenCashDrawerWithPrint] = useState(false);
  const [useSinhalaInvoice, setUseSinhalaInvoice] = useState(false);
  const [showOrderNo, setShowOrderNo] = useState(false); 
  const [doubleLineInvoiceItem, setDoubleLineInvoiceItem] = useState(false);
  
  // ✅ Return Policy State
  const [returnPolicy, setReturnPolicy] = useState("");
  const [editReturnPolicy, setEditReturnPolicy] = useState(false);

  // ✅ NEW: Warranty Feature State
  const [enableWarranty, setEnableWarranty] = useState(false);

  const [priceCategories, setPriceCategories] = useState([]);
  const [servicePriceCategory, setServicePriceCategory] = useState("");
  const [enableServiceOrders, setEnableServiceOrders] = useState(false);
  const [enableKOD, setEnableKOD] = useState(false);
  const [dineInAvailable, setDineInAvailable] = useState(false);
  const [serviceCharge, setServiceCharge] = useState("");
  const [editServiceCharge, setEditServiceCharge] = useState(false);

  const [sendInvoiceSms, setSendInvoiceSms] = useState(false);
  const [smsCredits, setSmsCredits] = useState(0);
  const [extraSmsCredits, setExtraSmsCredits] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        navigate("/");
        return;
      }
      const uid = currentUser.uid;
      const settingsDocRef = doc(db, uid, "settings");
      const userInfoRef = doc(db, "Userinfo", uid);

      try {
        // 1. Fetch BOTH Settings and UserInfo (Registration Data)
        const [settingsSnap, userInfoSnap] = await Promise.all([
            getDoc(settingsDocRef),
            getDoc(userInfoRef)
        ]);

        let finalData = {};
        let registrationData = {};

        if (userInfoSnap.exists()) {
            registrationData = userInfoSnap.data();
            setSmsCredits(registrationData.smsCredits || 0);
            setExtraSmsCredits(registrationData.extraSmsCredits || 0);
        }

        if (settingsSnap.exists()) {
          // --- SCENARIO 1: SETTINGS EXIST ---
          finalData = settingsSnap.data();

          // 🛠️ AUTO-FIX: If Settings are missing Phone/Name but Registration has them, SYNC IT.
          let updatesNeeded = {};
          if (!finalData.phone && registrationData.phone) {
              finalData.phone = registrationData.phone;
              updatesNeeded.phone = registrationData.phone;
          }
          if (!finalData.fullName && registrationData.fullName) {
              finalData.fullName = registrationData.fullName;
              updatesNeeded.fullName = registrationData.fullName;
          }
          if (!finalData.companyAddress && registrationData.companyAddress) {
              finalData.companyAddress = registrationData.companyAddress;
              updatesNeeded.companyAddress = registrationData.companyAddress;
          }
          if (!finalData.companyName && registrationData.companyName) {
              finalData.companyName = registrationData.companyName;
              updatesNeeded.companyName = registrationData.companyName;
          }

          // Apply fixes to DB if any found
          if (Object.keys(updatesNeeded).length > 0) {
              await updateDoc(settingsDocRef, updatesNeeded);
              console.log("Auto-fixed missing settings data from registration profile.");
          }

        } else {
          // --- SCENARIO 2: FIRST TIME LOAD (Create Defaults) ---
          finalData = {
            fullName: registrationData.fullName || "",
            email: auth.currentUser.email,
            phone: registrationData.phone || "",
            companyAddress: registrationData.companyAddress || "",
            companyName: registrationData.companyName || "My Business",
            companyLogo: "",
            inventoryType: "Buy and Sell only",
            itemCategories: ["Default Category"],
            itemUnits: ["Units", "Kg", "Metre"],
            stockReminder: "Do not remind",
            defaultCustomerId: "",
            useShiftProduction: false,
            productionShifts: [],
            expenseCategories: [],
            autoPrintInvoice: false,
            offerDelivery: false,
            openCashDrawerWithPrint: false,
            useSinhalaInvoice: false,
            showOrderNo: false,
            serviceJobPriceCategory: "",
            enableServiceOrders: false,
            doubleLineInvoiceItem: false,
            enableKOD: false,
            dineInAvailable: false,
            serviceCharge: "",
            sendInvoiceSms: false,
            returnPolicy: "",
            enableWarranty: false,
            expireMaintain: false, // Default value
          };
          await setDoc(settingsDocRef, finalData);
        }

        // --- SET STATE WITH FINAL DATA ---
        setUserInfo(finalData);
        setFormInput({
            fullName: finalData.fullName || "",
            email: finalData.email || auth.currentUser.email,
            phone: finalData.phone || "",
            companyAddress: finalData.companyAddress || "",
            companyName: finalData.companyName || "",
            companyLogo: finalData.companyLogo || "",
        });

        // Set remaining states
        setInventoryType(finalData.inventoryType || "Buy and Sell only");
        setItemCategories(finalData.itemCategories || []);
        setSelectedUnits(finalData.itemUnits || ["Units", "Kg", "Metre"]);
        setStockReminder(finalData.stockReminder || "Do not remind");
        setDefaultCustomerId(finalData.defaultCustomerId || "");
        setUseShiftProduction(finalData.useShiftProduction || false);
        setProductionShifts(finalData.productionShifts || []);
        setExpenseCategories(finalData.expenseCategories || []);
        setAutoPrintInvoice(finalData.autoPrintInvoice || false);
        setOfferDelivery(finalData.offerDelivery || false);
        setOpenCashDrawerWithPrint(finalData.openCashDrawerWithPrint || false);
        setUseSinhalaInvoice(finalData.useSinhalaInvoice || false); 
        setShowOrderNo(finalData.showOrderNo || false); 
        setServicePriceCategory(finalData.serviceJobPriceCategory || "");
        setEnableServiceOrders(finalData.enableServiceOrders || false);
        setDoubleLineInvoiceItem(finalData.doubleLineInvoiceItem || false);
        setEnableKOD(finalData.enableKOD || false);
        setDineInAvailable(finalData.dineInAvailable || false);
        setServiceCharge(finalData.serviceCharge || "");
        setSendInvoiceSms(finalData.sendInvoiceSms || false);
        setReturnPolicy(finalData.returnPolicy || ""); 
        
        // ✅ Load Warranty Setting
        setEnableWarranty(finalData.enableWarranty || false);
        
        // ✅ Load Expire Maintain Setting
        setExpireMaintain(finalData.expireMaintain || false);

        // --- FETCH SUBCOLLECTIONS ---
        const customersColRef = collection(db, uid, "customers", "customer_list");
        const customersSnap = await getDocs(customersColRef);
        setCustomers(customersSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        const catColRef = collection(db, uid, "price_categories", "categories");
        const catSnap = await getDocs(query(catColRef));
        const catData = catSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPriceCategories(catData);

      } catch (error) {
        alert("Error fetching settings: " + error.message);
      }
      setLoading(false);
    };

    fetchData();
  }, [navigate]);

  const getSettingsDocRef = () => {
      const uid = auth.currentUser.uid;
      return doc(db, uid, "settings");
  }

  const uploadLogo = async (file) => {
    if (!file) return;
    setLogoUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);
    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData });
      const data = await res.json();
      if (data.secure_url) {
        await updateDoc(getSettingsDocRef(), { companyLogo: data.secure_url });
        setUserInfo((prev) => ({ ...prev, companyLogo: data.secure_url }));
        setFormInput((prev) => ({ ...prev, companyLogo: data.secure_url })); 
        alert("Logo uploaded successfully!");
      }
    } catch (error) { alert("Logo upload failed: " + error.message); }
    setLogoUploading(false);
  };

  const handleSave = async () => {
    try {
      const { email, ...updateData } = formInput;
      await updateDoc(getSettingsDocRef(), updateData);
      setUserInfo(prev => ({...prev, ...updateData}));
      setEditMode(false);
      alert("Personal info updated successfully!");
    } catch (error) { alert("Failed to update info: " + error.message); }
  };

  const handleInventoryTypeChange = async (value) => {
    setInventoryType(value);
    await updateDoc(getSettingsDocRef(), { inventoryType: value });
  };

  const handleAddCategory = async () => {
    if (!newCategory.trim()) return;
    const updatedCategories = [...itemCategories, newCategory.trim()];
    await updateDoc(getSettingsDocRef(), { itemCategories: updatedCategories });
    setItemCategories(updatedCategories);
    setNewCategory("");
  };

  const handleDeleteCategory = async (category) => {
    const updatedCategories = itemCategories.filter((c) => c !== category);
    await updateDoc(getSettingsDocRef(), { itemCategories: updatedCategories });
    setItemCategories(updatedCategories);
  };

  const handleUnitChange = async (unit) => {
    const updatedUnits = selectedUnits.includes(unit) ? selectedUnits.filter(u => u !== unit) : [...selectedUnits, unit];
    setSelectedUnits(updatedUnits);
    await updateDoc(getSettingsDocRef(), { itemUnits: updatedUnits });
  };

  const handleStockReminderChange = async (value) => {
    setStockReminder(value);
    await updateDoc(getSettingsDocRef(), { stockReminder: value });
  };

  // ✅ NEW: Handle Expire Maintain Change
  const handleExpireMaintainChange = async (value) => {
    setExpireMaintain(value);
    await updateDoc(getSettingsDocRef(), { expireMaintain: value });
  };

  const handleToggleShiftProduction = async (value) => {
    setUseShiftProduction(value);
    await updateDoc(getSettingsDocRef(), { useShiftProduction: value });
  };

  const handleAddShift = async () => {
    const nextShiftLetter = String.fromCharCode(65 + productionShifts.length);
    const newShift = `Shift ${nextShiftLetter}`;
    const updatedShifts = [...productionShifts, newShift];
    setProductionShifts(updatedShifts);
    await updateDoc(getSettingsDocRef(), { productionShifts: updatedShifts });
  };

  const handleSaveShiftName = async (indexToSave) => {
    if (!editingShift || editingShift.name.trim() === "") return;
    const updatedShifts = productionShifts.map((shift, index) => index === indexToSave ? editingShift.name.trim() : shift);
    setProductionShifts(updatedShifts);
    await updateDoc(getSettingsDocRef(), { productionShifts: updatedShifts });
    setEditingShift(null);
  };

  const handleDeleteShift = async (indexToDelete) => {
    if (!window.confirm("Are you sure you want to delete this shift?")) return;
    const updatedShifts = productionShifts.filter((_, index) => index !== indexToDelete);
    setProductionShifts(updatedShifts);
    await updateDoc(getSettingsDocRef(), { productionShifts: updatedShifts });
  };
  
  const handleAddExpenseCategory = async () => {
    if (!newExpenseCategory.trim()) return;
    const updatedCategories = [...expenseCategories, newExpenseCategory.trim()];
    await updateDoc(getSettingsDocRef(), { expenseCategories: updatedCategories });
    setExpenseCategories(updatedCategories);
    setNewExpenseCategory("");
  };

  const handleDeleteExpenseCategory = async (categoryToDelete) => {
    const updatedCategories = expenseCategories.filter(c => c !== categoryToDelete);
    await updateDoc(getSettingsDocRef(), { expenseCategories: updatedCategories });
    setExpenseCategories(updatedCategories);
  };

  const handleDefaultCustomerChange = async (value) => {
    setDefaultCustomerId(value);
    await updateDoc(getSettingsDocRef(), { defaultCustomerId: value });
  };

  const handleAutoPrintChange = async (value) => {
    setAutoPrintInvoice(value);
    const updates = { autoPrintInvoice: value };
    if (value) { 
        setSendInvoiceSms(false); 
        updates.sendInvoiceSms = false; 
    }
    await updateDoc(getSettingsDocRef(), updates);
  };

  const handleOfferDeliveryChange = async (value) => {
    setOfferDelivery(value);
    await updateDoc(getSettingsDocRef(), { offerDelivery: value });
  };

  const handleOpenCashDrawerChange = async (value) => {
    setOpenCashDrawerWithPrint(value);
    await updateDoc(getSettingsDocRef(), { openCashDrawerWithPrint: value });
  };
  
  const handleUseSinhalaInvoiceChange = async (value) => {
    setUseSinhalaInvoice(value);
    await updateDoc(getSettingsDocRef(), { useSinhalaInvoice: value });
  };

  const handleShowOrderNoChange = async (value) => {
    setShowOrderNo(value);
    await updateDoc(getSettingsDocRef(), { showOrderNo: value });
  };

  const handleDoubleLineInvoiceChange = async (value) => {
    setDoubleLineInvoiceItem(value);
    await updateDoc(getSettingsDocRef(), { doubleLineInvoiceItem: value });
  };

  // ✅ NEW: Warranty Toggle Handler
  const handleEnableWarrantyChange = async (value) => {
    setEnableWarranty(value);
    await updateDoc(getSettingsDocRef(), { enableWarranty: value });
  };

  const handleServicePriceCategoryChange = async (value) => {
    setServicePriceCategory(value);
    await updateDoc(getSettingsDocRef(), { serviceJobPriceCategory: value });
  };
  
  const handleEnableServiceOrdersChange = async (value) => {
    setEnableServiceOrders(value);
    await updateDoc(getSettingsDocRef(), { enableServiceOrders: value });
  };

  const handleEnableKODChange = async (value) => {
    setEnableKOD(value);
    await updateDoc(getSettingsDocRef(), { enableKOD: value });
  };

  const handleDineInChange = async (value) => {
    setDineInAvailable(value);
    await updateDoc(getSettingsDocRef(), { dineInAvailable: value });
  };

  const handleSaveServiceCharge = async () => {
    await updateDoc(getSettingsDocRef(), { serviceCharge: serviceCharge });
    setEditServiceCharge(false);
    alert("Service charge updated!");
  };

  const handleSendInvoiceSmsChange = async (value) => {
    setSendInvoiceSms(value);
    const updates = { sendInvoiceSms: value };
    if (value) { 
        setAutoPrintInvoice(false); 
        updates.autoPrintInvoice = false; 
    }
    await updateDoc(getSettingsDocRef(), updates);
  };

  // ✅ Save Return Policy with Edit/Save Logic
  const handleSaveReturnPolicy = async () => {
    try {
        await updateDoc(getSettingsDocRef(), { returnPolicy: returnPolicy });
        setEditReturnPolicy(false); // Switch back to view mode
        alert("Return policy updated successfully!");
    } catch (e) {
        alert("Failed to save return policy: " + e.message);
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
    navigate("/");
  };
  
  if (loading) return (
    <div style={styles.loadingContainer}><div style={styles.loadingSpinner}></div><p style={styles.loadingText}>Loading settings...</p></div>
  );

  return (
    <div style={styles.container}>
      <div style={styles.headerContainer}><h2 style={styles.header}>Settings</h2><p style={styles.subHeader}>Manage your account and application preferences</p></div>
      
      {/* Personal Information */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Personal Information</h3>
            {!editMode && (<button style={styles.editButton} onClick={() => setEditMode(true)}><AiOutlineEdit size={16} /> Edit</button>)}
        </div>
        <div style={styles.formGroup}>
            <label style={styles.label}>Company Logo</label>
            <div style={styles.logoContainer}>
                {/* ✅ MODIFIED: Show person.jpg as default if no companyLogo is set */}
                <img 
                    src={userInfo?.companyLogo || "/person.jpg"} 
                    alt="Company Logo" 
                    style={styles.logoImage} 
                />
                
                <div style={styles.fileInputContainer}>
                    <label htmlFor="logo-upload" style={logoUploading ? styles.uploadButtonDisabled : styles.uploadButton}>
                        <AiOutlineUpload size={16} /> {logoUploading ? 'Uploading...' : 'Upload Logo'}
                        <input id="logo-upload" type="file" accept="image/*" onChange={(e) => uploadLogo(e.target.files[0])} disabled={logoUploading} style={styles.hiddenFileInput} />
                    </label>
                </div>
            </div>
        </div>
      {["companyName", "fullName", "email", "phone", "companyAddress"].map((field) => (
        <div style={styles.formGroup} key={field}>
            <label style={styles.label}>{field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1')}</label>
            {editMode ? (
                (field === "email" || field === "phone") ? (
                    <input type="text" value={formInput[field]} style={styles.inputDisabled} readOnly/>
                ) : (
                    <input type="text" value={formInput[field]} onChange={(e) => setFormInput({ ...formInput, [field]: e.target.value })} style={styles.input} placeholder={`Enter your ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}`}/>
                )
            ) : (
                <p style={styles.value}>{userInfo?.[field] || "Not provided"}</p>
            )}
        </div>
      ))}
      {editMode && (<div style={styles.buttonGroup}><button style={styles.cancelButton} onClick={() => setEditMode(false)}>Cancel</button><button style={styles.saveButton} onClick={handleSave}>Save Changes</button></div>)}</div>

      {/* Inventory Settings */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Inventory Settings</h3>
        <div style={styles.formGroup}><label style={styles.label}>Inventory Type</label><select value={inventoryType} onChange={(e) => handleInventoryTypeChange(e.target.value)} style={styles.select}><option value="Buy and Sell only">Buy and Sell only</option><option value="Production Selling only">Production Selling only</option><option value="We doing both">We doing both</option></select><p style={styles.helpText}>{inventoryTypeDescriptions[inventoryType]}</p></div>
        {(inventoryType === "Production Selling only" || inventoryType === "We doing both") && (<div style={styles.formGroup}><label style={styles.label}>Use a shift based production</label><div style={styles.toggleContainer}><button onClick={() => handleToggleShiftProduction(true)} style={useShiftProduction ? styles.toggleButtonActive : styles.toggleButton}>Yes</button><button onClick={() => handleToggleShiftProduction(false)} style={!useShiftProduction ? styles.toggleButtonActive : styles.toggleButton}>No</button></div>{useShiftProduction && (<div style={styles.shiftsManagementContainer}>{productionShifts.map((shift, index) => (<div key={index} style={styles.shiftItem}>{editingShift?.index === index ? (<><input type="text" value={editingShift.name} onChange={(e) => setEditingShift({...editingShift, name: e.target.value})} style={styles.shiftInput}/><button onClick={() => handleSaveShiftName(index)} style={styles.shiftSaveBtn}>Save</button></>) : (<><span>{shift}</span><div style={styles.shiftActions}><button onClick={() => setEditingShift({index, name: shift})} style={styles.shiftRenameBtn}>Rename</button><button onClick={() => handleDeleteShift(index)} style={styles.shiftDeleteBtn}><AiOutlineDelete size={16} /></button></div></>)}</div>))}<button onClick={handleAddShift} style={styles.addShiftButton}>+ Add a shift</button></div>)}</div>)}
        <div style={styles.formGroup}><label style={styles.label}>Low Stock Reminder</label><select value={stockReminder} onChange={(e) => handleStockReminderChange(e.target.value)} style={styles.select}><option value="Do not remind">Do not remind</option><option value="50">Remind at 50%</option><option value="20">Remind at 20%</option><option value="10">Remind at 10%</option></select><p style={styles.helpText}>Get notified when stock goes below the selected percentage</p></div>
        
        {/* ✅ NEW: Expire Maintain Toggle */}
        <div style={styles.formGroup}>
            <label style={styles.label}>Expire Maintain</label>
            <div style={styles.toggleContainer}>
                <button onClick={() => handleExpireMaintainChange(true)} style={expireMaintain ? styles.toggleButtonActive : styles.toggleButton}>Yes</button>
                <button onClick={() => handleExpireMaintainChange(false)} style={!expireMaintain ? styles.toggleButtonActive : styles.toggleButton}>No</button>
            </div>
            <p style={styles.helpText}>Enable this to track expiration dates for your inventory items.</p>
        </div>

        <div style={styles.formGroup}><label style={styles.label}>Item Categories</label><div style={styles.categoryInputContainer}><input type="text" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} style={styles.categoryInput} placeholder="Add new item category" onKeyPress={(e) => e.key === 'Enter' && handleAddCategory()}/><button onClick={handleAddCategory} style={styles.addButton}>Add</button></div><div style={styles.categoriesList}>{itemCategories.length > 0 ? (itemCategories.map((cat, idx) => (<div key={idx} style={styles.categoryItem}><span>{cat}</span><button onClick={() => handleDeleteCategory(cat)} style={styles.deleteButton}><AiOutlineDelete size={14} /></button></div>))) : (<p style={styles.emptyState}>No item categories added yet</p>)}</div></div>
        <div style={styles.formGroup}><label style={styles.label}>Measurement Units</label><div style={styles.unitsGrid}>{AVAILABLE_UNITS.map((unit) => (<label key={unit} style={styles.unitCheckbox}><input type="checkbox" checked={selectedUnits.includes(unit)} onChange={() => handleUnitChange(unit)}/>{unit}</label>))}</div></div>
      </div>
      
      {/* Finance Settings */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Finance Settings</h3>
        <div style={styles.formGroup}>
          <label style={styles.label}>Expense Categories</label>
          <div style={styles.categoryInputContainer}>
            <input type="text" value={newExpenseCategory} onChange={(e) => setNewExpenseCategory(e.target.value)} style={styles.categoryInput} placeholder="Add new expense category" onKeyPress={(e) => e.key === 'Enter' && handleAddExpenseCategory()}/>
            <button onClick={handleAddExpenseCategory} style={styles.addButton}>Add</button>
          </div>
          <div style={styles.categoriesList}>
            {expenseCategories.length > 0 ? (
              expenseCategories.map((cat, idx) => (
                <div key={idx} style={styles.categoryItem}>
                  <span>{cat}</span>
                  <button onClick={() => handleDeleteExpenseCategory(cat)} style={styles.deleteButton}><AiOutlineDelete size={14} /></button>
                </div>
              ))
            ) : (<p style={styles.emptyState}>No expense categories added yet</p>)}
          </div>
        </div>
      </div>

      {/* SMS & Notifications */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>SMS & Notifications</h3>
        <div style={{ padding: '15px', background: '#e0f2fe', borderRadius: '8px', marginBottom: '20px', border: '1px solid #bae6fd', color: '#0369a1' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>SMS Credits Balance</h4>
            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px'}}><span>Monthly Free Plan:</span><strong>{smsCredits} / 350</strong></div>
            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px'}}><span>Purchased Packs:</span><strong>{extraSmsCredits}</strong></div>
            <div style={{borderTop: '1px solid #93c5fd', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 'bold'}}><span>Total Available:</span><span>{smsCredits + extraSmsCredits}</span></div>
        </div>
        <div style={styles.formGroup}>
            <label style={styles.label}>Send invoice to customer as SMS after save the invoice</label>
            <div style={styles.toggleContainer}>
                <button onClick={() => handleSendInvoiceSmsChange(true)} style={sendInvoiceSms ? styles.toggleButtonActive : styles.toggleButton}>Yes</button>
                <button onClick={() => handleSendInvoiceSmsChange(false)} style={!sendInvoiceSms ? styles.toggleButtonActive : styles.toggleButton}>No</button>
            </div>
            <p style={styles.helpText}>If enabled, a popup will appear after saving an invoice to send a notification via SMS. <strong>This will automatically disable "Auto-Print".</strong></p>
        </div>
      </div>
      
      {/* Invoicing */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Invoicing</h3>
        <div style={styles.formGroup}>
            <label style={styles.label}>Default Customer</label>
            <select value={defaultCustomerId} onChange={(e) => handleDefaultCustomerChange(e.target.value)} style={styles.select}>
                <option value="">Select a Default Customer</option>
                {customers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
            <p style={styles.helpText}>This customer will be selected by default in new invoices.</p>
        </div>
        
        <div style={styles.formGroup}>
            <label style={styles.label}>Print Invoice Automatically After Save</label>
            <div style={styles.toggleContainer}>
                <button onClick={() => handleAutoPrintChange(true)} style={autoPrintInvoice ? styles.toggleButtonActive : styles.toggleButton}>Yes</button>
                <button onClick={() => handleAutoPrintChange(false)} style={!autoPrintInvoice ? styles.toggleButtonActive : styles.toggleButton}>No</button>
            </div>
            <p style={styles.helpText}>If set to 'Yes', the print dialog will open automatically after an invoice is saved. <strong>This will automatically disable "Send Invoice SMS".</strong></p>
        </div>

        <div style={styles.formGroup}>
            <label style={styles.label}>Offer Delivery Facility</label>
            <div style={styles.toggleContainer}>
                <button onClick={() => handleOfferDeliveryChange(true)} style={offerDelivery ? styles.toggleButtonActive : styles.toggleButton}>Yes</button>
                <button onClick={() => handleOfferDeliveryChange(false)} style={!offerDelivery ? styles.toggleButtonActive : styles.toggleButton}>No</button>
            </div>
            <p style={styles.helpText}>Enable this if you offer delivery services for your sales.</p>
        </div>

        <div style={styles.formGroup}>
            <label style={styles.label}>Open cashdrawer with print</label>
            <div style={styles.toggleContainer}>
                <button onClick={() => handleOpenCashDrawerChange(true)} style={openCashDrawerWithPrint ? styles.toggleButtonActive : styles.toggleButton}>Yes</button>
                <button onClick={() => handleOpenCashDrawerChange(false)} style={!openCashDrawerWithPrint ? styles.toggleButtonActive : styles.toggleButton}>No</button>
            </div>
            <p style={styles.helpText}>If set to 'Yes', a command to open the cash drawer will be sent with the print job.</p>
        </div>
        
        <div style={styles.formGroup}>
            <label style={styles.label}>Use Sinhala format in invoices</label>
            <div style={styles.toggleContainer}>
                <button onClick={() => handleUseSinhalaInvoiceChange(true)} style={useSinhalaInvoice ? styles.toggleButtonActive : styles.toggleButton}>Yes</button>
                <button onClick={() => handleUseSinhalaInvoiceChange(false)} style={!useSinhalaInvoice ? styles.toggleButtonActive : styles.toggleButton}>No</button>
            </div>
            <p style={styles.helpText}>Enable this to print invoices using the Sinhala language format.</p>
        </div>
        
        <div style={styles.formGroup}>
            <label style={styles.label}>Add Order Number to Invoice</label>
            <div style={styles.toggleContainer}>
                <button onClick={() => handleShowOrderNoChange(true)} style={showOrderNo ? styles.toggleButtonActive : styles.toggleButton}>Yes</button>
                <button onClick={() => handleShowOrderNoChange(false)} style={!showOrderNo ? styles.toggleButtonActive : styles.toggleButton}>No</button>
            </div>
            <p style={styles.helpText}>Enable this to display the Order Number on your printed invoices.</p>
        </div>

        <div style={styles.formGroup}>
            <label style={styles.label}>Double line for single item in invoice print</label>
            <div style={styles.toggleContainer}>
                <button onClick={() => handleDoubleLineInvoiceChange(true)} style={doubleLineInvoiceItem ? styles.toggleButtonActive : styles.toggleButton}>Yes</button>
                <button onClick={() => handleDoubleLineInvoiceChange(false)} style={!doubleLineInvoiceItem ? styles.toggleButtonActive : styles.toggleButton}>No</button>
            </div>
            <p style={styles.helpText}>Enable this to split item details into two lines on the printed invoice.</p>
        </div>

        {/* ✅ NEW: Enable Warranty Feature */}
        <div style={styles.formGroup}>
            <label style={styles.label}>Enable warranty feature</label>
            <div style={styles.toggleContainer}>
                <button onClick={() => handleEnableWarrantyChange(true)} style={enableWarranty ? styles.toggleButtonActive : styles.toggleButton}>Yes</button>
                <button onClick={() => handleEnableWarrantyChange(false)} style={!enableWarranty ? styles.toggleButtonActive : styles.toggleButton}>No</button>
            </div>
            <p style={styles.helpText}>Enable this to manage warranties for items in invoices.</p>
        </div>

        {/* ✅ Return Policy Field with Edit Toggle */}
        <div style={styles.formGroup}>
            <label style={styles.label}>Return Policy</label>
            
            {editReturnPolicy ? (
                <>
                    <textarea
                        value={returnPolicy}
                        onChange={(e) => setReturnPolicy(e.target.value)}
                        style={{...styles.input, minHeight: '80px', resize: 'vertical'}}
                        placeholder="Enter your return policy here (e.g., 'Goods once sold cannot be returned')..."
                    />
                    <div style={{marginTop: '10px', display: 'flex', gap: '10px'}}>
                        <button onClick={handleSaveReturnPolicy} style={{...styles.saveButton, backgroundColor: '#3498db'}}>Save Policy</button>
                        <button onClick={() => setEditReturnPolicy(false)} style={styles.cancelButton}>Cancel</button>
                    </div>
                </>
            ) : (
                <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                    <div style={{...styles.inputDisabled, minHeight: '60px', color: '#333', whiteSpace: 'pre-wrap'}}>
                        {returnPolicy || "No return policy set."}
                    </div>
                    <button onClick={() => setEditReturnPolicy(true)} style={{...styles.editButton, width: 'fit-content'}}>
                        <AiOutlineEdit /> Edit Policy
                    </button>
                </div>
            )}
            
            <p style={styles.helpText}>This text will appear at the bottom of your printed invoices.</p>
        </div>

      </div>

      {/* Restaurant Mode */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Resturent Mode</h3>
        <div style={styles.formGroup}>
            <label style={styles.label}>Enable Kitchen Ordering Display (KOD) feature</label>
            <div style={styles.toggleContainer}>
                <button onClick={() => handleEnableKODChange(true)} style={enableKOD ? styles.toggleButtonActive : styles.toggleButton}>Yes</button>
                <button onClick={() => handleEnableKODChange(false)} style={!enableKOD ? styles.toggleButtonActive : styles.toggleButton}>No</button>
            </div>
            <p style={styles.helpText}>Enable this to activate the Kitchen Ordering Display system feature.</p>
        </div>

        <div style={styles.formGroup}>
            <label style={styles.label}>Dine-in available</label>
            <div style={styles.toggleContainer}>
                <button onClick={() => handleDineInChange(true)} style={dineInAvailable ? styles.toggleButtonActive : styles.toggleButton}>Yes</button>
                <button onClick={() => handleDineInChange(false)} style={!dineInAvailable ? styles.toggleButtonActive : styles.toggleButton}>No</button>
            </div>
            <p style={styles.helpText}>Enable this to allow dine-in orders.</p>
        </div>

        {dineInAvailable && (
            <div style={styles.formGroup}>
                <label style={styles.label}>Service Charge (Percentage)</label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {editServiceCharge ? (
                        <>
                            <input
                                type="number"
                                value={serviceCharge}
                                onChange={(e) => setServiceCharge(e.target.value)}
                                style={{ ...styles.input, width: '150px' }}
                                placeholder="0"
                            />
                            <button onClick={handleSaveServiceCharge} style={styles.saveButton}>Save</button>
                        </>
                    ) : (
                        <>
                             <div style={{ ...styles.inputDisabled, width: '150px', color: '#333' }}>
                                {serviceCharge || "0"}%
                             </div>
                             <button onClick={() => setEditServiceCharge(true)} style={styles.editButton}>
                                <AiOutlineEdit /> Edit
                             </button>
                        </>
                    )}
                </div>
                <p style={styles.helpText}>Percentage added to dine-in orders.</p>
            </div>
        )}
      </div>

      {/* Service and Orders */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Service and Orders</h3>
        <div style={styles.formGroup}>
            <label style={styles.label}>Enable Services & Future Orders Facility</label>
            <div style={styles.toggleContainer}>
                <button onClick={() => handleEnableServiceOrdersChange(true)} style={enableServiceOrders ? styles.toggleButtonActive : styles.toggleButton}>Yes</button>
                <button onClick={() => handleEnableServiceOrdersChange(false)} style={!enableServiceOrders ? styles.toggleButtonActive : styles.toggleButton}>No</button>
            </div>
            <p style={styles.helpText}>Enable this to manage services, repair jobs, and future orders in the dashboard.</p>
        </div>

        <div style={styles.formGroup}>
            <label style={styles.label}>Select Price Category for Orders</label>
            <select value={servicePriceCategory} onChange={(e) => handleServicePriceCategoryChange(e.target.value)} style={styles.select}>
                <option value="">Select a Price Category</option>
                {priceCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
            </select>
            <p style={styles.helpText}>This price category will be used to price items in service jobs.</p>
        </div>
      </div>

      <div style={styles.logoutContainer}><button onClick={handleLogout} style={styles.logoutButton}><AiOutlineLogout size={18} /> Logout</button></div>
    </div>
  );
};

const styles = {
  inputDisabled: { width: '100%', padding: '12px 16px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', backgroundColor: '#f8f9fa', color: '#6c757d', cursor: 'not-allowed' },
  toggleContainer: { display: 'flex', border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden', width: 'fit-content' },
  toggleButton: { padding: '10px 20px', border: 'none', background: '#f8f9fa', cursor: 'pointer', color: '#6c757d', fontWeight: '500' },
  toggleButtonActive: { padding: '10px 20px', border: 'none', background: '#3498db', cursor: 'pointer', color: 'white', fontWeight: '600' },
  shiftsManagementContainer: { marginTop: '16px', padding: '16px', backgroundColor: '#f8f9fa', border: '1px solid #eaeaea', borderRadius: '8px' },
  shiftItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px', backgroundColor: 'white', borderRadius: '6px', marginBottom: '8px' },
  shiftInput: { flex: 1, padding: '8px 12px', border: '1px solid #3498db', borderRadius: '6px', marginRight: '8px' },
  shiftSaveBtn: { padding: '8px 12px', border: 'none', borderRadius: '6px', backgroundColor: '#2ecc71', color: 'white', cursor: 'pointer' },
  shiftActions: { display: 'flex', alignItems: 'center', gap: '4px' },
  shiftRenameBtn: { padding: '8px 12px', border: 'none', borderRadius: '6px', backgroundColor: 'transparent', color: '#3498db', cursor: 'pointer' },
  shiftDeleteBtn: { padding: '8px', border: 'none', borderRadius: '6px', backgroundColor: 'transparent', color: '#e74c3c', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  addShiftButton: { marginTop: '12px', padding: '10px 16px', border: '1px dashed #3498db', borderRadius: '6px', backgroundColor: 'transparent', color: '#3498db', fontWeight: '500', cursor: 'pointer' },
  container: { padding: '24px', fontFamily: "'Inter', sans-serif", backgroundColor: '#f8f9fa', minHeight: '100vh' },
  loadingContainer: { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '200px', color: '#6c757d' },
  loadingSpinner: { border: '3px solid #f3f3f3', borderTop: '3px solid #3498db', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', marginBottom: '15px' },
  loadingText: { fontSize: '16px', fontWeight: '500' },
  headerContainer: { marginBottom: '32px' },
  header: { fontSize: '28px', fontWeight: '700', color: '#2c3e50' },
  subHeader: { fontSize: '16px', color: '#6c757d', margin: '4px 0 0 0' },
  section: { backgroundColor: '#fff', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #eaeaea' },
  sectionTitle: { fontSize: '20px', fontWeight: '600', color: '#2c3e50', margin: 0 },
  editButton: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', backgroundColor: 'transparent', border: '1px solid #ddd', borderRadius: '6px', color: '#6c757d', cursor: 'pointer', fontSize: '14px', fontWeight: '500' },
  formGroup: { marginBottom: '24px' },
  label: { display: 'block', fontSize: '14px', fontWeight: '600', color: '#495057', marginBottom: '8px' },
  helpText: { fontSize: '13px', color: '#6c757d', margin: '8px 0 0 0', fontStyle: 'italic' },
  logoContainer: { display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '16px' },
  logoImage: { width: '80px', height: '80px', borderRadius: '12px', objectFit: 'cover', border: '1px solid #eaeaea' },
  logoPlaceholder: { width: '80px', height: '80px', borderRadius: '12px', backgroundColor: '#3498db', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '24px', fontWeight: 'bold' },
  fileInputContainer: { display: 'flex', flexDirection: 'column', gap: '8px' },
  uploadButton: { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' },
  uploadButtonDisabled: { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: '#bdc3c7', color: 'white', border: 'none', borderRadius: '6px', cursor: 'not-allowed', fontSize: '14px' },
  hiddenFileInput: { display: 'none' },
  input: { width: '100%', padding: '12px 16px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' },
  value: { margin: '8px 0 0 0', fontSize: '16px', color: '#2c3e50', padding: '12px 0' },
  buttonGroup: { display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' },
  saveButton: { padding: '12px 24px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  cancelButton: { padding: '12px 24px', backgroundColor: 'transparent', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', color: '#6c757d', fontWeight: '500' },
  select: { width: '100%', padding: '12px 16px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', backgroundColor: 'white', boxSizing: 'border-box' },
  categoryInputContainer: { display: 'flex', gap: '12px', marginBottom: '16px' },
  categoryInput: { flex: 1, padding: '12px 16px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' },
  addButton: { padding: '12px 20px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' },
  categoriesList: { display: 'flex', flexWrap: 'wrap', gap: '12px' },
  categoryItem: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', backgroundColor: '#f8f9fa', borderRadius: '20px', border: '1px solid #eaeaea' },
  deleteButton: { display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', border: 'none', color: '#e74c3c', cursor: 'pointer', borderRadius: '4px', padding: '4px' },
  emptyState: { fontSize: '14px', color: '#6c757d', fontStyle: 'italic', margin: '8px 0' },
  unitsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px', marginTop: '12px' },
  unitCheckbox: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: '#f8f9fa', borderRadius: '6px', border: '1px solid #eaeaea', cursor: 'pointer' },
  logoutContainer: { display: 'flex', justifyContent: 'center', marginTop: '32px' },
  logoutButton: { display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: '600' },
};

const styleSheet = document.createElement("style");
styleSheet.innerText = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
document.head.appendChild(styleSheet);


export default Settings;