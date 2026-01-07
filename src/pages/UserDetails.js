import React, { useState, useEffect } from "react";
import { auth, db } from "../firebase";
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { FaCheckCircle } from 'react-icons/fa';

const UserDetails = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState('monthly');
  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    companyName: "",
    companyAddress: "",
  });
  
  const [agreedToTerms, setAgreedToTerms] = useState(false);


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        navigate("/");
        return;
      }

      // ---------------------------------------------------------
      // 🔒 NEW SECURITY CHECK: BLOCK UNVERIFIED USERS
      // ---------------------------------------------------------
      if (!currentUser.emailVerified) {
        navigate("/verify-email");
        return;
      }
      // ---------------------------------------------------------

      setUser(currentUser);

      const userRef = doc(db, "Userinfo", currentUser.uid);
      const docSnap = await getDoc(userRef);

      if (docSnap.exists()) {
        const userData = docSnap.data();
        if (userData.status === 'trialing') {
          const trialEndDate = userData.trialEndDate?.toDate(); 

          if (trialEndDate) {
            const today = new Date();
            today.setHours(0, 0, 0, 0); 

            if (today > trialEndDate) {
              navigate("/billing");
            } else {
              navigate("/dashboard");
            }
          } else {
            navigate("/dashboard");
          }
        } else {
          setFormData({
              fullName: userData.fullName || "",
              phone: userData.phone || "",
              companyName: userData.companyName || "",
              companyAddress: userData.companyAddress || "",
          });
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
      }
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleSaveUserInfo = async () => {
    if (!formData.fullName || !formData.phone || !formData.companyName || !formData.companyAddress) {
      alert("Please fill all fields to continue.");
      return;
    }
    const phoneRegex = /^0\d{9}$/;
    if (!phoneRegex.test(formData.phone)) {
        alert("Please enter a valid 10-digit Sri Lankan phone number starting with 0.");
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
      // ✅ **FIX: Changed trial period from 30 days to 7 days**
      trialEndDate.setDate(trialStartDate.getDate() + 7);

      const userRef = doc(db, "Userinfo", user.uid);
      await updateDoc(userRef, {
        selectedPackage: selectedPlan,
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

  return (
    <div style={styles.pageContainer}>
      <div style={styles.leftPanel}>
        <h1 style={styles.brandTitle}>EasyPOS LK</h1>
        <p style={styles.brandSubtitle}>The complete Point of Sale solution for your growing business.</p>
      </div>
      <div style={styles.rightPanel}>
        {step === 1 && (
          <div style={styles.formContainer}>
            <h2 style={styles.formTitle}>Tell Us About Yourself</h2>
            <p style={styles.formSubtitle}>This information will be used on your invoices and reports.</p>
            <input type="text" name="fullName" placeholder="Full Name" value={formData.fullName} onChange={handleChange} style={styles.input} />
            <input type="tel" name="phone" placeholder="E.g., 0712345678" value={formData.phone} onChange={handleChange} style={styles.input} />
            <input type="text" name="companyName" placeholder="Company / Shop Name" value={formData.companyName} onChange={handleChange} style={styles.input} />
            <input type="text" name="companyAddress" placeholder="Company / Shop Address" value={formData.companyAddress} onChange={handleChange} style={styles.input} />
            
            <div style={styles.termsContainer}>
              <input
                type="checkbox"
                id="terms"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                style={styles.checkbox}
              />
              <label htmlFor="terms" style={styles.termsLabel}>
                By clicking here, you agree to our{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" style={styles.termsLink}>
                  Terms and Conditions
                </a>
                .
              </label>
            </div>

            <button 
              onClick={handleSaveUserInfo} 
              style={(loading || !agreedToTerms) ? styles.buttonDisabled : styles.button} 
              disabled={loading || !agreedToTerms}
            >
              {loading ? 'Saving...' : 'Next'}
            </button>
          </div>
        )}

        {step === 2 && (
          <div style={styles.formContainer}>
            <div style={styles.flashOffer}>⚡ Flash Offer</div>
            <h2 style={styles.formTitle}>Choose Your Plan</h2>
            {/* ✅ **FIX: Updated text to reflect 1-week trial** */}
            <p style={styles.formSubtitle}>All plans begin with a 1-week free trial.</p>
            <div style={styles.optionsContainer}>
              <div style={selectedPlan === 'monthly' ? {...styles.planOption, ...styles.selectedOption} : styles.planOption} onClick={() => setSelectedPlan('monthly')}>
                {selectedPlan === 'monthly' && <FaCheckCircle style={styles.checkIcon} />}
                <h3 style={styles.planTitle}>Monthly</h3>
                <p style={styles.planPrice}>Rs. 1,800 <span style={styles.pricePer}>/ month</span></p>
              </div>
              <div style={selectedPlan === 'yearly' ? {...styles.planOption, ...styles.selectedOption} : styles.planOption} onClick={() => setSelectedPlan('yearly')}>
                {selectedPlan === 'yearly' && <FaCheckCircle style={styles.checkIcon} />}
                <div style={styles.saveBadge}>Save 7.41%</div>
                <h3 style={styles.planTitle}>Yearly</h3>
                <p style={styles.planPrice}>Rs. 20,000 <span style={styles.pricePer}>/ year</span></p>
              </div>
            </div>
            <button onClick={handleStartTrial} style={loading ? styles.buttonDisabled : styles.button} disabled={loading}>
              {loading ? 'Starting...' : 'Start Free Trial'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
// Styles
const styles = {
    pageContainer: { display: 'flex', width: '100vw', height: '100vh', fontFamily: "'Inter', sans-serif" },
    leftPanel: { flex: 1, background: 'linear-gradient(135deg, #2c3e50, #1a2530)', color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px', boxSizing: 'border-box' },
    brandTitle: { fontSize: '48px', fontWeight: 'bold', margin: 0 },
    brandSubtitle: { fontSize: '18px', color: '#bdc3c7', marginTop: '10px', lineHeight: '1.6' },
    rightPanel: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px', background: '#f8f9fa' },
    loadingOverlay: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '18px' },
    formContainer: { width: '100%', maxWidth: '500px', backgroundColor: '#fff', borderRadius: '16px', padding: '40px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', textAlign: 'center', position: 'relative' },
    formTitle: { fontSize: '28px', fontWeight: 'bold', color: '#111827', margin: '0 0 10px 0' },
    formSubtitle: { fontSize: '16px', color: '#6b7280', marginBottom: '30px' },
    input: { width: '100%', padding: '14px 16px', margin: '10px 0', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', boxSizing: 'border-box' },
    button: { width: '100%', marginTop: '20px', padding: '16px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #3498db, #2980b9)', color: '#fff', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' },
    buttonDisabled: { width: '100%', marginTop: '20px', padding: '16px', borderRadius: '12px', border: 'none', background: '#9ca3af', color: '#e5e7eb', cursor: 'not-allowed', fontSize: '16px', fontWeight: 'bold' },
    flashOffer: { position: 'absolute', top: '-15px', left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #ff416c, #ff4b2b)', color: 'white', padding: '8px 16px', borderRadius: '20px', fontSize: '14px', fontWeight: 'bold' },
    optionsContainer: { display: 'flex', gap: '20px', marginBottom: '30px' },
    planOption: { flex: 1, padding: '20px', border: '2px solid #e5e7eb', borderRadius: '12px', cursor: 'pointer', position: 'relative', transition: 'border-color 0.2s, box-shadow 0.2s' },
    selectedOption: { borderColor: '#3b82f6', boxShadow: '0 0 10px rgba(59, 130, 246, 0.3)' },
    checkIcon: { position: 'absolute', top: '10px', right: '10px', color: '#3b82f6' },
    planTitle: { margin: 0, fontSize: '18px', fontWeight: '600', color: '#1f2937' },
    planPrice: { margin: '8px 0 0 0', fontSize: '22px', fontWeight: 'bold', color: '#111827' },
    pricePer: { fontSize: '14px', fontWeight: 'normal', color: '#6b7280' },
    saveBadge: { position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#10b981', color: 'white', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '500' },
    termsContainer: { display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '20px 0 10px 0', textAlign: 'left' },
    checkbox: { margin: '0 10px 0 0', width: '16px', height: '16px', cursor: 'pointer' },
    termsLabel: { fontSize: '14px', color: '#6b7280', lineHeight: '1.5' },
    termsLink: { color: '#3b82f6', textDecoration: 'underline', cursor: 'pointer' },
};

export default UserDetails;