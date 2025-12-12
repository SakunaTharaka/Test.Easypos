import React, { useMemo } from 'react';
import { AiOutlineShoppingCart, AiOutlineTool } from 'react-icons/ai'; 

// --- Theme Colors and Constants ---
const themeColors = {
  orderColor: '#00A1FF',  // Blue for Orders
  serviceColor: '#10B981', // Green for Services
  border: '#e5e7eb',
  light: '#f9fafb',
  darkText: '#1f2937',
  mediumText: '#6b7280',
  red: '#ef4444',
};

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// --- Helper Functions ---

// Formats a Date object to a YYYY-MM-DD string for map key lookup
const formatDateKey = (date) => {
    return date.toISOString().slice(0, 10);
};

/* Transforms raw data into a map of { 'YYYY-MM-DD': [events...] } 
   This allows for quick lookup when rendering the calendar cells.
*/
const createEventsMap = (orders, serviceJobs) => {
    const eventMap = new Map();

    const processEvents = (dataArray, type, color, icon) => {
        if (!Array.isArray(dataArray)) return;

        dataArray.forEach(item => {
            let dateString = null;
            let title = '';
            
            if (type === 'Order' && item.deliveryDateTime) {
                dateString = item.deliveryDateTime;
                title = `Order #${item.orderNumber || 'N/A'}`;
            } else if (type === 'Service' && item.jobCompleteDate) {
                dateString = item.jobCompleteDate;
                title = `Service: ${item.jobType || 'General'}`;
            }

            if (dateString) {
                const date = new Date(dateString);
                // Reset time to midnight for grouping
                date.setHours(0, 0, 0, 0); 
                const key = formatDateKey(date);

                const event = {
                    id: `${type}-${item.id || item.orderNumber || Date.now()}`,
                    type,
                    title,
                    color,
                    icon,
                };
                
                if (eventMap.has(key)) {
                    eventMap.get(key).push(event);
                } else {
                    eventMap.set(key, [event]);
                }
            }
        });
    };

    processEvents(orders, 'Order', themeColors.orderColor, AiOutlineShoppingCart);
    processEvents(serviceJobs, 'Service', themeColors.serviceColor, AiOutlineTool);

    return eventMap;
};

/* Generates all days required for the current month's calendar view. */
const getCalendarDays = (targetDate) => {
    const date = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    date.setHours(0, 0, 0, 0); 
    
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed month
    
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0); // Last day of the current month
    
    const startDayOfWeek = firstDayOfMonth.getDay(); // 0 (Sun) - 6 (Sat)
    
    const days = [];
    
    // 1. Fill in preceding days from the previous month
    const previousMonthLastDay = new Date(year, month, 0);
    for (let i = startDayOfWeek; i > 0; i--) {
        const day = previousMonthLastDay.getDate() - i + 1;
        days.push({ 
            date: new Date(year, month - 1, day), 
            isCurrentMonth: false 
        });
    }

    // 2. Fill in days of the current month
    for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
        days.push({ 
            date: new Date(year, month, i), 
            isCurrentMonth: true 
        });
    }

    // 3. Fill in trailing days from the next month to complete the last week
    const totalDaysToDisplay = Math.ceil((days.length) / 7) * 7;
    let nextMonthDay = 1;
    while (days.length < totalDaysToDisplay) {
        days.push({ 
            date: new Date(year, month + 1, nextMonthDay++), 
            isCurrentMonth: false 
        });
    }

    return days;
};


/**
 * Timeline Component (Calendar Grid View)
 * Displays a monthly calendar grid showing Orders and Services.
 */
const Timeline = ({ orders = [], serviceJobs = [] }) => {
    
    // Set the target date to the current date for the current month view
    const today = useMemo(() => new Date(), []);
    const targetDate = useMemo(() => {
        const d = new Date(today);
        d.setDate(1); // Set to the 1st for consistent month start
        return d;
    }, [today]);
    
    // 1. Prepare Data
    const eventsMap = useMemo(() => {
        return createEventsMap(orders, serviceJobs);
    }, [orders, serviceJobs]);

    // 2. Generate Calendar Days
    const calendarDays = useMemo(() => {
        return getCalendarDays(targetDate);
    }, [targetDate]);

    const currentMonthName = targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // --- RENDER LOGIC ---

    return (
        <div style={styles.container}>
            <h1 style={styles.header}>
                {currentMonthName} Schedule 
            </h1>
            
            {/* REFERENCE (Legend) Area */}
            <div style={styles.legendContainer}>
                <span style={styles.legendItem}>
                    <div style={{...styles.legendColor, backgroundColor: themeColors.orderColor}}></div> Orders
                </span>
                <span style={styles.legendItem}>
                    <div style={{...styles.legendColor, backgroundColor: themeColors.serviceColor}}></div> Services
                </span>
            </div>

            {/* Calendar Grid Header (Days of Week) */}
            <div style={styles.calendarGrid}>
                {DAYS_OF_WEEK.map(day => (
                    <div key={day} style={styles.dayOfWeekHeader}>
                        {day}
                    </div>
                ))}

                {/* Calendar Grid Cells (Days of Month) */}
                {calendarDays.map(({ date, isCurrentMonth }) => {
                    const key = formatDateKey(date);
                    const dayEvents = eventsMap.get(key) || [];
                    const isToday = key === formatDateKey(today);
                    
                    const hasOrder = dayEvents.some(e => e.type === 'Order');
                    const hasService = dayEvents.some(e => e.type === 'Service');

                    return (
                        <div 
                            key={key} 
                            style={{
                                ...styles.calendarCell,
                                opacity: isCurrentMonth ? 1 : 0.5,
                                border: isToday ? `2px solid ${themeColors.red}` : `1px solid ${themeColors.border}`,
                                backgroundColor: isToday ? themeColors.light : '#fff',
                            }}
                        >
                            <span style={styles.dateNumber}>
                                {date.getDate()}
                            </span>

                            <div style={styles.eventIndicators}>
                                {hasOrder && (
                                    <div 
                                        style={{...styles.eventDot, backgroundColor: themeColors.orderColor}} 
                                        title={`${dayEvents.filter(e => e.type === 'Order').length} Order(s)`}
                                    />
                                )}
                                {hasService && (
                                    <div 
                                        style={{...styles.eventDot, backgroundColor: themeColors.serviceColor}} 
                                        title={`${dayEvents.filter(e => e.type === 'Service').length} Service(s)`}
                                    />
                                )}
                            </div>
                            
                            {/* Optional: Show event titles on hover/click */}
                            {dayEvents.length > 0 && (
                                <div style={styles.eventList}>
                                    {dayEvents.map(event => (
                                        <div key={event.id} style={{
                                            ...styles.eventItem, 
                                            borderLeft: `3px solid ${event.color}`
                                        }}>
                                            <event.icon size={12} style={{marginRight: '4px', color: event.color}} />
                                            {event.title}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// --- Styles (CSS-in-JS) ---
const styles = {
    container: {
        padding: '25px',
        backgroundColor: '#fff',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        maxWidth: '1000px',
        margin: '20px auto',
        fontFamily: 'Arial, sans-serif',
    },
    header: {
        fontSize: '28px',
        fontWeight: '700',
        marginBottom: '25px',
        color: themeColors.darkText,
        textAlign: 'center',
    },
    // --- Legend Styles ---
    legendContainer: {
        display: 'flex',
        justifyContent: 'center',
        gap: '40px',
        padding: '15px 0',
        marginBottom: '20px',
        borderBottom: `1px solid ${themeColors.border}`,
    },
    legendItem: {
        display: 'flex',
        alignItems: 'center',
        fontSize: '15px',
        color: themeColors.mediumText,
    },
    legendColor: {
        width: '14px',
        height: '14px',
        borderRadius: '50%',
        marginRight: '8px',
        border: `1px solid ${themeColors.border}`,
    },
    // --- Calendar Grid Styles ---
    calendarGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        border: `1px solid ${themeColors.border}`,
        borderRadius: '4px',
        overflow: 'hidden',
    },
    dayOfWeekHeader: {
        padding: '10px 5px',
        textAlign: 'center',
        fontWeight: 'bold',
        fontSize: '14px',
        color: themeColors.darkText,
        backgroundColor: themeColors.light,
        borderBottom: `1px solid ${themeColors.border}`,
    },
    calendarCell: {
        position: 'relative',
        height: '120px', // Standard height for a calendar cell
        padding: '8px',
        border: `1px solid ${themeColors.border}`,
        cursor: 'pointer',
        transition: 'background-color 0.2s',
        overflow: 'hidden',
        boxSizing: 'border-box',
    },
    dateNumber: {
        fontSize: '16px',
        fontWeight: '600',
        color: themeColors.darkText,
        display: 'block',
        textAlign: 'right',
        marginBottom: '5px',
    },
    eventIndicators: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '5px',
        marginBottom: '5px',
    },
    eventDot: {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        marginTop: '2px',
    },
    eventList: {
        position: 'absolute',
        top: '35px', // Start below the date number
        left: '0',
        right: '0',
        maxHeight: '75px',
        overflowY: 'auto',
        padding: '0 5px',
        zIndex: 10,
    },
    eventItem: {
        fontSize: '11px',
        backgroundColor: '#fff',
        padding: '3px 5px',
        marginBottom: '3px',
        borderRadius: '2px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        color: themeColors.mediumText,
        fontWeight: '500',
        display: 'flex',
        alignItems: 'center',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
    },
};

export default Timeline;