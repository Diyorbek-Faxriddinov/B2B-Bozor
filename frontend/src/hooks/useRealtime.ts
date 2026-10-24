/**
 * Socket.IO push from the backend (real API mode only). Events just invalidate
 * the matching queries; the existing polling stays as a fallback.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import { API_URL, USE_MOCK } from '@/api/client';
import { qk } from '@/api/hooks';
import { useAuth } from '@/stores/auth';
import type { AppNotification, CourierLocation, ID, Message } from '@/types';

export function useRealtime() {
  const token = useAuth((s) => s.token);
  const qc = useQueryClient();

  useEffect(() => {
    if (USE_MOCK || !token) return;
    const socket = io(`${new URL(API_URL).origin}/realtime`, { auth: { token }, transports: ['websocket', 'polling'] });

    socket.on('notification', (n: AppNotification) => {
      qc.invalidateQueries({ queryKey: qk.notifications });
      if (n.type !== 'message') toast(n.title, { description: n.body });
    });
    socket.on('message', (m: Message) => {
      qc.invalidateQueries({ queryKey: qk.conversations });
      qc.invalidateQueries({ queryKey: qk.conversation(m.conversationId) });
    });
    socket.on('order:updated', (o: { id: ID }) => {
      qc.invalidateQueries({ queryKey: qk.order(o.id) });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['seller'] });
      qc.invalidateQueries({ queryKey: ['courier'] });
    });
    socket.on('order:location', (l: CourierLocation & { orderId: ID }) => {
      qc.invalidateQueries({ queryKey: qk.tracking(l.orderId) });
    });
    return () => {
      socket.disconnect();
    };
  }, [token, qc]);
}
