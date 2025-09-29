import React, { useState, useEffect } from "react";
import { auth, db } from "../firebase";
import { doc, setDoc, getDoc, Timestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";

const UserDetails = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [selectedBilling, setSelectedBilling] = useState(null);

  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    companyName: "",
    companyAddress: "",
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        navigate("/"); // redirect to Home if not logged in
        return;
      }

      setUser(currentUser);

      // Check if user already exists in Firestore
      const userRef = doc(db, "Userinfo", currentUser.uid);
      const docSnap = await getDoc(userRef);

      if (docSnap.exists()) {
        // User already registered → redirect directly to Dashboard
        navigate("/dashboard");
      } else {
        // First-time login → show User Info form
        setStep(1);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSaveUserInfo = async () => {
    if (
      !formData.fullName ||
      !formData.phone ||
      !formData.companyName ||
      !formData.companyAddress
    ) {
      alert("Please fill all fields");
      return;
    }

    setLoading(true);
    try {
      const userRef = doc(db, "Userinfo", user.uid);

      const savingDate = Timestamp.fromDate(new Date());
      const dueDate = Timestamp.fromDate(
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days later
      );

      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        ...formData,
        savingDate,
        dueDate,
      });

      // After saving, show billing step
      setStep(2);
      setLoading(false);
    } catch (error) {
      alert("Error saving user info: " + error.message);
      setLoading(false);
    }
  };

  const handleBillingProceed = () => {
    if (!selectedBilling) {
      alert("Please select a billing option");
      return;
    }
    navigate("/dashboard");
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div style={styles.container}>
      {step === 1 && (
        <div style={styles.box}>
          <h2>User Information</h2>
          <input
            type="text"
            name="fullName"
            placeholder="Full Name"
            value={formData.fullName}
            onChange={handleChange}
            style={styles.input}
          />
          <input
            type="text"
            name="phone"
            placeholder="Phone Number"
            value={formData.phone}
            onChange={handleChange}
            style={styles.input}
          />
          <input
            type="text"
            name="companyName"
            placeholder="Company/Shop Name"
            value={formData.companyName}
            onChange={handleChange}
            style={styles.input}
          />
          <input
            type="text"
            name="companyAddress"
            placeholder="Company/Shop Address"
            value={formData.companyAddress}
            onChange={handleChange}
            style={styles.input}
          />
          <button onClick={handleSaveUserInfo} style={styles.button}>
            Next
          </button>
        </div>
      )}

      {step === 2 && (
        <div style={styles.box}>
          <h2>Billing Info</h2>
          <div style={styles.billingBoxes}>
            <div
              style={{
                ...styles.billingBox,
                borderColor: selectedBilling === 1 ? "#28a745" : "#007bff",
              }}
              onClick={() => setSelectedBilling(1)}
            >
              Billing Option 1
            </div>
            <div
              style={{
                ...styles.billingBox,
                borderColor: selectedBilling === 2 ? "#28a745" : "#007bff",
              }}
              onClick={() => setSelectedBilling(2)}
            >
              Billing Option 2
            </div>
            <div
              style={{
                ...styles.billingBox,
                borderColor: selectedBilling === 3 ? "#28a745" : "#007bff",
              }}
              onClick={() => setSelectedBilling(3)}
            >
              Billing Option 3
            </div>
          </div>
          <button onClick={handleBillingProceed} style={styles.button}>
            Proceed
          </button>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    padding: "30px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    fontFamily: "Arial, sans-serif",
    background: "#f4f6f9",
  },
  box: {
    width: "400px",
    padding: "20px",
    borderRadius: "10px",
    background: "#fff",
    boxShadow: "0 0 10px rgba(0,0,0,0.1)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  input: {
    width: "100%",
    padding: "10px",
    margin: "10px 0",
    borderRadius: "6px",
    border: "1px solid #ccc",
  },
  button: {
    marginTop: "20px",
    padding: "10px 20px",
    borderRadius: "6px",
    border: "none",
    background: "#007bff",
    color: "#fff",
    cursor: "pointer",
    fontSize: "1rem",
  },
  billingBoxes: {
    display: "flex",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: "20px",
  },
  billingBox: {
    flex: 1,
    margin: "0 5px",
    padding: "20px",
    border: "2px solid #007bff",
    borderRadius: "8px",
    textAlign: "center",
    cursor: "pointer",
    background: "#e7f0ff",
    transition: "0.2s",
  },
};

export default UserDetails;
