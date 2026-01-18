import React, { useState, useEffect, useRef } from "react";
import { auth, db } from "../firebase";
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
// Removed unused 'FaStar'
import { FaCheckCircle, FaSignOutAlt, FaTimes, FaLock } from 'react-icons/fa'; 

const UserDetails = () => {
  const navigate = useNavigate();
  const functions = getFunctions(); 

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState('monthly'); // Defaults to the special offer
  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    companyName: "",
    companyAddress: "",
  });
  
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // --- OTP STATE ---
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState(new Array(6).fill(""));
  const [otpLoading, setOtpLoading] = useState(false);
  const inputRefs = useRef([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        navigate("/");
        return;
      }
      if (!currentUser.emailVerified) {
        navigate("/verify-email");
        return;
      }

      setUser(currentUser);

      const userRef = doc(db, "Userinfo", currentUser.uid);
      const docSnap = await getDoc(userRef);

      if (docSnap.exists()) {
        const userData = docSnap.data();
        if (userData.status === 'trialing') {
          // Check if trial is expired logic here...
          navigate("/dashboard");
        } else {
          setFormData({
              fullName: userData.fullName || "",
              phone: userData.phone || "",
              companyName: userData.companyName || "",
              companyAddress: userData.companyAddress || "",
          });
          if (userData.phone) setIsPhoneVerified(true); 
          setStep(2);
          setLoading(false);
        }
      } else {
        setStep(1);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "phone") {
      const numericValue = value.replace(/[^0-9]/g, '');
      if (numericValue.length <= 10) {
        setFormData({ ...formData, [name]: numericValue });
        setIsPhoneVerified(false);
      }
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  // --- OTP LOGIC (Same as before) ---
  const handleRequestOtp = async () => {
    const phoneRegex = /^0\d{9}$/;
    if (!phoneRegex.test(formData.phone)) {
        alert("Please enter a valid 10-digit Sri Lankan phone number starting with 0 (e.g., 0771234567).");
        return;
    }
    setOtpLoading(true);
    const requestOtpFn = httpsCallable(functions, 'requestOtp');
    try {
        await requestOtpFn({ mobile: formData.phone });
        setOtpLoading(false);
        setOtp(new Array(6).fill("")); 
        setShowOtpModal(true);
    } catch (error) {
        console.error(error);
        alert("Failed to send OTP. " + error.message);
        setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const code = otp.join(""); 
    if (code.length < 6) {
        alert("Please enter the complete 6-digit code.");
        return;
    }
    setOtpLoading(true);
    const verifyOtpFn = httpsCallable(functions, 'verifyOtp');
    try {
        await verifyOtpFn({ mobile: formData.phone, code: code });
        setIsPhoneVerified(true);
        setShowOtpModal(false);
        alert("Phone Verified Successfully! ✅");
    } catch (error) {
        console.error(error);
        alert("Verification Failed: " + error.message);
    } finally {
        setOtpLoading(false);
    }
  };

  const handleOtpChange = (element, index) => {
    if (isNaN(element.value)) return false;
    const newOtp = [...otp];
    newOtp[index] = element.value;
    setOtp(newOtp);
    if (element.value && index < 5) inputRefs.current[index + 1].focus();
  };

  const handleOtpKeyDown = (e, index) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) inputRefs.current[index - 1].focus();
    if (e.key === "Enter") handleVerifyOtp();
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const data = e.clipboardData.getData("text");
    const splitData = data.split("").slice(0, 6); 
    if (splitData.every(char => !isNaN(char))) {
        const newOtp = [...otp];
        splitData.forEach((char, i) => newOtp[i] = char);
        setOtp(newOtp);
        inputRefs.current[Math.min(splitData.length, 5)].focus();
    }
  };

  const handleLogout = async () => {
    try {
        await signOut(auth);
        navigate("/");
    } catch (error) {
        console.error("Error logging out:", error);
    }
  };

  const handleSaveUserInfo = async () => {
    if (!formData.fullName || !formData.phone || !formData.companyName || !formData.companyAddress) {
      alert("Please fill all fields to continue.");
      return;
    }
    if (!isPhoneVerified) {
        alert("Please verify your phone number to continue.");
        return;
    }
    if (!agreedToTerms) {
      alert("You must agree to the Terms and Conditions to continue.");
      return;
    }

    setLoading(true);
    try {
      const userRef = doc(db, "Userinfo", user.uid);
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        ...formData,
        phoneVerified: true,
        registrationDate: serverTimestamp(),
      });
      setStep(2);
    } catch (error) {
      alert("Error saving user info: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartTrial = async () => {
    setLoading(true);
    try {
      const trialStartDate = new Date();
      const trialEndDate = new Date(trialStartDate);
      trialEndDate.setDate(trialStartDate.getDate() + 7);

      const userRef = doc(db, "Userinfo", user.uid);
      await updateDoc(userRef, {
        selectedPackage: selectedPlan, // 'monthly' (which is the 1800 one) or 'yearly'
        trialStartDate: trialStartDate,
        trialEndDate: trialEndDate,
        status: 'trialing',
      });
      navigate("/dashboard");
    } catch (error) {
      alert("Could not start your trial. Please try again.");
      setLoading(false);
    }
  };

  if (loading) return <div style={styles.loadingOverlay}><p>Loading...</p></div>;

  const isNextDisabled = loading || !agreedToTerms || !isPhoneVerified;

  // Features list array for rendering
  const featureList = [
    "Cloud Dashboard Access",
    "1000 Items & Sales",
    "Daily Business Reports",
    "Premium 24/7 Support"
  ];

  return (
    <div style={styles.pageContainer}>
      <div style={styles.leftPanel}>
        <h1 style={styles.brandTitle}>QuickPOS SITE</h1>
        <p style={styles.brandSubtitle}>The complete Point of Sale solution for your growing business.</p>
      </div>
      <div style={styles.rightPanel}>
        
        <button onClick={handleLogout} style={styles.logoutButton} title="Sign out">
            <FaSignOutAlt style={{ marginRight: '8px' }} /> Logout
        </button>

        {step === 1 && (
          <div style={styles.formContainer}>
            <h2 style={styles.formTitle}>Tell Us About Yourself</h2>
            <p style={styles.formSubtitle}>This information will be used on your invoices and reports.</p>
            <input type="text" name="fullName" placeholder="Full Name" value={formData.fullName} onChange={handleChange} style={styles.input} />
            
            <div style={styles.phoneInputContainer}>
                <input 
                    type="tel" 
                    name="phone" 
                    placeholder="E.g., 0712345678" 
                    value={formData.phone} 
                    onChange={handleChange} 
                    style={{...styles.input, flex: 1, margin: 0}} 
                    disabled={isPhoneVerified} 
                />
                
                {isPhoneVerified ? (
                    <div style={styles.verifiedBadge}><FaCheckCircle /> Verified</div>
                ) : (
                    <button 
                        onClick={handleRequestOtp} 
                        style={otpLoading ? styles.verifyBtnDisabled : styles.verifyBtn}
                        disabled={otpLoading || !formData.phone}
                    >
                        {otpLoading ? "Sending..." : "Verify"}
                    </button>
                )}
            </div>

            <input type="text" name="companyName" placeholder="Company / Shop Name" value={formData.companyName} onChange={handleChange} style={styles.input} />
            <input type="text" name="companyAddress" placeholder="Company / Shop Address" value={formData.companyAddress} onChange={handleChange} style={styles.input} />
            
            <div style={styles.termsContainer}>
              <input type="checkbox" id="terms" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} style={styles.checkbox} />
              <label htmlFor="terms" style={styles.termsLabel}>
                By clicking here, you agree to our <a href="/terms" target="_blank" rel="noopener noreferrer" style={styles.termsLink}>Terms and Conditions</a>.
              </label>
            </div>

            <button 
              onClick={handleSaveUserInfo} 
              style={isNextDisabled ? styles.buttonDisabled : styles.button} 
              disabled={isNextDisabled}
            >
              {loading ? 'Saving...' : 'Next'}
            </button>
          </div>
        )}

        {step === 2 && (
          // Increased maxWidth to 950px to fit 3 cards comfortably
          <div style={{...styles.formContainer, maxWidth: '950px'}}>
            <h2 style={styles.formTitle}>Choose Your Plan</h2>
            <p style={styles.formSubtitle}>All plans begin with a 1-week free trial.</p>
            
            <div style={styles.optionsContainer}>
              
               {/* --- PLAN 1: SPECIAL OFFER (Rs 1800) - ENHANCED UI --- */}
              <div 
                style={selectedPlan === 'monthly' ? {...styles.planOption, ...styles.selectedOption, ...styles.specialOfferCard} : {...styles.planOption, ...styles.specialOfferCard}} 
                onClick={() => setSelectedPlan('monthly')}
              >
                {selectedPlan === 'monthly' && <FaCheckCircle style={styles.checkIcon} />}
                <div style={styles.flashOfferBadge}>🔥 LIMITED TIME OFFER</div>
                
                <h3 style={{...styles.planTitle, color: '#2563eb'}}>Monthly Special</h3>
                <p style={styles.planPrice}>Rs. 1,800 <span style={styles.pricePer}>/ month</span></p>
                <div style={styles.priceSlash}>Was Rs. 2,500</div>

                <div style={styles.divider}></div>
                <div style={styles.featureList}>
                    <p style={{fontWeight:'bold', color: '#166534', marginBottom: '8px'}}>✅ All Features Included:</p>
                    {featureList.map((feature, i) => (
                        <p key={i} style={styles.featureItem}>✔️ {feature}</p>
                    ))}
                </div>
              </div>

               {/* --- PLAN 2: REGULAR (Rs 2500) - DISABLED/ANCHOR --- */}
               <div style={styles.disabledPlanOption}>
                <div style={styles.lockedBadge}><FaLock /> Regular Price</div>
                <h3 style={{...styles.planTitle, color: '#6b7280'}}>Standard Monthly</h3>
                <p style={{...styles.planPrice, color: '#9ca3af'}}>Rs. 3,000 <span style={styles.pricePer}>/ month</span></p>
                
                <div style={styles.divider}></div>
                <div style={styles.featureList}>
                   <p style={{color: '#9ca3af', marginBottom: '8px'}}>Features included:</p>
                    {featureList.map((feature, i) => (
                        <p key={i} style={{...styles.featureItem, color: '#9ca3af'}}>• {feature}</p>
                    ))}
                </div>
                
                {/* Overlay to make it unclickable */}
                <div style={styles.disabledOverlay}>
                    <span style={styles.disabledText}>Select Special Offer Instead</span>
                </div>
              </div>

               {/* --- PLAN 3: YEARLY (Rs 20000) --- */}
              <div style={selectedPlan === 'yearly' ? {...styles.planOption, ...styles.selectedOption} : styles.planOption} onClick={() => setSelectedPlan('yearly')}>
                {selectedPlan === 'yearly' && <FaCheckCircle style={styles.checkIcon} />}
                <div style={styles.saveBadge}>Save 16.67%</div>
                
                <h3 style={styles.planTitle}>Yearly Plan</h3>
                <p style={styles.planPrice}>Rs. 30,000 <span style={styles.pricePer}>/ year</span></p>
                <div style={{height: '19px'}}></div> {/* Spacer to align with slashed price */}

                 <div style={styles.divider}></div>
                 <div style={styles.featureList}>
                    <p style={{fontWeight:'bold', color: '#166534', marginBottom: '8px'}}>✅ Best Value Features:</p>
                    <p style={styles.featureItem}>✔️ <strong>Pay Once a Year</strong></p>
                    {featureList.map((feature, i) => (
                        <p key={i} style={styles.featureItem}>✔️ {feature}</p>
                    ))}
                </div>
              </div>

            </div>
            
            <button onClick={handleStartTrial} style={loading ? styles.buttonDisabled : styles.button} disabled={loading}>
              {loading ? 'Starting...' : 'Start Free Trial'}
            </button>
          </div>
        )}
      </div>

      {showOtpModal && (
        <div style={styles.modalOverlay}>
            <div style={styles.modalContent}>
                {/* OTP Modal Content ... (Same as before) */}
                <div style={styles.modalHeader}>
                    <h3 style={{margin:0}}>Enter Verification Code</h3>
                    <FaTimes style={{cursor:'pointer'}} onClick={() => setShowOtpModal(false)} />
                </div>
                <p style={styles.modalText}>We sent a 6-digit code to <strong>{formData.phone}</strong></p>
                <div style={styles.otpContainer}>
                    {otp.map((data, index) => (
                        <input
                            key={index} type="text" maxLength="1" value={data}
                            ref={(el) => (inputRefs.current[index] = el)}
                            onChange={(e) => handleOtpChange(e.target, index)}
                            onKeyDown={(e) => handleOtpKeyDown(e, index)}
                            onPaste={handleOtpPaste}
                            onFocus={(e) => e.target.select()}
                            style={styles.otpBox}
                        />
                    ))}
                </div>
                <button 
                    onClick={handleVerifyOtp} 
                    style={otpLoading ? styles.modalButtonDisabled : styles.modalButton}
                    disabled={otpLoading}
                >
                    {otpLoading ? "Verifying..." : "Verify Code"}
                </button>
            </div>
        </div>
      )}

    </div>
  );
};

const styles = {
    pageContainer: { display: 'flex', width: '100vw', height: '100vh', fontFamily: "'Inter', sans-serif" },
    leftPanel: { flex: 1, background: 'linear-gradient(135deg, #2c3e50, #1a2530)', color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px', boxSizing: 'border-box' },
    brandTitle: { fontSize: '48px', fontWeight: 'bold', margin: 0 },
    brandSubtitle: { fontSize: '18px', color: '#bdc3c7', marginTop: '10px', lineHeight: '1.6' },
    
    rightPanel: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px', background: '#f8f9fa', position: 'relative' },
    
    loadingOverlay: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '18px' },
    formContainer: { width: '100%', maxWidth: '500px', backgroundColor: '#fff', borderRadius: '16px', padding: '40px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', textAlign: 'center', position: 'relative', transition: 'max-width 0.3s ease' },
    formTitle: { fontSize: '28px', fontWeight: 'bold', color: '#111827', margin: '0 0 10px 0' },
    formSubtitle: { fontSize: '16px', color: '#6b7280', marginBottom: '30px' },
    input: { width: '100%', padding: '14px 16px', margin: '10px 0', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', boxSizing: 'border-box' },
    button: { width: '100%', marginTop: '20px', padding: '16px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #3498db, #2980b9)', color: '#fff', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' },
    buttonDisabled: { width: '100%', marginTop: '20px', padding: '16px', borderRadius: '12px', border: 'none', background: '#9ca3af', color: '#e5e7eb', cursor: 'not-allowed', fontSize: '16px', fontWeight: 'bold' },
    
    // --- Pricing Options Styling ---
    optionsContainer: { display: 'flex', gap: '15px', marginBottom: '30px', justifyContent: 'center', alignItems: 'stretch' },
    
    planOption: { flex: 1, padding: '30px 15px', border: '2px solid #e5e7eb', borderRadius: '16px', cursor: 'pointer', position: 'relative', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', background: '#fff' },
    
    // Special Offer Card Style
    specialOfferCard: { background: '#eff6ff', borderColor: '#3b82f6', boxShadow: '0 4px 15px rgba(59, 130, 246, 0.15)' },
    
    // Disabled Card Style
    disabledPlanOption: { flex: 1, padding: '30px 15px', border: '1px solid #e5e7eb', borderRadius: '16px', background: '#f9fafb', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', cursor: 'not-allowed', opacity: 0.7 },
    disabledOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: '16px', background: 'rgba(255,255,255,0.4)', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' },
    disabledText: { background: '#f3f4f6', padding: '5px 10px', borderRadius: '20px', fontSize: '12px', color: '#6b7280', fontWeight: 'bold', border: '1px solid #d1d5db' },

    selectedOption: { borderColor: '#3b82f6', boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.3)', transform: 'translateY(-5px)', zIndex: 1 },
    
    checkIcon: { position: 'absolute', top: '15px', right: '15px', color: '#3b82f6', fontSize: '22px' },
    planTitle: { margin: '15px 0 5px 0', fontSize: '18px', fontWeight: '700', color: '#1f2937' },
    planPrice: { margin: '5px 0', fontSize: '24px', fontWeight: '800', color: '#111827' },
    pricePer: { fontSize: '13px', fontWeight: '500', color: '#6b7280' },
    priceSlash: { fontSize: '13px', color: '#ef4444', textDecoration: 'line-through', fontWeight: '600', height: '19px' },
    
    divider: { height: '1px', background: '#e5e7eb', width: '100%', margin: '15px 0' },
    featureList: { textAlign: 'left', fontSize: '13px', color: '#4b5563', padding: '0 5px' },
    featureItem: { margin: '6px 0', display: 'flex', alignItems: 'center', gap: '6px' },

    // Badges
    saveBadge: { position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#10b981', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' },
    flashOfferBadge: { position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #ff416c, #ff4b2b)', color: 'white', padding: '6px 14px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap', boxShadow: '0 4px 10px rgba(255, 75, 43, 0.3)', letterSpacing: '0.5px' },
    lockedBadge: { position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#9ca3af', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' },

    termsContainer: { display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '20px 0 10px 0', textAlign: 'left' },
    checkbox: { margin: '0 10px 0 0', width: '16px', height: '16px', cursor: 'pointer' },
    termsLabel: { fontSize: '14px', color: '#6b7280', lineHeight: '1.5' },
    termsLink: { color: '#3b82f6', textDecoration: 'underline', cursor: 'pointer' },
    
    logoutButton: { position: 'absolute', top: '20px', right: '20px', display: 'flex', alignItems: 'center', padding: '8px 16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', color: '#64748b', fontWeight: '600', fontSize: '14px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', transition: 'all 0.2s ease', zIndex: 10 },

    phoneInputContainer: { display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0' },
    verifyBtn: { padding: '14px 20px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' },
    verifyBtnDisabled: { padding: '14px 20px', background: '#a7f3d0', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'not-allowed', fontSize: '14px' },
    verifiedBadge: { display: 'flex', alignItems: 'center', gap: '6px', color: '#059669', fontWeight: 'bold', fontSize: '14px', padding: '14px 20px', background: '#ecfdf5', borderRadius: '8px' },
    
    modalOverlay: { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 },
    modalContent: { background: "white", padding: "30px", borderRadius: "16px", width: "90%", maxWidth: "420px", textAlign: "center", boxShadow: '0 20px 50px rgba(0,0,0,0.3)' },
    modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: '1px solid #eee', paddingBottom: '10px' },
    modalText: { color: "#64748b", marginBottom: "20px" },
    otpContainer: { display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '10px' },
    otpBox: { width: '45px', height: '55px', fontSize: '24px', textAlign: 'center', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', transition: 'border-color 0.2s', fontWeight: 'bold' },
    modalButton: { width: "100%", marginTop: "20px", padding: "14px", background: "#3b82f6", color: "white", border: "none", borderRadius: "8px", fontSize: "16px", fontWeight: "bold", cursor: "pointer" },
    modalButtonDisabled: { width: "100%", marginTop: "20px", padding: "14px", background: "#93c5fd", color: "white", border: "none", borderRadius: "8px", fontSize: "16px", fontWeight: "bold", cursor: "not-allowed" },
};

export default UserDetails;