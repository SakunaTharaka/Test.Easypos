import React from 'react';
import { FaPhoneAlt, FaEnvelope, FaWhatsapp, FaYoutube } from 'react-icons/fa';

const Help = () => {
  const contactNumber = '078 722 3407';

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>❓ Help & Support</h2>
        <p style={styles.subtitle}>Find answers to your questions and get in touch with our support team.</p>
      </div>

      {/* Contact Section */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Contact Us</h3>
        <div style={styles.contactGrid}>
          <a href={`tel:${contactNumber}`} style={styles.contactCard}>
            <FaPhoneAlt size={24} style={styles.icon} />
            <span style={styles.contactTitle}>Call Support</span>
            <span style={styles.contactDetail}>{contactNumber}</span>
          </a>
          <a href={`https://wa.me/94${contactNumber.substring(1)}`} target="_blank" rel="noopener noreferrer" style={styles.contactCard}>
            <FaWhatsapp size={24} style={styles.icon} />
            <span style={styles.contactTitle}>WhatsApp</span>
            <span style={styles.contactDetail}>Chat with us</span>
          </a>
          <a href="mailto:support@waynesoftware.com" style={styles.contactCard}>
            <FaEnvelope size={24} style={styles.icon} />
            <span style={styles.contactTitle}>Email Support</span>
            <span style={styles.contactDetail}>support@waynesoftware.com</span>
          </a>
        </div>
      </div>

      {/* FAQ Section */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Frequently Asked Questions (FAQ)</h3>
        <div style={styles.faqItem}>
          <p style={styles.faqQuestion}>Q: How do I print an invoice for a thermal printer?</p>
          <p style={styles.faqAnswer}>A: Navigate to the "Invoicing" tab, find the invoice you want to print, and click the view icon. On the Invoice View page, select the "Print 80mm Receipt" button. Ensure your printer settings are also set to the correct paper size.</p>
        </div>
        <div style={styles.faqItem}>
          <p style={styles.faqQuestion}>Q: How can I see my total sales for today?</p>
          <p style={styles.faqAnswer}>A: Your total sales for the current day are displayed on the main "Dashboard" tab in the "Total Sales (Today)" card. For a more detailed breakdown, go to the "Finance" tab and select "Sales Income".</p>
        </div>
        <div style={styles.faqItem}>
          <p style={styles.faqQuestion}>Q: I dismissed the "Low Stock Warning" on the dashboard. How can I see it again?</p>
          <p style={styles.faqAnswer}>A: The low stock warning is dismissed only for your current session. If you log out and log back in, or close the browser tab and reopen it, the warning will reappear if items are still low on stock.</p>
        </div>
         <div style={styles.faqItem}>
            <p style={styles.faqQuestion}>Q: Where can I find a video tutorial?</p>
            <p style={styles.faqAnswer}>A: A quick video guide is available when you first log in. You can also access it anytime at this link: <a href="https://youtu.be/DiA2LuJcN4A?si=gOhg0jRYo8ANvZkI" target="_blank" rel="noopener noreferrer">Watch Tutorial</a></p>
        </div>
      </div>

      {/* Terms & Conditions Section */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Terms and Conditions</h3>
        <div style={styles.termsContainer}>
            <p>Last updated: October 05, 2025</p>
            <p>Please read these terms and conditions carefully before using Our Service.</p>

            <h4 style={styles.termsHeading}>1. Acceptance of Terms</h4>
            <p>By accessing and using this web application (the "Service"), you accept and agree to be bound by the terms and provision of this agreement. This Service is the exclusive property of <strong>Wayne Software Company</strong>.</p>

            <h4 style={styles.termsHeading}>2. Subscription and Fees</h4>
            <p>Access to the Service is provided on a subscription basis. Wayne Software Company reserves the right to modify subscription fees, surcharges, or institute new charges at any time. We will provide you with reasonable prior notice of any such pricing changes, typically no less than 30 days, via email or an in-app notification.</p>

            <h4 style={styles.termsHeading}>3. Intellectual Property</h4>
            <p>The Service and its original content, features, and functionality are and will remain the exclusive property of Wayne Software Company and its licensors. The Service is protected by copyright, trademark, and other laws of both Sri Lanka and foreign countries. Our trademarks may not be used in connection with any product or service without the prior written consent of Wayne Software Company.</p>
            
            <h4 style={styles.termsHeading}>4. Limitation of Liability</h4>
            <p>In no event shall Wayne Software Company, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service. You are solely responsible for backing up your data.</p>

            <h4 style={styles.termsHeading}>5. Termination</h4>
            <p>We may terminate or suspend your access to our Service immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms. Upon termination, your right to use the Service will immediately cease.</p>

            <h4 style={styles.termsHeading}>6. Governing Law</h4>
            <p>These Terms shall be governed and construed in accordance with the laws of Sri Lanka, without regard to its conflict of law provisions.</p>
            
            <h4 style={styles.termsHeading}>7. Changes to Terms</h4>
            <p>We reserve the right, at our sole discretion, to modify or replace these Terms at any time. We will try to provide at least 30 days' notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion.</p>
        </div>
      </div>
    </div>
  );
};

const styles = {
    container: { padding: '24px', fontFamily: "'Inter', sans-serif", maxWidth: '900px', margin: '0 auto' },
    header: { textAlign: 'center', marginBottom: '40px' },
    title: { fontSize: '28px', fontWeight: 'bold', color: '#111827', margin: 0 },
    subtitle: { fontSize: '16px', color: '#6b7280', marginTop: '4px' },
    section: { backgroundColor: '#fff', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' },
    sectionTitle: { fontSize: '20px', fontWeight: '600', color: '#1f2937', marginTop: '0', marginBottom: '20px', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' },
    contactGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' },
    contactCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', backgroundColor: '#f9fafb', borderRadius: '8px', textDecoration: 'none', color: 'inherit', border: '1px solid #e5e7eb', transition: 'transform 0.2s, box-shadow 0.2s' },
    icon: { color: '#3498db', marginBottom: '12px' },
    contactTitle: { fontWeight: '600', color: '#111827', marginBottom: '4px' },
    contactDetail: { fontSize: '14px', color: '#6b7280' },
    faqItem: { marginBottom: '16px', borderBottom: '1px solid #f0f0f0', paddingBottom: '16px' },
    faqQuestion: { fontWeight: '600', color: '#1f2937', margin: '0 0 8px 0' },
    faqAnswer: { color: '#4b5563', margin: 0, lineHeight: '1.6' },
    termsContainer: { maxHeight: '300px', overflowY: 'auto', paddingRight: '15px', fontSize: '14px', lineHeight: '1.7', color: '#4b5563' },
    termsHeading: { fontSize: '16px', fontWeight: '600', color: '#111827', marginTop: '20px' },
};

export default Help;