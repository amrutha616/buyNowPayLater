import { useState, useEffect } from "react";
import API from "./services/api";

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await API.get("/notifications");
      setNotifications(res.data.notifications);
      setUnreadCount(res.data.unreadCount);
    } catch (err) {
      console.error("Fetch notifications error:", err);
    } finally {
      setLoading(false);
    }
  };

  const markRead = async (notificationId) => {
    try {
      await API.put(`/notifications/${notificationId}/read`);
      fetchNotifications();
    } catch (err) {
      console.error("Mark read error:", err);
    }
  };

  const deleteNotification = async (notificationId) => {
    try {
      await API.delete(`/notifications/${notificationId}`);
      fetchNotifications();
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const markAllRead = async () => {
    try {
      await API.put("/notifications/mark-all-read");
      fetchNotifications();
    } catch (err) {
      console.error("Mark all read error:", err);
    }
  };

  if (loading) return <div className="loading">Loading notifications...</div>;

  return (
    <div className="notifications-page">
      <section className="overview">
        <h2>🔔 Notifications</h2>
        {unreadCount > 0 && (
          <div className="unread-badge">{unreadCount} unread</div>
        )}
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="ghost-button">
            Mark all as read
          </button>
        )}
      </section>

      <div className="notifications-list">
        {notifications.length === 0 ? (
          <p className="muted">No notifications yet</p>
        ) : (
          notifications.map((notif) => (
            <div
              key={notif._id}
              className={`notification-item ${notif.read ? "read" : "unread"}`}
            >
              <div className="notification-content">
                <h4>{notif.title}</h4>
                <p>{notif.message}</p>
                <p className="muted">
                  {new Date(notif.createdAt).toLocaleDateString()} •{" "}
                  <span className="channel-badge">{notif.channel}</span>
                </p>
              </div>
              <div className="notification-actions">
                {!notif.read && (
                  <button
                    onClick={() => markRead(notif._id)}
                    className="ghost-button"
                  >
                    Mark read
                  </button>
                )}
                <button
                  onClick={() => deleteNotification(notif._id)}
                  className="ghost-button danger"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
