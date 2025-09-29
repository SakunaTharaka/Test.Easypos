import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { db, auth } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { AiOutlinePrinter } from "react-icons/ai";

const StockOutView = () => {
    const { id } = useParams(); // Get the document ID from the URL
    const [details, setDetails] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDetails = async () => {
            const uid = auth.currentUser?.uid;
            if (!uid || !id) {
                setLoading(false);
                return;
            }

            try {
                const docRef = doc(db, uid, "inventory", "stock_out", id);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    setDetails(docSnap.data());
                } else {
                    console.log("No such document!");
                }
            } catch (error) {
                console.error("Error fetching stock out details:", error);
            }
            setLoading(false);
        };

        fetchDetails();
    }, [id]);

    if (loading) return <div style={styles.centered}>Loading Details...</div>;
    if (!details) return <div style={styles.centered}>Record not found.</div>;

    return (
        <>
            <style>{`
                @media print {
                    .non-printable { display: none !important; }
                    body { background-color: #fff; }
                    .print-area { margin: 0; padding: 0; box-shadow: none; border: none; }
                }
            `}</style>
            <div className="non-printable" style={styles.controls}>
                <button onClick={() => window.print()} style={styles.printButton}>
                    <AiOutlinePrinter style={{ marginRight: '8px' }} />
                    Print
                </button>
            </div>
            <div className="print-area" style={styles.container}>
                <h2 style={styles.header}>Stock Out Details</h2>
                <div style={styles.grid}>
                    <div style={styles.detailItem}><strong>Stock Out ID:</strong> {details.stockOutId}</div>
                    <div style={styles.detailItem}><strong>Original Stock In ID:</strong> {details.stockInId}</div>
                    <div style={styles.detailItem}><strong>Item Name:</strong> {details.item}</div>
                    <div style={styles.detailItem}><strong>Category:</strong> {details.category}</div>
                    <div style={styles.detailItem}><strong>Quantity Removed:</strong> {details.quantity} {details.unit}</div>
                    <div style={styles.detailItem}><strong>Date:</strong> {details.createdAt?.toDate().toLocaleString()}</div>
                    <div style={styles.detailItemFull}><strong>Receiver:</strong> {details.receiverName} (ID: {details.receiverId})</div>
                    <div style={styles.detailItemFull}><strong>Issued By:</strong> {details.addedBy}</div>
                    <div style={styles.detailItemFull}><strong>Remark:</strong> {details.remark || "No remark"}</div>
                </div>
            </div>
        </>
    );
};

const styles = {
    centered: { textAlign: 'center', marginTop: '50px', fontSize: '18px' },
    container: { maxWidth: '800px', margin: '20px auto', padding: '32px', backgroundColor: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', borderRadius: '12px', fontFamily: "'Inter', sans-serif" },
    header: { textAlign: 'center', marginBottom: '32px', color: '#2c3e50', borderBottom: '1px solid #eaeaea', paddingBottom: '16px' },
    grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
    detailItem: { padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '8px' },
    detailItemFull: { gridColumn: 'span 2', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '8px' },
    controls: { padding: '20px', display: 'flex', justifyContent: 'center' },
    printButton: { padding: '10px 20px', border: 'none', backgroundColor: '#3498db', color: 'white', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' },
};

export default StockOutView;