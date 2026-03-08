import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Search, RefreshCw, Zap, Monitor, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface DeviceInfo {
  name?: string;
  ip?: string;
  battery?: number;
  status?: string;
  last_seen?: string;
}

export type DevicesMap = Record<string, DeviceInfo>;

export function HardwareModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('core', { useSuspense: false });
  const [devices, setDevices] = useState<DevicesMap>({});
  const [loading, setLoading] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/hardware/');
      const data = await res.json();
      setDevices(typeof data === 'object' && data !== null ? data : {});
    } catch (err) {
      console.error('Failed to fetch devices', err);
      setDevices({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const handleDiscover = async () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setIsSearching(true);
    try {
      await fetch('/api/hardware/discover', { method: 'POST' });
    } catch (err) {
      console.error('Discover failed', err);
    } finally {
      setDiscovering(false);
    }
    searchTimeoutRef.current = setTimeout(() => setIsSearching(false), 3000);
  };

  const handleBlinkLed = async (mac: string) => {
    try {
      const res = await fetch(`/api/hardware/${encodeURIComponent(mac)}/blink`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('Blink failed', res.status, err);
      }
    } catch (err) {
      console.error('Blink failed', err);
    }
  };

  const handleTestScreen = async (mac: string) => {
    try {
      const res = await fetch(`/api/hardware/${encodeURIComponent(mac)}/test`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('Test screen failed', res.status, err);
      }
    } catch (err) {
      console.error('Test screen failed', err);
    }
  };

  const entries = Object.entries(devices);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50 shrink-0">
          <h3 className="text-lg font-medium text-zinc-100">{t('header.device_manager')}</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchDevices}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-200 rounded-lg text-sm transition-colors"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              {t('hardware.refresh')}
            </button>
            <button
              type="button"
              onClick={handleDiscover}
              disabled={isSearching}
              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
            >
              {isSearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              {t('hardware.discover')}
            </button>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100 p-1">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          {loading && entries.length === 0 ? (
            <p className="text-zinc-500 text-sm">{t('hardware.loading')}</p>
          ) : entries.length === 0 ? (
            <p className="text-zinc-500 text-sm">{t('hardware.no_devices')}</p>
          ) : (
            <div className="border border-zinc-700 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-800/80 text-zinc-400 text-left">
                    <th className="px-4 py-3 font-medium">{t('hardware.name')}</th>
                    <th className="px-4 py-3 font-medium">{t('hardware.mac')}</th>
                    <th className="px-4 py-3 font-medium">{t('hardware.ip')}</th>
                    <th className="px-4 py-3 font-medium">{t('hardware.status')}</th>
                    <th className="px-4 py-3 font-medium text-right">{t('hardware.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(([mac, info]) => (
                    <tr key={mac} className="border-t border-zinc-800 hover:bg-zinc-800/40">
                      <td className="px-4 py-3 text-zinc-200">{info.name ?? '—'}</td>
                      <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{mac}</td>
                      <td className="px-4 py-3 text-zinc-300">{info.ip ?? '—'}</td>
                      <td className="px-4 py-3 text-zinc-300">{info.status ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleBlinkLed(mac)}
                            className="flex items-center gap-1 px-2 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-xs transition-colors"
                          >
                            <Zap size={12} />
                            {t('hardware.blink_led')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTestScreen(mac)}
                            className="flex items-center gap-1 px-2 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-xs transition-colors"
                          >
                            <Monitor size={12} />
                            {t('hardware.test_screen')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
