import React, { useState, useEffect } from "react";
import { auth, provider } from "../firebase";
import { createUserWithEmailAndPassword, signInWithPopup, sendEmailVerification } from "firebase/auth";
import { useNavigate } from "react-router-dom";

const Signup = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);

  // PROTECT THE ROUTE: Check if user is already logged in
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        if (user.emailVerified) {
          // If verified, go to dashboard
          navigate("/dashboard", { replace: true });
        } else {
          // If logged in but NOT verified, go to waiting room
          navigate("/verify-email", { replace: true });
        }
      } else {
        setCheckingAuth(false);
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const handleEmailSignup = async () => {
    try {
      // 1. Create the user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // 2. Send the verification email immediately
      await sendEmailVerification(userCredential.user);
      
      // 3. Force redirect to the verification waiting room
      navigate("/verify-email");
      
    } catch (error) {
      alert("Signup failed: " + error.message);
    }
  };

  const handleGoogleSignup = async () => {
    try {
      // Google accounts are auto-verified by Firebase
      await signInWithPopup(auth, provider);
      navigate("/user-details");
    } catch (error) {
      alert("Google signup failed: " + error.message);
    }
  };

  if (checkingAuth) {
    return (
      <div style={signupStyles.loadingContainer}>
        <div style={signupStyles.spinner}></div>
        <p>Checking authentication...</p>
      </div>
    );
  }

  return (
    <div style={signupStyles.pageContainer}>
      <div style={signupStyles.card}>
        <h2 style={signupStyles.title}>Create Account</h2>
        <p style={signupStyles.subtitle}>Sign up to get started</p>

        <div style={signupStyles.formContainer}>
          <div style={signupStyles.inputGroup}>
            <label htmlFor="signup-email" style={signupStyles.label}>Email</label>
            <input
              id="signup-email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={signupStyles.input}
            />
          </div>
          
          <div style={signupStyles.inputGroup}>
            <label htmlFor="signup-password" style={signupStyles.label}>Password</label>
            <input
              id="signup-password"
              type="password"
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={signupStyles.input}
            />
          </div>
          
          <button onClick={handleEmailSignup} style={signupStyles.primaryButton}>
            Create Account
          </button>

          <div style={signupStyles.divider}>
            <span style={signupStyles.dividerText}>OR</span>
          </div>

          <button onClick={handleGoogleSignup} style={signupStyles.googleButton}>
            <svg style={signupStyles.googleIcon} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="24px" height="24px">
              <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
              <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
              <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
              <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
            </svg>
            Sign up with Google
          </button>
          
          <p style={signupStyles.loginPrompt}>
            Already have an account? <a href="/login" style={signupStyles.link}>Sign in</a>
          </p>
        </div>
      </div>
    </div>
  );
};

const signupStyles = {
  pageContainer: {
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
    padding: "30px",
    width: "100%",
    maxWidth: "400px"
  },
  title: {
    textAlign: "center",
    marginBottom: "5px",
    color: "#333",
    fontSize: "24px",
    fontWeight: "600"
  },
  subtitle: {
    textAlign: "center",
    color: "#666",
    marginBottom: "30px",
    fontSize: "14px"
  },
  formContainer: {
    display: "flex",
    flexDirection: "column"
  },
  inputGroup: {
    marginBottom: "15px"
  },
  label: {
    display: "block",
    marginBottom: "5px",
    fontSize: "14px",
    color: "#555",
    fontWeight: "500"
  },
  input: {
    width: "100%",
    padding: "12px 15px",
    borderRadius: "6px",
    border: "1px solid #ddd",
    fontSize: "16px",
    boxSizing: "border-box",
    transition: "border-color 0.2s",
  },
  primaryButton: {
    padding: "12px",
    borderRadius: "6px",
    border: "none",
    background: "#28a745",
    color: "#fff",
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: "600",
    marginTop: "10px",
    transition: "background-color 0.2s"
  },
  divider: {
    display: "flex",
    alignItems: "center",
    margin: "20px 0"
  },
  dividerText: {
    padding: "0 15px",
    color: "#777",
    fontSize: "14px"
  },
  googleButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "12px",
    borderRadius: "6px",
    border: "1px solid #ddd",
    background: "white",
    color: "#444",
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: "500",
    transition: "background-color 0.2s"
  },
  googleIcon: {
    marginRight: "10px"
  },
  loginPrompt: {
    textAlign: "center",
    marginTop: "20px",
    color: "#666",
    fontSize: "14px"
  },
  link: {
    color: "#007bff",
    textDecoration: "none",
    fontWeight: "500"
  },
  loadingContainer: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
  },
  spinner: {
    border: "4px solid rgba(0, 0, 0, 0.1)",
    borderLeftColor: "#28a745",
    borderRadius: "50%",
    width: "30px",
    height: "30px",
    animation: "spin 1s linear infinite",
    marginBottom: "15px"
  }
};

export default Signup;