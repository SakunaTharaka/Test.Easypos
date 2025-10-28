import React, { useEffect, useState } from "react";
import { auth, db } from "../../firebase";
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where } from "firebase/firestore";
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

  const [expenseCategories, setExpenseCategories] = useState([]);
  const [newExpenseCategory, setNewExpenseCategory] = useState("");
  
  const [autoPrintInvoice, setAutoPrintInvoice] = useState(false);
  
  // ✅ **1. New state for the new toggles**
  const [offerDelivery, setOfferDelivery] = useState(false);
  const [maintainCreditCustomers, setMaintainCreditCustomers] = useState(false);
  const [openCashDrawerWithPrint, setOpenCashDrawerWithPrint] = useState(false);

  // --- NEW STATE FOR SERVICE & ORDERS ---
  const [priceCategories, setPriceCategories] = useState([]);
  const [servicePriceCategory, setServicePriceCategory] = useState("");


  useEffect(() => {
    const fetchData = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        navigate("/");
        return;
      }
      const uid = currentUser.uid;
      const settingsDocRef = doc(db, uid, "settings");

      try {
        const docSnap = await getDoc(settingsDocRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserInfo(data);
          setFormInput({
            fullName: data.fullName || "",
            email: data.email || auth.currentUser.email,
            phone: data.phone || "",
            companyAddress: data.companyAddress || "",
            companyName: data.companyName || "",
            companyLogo: data.companyLogo || "",
          });
          setInventoryType(data.inventoryType || "Buy and Sell only");
          setItemCategories(data.itemCategories || []);
          setSelectedUnits(data.itemUnits || ["Units", "Kg", "Metre"]);
          setStockReminder(data.stockReminder || "Do not remind");
          setDefaultCustomerId(data.defaultCustomerId || "");
          setUseShiftProduction(data.useShiftProduction || false);
          setProductionShifts(data.productionShifts || []);
          setExpenseCategories(data.expenseCategories || []);
          setAutoPrintInvoice(data.autoPrintInvoice || false);
          setOfferDelivery(data.offerDelivery || false);
          setMaintainCreditCustomers(data.maintainCreditCustomers || false);
          setOpenCashDrawerWithPrint(data.openCashDrawerWithPrint || false);
          // --- LOAD SERVICE PRICE CATEGORY ---
          setServicePriceCategory(data.serviceJobPriceCategory || "");

        } else {
          const userInfoRef = doc(db, "Userinfo", uid);
          const userInfoSnap = await getDoc(userInfoRef);
          
          let initialCompanyName = "My Business";
          let initialCompanyAddress = "";
          let initialFullName = auth.currentUser.displayName || "";
          let initialPhone = "";

          if (userInfoSnap.exists()) {
            const onboardingData = userInfoSnap.data();
            initialCompanyName = onboardingData.companyName || "My Business";
            initialCompanyAddress = onboardingData.companyAddress || "";
            initialFullName = onboardingData.fullName || "";
            initialPhone = onboardingData.phone || "";
          }

          const defaultSettings = {
            fullName: initialFullName,
            email: auth.currentUser.email,
            phone: initialPhone,
            companyAddress: initialCompanyAddress,
            companyName: initialCompanyName,
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
            maintainCreditCustomers: false,
            openCashDrawerWithPrint: false,
            // --- ADD TO DEFAULT SETTINGS ---
            serviceJobPriceCategory: "",
          };
          
          await setDoc(settingsDocRef, defaultSettings);
          setUserInfo(defaultSettings);
          setFormInput({
            fullName: defaultSettings.fullName,
            email: defaultSettings.email,
            phone: defaultSettings.phone,
            companyAddress: defaultSettings.companyAddress,
            companyName: defaultSettings.companyName,
            companyLogo: defaultSettings.companyLogo,
          });
          setInventoryType(defaultSettings.inventoryType);
          setItemCategories(defaultSettings.itemCategories);
          setSelectedUnits(defaultSettings.itemUnits);
          setStockReminder(defaultSettings.stockReminder);
          setDefaultCustomerId(defaultSettings.defaultCustomerId);
          setUseShiftProduction(defaultSettings.useShiftProduction);
          setProductionShifts(defaultSettings.productionShifts);
          setExpenseCategories(defaultSettings.expenseCategories);
          setAutoPrintInvoice(defaultSettings.autoPrintInvoice);
          setOfferDelivery(defaultSettings.offerDelivery);
          setMaintainCreditCustomers(defaultSettings.maintainCreditCustomers);
          setOpenCashDrawerWithPrint(defaultSettings.openCashDrawerWithPrint);
          // --- LOAD FROM DEFAULT SETTINGS ---
          setServicePriceCategory(defaultSettings.serviceJobPriceCategory);
        }

        // --- FETCH CUSTOMERS ---
        const customersColRef = collection(db, uid, "customers", "customer_list");
        const customersSnap = await getDocs(customersColRef);
        setCustomers(customersSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // --- FETCH PRICE CATEGORIES ---
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
    await updateDoc(getSettingsDocRef(), { autoPrintInvoice: value });
  };

  // ✅ **4. Handlers for the new toggles**
  const handleOfferDeliveryChange = async (value) => {
    setOfferDelivery(value);
    await updateDoc(getSettingsDocRef(), { offerDelivery: value });
  };

  const handleMaintainCreditCustomersChange = async (value) => {
    setMaintainCreditCustomers(value);
    await updateDoc(getSettingsDocRef(), { maintainCreditCustomers: value });
  };

  const handleOpenCashDrawerChange = async (value) => {
    setOpenCashDrawerWithPrint(value);
    await updateDoc(getSettingsDocRef(), { openCashDrawerWithPrint: value });
  };

  // --- NEW HANDLER FOR SERVICE PRICE CATEGORY ---
  const handleServicePriceCategoryChange = async (value) => {
    setServicePriceCategory(value);
    await updateDoc(getSettingsDocRef(), { serviceJobPriceCategory: value });
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
      <div style={styles.section}><div style={styles.sectionHeader}><h3 style={styles.sectionTitle}>Personal Information</h3>{!editMode && (<button style={styles.editButton} onClick={() => setEditMode(true)}><AiOutlineEdit size={16} /> Edit</button>)}</div><div style={styles.formGroup}><label style={styles.label}>Company Logo</label><div style={styles.logoContainer}>{userInfo?.companyLogo ? (<img src={userInfo.companyLogo} alt="Company Logo" style={styles.logoImage} />) : (<div style={styles.logoPlaceholder}>{userInfo?.companyName?.charAt(0) || "C"}</div>)}<div style={styles.fileInputContainer}><label htmlFor="logo-upload" style={logoUploading ? styles.uploadButtonDisabled : styles.uploadButton}><AiOutlineUpload size={16} /> {logoUploading ? 'Uploading...' : 'Upload Logo'}<input id="logo-upload" type="file" accept="image/*" onChange={(e) => uploadLogo(e.target.files[0])} disabled={logoUploading} style={styles.hiddenFileInput} /></label></div></div></div>{["companyName", "fullName", "email", "phone", "companyAddress"].map((field) => (<div style={styles.formGroup} key={field}><label style={styles.label}>{field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1')}</label>{editMode ? (field === "email" ? (<input type="email" value={formInput[field]} style={styles.inputDisabled} readOnly/>) : (<input type="text" value={formInput[field]} onChange={(e) => setFormInput({ ...formInput, [field]: e.target.value })} style={styles.input} placeholder={`Enter your ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}`}/>)) : (<p style={styles.value}>{userInfo?.[field] || "Not provided"}</p>)}</div>))}{editMode && (<div style={styles.buttonGroup}><button style={styles.cancelButton} onClick={() => setEditMode(false)}>Cancel</button><button style={styles.saveButton} onClick={handleSave}>Save Changes</button></div>)}</div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Inventory Settings</h3>
        <div style={styles.formGroup}><label style={styles.label}>Inventory Type</label><select value={inventoryType} onChange={(e) => handleInventoryTypeChange(e.target.value)} style={styles.select}><option value="Buy and Sell only">Buy and Sell only</option><option value="Production Selling only">Production Selling only</option><option value="We doing both">We doing both</option></select><p style={styles.helpText}>{inventoryTypeDescriptions[inventoryType]}</p></div>
        {(inventoryType === "Production Selling only" || inventoryType === "We doing both") && (<div style={styles.formGroup}><label style={styles.label}>Use a shift based production</label><div style={styles.toggleContainer}><button onClick={() => handleToggleShiftProduction(true)} style={useShiftProduction ? styles.toggleButtonActive : styles.toggleButton}>Yes</button><button onClick={() => handleToggleShiftProduction(false)} style={!useShiftProduction ? styles.toggleButtonActive : styles.toggleButton}>No</button></div>{useShiftProduction && (<div style={styles.shiftsManagementContainer}>{productionShifts.map((shift, index) => (<div key={index} style={styles.shiftItem}>{editingShift?.index === index ? (<><input type="text" value={editingShift.name} onChange={(e) => setEditingShift({...editingShift, name: e.target.value})} style={styles.shiftInput}/><button onClick={() => handleSaveShiftName(index)} style={styles.shiftSaveBtn}>Save</button></>) : (<><span>{shift}</span><div style={styles.shiftActions}><button onClick={() => setEditingShift({index, name: shift})} style={styles.shiftRenameBtn}>Rename</button><button onClick={() => handleDeleteShift(index)} style={styles.shiftDeleteBtn}><AiOutlineDelete size={16} /></button></div></>)}</div>))}<button onClick={handleAddShift} style={styles.addShiftButton}>+ Add a shift</button></div>)}</div>)}
        <div style={styles.formGroup}><label style={styles.label}>Low Stock Reminder</label><select value={stockReminder} onChange={(e) => handleStockReminderChange(e.target.value)} style={styles.select}><option value="Do not remind">Do not remind</option><option value="50">Remind at 50%</option><option value="20">Remind at 20%</option><option value="10">Remind at 10%</option></select><p style={styles.helpText}>Get notified when stock goes below the selected percentage</p></div>
        <div style={styles.formGroup}><label style={styles.label}>Item Categories</label><div style={styles.categoryInputContainer}><input type="text" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} style={styles.categoryInput} placeholder="Add new item category" onKeyPress={(e) => e.key === 'Enter' && handleAddCategory()}/><button onClick={handleAddCategory} style={styles.addButton}>Add</button></div><div style={styles.categoriesList}>{itemCategories.length > 0 ? (itemCategories.map((cat, idx) => (<div key={idx} style={styles.categoryItem}><span>{cat}</span><button onClick={() => handleDeleteCategory(cat)} style={styles.deleteButton}><AiOutlineDelete size={14} /></button></div>))) : (<p style={styles.emptyState}>No item categories added yet</p>)}</div></div>
        <div style={styles.formGroup}><label style={styles.label}>Measurement Units</label><div style={styles.unitsGrid}>{AVAILABLE_UNITS.map((unit) => (<label key={unit} style={styles.unitCheckbox}><input type="checkbox" checked={selectedUnits.includes(unit)} onChange={() => handleUnitChange(unit)}/>{unit}</label>))}</div></div>
      </div>
      
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
            <p style={styles.helpText}>If set to 'Yes', the print dialog will open automatically after an invoice is saved.</p>
        </div>

        {/* ✅ **5. Add the new JSX for the toggles** */}
        <div style={styles.formGroup}>
            <label style={styles.label}>Offer Delivery Facility</label>
            <div style={styles.toggleContainer}>
                <button onClick={() => handleOfferDeliveryChange(true)} style={offerDelivery ? styles.toggleButtonActive : styles.toggleButton}>Yes</button>
                <button onClick={() => handleOfferDeliveryChange(false)} style={!offerDelivery ? styles.toggleButtonActive : styles.toggleButton}>No</button>
            </div>
            <p style={styles.helpText}>Enable this if you offer delivery services for your sales.</p>
        </div>

        <div style={styles.formGroup}>
            <label style={styles.label}>Maintain Credit Customers</label>
            <div style={styles.toggleContainer}>
                <button onClick={() => handleMaintainCreditCustomersChange(true)} style={maintainCreditCustomers ? styles.toggleButtonActive : styles.toggleButton}>Yes</button>
                <button onClick={() => handleMaintainCreditCustomersChange(false)} style={!maintainCreditCustomers ? styles.toggleButtonActive : styles.toggleButton}>No</button>
            </div>
            <p style={styles.helpText}>Enable this to manage credit sales and track customer balances.</p>
        </div>

        <div style={styles.formGroup}>
            <label style={styles.label}>Open cashdrawer with print</label>
            <div style={styles.toggleContainer}>
                <button onClick={() => handleOpenCashDrawerChange(true)} style={openCashDrawerWithPrint ? styles.toggleButtonActive : styles.toggleButton}>Yes</button>
                <button onClick={() => handleOpenCashDrawerChange(false)} style={!openCashDrawerWithPrint ? styles.toggleButtonActive : styles.toggleButton}>No</button>
            </div>
            <p style={styles.helpText}>If set to 'Yes', a command to open the cash drawer will be sent with the print job.</p>
        </div>
      </div>

      {/* --- NEW SERVICE AND ORDERS SECTION --- */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Service and Orders</h3>
        <div style={styles.formGroup}>
            <label style={styles.label}>Select Price Category for Service Jobs</label>
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
