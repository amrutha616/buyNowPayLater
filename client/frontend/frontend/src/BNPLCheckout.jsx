import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "./services/api";
import "./BNPLCheckout.css";

const formatInr = (value) => `₹${Math.round(value).toLocaleString("en-IN")}`;

export default function BNPLCheckout() {
  const navigate = useNavigate();
  const [orderData, setOrderData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [paymentProcessing, setPaymentProcessing] = useState(false);

  useEffect(() => {
    // Check if order data exists in localStorage
    const bnplOrder = localStorage.getItem("bnplOrder");
    console.log("BNPLCheckout - bnplOrder from localStorage:", bnplOrder);
    
    if (!bnplOrder) {
      console.warn("No bnplOrder found in localStorage");
      setError("No order found. Please select BNPL from the main shop.");
      setTimeout(() => {
        window.location.href = "/";
      }, 3000);
      return;
    }

    try {
      const data = JSON.parse(bnplOrder);
      console.log("BNPLCheckout - Parsed order data:", data);
      setOrderData(data);
    } catch (err) {
      console.error("BNPLCheckout - Error parsing order:", err);
      setError("Invalid order data");
    }
  }, []);

  const handleCheckout = async () => {
    if (!orderData) return;

    setPaymentProcessing(true);
    setError(null);

    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const userEmail = user.email || "guest@example.com";

      // Step 1: Create order on BNPL backend
      const orderResponse = await API.post("/payment/shop/create-order", {
        amount: orderData.finalTotal,
        userEmail,
        orderId: `SHOP_${Date.now()}`,
      });

      const { orderId, key } = orderResponse.data;

      // Step 2: Open Razorpay checkout
      const options = {
        key,
        amount: Math.round(orderData.finalTotal * 100), // in paise
        currency: "INR",
        name: "SnapCredit Shop",
        description: `Shopping Order - ${orderData.items.length} items`,
        order_id: orderId,
        handler: async (response) => {
          try {
            // Step 3: Verify payment
            const verifyResponse = await API.post(
              "/payment/shop/verify-payment",
              {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                userEmail,
                orderId,
                amount: orderData.finalTotal,
              }
            );

            if (verifyResponse.data.success) {
              // Step 4: Save order to main app
              const order = {
                id: `ORD${Date.now()}`,
                date: new Date().toISOString(),
                items: orderData.items,
                total: orderData.finalTotal,
                paymentMethod: "bnpl",
                status: "confirmed",
                razorpayPaymentId: response.razorpay_payment_id,
              };

              const ordersKey = `orders_${userEmail}`;
              const existingOrders = JSON.parse(
                localStorage.getItem(ordersKey) || "[]"
              );
              existingOrders.push(order);
              localStorage.setItem(ordersKey, JSON.stringify(existingOrders));

              // Clear cart and pending order
              localStorage.removeItem("cart");
              localStorage.removeItem("pendingOrder");
              localStorage.removeItem("bnplOrder");

              alert("✅ Payment successful! Your order has been placed.");

              // Redirect to main app orders page
              window.location.href = "/#/orders";
            } else {
              setError("Payment verification failed. Please try again.");
            }
          } catch (verifyErr) {
            console.error("Payment verification error:", verifyErr);
            setError(
              verifyErr.response?.data?.error || "Payment verification failed"
            );
          } finally {
            setPaymentProcessing(false);
          }
        },
        prefill: {
          email: userEmail,
        },
        theme: {
          color: "#ff0000",
        },
        modal: {
          ondismiss: () => {
            setPaymentProcessing(false);
            setError("Payment cancelled");
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      console.error("Checkout error:", err);
      setError(err.response?.data?.error || err.message);
      setPaymentProcessing(false);
    }
  };

  if (!orderData && !error) {
    return (
      <div className="bnpl-checkout-container">
        <div className="bnpl-loading" style={{ textAlign: "center", padding: "40px" }}>
          <p style={{ fontSize: "18px", marginBottom: "20px" }}>⏳ Loading order details...</p>
          <p style={{ color: "#666", fontSize: "14px" }}>Please wait while we retrieve your order information.</p>
        </div>
      </div>
    );
  }

  if (!orderData && error) {
    return (
      <div className="bnpl-checkout-container">
        <div className="bnpl-loading" style={{ textAlign: "center", padding: "40px", background: "#ffebee", borderRadius: "8px" }}>
          <p style={{ fontSize: "18px", color: "#d32f2f", marginBottom: "16px" }}>❌ {error}</p>
          <a href="/" style={{ color: "#ff0000", textDecoration: "underline", fontSize: "14px" }}>
            ← Return to shop
          </a>
        </div>
      </div>
    );
  }

  if (!orderData) {
    return null;
  }

  return (
    <div className="bnpl-checkout-container">
      <div className="bnpl-checkout">
        <div className="bnpl-header">
          <h2>Complete Your BNPL Purchase</h2>
          <p>Review your order and proceed with payment</p>
        </div>

        <div className="bnpl-content">
          {/* Order Summary */}
          <div className="bnpl-section">
            <h3>Order Summary</h3>

            <div className="bnpl-items">
              {orderData.items.map((item) => (
                <div key={item.cartId} className="bnpl-item">
                  <img src={item.image} alt={item.name} />
                  <div className="bnpl-item-details">
                    <p className="bnpl-item-name">{item.name}</p>
                    <p className="bnpl-item-qty">Qty: {item.quantity}</p>
                  </div>
                  <p className="bnpl-item-price">
                    {formatInr(item.price * item.quantity)}
                  </p>
                </div>
              ))}
            </div>

            <div className="bnpl-price-breakdown">
              <div className="bnpl-price-row">
                <span>Total MRP</span>
                <span>{formatInr(orderData.totalPrice)}</span>
              </div>
              {orderData.couponDiscount > 0 && (
                <div className="bnpl-price-row bnpl-discount">
                  <span>
                    Coupon Discount ({orderData.appliedCoupon?.code})
                  </span>
                  <span className="bnpl-discount-value">
                    −{formatInr(orderData.couponDiscount)}
                  </span>
                </div>
              )}
              <div className="bnpl-price-row">
                <span>Platform Fee</span>
                <span>₹23</span>
              </div>
              <div className="bnpl-price-row bnpl-total">
                <span>Total Amount</span>
                <span>{formatInr(orderData.finalTotal)}</span>
              </div>
            </div>
          </div>

          {/* Payment Info */}
          <div className="bnpl-section">
            <h3>BNPL Payment</h3>
            <div className="bnpl-info-box">
              <p>
                💳 Secure payment powered by <strong>Razorpay</strong>
              </p>
              <p>Choose your preferred payment method at checkout</p>
            </div>

            {error && <div className="bnpl-error">{error}</div>}

            <button
              className="bnpl-checkout-btn"
              onClick={handleCheckout}
              disabled={paymentProcessing}
              style={{
                width: "100%",
                padding: "14px 24px",
                fontSize: "16px",
                fontWeight: "bold",
                color: "#fff",
                background: paymentProcessing ? "#ccc" : "#ff0000",
                border: "none",
                borderRadius: "6px",
                cursor: paymentProcessing ? "not-allowed" : "pointer",
                marginTop: "16px"
              }}
            >
              {paymentProcessing ? "⏳ Processing..." : "🚀 Proceed to Payment"}
            </button>
          </div>

          {/* Security Note */}
          <div className="bnpl-security-note">
            <span>🔒 Your payment information is secure</span>
          </div>
        </div>
      </div>
    </div>
  );
}
