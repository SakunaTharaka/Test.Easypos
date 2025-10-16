import React, { useState, useEffect } from "react";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";

const Home = () => {
  const navigate = useNavigate();
  const [isLoaded, setIsLoaded] = useState(false);
  const [hoveredButton, setHoveredButton] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // State for hidden admin button
  const [keySequence, setKeySequence] = useState('');
  const [isAdminButtonVisible, setIsAdminButtonVisible] = useState(false);
  const SECRET_CODE = 'admin';

  useEffect(() => {
    // Trigger animations after component mounts
    setTimeout(() => setIsLoaded(true), 100);

    // Mouse movement for subtle parallax effect
    const handleMouseMove = (e) => {
      setMousePosition({
        x: (e.clientX - window.innerWidth / 2) / 50,
        y: (e.clientY - window.innerHeight / 2) / 50,
      });
    };
    
    // Keydown listener for the secret shortcut
    const handleKeyDown = (e) => {
      const newSequence = keySequence + e.key;
      // Keep the sequence from getting too long and check if it ends with the code
      const trimmedSequence = newSequence.slice(-SECRET_CODE.length);
      setKeySequence(trimmedSequence);

      if (trimmedSequence === SECRET_CODE) {
        setIsAdminButtonVisible(true);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [keySequence]);

  const openLogin = () => {
    if (auth.currentUser) {
      navigate("/dashboard");
    } else {
      window.open("/login", "_blank");
    }
  };

  const openSignup = () => {
    if (auth.currentUser) {
      navigate("/dashboard");
    } else {
      window.open("/signup", "_blank");
    }
  };

  const openMasterAdmin = () => {
    navigate("/master-admin");
  };

  return (
    <>
      {/* Animated Background Elements */}
      <div style={styles.backgroundAnimation}>
        <div style={{
          ...styles.floatingShape1,
          transform: `translate(${mousePosition.x}px, ${mousePosition.y}px)`
        }}></div>
        <div style={{
          ...styles.floatingShape2,
          transform: `translate(${-mousePosition.x * 0.5}px, ${-mousePosition.y * 0.5}px)`
        }}></div>
        <div style={{
          ...styles.floatingShape3,
          transform: `translate(${mousePosition.x * 0.3}px, ${mousePosition.y * 0.3}px)`
        }}></div>
        <div style={styles.gridPattern}></div>
      </div>

      {/* Header */}
      <header style={styles.header}>
        <div style={{
          ...styles.headerContent,
          transform: isLoaded ? 'translateY(0)' : 'translateY(-50px)',
          opacity: isLoaded ? 1 : 0,
          transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
          <div style={styles.logo}>
            <div style={styles.logoIcon}></div>
            <h1 style={styles.headerTitle}>EasyPOS.lk</h1>
          </div>
          <div style={styles.headerRight}>
            <nav style={styles.nav}>
              <a href="#features" style={styles.navLink}>Features</a>
              <a href="#pricing" style={styles.navLink}>Pricing</a>
              <a href="#contact" style={styles.navLink}>Contact</a>
              {/* --- UPDATED QZ TRAY DOWNLOAD LINK --- */}
              <a 
                href="https://qz.io/download/" 
                target="_blank" 
                rel="noopener noreferrer" 
                style={styles.navLink}
              >
                Download QZ Tray
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div style={styles.container}>
        <div style={styles.heroContent}>
          <div style={{
            ...styles.titleContainer,
            transform: isLoaded ? 'translateY(0) scale(1)' : 'translateY(50px) scale(0.95)',
            opacity: isLoaded ? 1 : 0,
            transition: 'all 1.2s cubic-bezier(0.4, 0, 0.2, 1) 0.2s'
          }}>
            <h1 style={styles.title}>
              <span style={styles.titleLine1}>Simple ERP & POS System</span>
              <span style={styles.titleLine2}>for Modern Business</span>
            </h1>
            
            <div style={styles.titleUnderline}></div>
          </div>
          
          <p style={{
            ...styles.subtitle,
            transform: isLoaded ? 'translateY(0)' : 'translateY(30px)',
            opacity: isLoaded ? 1 : 0,
            transition: 'all 1s cubic-bezier(0.4, 0, 0.2, 1) 0.6s'
          }}>
            Streamline your sales process with our intuitive point-of-sale solution. 
            Manage inventory, track sales, and grow your business with confidence.
          </p>
          
          <div style={{
            ...styles.buttonGroup,
            transform: isLoaded ? 'translateY(0)' : 'translateY(40px)',
            opacity: isLoaded ? 1 : 0,
            transition: 'all 1s cubic-bezier(0.4, 0, 0.2, 1) 1s'
          }}>
            <button 
              style={{
                ...styles.button,
                ...styles.loginButton,
                transform: hoveredButton === 'login' 
                  ? 'translateY(-8px) scale(1.02)' 
                  : 'translateY(0) scale(1)',
                boxShadow: hoveredButton === 'login' 
                  ? '0 20px 40px rgba(99, 102, 241, 0.3)' 
                  : '0 10px 30px rgba(99, 102, 241, 0.2)'
              }}
              onClick={openLogin}
              onMouseEnter={() => setHoveredButton('login')}
              onMouseLeave={() => setHoveredButton(null)}
            >
              <span style={styles.buttonContent}>
                <span style={styles.buttonText}>Login</span>
                <div style={{
                  ...styles.buttonArrow,
                  transform: hoveredButton === 'login' ? 'translateX(5px)' : 'translateX(0)'
                }}>→</div>
              </span>
              <div style={{
                ...styles.buttonRipple,
                transform: hoveredButton === 'login' ? 'scale(1)' : 'scale(0)'
              }}></div>
            </button>
            
            <button 
              style={{
                ...styles.button,
                ...styles.signupButton,
                transform: hoveredButton === 'signup' 
                  ? 'translateY(-8px) scale(1.02)' 
                  : 'translateY(0) scale(1)',
                boxShadow: hoveredButton === 'signup' 
                  ? '0 20px 40px rgba(16, 185, 129, 0.3)' 
                  : '0 10px 30px rgba(16, 185, 129, 0.2)'
              }}
              onClick={openSignup}
              onMouseEnter={() => setHoveredButton('signup')}
              onMouseLeave={() => setHoveredButton(null)}
            >
              <span style={styles.buttonContent}>
                <span style={styles.buttonText}>Get Started</span>
                <div style={{
                  ...styles.buttonArrow,
                  transform: hoveredButton === 'signup' ? 'translateX(5px)' : 'translateX(0)'
                }}>→</div>
              </span>
              <div style={{
                ...styles.buttonRipple,
                transform: hoveredButton === 'signup' ? 'scale(1)' : 'scale(0)'
              }}></div>
            </button>
          </div>
        </div>

        {/* Features Preview */}
        <div style={{
          ...styles.featuresPreview,
          transform: isLoaded ? 'translateY(0)' : 'translateY(60px)',
          opacity: isLoaded ? 1 : 0,
          transition: 'all 1.2s cubic-bezier(0.4, 0, 0.2, 1) 1.4s'
        }}>
          <div style={styles.featureCard}>
            <div style={styles.featureIconContainer}>
              <div style={{...styles.featureIcon, ...styles.salesIcon}}></div>
            </div>
            <h3 style={styles.featureTitle}>Real-Time Analytics</h3>
            <p style={styles.featureDesc}>Monitor your sales performance with live data and comprehensive reports</p>
          </div>
          
          <div style={styles.featureCard}>
            <div style={styles.featureIconContainer}>
              <div style={{...styles.featureIcon, ...styles.inventoryIcon}}></div>
            </div>
            <h3 style={styles.featureTitle}>Smart Inventory</h3>
            <p style={styles.featureDesc}>Automated stock tracking with intelligent alerts and reorder suggestions</p>
          </div>
          
          <div style={styles.featureCard}>
            <div style={styles.featureIconContainer}>
              <div style={{...styles.featureIcon, ...styles.cloudIcon}}></div>
            </div>
            <h3 style={styles.featureTitle}>Cloud Security</h3>
            <p style={styles.featureDesc}>Access your data securely from anywhere with enterprise-grade protection</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={{
          ...styles.footerContent,
          transform: isLoaded ? 'translateY(0)' : 'translateY(30px)',
          opacity: isLoaded ? 1 : 0,
          transition: 'all 1s cubic-bezier(0.4, 0, 0.2, 1) 1.8s'
        }}>
          <div style={styles.footerTop}>
            <div style={styles.footerLogo}>
              <div style={styles.footerLogoIcon}></div>
              <span>EasyPOS.lk</span>
            </div>
            <p style={styles.footerTagline}>Simplifying business operations, one transaction at a time.</p>
          </div>
          <div style={styles.footerBottom}>
            <p>© 2025 EasyPOS.lk | All Rights Reserved</p>

            {isAdminButtonVisible && (
              <button onClick={openMasterAdmin} style={styles.adminButton}>
                Master Admin Panel
              </button>
            )}
            <p>Contact: <a href="mailto:support@easypos.lk" style={styles.footerLink}>support@easypos.lk</a></p>
          </div>
        </div>
      </footer>
    </>
  );
};

const styles = {
  // Background Animation
  backgroundAnimation: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: -1,
    overflow: 'hidden',
  },
  
  gridPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundImage: `
      linear-gradient(rgba(99, 102, 241, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(99, 102, 241, 0.03) 1px, transparent 1px)
    `,
    backgroundSize: '60px 60px',
    animation: 'gridFloat 20s ease-in-out infinite',
  },

  floatingShape1: {
    position: 'absolute',
    top: '15%',
    left: '10%',
    width: '200px',
    height: '200px',
    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.05))',
    borderRadius: '30% 70% 70% 30% / 30% 30% 70% 70%',
    animation: 'morphFloat 8s ease-in-out infinite',
    transition: 'transform 0.1s ease-out',
  },

  floatingShape2: {
    position: 'absolute',
    top: '60%',
    right: '15%',
    width: '150px',
    height: '150px',
    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.05))',
    borderRadius: '63% 37% 54% 46% / 55% 48% 52% 45%',
    animation: 'morphFloat 10s ease-in-out infinite reverse',
    transition: 'transform 0.1s ease-out',
  },

  floatingShape3: {
    position: 'absolute',
    bottom: '20%',
    left: '60%',
    width: '100px',
    height: '100px',
    background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.1), rgba(219, 39, 119, 0.05))',
    borderRadius: '40% 60% 60% 40% / 60% 30% 70% 40%',
    animation: 'morphFloat 12s ease-in-out infinite',
    transition: 'transform 0.1s ease-out',
  },

  // Header
  header: {
    background: 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(20px)',
    borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
    padding: '20px 0',
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },

  headerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 50px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '40px',
  },

  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },

  logoIcon: {
    width: '32px',
    height: '32px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    borderRadius: '8px',
  },

  headerTitle: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1f2937',
    margin: 0,
  },

  nav: {
    display: 'flex',
    gap: '40px',
  },

  navLink: {
    color: '#6b7280',
    fontWeight: '500',
    fontSize: '16px',
    textDecoration: 'none',
    transition: 'color 0.3s ease',
  },

  // Main Container
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    background: 'linear-gradient(135deg, #fafafa 0%, #f9fafb 100%)',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    paddingTop: '120px',
    paddingBottom: '80px',
    position: 'relative',
  },

  heroContent: {
    textAlign: 'center',
    maxWidth: '900px',
    padding: '0 20px',
    marginBottom: '100px',
  },

  titleContainer: {
    marginBottom: '30px',
    position: 'relative',
  },

  title: {
    fontSize: '4rem',
    fontWeight: '800',
    lineHeight: '1.1',
    color: '#111827',
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },

  titleLine1: {
    display: 'block',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    animation: 'titleGlow 3s ease-in-out infinite alternate',
  },

  titleLine2: {
    display: 'block',
    color: '#374151',
  },

  titleUnderline: {
    width: '100px',
    height: '4px',
    background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
    margin: '20px auto 0',
    borderRadius: '2px',
    animation: 'underlineExpand 2s ease-out 1.5s both',
  },

  subtitle: {
    fontSize: '1.25rem',
    lineHeight: '1.7',
    color: '#6b7280',
    fontWeight: '400',
    maxWidth: '600px',
    margin: '0 auto 50px',
  },

  buttonGroup: {
    display: 'flex',
    gap: '20px',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },

  button: {
    padding: '16px 32px',
    fontSize: '16px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    position: 'relative',
    overflow: 'hidden',
    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
    minWidth: '160px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  buttonContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    position: 'relative',
    zIndex: 2,
  },

  buttonText: {
    transition: 'all 0.3s ease',
  },

  buttonArrow: {
    fontSize: '16px',
    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  },

  buttonRipple: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '100%',
    height: '100%',
    background: 'rgba(255, 255, 255, 0.2)',
    borderRadius: '50%',
    transform: 'translate(-50%, -50%) scale(0)',
    transition: 'transform 0.6s ease',
    zIndex: 1,
  },

  loginButton: {
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#ffffff',
  },

  signupButton: {
    background: 'linear-gradient(135deg, #10b981, #059669)',
    color: '#ffffff',
  },

  featuresPreview: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '30px',
    maxWidth: '1000px',
    padding: '0 20px',
    width: '100%',
  },

  featureCard: {
    background: 'rgba(255, 255, 255, 0.8)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '20px',
    padding: '40px 30px',
    textAlign: 'center',
    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
    cursor: 'pointer',
    position: 'relative',
  },

  featureIconContainer: {
    width: '60px',
    height: '60px',
    margin: '0 auto 20px',
    borderRadius: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  featureIcon: {
    width: '24px',
    height: '24px',
    borderRadius: '4px',
    position: 'relative',
  },

  salesIcon: {
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  },

  inventoryIcon: {
    background: 'linear-gradient(135deg, #10b981, #059669)',
  },

  cloudIcon: {
    background: 'linear-gradient(135deg, #ec4899, #db2777)',
  },

  featureTitle: {
    color: '#111827',
    fontSize: '1.25rem',
    fontWeight: '700',
    marginBottom: '12px',
    margin: '0 0 12px 0',
  },

  featureDesc: {
    color: '#6b7280',
    fontSize: '0.95rem',
    lineHeight: '1.6',
    margin: 0,
  },

  footer: {
    background: 'rgba(249, 250, 251, 0.8)',
    backdropFilter: 'blur(20px)',
    borderTop: '1px solid rgba(0, 0, 0, 0.05)',
    padding: '60px 20px 40px',
  },

  footerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    textAlign: 'center',
  },

  footerTop: {
    marginBottom: '40px',
  },

  footerLogo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    marginBottom: '16px',
    fontSize: '20px',
    fontWeight: '700',
    color: '#111827',
  },

  footerLogoIcon: {
    width: '24px',
    height: '24px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    borderRadius: '6px',
  },

  footerTagline: {
    color: '#6b7280',
    fontSize: '16px',
    margin: 0,
  },

  footerBottom: {
    paddingTop: '30px',
    borderTop: '1px solid rgba(0, 0, 0, 0.05)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '20px',
    color: '#6b7280'
  },
  
  adminButton: {
    padding: '8px 16px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    backgroundColor: '#f9fafb',
    color: '#4b5563',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },

  footerLink: {
    color: '#6366f1',
    fontWeight: '500',
    textDecoration: 'none',
    transition: 'color 0.3s ease',
  },
};

const styleSheet = document.createElement("style");
styleSheet.innerText = `
  @keyframes morphFloat {
    0%, 100% { 
      transform: translateY(0px) rotate(0deg);
      border-radius: 63% 37% 54% 46% / 55% 48% 52% 45%;
    }
    25% {
      border-radius: 40% 60% 60% 40% / 60% 30% 70% 40%;
    }
    50% { 
      transform: translateY(-20px) rotate(2deg);
      border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%;
    }
    75% {
      border-radius: 58% 42% 75% 25% / 76% 46% 54% 24%;
    }
  }

  @keyframes gridFloat {
    0%, 100% { transform: translate(0, 0); }
    50% { transform: translate(10px, -10px); }
  }

  @keyframes titleGlow {
    0% { filter: brightness(1); }
    100% { filter: brightness(1.1); }
  }

  @keyframes underlineExpand {
    0% { width: 0; }
    100% { width: 100px; }
  }
`;
document.head.appendChild(styleSheet);

export default Home;

