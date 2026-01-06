import React, { useState, useEffect } from "react";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import { 
  FaTimes, FaStore, FaUsers, FaBoxOpen, FaCog, FaPrint, 
  FaEnvelope, FaPhone, FaCheckCircle, FaStar, FaArrowRight, FaShieldAlt, FaChartLine 
} from 'react-icons/fa';

const Home = () => {
  const navigate = useNavigate();
  const [isLoaded, setIsLoaded] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Admin Shortcut State
  const [keySequence, setKeySequence] = useState('');
  const [isAdminButtonVisible, setIsAdminButtonVisible] = useState(false);
  const SECRET_CODE = 'admin';

  // Modal State
  const [activeModal, setActiveModal] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

  useEffect(() => {
    // Initial Load Animation
    setTimeout(() => setIsLoaded(true), 100);

    // Mouse Parallax Logic
    const handleMouseMove = (e) => {
      // Calibrate sensitivity for smoother effect
      setMousePosition({
        x: (e.clientX - window.innerWidth / 2) / 40,
        y: (e.clientY - window.innerHeight / 2) / 40,
      });
    };
    
    // Secret Admin Shortcut
    const handleKeyDown = (e) => {
      if (activeModal) return;
      const newSequence = keySequence + e.key;
      const trimmedSequence = newSequence.slice(-SECRET_CODE.length);
      setKeySequence(trimmedSequence);
      if (trimmedSequence === SECRET_CODE) setIsAdminButtonVisible(true);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [keySequence, activeModal]);

  // Navigation Handlers
  const openLogin = () => auth.currentUser ? navigate("/dashboard") : window.open("/login", "_blank");
  const openSignup = () => auth.currentUser ? navigate("/dashboard") : window.open("/signup", "_blank");
  const openMasterAdmin = () => navigate("/master-admin");

  // Modal Handlers
  const openModal = (modalName) => {
    setActiveModal(modalName);
    setTimeout(() => setIsModalVisible(true), 50);
  };

  const closeModal = () => {
    setIsModalVisible(false);
    setTimeout(() => setActiveModal(null), 300);
  };

  // --- Modal Content Renderer ---
  const renderModalContent = () => {
    switch (activeModal) {
      case 'features':
        return (
          <div className="modal-inner">
            <h2 className="modal-title">Powerful Features</h2>
            <p className="modal-subtitle">Everything you need to run your business effectively.</p>
            <div className="features-grid">
              <div className="feature-group">
                <h3><FaStore className="icon-blue" /> Inventory Control</h3>
                <ul>
                  <li>Add, edit, and categorize items effortlessly</li>
                  <li>Auto-generate SKUs and Product IDs</li>
                  <li>Manage Raw Materials vs. Finished Goods</li>
                  <li>Lightning-fast item search</li>
                </ul>
              </div>
              <div className="feature-group">
                <h3><FaUsers className="icon-green" /> CRM Tools</h3>
                <ul>
                  <li>Comprehensive Customer Database</li>
                  <li>Custom Price Categories per client</li>
                  <li>Credit Management & Overdue Limits</li>
                  <li>Purchase history tracking</li>
                </ul>
              </div>
              <div className="feature-group">
                <h3><FaCog className="icon-purple" /> Admin & Security</h3>
                <ul>
                  <li>Role-based access control (Admin/User)</li>
                  <li>Activity Logging & Audit Trails</li>
                  <li>Secure Master Admin shortcut</li>
                </ul>
              </div>
              <div className="feature-group">
                <h3><FaPrint className="icon-orange" /> Hardware</h3>
                <ul>
                  <li>Seamless integration with QZ Tray</li>
                  <li>Direct Thermal Receipt Printing</li>
                  <li>Barcode Label generation</li>
                </ul>
              </div>
            </div>
          </div>
        );
      case 'pricing':
        return (
          <div className="modal-inner">
            <h2 className="modal-title">Simple, Transparent Pricing</h2>
            <div className="pricing-grid">
              <div className="pricing-card">
                <h3>Monthly</h3>
                <div className="price">
                  <span className="currency">LKR</span>1,800<span className="term">/mo</span>
                </div>
                <p>Great for startups. Cancel anytime.</p>
                <button className="btn-outline" onClick={() => openModal('contact')}>Contact Sales</button>
              </div>
              <div className="pricing-card featured">
                <div className="badge"><FaStar /> Best Value</div>
                <h3>Yearly</h3>
                <div className="price">
                  <span className="currency">LKR</span>20,000<span className="term">/yr</span>
                </div>
                <p>Save ~7% with annual billing.</p>
                <button className="btn-primary full-width" onClick={() => openModal('contact')}>Get Started</button>
              </div>
            </div>
          </div>
        );
      case 'contact':
        return (
          <div className="modal-inner">
            <h2 className="modal-title">Contact Support</h2>
            <p className="modal-subtitle">We are here to help you set up.</p>
            <div className="contact-container">
              <a href="mailto:sakuna.wayne.easyerp@gmail.com" className="contact-card">
                <div className="contact-icon email"><FaEnvelope /></div>
                <div>
                  <h4>Email Us</h4>
                  <span>sakuna.wayne.easyerp@gmail.com</span>
                </div>
              </a>
              <a href="tel:0787223407" className="contact-card">
                <div className="contact-icon phone"><FaPhone /></div>
                <div>
                  <h4>Call Us</h4>
                  <span>078 722 3407</span>
                </div>
              </a>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="home-container">
      {/* Dynamic Background */}
      <div className="background-wrapper">
        <div className="grid-pattern"></div>
        <div 
          className="blob blob-1"
          style={{ transform: `translate(${mousePosition.x}px, ${mousePosition.y}px)` }}
        ></div>
        <div 
          className="blob blob-2"
          style={{ transform: `translate(${-mousePosition.x * 0.8}px, ${-mousePosition.y * 0.8}px)` }}
        ></div>
        <div 
          className="blob blob-3"
          style={{ transform: `translate(${mousePosition.x * 0.5}px, ${mousePosition.y * 0.5}px)` }}
        ></div>
      </div>

      {/* Navbar */}
      <header className={`navbar ${isLoaded ? 'loaded' : ''}`}>
        <div className="nav-content">
          <div className="logo-section">
            <div className="logo-icon"></div>
            <h1>EasyPOS<span className="highlight">.lk</span></h1>
          </div>
          <nav className="nav-links">
            <span onClick={() => openModal('features')}>Features</span>
            <span onClick={() => openModal('pricing')}>Pricing</span>
            <span onClick={() => openModal('contact')}>Contact</span>
            <a href="https://qz.io/download/" target="_blank" rel="noopener noreferrer" className="nav-download">
              QZ Tray
            </a>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="hero-section">
        <div className={`hero-content ${isLoaded ? 'loaded' : ''}`}>
          <div className="hero-badge">New Version 2.0 Available</div>
          <h1 className="hero-title">
            <span className="block-reveal">Smart ERP & POS</span>
            <span className="block-reveal gradient-text">for Growing Businesses</span>
          </h1>
          <p className="hero-subtitle">
            Streamline your inventory, manage customers, and track sales in real-time. 
            The all-in-one solution designed for Sri Lankan retailers.
          </p>
          
          <div className="cta-group">
            <button className="btn-primary" onClick={openSignup}>
              Get Started <FaArrowRight className="arrow-icon" />
            </button>
            <button className="btn-secondary" onClick={openLogin}>
              Login
            </button>
          </div>
        </div>

        {/* Feature Cards Preview */}
        <div className={`features-preview ${isLoaded ? 'loaded' : ''}`}>
          <div className="preview-card" onClick={() => openModal('features')}>
            <div className="card-icon icon-blue"><FaChartLine /></div>
            <h3>Real-Time Analytics</h3>
            <p>Monitor performance with live data dashboards.</p>
          </div>
          <div className="preview-card" onClick={() => openModal('features')}>
            <div className="card-icon icon-green"><FaBoxOpen /></div>
            <h3>Smart Inventory</h3>
            <p>Automated tracking and low-stock alerts.</p>
          </div>
          <div className="preview-card" onClick={() => openModal('features')}>
            <div className="card-icon icon-purple"><FaShieldAlt /></div>
            <h3>Cloud Security</h3>
            <p>Enterprise-grade encryption for your data.</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className={`footer ${isLoaded ? 'loaded' : ''}`}>
        <div className="footer-content">
          <p>© 2025 EasyPOS.lk | Built for Performance</p>
          <div className="footer-links">
            {isAdminButtonVisible && (
              <button onClick={openMasterAdmin} className="admin-btn">Master Admin</button>
            )}
            <a href="mailto:sakuna.wayne.easyerp@gmail.com">Support</a>
          </div>
        </div>
      </footer>

      {/* Modal Overlay */}
      {activeModal && (
        <div 
          className={`modal-overlay ${isModalVisible ? 'visible' : ''}`} 
          onClick={closeModal}
        >
          <div 
            className={`modal-box ${isModalVisible ? 'visible' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={closeModal}><FaTimes /></button>
            {renderModalContent()}
          </div>
        </div>
      )}

      {/* INJECTED CSS STYLES */}
      <style>{`
        /* --- GLOBAL RESET & FONTS --- */
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        :root {
          --primary: #6366f1;
          --primary-dark: #4f46e5;
          --secondary: #ec4899;
          --success: #10b981;
          --bg-light: #f9fafb;
          --text-main: #111827;
          --text-muted: #6b7280;
        }

        body {
          margin: 0;
          font-family: 'Inter', sans-serif;
          color: var(--text-main);
          background: #ffffff;
          overflow-x: hidden;
        }

        /* --- BACKGROUND ANIMATIONS --- */
        .home-container {
          min-height: 100vh;
          position: relative;
          display: flex;
          flex-direction: column;
        }

        .background-wrapper {
          position: fixed;
          top: 0; left: 0; width: 100%; height: 100%;
          z-index: -1;
          overflow: hidden;
          background: #fafafa;
        }

        .grid-pattern {
          position: absolute;
          width: 100%; height: 100%;
          background-image: linear-gradient(rgba(99, 102, 241, 0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(99, 102, 241, 0.03) 1px, transparent 1px);
          background-size: 50px 50px;
        }

        .blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.6;
          transition: transform 0.2s ease-out;
        }

        .blob-1 {
          top: -10%; left: -10%; width: 500px; height: 500px;
          background: rgba(99, 102, 241, 0.3);
          animation: float 20s infinite alternate;
        }

        .blob-2 {
          bottom: 10%; right: -5%; width: 400px; height: 400px;
          background: rgba(236, 72, 153, 0.2);
          animation: float 15s infinite alternate-reverse;
        }

        .blob-3 {
          top: 40%; left: 30%; width: 300px; height: 300px;
          background: rgba(16, 185, 129, 0.2);
          animation: pulse 10s infinite;
        }

        @keyframes float { 0% { transform: translate(0,0); } 100% { transform: translate(30px, 50px); } }
        @keyframes pulse { 0% { opacity: 0.4; } 50% { opacity: 0.7; } 100% { opacity: 0.4; } }

        /* --- NAVBAR --- */
        .navbar {
          position: fixed;
          top: 0; left: 0; right: 0;
          padding: 20px 0;
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(0,0,0,0.05);
          z-index: 1000;
          transform: translateY(-100%);
          transition: transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .navbar.loaded { transform: translateY(0); }

        .nav-content {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 24px;
        }

        .logo-section { display: flex; align-items: center; gap: 12px; cursor: pointer; }
        .logo-icon {
          width: 32px; height: 32px;
          background: linear-gradient(135deg, var(--primary), #8b5cf6);
          border-radius: 8px;
        }
        .logo-section h1 { font-size: 1.5rem; font-weight: 800; margin: 0; letter-spacing: -0.5px; }
        .highlight { color: var(--primary); }

        .nav-links { display: flex; gap: 32px; align-items: center; }
        .nav-links span {
          cursor: pointer; font-weight: 500; color: var(--text-muted);
          transition: color 0.2s;
        }
        .nav-links span:hover { color: var(--primary); }
        .nav-download {
          color: var(--primary); font-weight: 600; text-decoration: none;
          padding: 8px 16px; background: rgba(99, 102, 241, 0.1); border-radius: 20px;
          transition: all 0.2s;
        }
        .nav-download:hover { background: var(--primary); color: white; }

        /* --- HERO --- */
        .hero-section {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 140px 20px 60px;
          text-align: center;
        }

        .hero-content {
          max-width: 900px;
          opacity: 0; transform: translateY(30px);
          transition: all 1s ease-out 0.2s;
        }
        .hero-content.loaded { opacity: 1; transform: translateY(0); }

        .hero-badge {
          display: inline-block;
          padding: 6px 16px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 50px;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--primary);
          margin-bottom: 24px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }

        .hero-title {
          font-size: 4.5rem;
          font-weight: 800;
          line-height: 1.1;
          margin-bottom: 24px;
          letter-spacing: -1px;
        }
        .block-reveal { display: block; }
        .gradient-text {
          background: linear-gradient(135deg, var(--primary) 0%, #ec4899 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .hero-subtitle {
          font-size: 1.25rem;
          color: var(--text-muted);
          max-width: 600px;
          margin: 0 auto 40px;
          line-height: 1.6;
        }

        .cta-group { display: flex; gap: 16px; justify-content: center; }

        .btn-primary, .btn-secondary {
          padding: 14px 32px;
          font-size: 1rem;
          font-weight: 600;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          border: none;
          display: flex; align-items: center; gap: 8px;
        }

        .btn-primary {
          background: var(--text-main);
          color: white;
          box-shadow: 0 4px 14px rgba(0,0,0,0.2);
        }
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.3);
          background: #000;
        }

        .btn-secondary {
          background: white;
          color: var(--text-main);
          border: 1px solid #e5e7eb;
          box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }
        .btn-secondary:hover {
          transform: translateY(-2px);
          border-color: #d1d5db;
        }

        /* --- FEATURE CARDS --- */
        .features-preview {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 30px;
          margin-top: 80px;
          width: 100%;
          max-width: 1000px;
          opacity: 0;
          transform: translateY(40px);
          transition: all 1s ease-out 0.6s;
        }
        .features-preview.loaded { opacity: 1; transform: translateY(0); }

        .preview-card {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(10px);
          padding: 30px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.8);
          box-shadow: 0 4px 20px rgba(0,0,0,0.03);
          transition: all 0.3s ease;
          cursor: pointer;
          text-align: left;
        }
        .preview-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 30px rgba(0,0,0,0.08);
          background: white;
        }
        .preview-card h3 { font-size: 1.25rem; margin: 16px 0 8px; font-weight: 700; }
        .preview-card p { font-size: 0.95rem; color: var(--text-muted); line-height: 1.5; margin: 0; }

        .card-icon {
          width: 48px; height: 48px;
          border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          font-size: 1.2rem;
        }
        .icon-blue { background: rgba(99, 102, 241, 0.1); color: var(--primary); }
        .icon-green { background: rgba(16, 185, 129, 0.1); color: var(--success); }
        .icon-purple { background: rgba(139, 92, 246, 0.1); color: #8b5cf6; }
        .icon-orange { background: rgba(249, 115, 22, 0.1); color: #f97316; }

        /* --- MODAL SYSTEM --- */
        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.4);
          backdrop-filter: blur(5px);
          z-index: 2000;
          display: flex; align-items: center; justify-content: center;
          opacity: 0; transition: opacity 0.3s ease;
          padding: 20px;
        }
        .modal-overlay.visible { opacity: 1; }

        .modal-box {
          background: white;
          width: 100%; max-width: 800px;
          max-height: 90vh;
          overflow-y: auto;
          border-radius: 24px;
          padding: 40px;
          position: relative;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          transform: scale(0.95) translateY(20px);
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .modal-box.visible { transform: scale(1) translateY(0); }

        .modal-close {
          position: absolute; top: 20px; right: 20px;
          width: 36px; height: 36px;
          border-radius: 50%; border: none; background: #f3f4f6;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: var(--text-muted);
          transition: 0.2s;
        }
        .modal-close:hover { background: #e5e7eb; color: var(--text-main); }

        .modal-title { font-size: 2rem; margin: 0 0 8px; text-align: center; }
        .modal-subtitle { text-align: center; color: var(--text-muted); margin-bottom: 40px; }

        /* Features Modal */
        .features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; }
        .feature-group { background: #f9fafb; padding: 24px; border-radius: 16px; }
        .feature-group h3 { display: flex; align-items: center; gap: 10px; margin-top: 0; }
        .feature-group ul { list-style: none; padding: 0; margin: 0; color: var(--text-muted); }
        .feature-group li { padding: 4px 0; font-size: 0.95rem; display: flex; align-items: center; }
        .feature-group li:before { content: "•"; color: var(--primary); margin-right: 8px; }

        /* Pricing Modal */
        .pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 30px; }
        .pricing-card {
          border: 1px solid #e5e7eb; border-radius: 16px; padding: 32px;
          text-align: center; transition: 0.3s;
        }
        .pricing-card.featured {
          border: 2px solid var(--primary); background: rgba(99, 102, 241, 0.02);
          transform: scale(1.05); position: relative;
        }
        .badge {
          position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
          background: var(--primary); color: white; padding: 4px 12px;
          border-radius: 12px; font-size: 0.8rem; font-weight: 600;
          display: flex; align-items: center; gap: 5px;
        }
        .price { font-size: 2.5rem; font-weight: 800; margin: 16px 0; }
        .currency { font-size: 1rem; font-weight: 600; vertical-align: super; margin-right: 4px; }
        .term { font-size: 1rem; color: var(--text-muted); font-weight: 400; }
        .btn-outline {
          width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--primary);
          background: none; color: var(--primary); font-weight: 600; cursor: pointer;
          margin-top: 16px; transition: 0.2s;
        }
        .btn-outline:hover { background: rgba(99, 102, 241, 0.1); }
        .full-width { width: 100%; justify-content: center; margin-top: 16px; }

        /* Contact Modal */
        .contact-container { display: flex; flex-direction: column; gap: 20px; }
        .contact-card {
          display: flex; align-items: center; gap: 20px;
          padding: 24px; background: #f9fafb; border-radius: 12px;
          text-decoration: none; color: inherit; transition: 0.2s;
          border: 1px solid transparent;
        }
        .contact-card:hover { border-color: var(--primary); background: white; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
        .contact-icon {
          width: 48px; height: 48px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center; font-size: 1.2rem;
        }
        .contact-icon.email { background: #e0e7ff; color: var(--primary); }
        .contact-icon.phone { background: #d1fae5; color: var(--success); }

        /* --- FOOTER --- */
        .footer { padding: 40px 0; border-top: 1px solid #f3f4f6; margin-top: auto; width: 100%; opacity: 0; transition: 1s; }
        .footer.loaded { opacity: 1; }
        .footer-content {
          max-width: 1200px; margin: 0 auto; padding: 0 24px;
          display: flex; justify-content: space-between; align-items: center;
          color: var(--text-muted); font-size: 0.9rem;
        }
        .footer-links { display: flex; align-items: center; gap: 20px; }
        .footer-links a { color: var(--text-muted); text-decoration: none; transition: 0.2s; }
        .footer-links a:hover { color: var(--primary); }
        .admin-btn {
          padding: 6px 12px; border: 1px solid #d1d5db; background: transparent;
          border-radius: 6px; cursor: pointer; font-size: 0.8rem; color: #4b5563;
        }

        /* --- RESPONSIVE --- */
        @media (max-width: 768px) {
          .hero-title { font-size: 2.5rem; }
          .hero-subtitle { font-size: 1rem; }
          .features-preview { grid-template-columns: 1fr; }
          .pricing-card.featured { transform: scale(1); }
          .nav-links span { display: none; } /* Hide text links on mobile, keep CTA if needed */
          .nav-download { display: block; }
          .cta-group { flex-direction: column; width: 100%; }
          .btn-primary, .btn-secondary { width: 100%; justify-content: center; }
          .modal-box { padding: 24px; }
          .footer-content { flex-direction: column; gap: 16px; }
        }
      `}</style>
    </div>
  );
};

export default Home;