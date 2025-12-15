import React, { useState, useEffect, useMemo } from 'react';
import { AiOutlineShoppingCart, AiOutlineTool } from 'react-icons/ai'; 
// --- Import Firebase ---
import { auth, db } from '../../firebase'; // Adjust this path if your firebase.js is elsewhere
import { collection, query, onSnapshot } from 'firebase/firestore';

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

const formatDateKey = (date) => {
    return date.toISOString().slice(0, 10);
};

/* Transforms raw data into a map of { 'YYYY-MM-DD': [events...] } */
const createEventsMap = (orders, serviceJobs) => {
    const eventMap = new Map();

    const processEvents = (dataArray, type, color, icon) => {
        if (!Array.isArray(dataArray)) return;

        dataArray.forEach(item => {
            let dateString = null;
            let title = '';
            
            // Map specific fields based on Type
            if (type === 'Order' && item.deliveryDateTime) {
                dateString = item.deliveryDateTime;
                title = `Order #${item.orderNumber || 'N/A'}`;
            } else if (type === 'Service' && item.jobCompleteDate) {
                dateString = item.jobCompleteDate;
                title = `Service: ${item.jobType || 'General'}`;
            }

            if (dateString) {
                // Handle both Firestore Timestamps and String Dates
                const dateValue = (dateString && typeof dateString.toDate === 'function') 
                    ? dateString.toDate() 
                    : dateString;

                const date = new Date(dateValue); 
                
                // Validate date
                if (isNaN(date.getTime())) {
                    return; 
                }

                // Reset time to midnight for grouping
                date.setHours(0, 0, 0, 0); 
                const key = formatDateKey(date);

                const event = {
                    id: `${type}-${item.id || item.orderNumber || Date.now()}`,
                    type,
                    title,
                    color,
                    icon,
                    details: item // Store full details for potential future use (tooltips etc)
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

/* Generates days for the calendar view */
const getCalendarDays = (targetDate) => {
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth(); 
    
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0); 
    
    const startDayOfWeek = firstDayOfMonth.getDay(); 
    
    const days = [];
    
    // Preceding days
    for (let i = startDayOfWeek; i > 0; i--) {
        days.push({ 
            date: new Date(year, month, 1 - i), 
            isCurrentMonth: false 
        });
    }

    // Current month days
    for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
        days.push({ 
            date: new Date(year, month, i), 
            isCurrentMonth: true 
        });
    }

    // Trailing days
    const totalDaysToDisplay = Math.ceil((days.length) / 7) * 7;
    const remainingDays = totalDaysToDisplay - days.length;
    for (let i = 1; i <= remainingDays; i++) {
        days.push({ 
            date: new Date(year, month + 1, i), 
            isCurrentMonth: false 
        });
    }

    return days;
};


/**
 * Timeline Component
 */
const Timeline = () => {
    // --- State for fetching data ---
    const [fetchedOrders, setFetchedOrders] = useState([]);
    const [fetchedServices, setFetchedServices] = useState([]);
    const [loading, setLoading] = useState(true);

    const uid = auth.currentUser ? auth.currentUser.uid : null;

    // --- Fetch Orders ---
    useEffect(() => {
        if (!uid) return;

        const ordersRef = collection(db, uid, "orders", "order_list");
        const q = query(ordersRef);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setFetchedOrders(data);
        }, (error) => {
            console.error("Error fetching orders for timeline:", error);
        });

        return () => unsubscribe();
    }, [uid]);

    // --- Fetch Services ---
    useEffect(() => {
        if (!uid) {
            setLoading(false);
            return;
        }

        const servicesRef = collection(db, uid, 'data', 'service_jobs');
        const q = query(servicesRef);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setFetchedServices(data);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching services for timeline:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [uid]);

    
    // --- Calendar Logic ---
    const today = useMemo(() => new Date(), []);
    // Ensure we stick to the first of the current month
    const targetDate = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today]);

    // Create the map from the FETCHED data
    const eventsMap = useMemo(() => {
        return createEventsMap(fetchedOrders, fetchedServices);
    }, [fetchedOrders, fetchedServices]);

    const calendarDays = useMemo(() => {
        return getCalendarDays(targetDate);
    }, [targetDate]);

    const currentMonthName = targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    if (loading) {
        return <div style={{padding: '20px', textAlign: 'center'}}>Loading Schedule...</div>;
    }

    return (
        <div style={styles.container}>
            <h1 style={styles.header}>
                {currentMonthName} Schedule 
            </h1>
            
            {/* Legend */}
            <div style={styles.legendContainer}>
                <span style={styles.legendItem}>
                    <div style={{...styles.legendColor, backgroundColor: themeColors.orderColor}}></div> Orders (Delivery Date)
                </span>
                <span style={styles.legendItem}>
                    <div style={{...styles.legendColor, backgroundColor: themeColors.serviceColor}}></div> Services (Est. Completion)
                </span>
            </div>

            {/* Calendar Grid */}
            <div style={styles.calendarGrid}>
                {DAYS_OF_WEEK.map(day => (
                    <div key={day} style={styles.dayOfWeekHeader}>
                        {day}
                    </div>
                ))}

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
                                opacity: isCurrentMonth ? 1 : 0.4,
                                backgroundColor: isToday ? '#f0f9ff' : (isCurrentMonth ? '#fff' : '#f9fafb'),
                                borderColor: isToday ? themeColors.orderColor : themeColors.border,
                                borderWidth: isToday ? '2px' : '1px',
                            }}
                        >
                            <span style={{
                                ...styles.dateNumber,
                                color: isToday ? themeColors.orderColor : themeColors.darkText,
                                fontWeight: isToday ? 'bold' : 'normal'
                            }}>
                                {date.getDate()}
                            </span>

                            {/* Dots Indicator */}
                            <div style={styles.eventIndicators}>
                                {hasOrder && (
                                    <div 
                                        style={{...styles.eventDot, backgroundColor: themeColors.orderColor}} 
                                        title="Has Orders"
                                    />
                                )}
                                {hasService && (
                                    <div 
                                        style={{...styles.eventDot, backgroundColor: themeColors.serviceColor}} 
                                        title="Has Services"
                                    />
                                )}
                            </div>
                            
                            {/* Text List of Events */}
                            {dayEvents.length > 0 && (
                                <div style={styles.eventList}>
                                    {dayEvents.map(event => (
                                        <div key={event.id} style={{
                                            ...styles.eventItem, 
                                            borderLeft: `3px solid ${event.color}`
                                        }}>
                                            {/* Hide Icon on very small screens if needed, keeping for now */}
                                            {/* <event.icon size={10} style={{marginRight: '4px', color: event.color, minWidth: '10px'}} /> */}
                                            <span style={{overflow: 'hidden', textOverflow: 'ellipsis'}}>{event.title}</span>
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
        maxWidth: '1200px', // Increased width for better visibility
        margin: '20px auto',
        fontFamily: "'Inter', sans-serif",
    },
    header: {
        fontSize: '24px',
        fontWeight: '700',
        marginBottom: '20px',
        color: themeColors.darkText,
        textAlign: 'center',
    },
    legendContainer: {
        display: 'flex',
        justifyContent: 'center',
        gap: '30px',
        paddingBottom: '20px',
        marginBottom: '20px',
        borderBottom: `1px solid ${themeColors.border}`,
    },
    legendItem: {
        display: 'flex',
        alignItems: 'center',
        fontSize: '14px',
        color: themeColors.mediumText,
        fontWeight: '500',
    },
    legendColor: {
        width: '12px',
        height: '12px',
        borderRadius: '4px',
        marginRight: '8px',
    },
    calendarGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        border: `1px solid ${themeColors.border}`,
        borderRadius: '8px',
        overflow: 'hidden',
        backgroundColor: themeColors.border, // gap color
        gap: '1px', // creates grid lines
    },
    dayOfWeekHeader: {
        padding: '12px 5px',
        textAlign: 'center',
        fontWeight: '600',
        fontSize: '13px',
        color: themeColors.mediumText,
        backgroundColor: '#f8fafc',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    },
    calendarCell: {
        position: 'relative',
        minHeight: '130px', // Ensure enough height for items
        padding: '8px',
        backgroundColor: '#fff',
        transition: 'all 0.2s',
        display: 'flex',
        flexDirection: 'column',
    },
    dateNumber: {
        fontSize: '14px',
        display: 'block',
        textAlign: 'right',
        marginBottom: '4px',
    },
    eventIndicators: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '4px',
        marginBottom: '6px',
        height: '6px', // reserve space
    },
    eventDot: {
        width: '6px',
        height: '6px',
        borderRadius: '50%',
    },
    eventList: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        overflowY: 'auto', // Allow scrolling within cell if too many events
        flex: 1, // fill remaining space
    },
    eventItem: {
        fontSize: '10px',
        backgroundColor: '#f1f5f9',
        padding: '4px 6px',
        borderRadius: '4px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        color: themeColors.darkText,
        fontWeight: '600',
        display: 'flex',
        alignItems: 'center',
        cursor: 'default',
    },
};

export default Timeline;