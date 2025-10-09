import React from 'react';

const TermsAndConditions = () => {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Terms and Conditions</h1>
        <p style={styles.lastUpdated}>Last Updated: October 08, 2025</p>

        <p>Please read these Terms and Conditions (“Terms”, “Terms and Conditions”) carefully before using our web application (the “Service”). These Terms constitute a legally binding agreement between you (“User”, “you”, or “your”) and Wayne Software Company (“Company”, “we”, “our”, or “us”).</p>
        <p>By accessing or using the Service, you agree to be bound by these Terms. If you do not agree with any part of these Terms, you may not access or use the Service.</p>

        <h2 style={styles.sectionTitle}>1. Acceptance of Terms</h2>
        <p>By creating an account, subscribing, or otherwise using the Service, you acknowledge that you have read, understood, and agree to be bound by these Terms, along with our Privacy Policy, which is incorporated herein by reference.</p>

        <h2 style={styles.sectionTitle}>2. Subscription and Fees</h2>
        <h3 style={styles.subSectionTitle}>Subscription Basis</h3>
        <p>Access to the Service is provided on a subscription basis, which may include but is not limited to monthly, annual, or one-time paid plans. Subscription fees and billing cycles will be made available to you at the time of subscription.</p>
        <h3 style={styles.subSectionTitle}>Billing and Payment</h3>
        <p>You authorize us or our third-party payment processor to automatically charge your chosen payment method at the beginning of each billing cycle. If a payment attempt is unsuccessful, we may suspend or terminate your access to the Service until all outstanding amounts are paid.</p>
        <h3 style={styles.subSectionTitle}>Price Changes</h3>
        <p>We reserve the right to adjust subscription fees, surcharges, or institute new charges at our discretion. We will provide you with at least thirty (30) days’ advance notice of any pricing changes via email or in-app notification. Continued use of the Service after the effective date of the change constitutes acceptance of the new fees.</p>
        <h3 style={styles.subSectionTitle}>Refund Policy</h3>
        <p>All paid subscriptions are strictly non-refundable. Cancellation of a subscription will prevent future billing, but no partial refunds or credits will be issued for unused periods. Certain exceptions may apply where required by applicable law.</p>

        <h2 style={styles.sectionTitle}>3. Intellectual Property</h2>
        <h3 style={styles.subSectionTitle}>Ownership</h3>
        <p>The Service, including all content, features, source code, design, graphics, logos, trademarks, and other intellectual property, remains the exclusive property of Wayne Software Company and its licensors.</p>
        <h3 style={styles.subSectionTitle}>Restrictions</h3>
        <p>You may not copy, modify, reproduce, distribute, sell, license, or otherwise exploit any part of the Service without our prior written consent. Unauthorized use of our trademarks or branding in connection with any product or service is strictly prohibited.</p>

        <h2 style={styles.sectionTitle}>4. User Responsibilities</h2>
        <p>You are responsible for maintaining the confidentiality of your account credentials. You agree not to use the Service for any unlawful, fraudulent, or unauthorized purposes. You must comply with all applicable laws and regulations when using the Service. You are solely responsible for backing up any data you upload or generate through the Service.</p>

        <h2 style={styles.sectionTitle}>5. Limitation of Liability</h2>
        <p>To the maximum extent permitted by law, Wayne Software Company, its directors, employees, partners, agents, suppliers, and affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages. This includes, without limitation, damages for:</p>
        <ul>
            <li>Loss of profits, revenue, or anticipated savings,</li>
            <li>Loss of data, goodwill, or reputation,</li>
            <li>Business interruption, or</li>
            <li>Any other intangible loss.</li>
        </ul>
        <p>Our total aggregate liability for any claims relating to the Service shall not exceed the amount paid by you to us in the twelve (12) months preceding the claim.</p>

        <h2 style={styles.sectionTitle}>6. Termination</h2>
        <p>We may suspend or terminate your account and access to the Service immediately, without prior notice, if you breach these Terms or engage in activities harmful to the Service or other users. Upon termination, your right to use the Service will immediately cease. Sections relating to Intellectual Property, Limitation of Liability, and Governing Law shall survive termination.</p>

        <h2 style={styles.sectionTitle}>7. Governing Law</h2>
        <p>These Terms shall be governed by and construed in accordance with the laws of Sri Lanka, without regard to its conflict of law provisions. Any disputes arising from or relating to these Terms shall be subject to the exclusive jurisdiction of the courts of Sri Lanka.</p>

        <h2 style={styles.sectionTitle}>8. Changes to Terms</h2>
        <p>We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material, we will provide at least thirty (30) days’ notice before the new Terms take effect. What constitutes a material change will be determined solely by us. Continued use of the Service after such changes constitutes acceptance of the updated Terms.</p>
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: '20px',
    fontFamily: "'Inter', sans-serif",
    backgroundColor: '#f0f2f5',
    lineHeight: '1.6',
    color: '#333',
  },
  card: {
    maxWidth: '800px',
    margin: '0 auto',
    backgroundColor: '#fff',
    padding: '40px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  },
  title: {
    fontSize: '2.5rem',
    borderBottom: '2px solid #eee',
    paddingBottom: '10px',
    marginBottom: '10px',
  },
  lastUpdated: {
    fontSize: '0.9rem',
    color: '#888',
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '1.8rem',
    marginTop: '30px',
    marginBottom: '10px',
    borderBottom: '1px solid #eee',
    paddingBottom: '5px',
  },
  subSectionTitle: {
    fontSize: '1.2rem',
    fontWeight: '600',
    marginTop: '20px',
  },
};

export default TermsAndConditions;

