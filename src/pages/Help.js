import React from 'react';
import { FaPhoneAlt, FaEnvelope, FaWhatsapp } from 'react-icons/fa';

const Help = () => {
  const contactNumber = '0787223407';

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
          <a href="mailto:admin@quickpos.site" style={styles.contactCard}>
            <FaEnvelope size={24} style={styles.icon} />
            <span style={styles.contactTitle}>Email Support</span>
            <span style={styles.contactDetail}>admin@quickpos.site</span>
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
            <p style={styles.faqAnswer}>A: A quick video guide is available when you first log in. You can also access it anytime at this link: <a href="https://youtube.com" target="_blank" rel="noopener noreferrer">Watch Tutorial</a></p>
        </div>
      </div>

      {/* ✅ **UPDATED: Terms & Conditions Section** */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Terms and Conditions</h3>
        <div style={styles.termsContainer}>
            <p><strong>Last Updated: October 05, 2025</strong></p>
            <p>Please read these Terms and Conditions (“Terms”, “Terms and Conditions”) carefully before using our web application (the “Service”). These Terms constitute a legally binding agreement between you (“User”, “you”, or “your”) and Wayne Software Company (“Company”, “we”, “our”, or “us”).</p>
            <p>By accessing or using the Service, you agree to be bound by these Terms. If you do not agree with any part of these Terms, you may not access or use the Service.</p>
            
            <h4 style={styles.termsHeading}>1. Acceptance of Terms</h4>
            <p>By creating an account, subscribing, or otherwise using the Service, you acknowledge that you have read, understood, and agree to be bound by these Terms, along with our Privacy Policy, which is incorporated herein by reference.</p>
            
            <h4 style={styles.termsHeading}>2. Subscription and Fees</h4>
            <h5>Subscription Basis</h5>
            <p>Access to the Service is provided on a subscription basis, which may include but is not limited to monthly, annual, or one-time paid plans. Subscription fees and billing cycles will be made available to you at the time of subscription.</p>
            <h5>Billing and Payment</h5>
            <p>You authorize us or our third-party payment processor to automatically charge your chosen payment method at the beginning of each billing cycle. If a payment attempt is unsuccessful, we may suspend or terminate your access to the Service until all outstanding amounts are paid.</p>
            <h5>Price Changes</h5>
            <p>We reserve the right to adjust subscription fees, surcharges, or institute new charges at our discretion. We will provide you with at least thirty (30) days’ advance notice of any pricing changes via email or in-app notification. Continued use of the Service after the effective date of the change constitutes acceptance of the new fees.</p>
            <h5>Refund Policy</h5>
            <p>All paid subscriptions are strictly non-refundable. Cancellation of a subscription will prevent future billing, but no partial refunds or credits will be issued for unused periods. Certain exceptions may apply where required by applicable law.</p>
            
            <h4 style={styles.termsHeading}>3. Intellectual Property</h4>
            <h5>Ownership</h5>
            <p>The Service, including all content, features, source code, design, graphics, logos, trademarks, and other intellectual property, remains the exclusive property of Wayne Software Company and its licensors.</p>
            <h5>Restrictions</h5>
            <p>You may not copy, modify, reproduce, distribute, sell, license, or otherwise exploit any part of the Service without our prior written consent. Unauthorized use of our trademarks or branding in connection with any product or service is strictly prohibited.</p>
            
            <h4 style={styles.termsHeading}>4. User Responsibilities</h4>
            <p>You are responsible for maintaining the confidentiality of your account credentials. You agree not to use the Service for any unlawful, fraudulent, or unauthorized purposes. You must comply with all applicable laws and regulations when using the Service. You are solely responsible for backing up any data you upload or generate through the Service.</p>
            
            <h4 style={styles.termsHeading}>5. Limitation of Liability</h4>
            <p>To the maximum extent permitted by law, Wayne Software Company, its directors, employees, partners, agents, suppliers, and affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages. This includes, without limitation, damages for:</p>
            <ul>
                <li>Loss of profits, revenue, or anticipated savings,</li>
                <li>Loss of data, goodwill, or reputation,</li>
                <li>Business interruption, or</li>
                <li>Any other intangible loss.</li>
            </ul>
            <p>Our total aggregate liability for any claims relating to the Service shall not exceed the amount paid by you to us in the twelve (12) months preceding the claim.</p>
            
            <h4 style={styles.termsHeading}>6. Termination</h4>
            <p>We may suspend or terminate your account and access to the Service immediately, without prior notice, if you breach these Terms or engage in activities harmful to the Service or other users. Upon termination, your right to use the Service will immediately cease. Sections relating to Intellectual Property, Limitation of Liability, and Governing Law shall survive termination.</p>
            
            <h4 style={styles.termsHeading}>7. Governing Law</h4>
            <p>These Terms shall be governed by and construed in accordance with the laws of Sri Lanka, without regard to its conflict of law provisions. Any disputes arising from or relating to these Terms shall be subject to the exclusive jurisdiction of the courts of Sri Lanka.</p>
            
            <h4 style={styles.termsHeading}>8. Changes to Terms</h4>
            <p>We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material, we will provide at least thirty (30) days’ notice before the new Terms take effect. What constitutes a material change will be determined solely by us. Continued use of the Service after such changes constitutes acceptance of the updated Terms.</p>
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
