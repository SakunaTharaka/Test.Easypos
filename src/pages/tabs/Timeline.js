import React from 'react';

// Sample data for the timeline
const serviceEvents = [
  { id: 1, status: 'Order Placed', user: 'Admin', time: '2025-10-27 10:00 AM', description: 'New service request for "Printer Repair".' },
  { id: 2, status: 'Technician Assigned', user: 'Manager', time: '2025-10-27 10:30 AM', description: 'Technician John Doe assigned.' },
  { id: 3, status: 'In Progress', user: 'John Doe', time: '2025-10-27 01:15 PM', description: 'Technician is on-site and assessing the issue.' },
  { id: 4, status: 'Pending Parts', user: 'John Doe', time: '2025-10-27 02:45 PM', description: 'Requires new fuser assembly. Part ordered.' },
  { id: 5, status: 'Completed', user: 'John Doe', time: '2025-10-28 11:00 AM', description: 'Part replaced and printer is functional. Service completed.' },
  { id: 6, status: 'Billed', user: 'Admin', time: '2025-10-28 11:30 AM', description: 'Invoice #INV-00123 generated and sent to customer.' },
];

/**
 * Timeline Component
 * Renders a timeline view for service requests and orders.
 */
const Timeline = ({ internalUser }) => {
  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Service & Order Timeline</h1>
      <p style={styles.subHeader}>
        Tracking all service requests and order statuses. (Logged in as: {internalUser?.username || 'User'})
      </p>

      {/* Timeline Container */}
      <div style={styles.timelineContainer}>
        {serviceEvents.map((event, index) => (
          <div key={event.id} style={styles.timelineItem}>
            {/* Timeline dot and connecting line */}
            <div style={styles.timelineIconWrapper}>
              <div style={styles.timelineIcon}></div>
              {/* Don't draw a line for the last item */}
              {index < serviceEvents.length - 1 && (
                <div style={styles.timelineConnector}></div>
              )}
            </div>

            {/* Timeline event content */}
            <div style={styles.timelineContent}>
              <div style={styles.contentHeader}>
                <span style={styles.status}>{event.status}</span>
                <span style={styles.time}>{event.time}</span>
              </div>
              <p style={styles.description}>{event.description}</p>
              <span style={styles.user}>By: {event.user}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Styles ---
// Using inline styles for encapsulation
const themeColors = {
  primary: '#00A1FF',
  light: '#f8f9fa',
  darkText: '#1e293b',
  mediumText: '#334155',
  lightText: '#64748b',
  faintText: '#94a3b8',
  border: '#e2e8f0',
};

const styles = {
  container: {
    padding: '24px',
  },
  header: {
    color: themeColors.darkText,
    fontSize: '28px',
    fontWeight: '700',
    margin: '0 0 8px 0',
  },
  subHeader: {
    color: themeColors.lightText,
    fontSize: '16px',
    margin: '0 0 32px 0',
  },
  timelineContainer: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
  },
  timelineItem: {
    display: 'flex',
    position: 'relative',
    paddingBottom: '20px', // Gap between items
  },
  timelineIconWrapper: {
    position: 'relative',
    width: '30px', // Width for the icon and line
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  timelineIcon: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    background: themeColors.primary,
    border: `3px solid ${themeColors.light}`,
    zIndex: 1,
    boxShadow: `0 0 0 3px ${themeColors.primary}`,
  },
  timelineConnector: {
    position: 'absolute',
    top: '18px', // Start below the icon
    bottom: '-20px', // Extend to the next item's gap
    width: '2px',
    background: themeColors.border,
    zIndex: 0,
  },
  timelineContent: {
    flex: 1,
    background: themeColors.light,
    border: `1px solid ${themeColors.border}`,
    borderRadius: '8px',
    padding: '16px',
    marginLeft: '12px',
  },
  contentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  status: {
    fontSize: '16px',
    fontWeight: '600',
    color: themeColors.primary,
  },
  time: {
    fontSize: '13px',
    color: themeColors.lightText,
  },
  description: {
    fontSize: '14px',
    color: themeColors.mediumText,
    margin: '0 0 12px 0',
  },
  user: {
    fontSize: '13px',
    fontStyle: 'italic',
    color: themeColors.faintText,
  },
};

export default Timeline;
