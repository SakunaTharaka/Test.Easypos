import React, { useEffect, useState } from "react";
import { auth } from "../firebase";
import { sendEmailVerification, signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";

const VerifyEmail = () => {
  const navigate = useNavigate();
  const [buttonDisabled, setButtonDisabled] = useState(false);
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);

  // ---------------------------------------------------------
  // 🧠 SMART CHECKER: Polls Firebase every 3 seconds
  // ---------------------------------------------------------
  useEffect(() => {
    const checkVerified = async () => {
      if (auth.currentUser) {
        // Force reload to get the latest status from Firebase server
        await auth.currentUser.reload();
        
        if (auth.currentUser.emailVerified) {
          // 🎉 User verified! Send them to setup
          navigate("/user-details"); 
        }
      }
    };

    // Run immediately on load
    checkVerified();

    // Set up the interval loop (every 3000ms = 3 seconds)
    const timer = setInterval(() => {
      checkVerified();
    }, 3000);

    // Cleanup the timer if user leaves the page
    return () => clearInterval(timer);
  }, [navigate]);
  // ---------------------------------------------------------

  const handleResendEmail = async () => {
    setButtonDisabled(true);
    setChecking(true);
    try {
      if (auth.currentUser) {
        await sendEmailVerification(auth.currentUser);
        setMessage("Verification email sent! Please check your inbox.");
      }
    } catch (error) {
      if (error.code === 'auth/too-many-requests') {
        setMessage("Please wait a moment before trying again.");
      } else {
        setMessage("Error: " + error.message);
      }
    }
    setChecking(false);
    // Re-enable button after 60 seconds
    setTimeout(() => setButtonDisabled(false), 60000);
  };

  const handleBackToLogin = async () => {
    await signOut(auth);
    navigate("/login");
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.iconContainer}>
          {/* Animated Envelope Icon */}
          <div style={styles.pulseRing}></div>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#007bff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position: 'relative', zIndex: 2}}>
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
            <polyline points="22,6 12,13 2,6"></polyline>
          </svg>
        </div>
        
        <h2 style={styles.title}>Verify your email</h2>
        <p style={styles.text}>
          We've sent a verification email to: <br/>
          <strong>{auth.currentUser?.email}</strong>
        </p>
        
        {/* Helper text explaining the auto-redirect */}
        <p style={styles.autoText}>
          <span style={styles.spinner}></span>
          Waiting for verification... Page will refresh automatically.
        </p>

        {message && <div style={styles.alert}>{message}</div>}

        <button 
          onClick={handleResendEmail} 
          disabled={buttonDisabled}
          style={buttonDisabled ? styles.disabledButton : styles.button}
        >
          {buttonDisabled ? "Wait to Resend" : "Resend Verification Email"}
        </button>

        <button onClick={handleBackToLogin} style={styles.secondaryButton}>
          Back to Login
        </button>
      </div>
    </div>
  );
};

// Styles with added animations
const styles = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    backgroundColor: "#f5f5f5",
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    padding: "20px"
  },
  card: {
    backgroundColor: "white",
    borderRadius: "10px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
    padding: "40px",
    width: "100%",
    maxWidth: "450px",
    textAlign: "center"
  },
  iconContainer: {
    marginBottom: "20px",
    position: 'relative',
    display: 'inline-block'
  },
  // Simple CSS animation for the "pulse" effect
  pulseRing: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '50px',
    height: '50px',
    borderRadius: '50%',
    backgroundColor: 'rgba(0, 123, 255, 0.2)',
    animation: 'pulse 2s infinite'
  },
  title: {
    marginBottom: "10px",
    color: "#333",
    fontSize: "24px",
    fontWeight: "600"
  },
  text: {
    color: "#555",
    fontSize: "16px",
    marginBottom: "20px",
    lineHeight: "1.5"
  },
  autoText: {
    color: "#007bff",
    fontSize: "14px",
    marginBottom: "30px",
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontWeight: '500'
  },
  spinner: {
    width: '12px',
    height: '12px',
    border: '2px solid #007bff',
    borderTopColor: 'transparent',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  alert: {
    padding: "10px",
    backgroundColor: "#e3f2fd",
    color: "#0d47a1",
    borderRadius: "5px",
    marginBottom: "20px",
    fontSize: "14px"
  },
  button: {
    width: "100%",
    padding: "12px",
    borderRadius: "6px",
    border: "none",
    background: "#007bff",
    color: "#fff",
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: "600",
    marginBottom: "10px",
    transition: "background 0.2s"
  },
  disabledButton: {
    width: "100%",
    padding: "12px",
    borderRadius: "6px",
    border: "none",
    background: "#ccc",
    color: "#666",
    cursor: "not-allowed",
    fontSize: "16px",
    fontWeight: "600",
    marginBottom: "10px"
  },
  secondaryButton: {
    width: "100%",
    padding: "12px",
    borderRadius: "6px",
    border: "1px solid #ddd",
    background: "transparent",
    color: "#555",
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: "500"
  }
};

// Add styles to document head for animations
const styleSheet = document.createElement("style");
styleSheet.innerText = `
  @keyframes pulse {
    0% { width: 50px; height: 50px; opacity: 1; }
    100% { width: 100px; height: 100px; opacity: 0; }
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);

export default VerifyEmail;