import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '@sirius/state';
import { Drawer, Button, SeverityChip } from '@sirius/ui';

import { Bell, CheckCheck, Trash2 } from 'lucide-react';

export const NotificationDrawer: React.FC = () => {
  const navigate = useNavigate();
  const {
    isNotificationPanelOpen,
    setNotificationPanelOpen,
    notifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    removeNotification,
  } = useUIStore();

  return (
    <Drawer
      isOpen={isNotificationPanelOpen}
      onClose={() => setNotificationPanelOpen(false)}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={18} color="var(--color-cyan)" />
          <span>Notification Center</span>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Actions Bar */}
        {notifications.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-hairline)', paddingBottom: '12px' }}>
            <Button variant="ghost" size="sm" leftIcon={<CheckCheck size={14} />} onClick={markAllNotificationsAsRead}>
              Mark all read
            </Button>
            <span className="sirius-caption">{notifications.length} Total</span>
          </div>
        )}

        {/* Notifications History List */}
        {notifications.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px' }}>
            No notifications available.
          </div>
        ) : (
          notifications.map((notif) => (
            <div
              key={notif.id}
              onClick={() => {
                markNotificationAsRead(notif.id);
                if (notif.actionUrl) {
                  navigate(notif.actionUrl);
                  setNotificationPanelOpen(false);
                }
              }}
              style={{
                backgroundColor: notif.isRead ? 'var(--bg-surface)' : 'rgba(56, 189, 248, 0.06)',
                border: `1px solid ${notif.isRead ? 'var(--border-hairline)' : 'rgba(56, 189, 248, 0.25)'}`,
                borderRadius: 'var(--radius-md)',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {notif.type === 'critical_finding' && <SeverityChip severity="critical" variant="compact" />}
                  {notif.type === 'scan_complete' && <SeverityChip severity="low" variant="compact" />}
                  {notif.type === 'cerebus_fix_ready' && <SeverityChip severity="medium" variant="compact" />}
                  <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{notif.title}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeNotification(notif.id);
                  }}
                  aria-label="Remove notification"
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px' }}
                >
                  <Trash2 size={12} />
                </button>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{notif.message}</div>

              <div className="sirius-caption" style={{ fontSize: '10px', textAlign: 'right', marginTop: '2px' }}>
                {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>

            </div>
          ))
        )}
      </div>
    </Drawer>
  );
};
