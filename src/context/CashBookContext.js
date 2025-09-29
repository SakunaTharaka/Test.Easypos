import React, { createContext, useState, useCallback, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';

export const CashBookContext = createContext();

export const CashBookProvider = ({ children }) => {
    const [cashBooks, setCashBooks] = useState([]);
    const [cashBookBalances, setCashBookBalances] = useState({});
    const [reconciledDates, setReconciledDates] = useState(new Set());
    const [loading, setLoading] = useState(true);

    const refreshBalances = useCallback(async () => {
        const user = auth.currentUser;
        if (!user) return;
        const uid = user.uid;

        setLoading(true);
        try {
            const cashBooksColRef = collection(db, uid, 'cash_books', 'book_list');
            const cashInsColRef = collection(db, uid, 'cash_book_entries', 'entry_list');
            const expensesColRef = collection(db, uid, 'user_data', 'expenses');
            const stockPaymentsColRef = collection(db, uid, 'stock_payments', 'payments');
            const reconciliationsColRef = collection(db, uid, 'user_data', 'reconciliations');

            const [booksSnap, cashInsSnap, expensesSnap, stockPaymentsSnap, reconSnap] = await Promise.all([
                getDocs(cashBooksColRef),
                getDocs(cashInsColRef),
                getDocs(expensesColRef),
                getDocs(stockPaymentsColRef),
                getDocs(reconciliationsColRef)
            ]);

            let booksData = booksSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            if (booksData.length === 0) {
                const defaultBookName = "Main Account Cashier";
                const defaultBookRef = await addDoc(cashBooksColRef, {
                    name: defaultBookName,
                    createdAt: serverTimestamp(),
                    createdBy: user.displayName || user.email
                });
                booksData.push({ id: defaultBookRef.id, name: defaultBookName });
            }

            const balances = {};
            booksData.forEach(book => balances[book.id] = 0);

            cashInsSnap.forEach(doc => {
                const { cashBookId, amount } = doc.data();
                if (balances[cashBookId] !== undefined) balances[cashBookId] += amount;
            });

            expensesSnap.forEach(doc => {
                const { cashBookId, amount } = doc.data();
                if (balances[cashBookId] !== undefined) balances[cashBookId] -= amount;
            });

            stockPaymentsSnap.forEach(doc => {
                const { cashBookId, amount, method } = doc.data();
                if (cashBookId && method === 'Cash' && balances[cashBookId] !== undefined) {
                    balances[cashBookId] -= amount;
                }
            });
            
            setCashBooks(booksData);
            setCashBookBalances(balances);
            setReconciledDates(new Set(reconSnap.docs.map(doc => doc.id)));

        } catch (error) {
            console.error("Error calculating balances:", error);
            alert("Error setting up cash books: " + error.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(user => {
            if (user) {
                refreshBalances();
            } else {
                setCashBooks([]);
                setCashBookBalances({});
                setReconciledDates(new Set());
                setLoading(false);
            }
        });
        return () => unsubscribe();
    }, [refreshBalances]);

    return (
        <CashBookContext.Provider value={{ cashBooks, cashBookBalances, reconciledDates, refreshBalances, loading }}>
            {children}
        </CashBookContext.Provider>
    );
};