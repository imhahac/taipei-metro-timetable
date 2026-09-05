import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, HelpCircle, Clock, RotateCcw, Trash2, Zap, Cloud, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { getEffectiveWorkerUrl, saveCustomWorkerUrl } from '../services/tdxService';
import { getCacheItemCount } from '../registerServiceWorker';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  simulatedTime: string;
  onSetSimulatedTime: (t: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  simulatedTime,
  onSetSimulatedTime,
}) => {
  const [workerUrl, setWorkerUrl] = useState<string>('');
  const [workerTestResult, setWorkerTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testingWorker, setTestingWorker] = useState<boolean>(false);
  const [cacheCount, setCacheCount] = useState<number>(0);

  useEffect(() => {
    if (isOpen) {
      setWorkerUrl(getEffectiveWorkerUrl());
      getCacheItemCount().then(setCacheCount);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveWorkerUrl = () => {
    saveCustomWorkerUrl(workerUrl);
    setWorkerTestResult({ success: true, message: '已儲存設定！' });
    setTimeout(() => setWorkerTestResult(null), 2500);
  };

  const handleTestWorker = async () => {
    if (!workerUrl.trim()) {
      setWorkerTestResult({ success: false, message: '請先輸入 Cloudflare Worker 網址' });
      return;
    }
    setTestingWorker(true);
    setWorkerTestResult(null);
    try {
      const base = workerUrl.trim().endsWith('/') ? workerUrl.trim().slice(0, -1) : workerUrl.trim();

      // 1. 檢驗 /health 端點健康狀態
      const healthRes = await fetch(`${base}/health`, { signal: AbortSignal.timeout(4000) });
      if (!healthRes.ok) {
        setWorkerTestResult({ success: false, message: `Worker 基礎連線失敗 (HTTP ${healthRes.status})` });
        return;
      }
      const healthJson = await healthRes.json();

      if (!healthJson.hasCredentials) {
        setWorkerTestResult({
          success: false,
          message: `Worker 已在線，但尚未配置 TDX_CLIENT_ID / TDX_CLIENT_SECRET，無法取得即時資料！`,
        });
        return;
      }

      // 2. 深入檢驗實體列車即時端點 /api/live (全網聚合)
      const liveRes = await fetch(`${base}/api/live`, { signal: AbortSignal.timeout(6000) });
      if (liveRes.ok) {
        const allData = await liveRes.json();
        const totalCount = Array.isArray(allData) ? allData.length : 0;
        const g18Trains = Array.isArray(allData) ? allData.filter((t: any) => t.StationID === 'G18') : [];
        setWorkerTestResult({
          success: true,
          message: `驗證成功！Worker 與 TDX 連線正常，全網當前捕捉到 ${totalCount} 班進站/停靠列車 (南京三民 G18 當前月台停靠: ${g18Trains.length} 班)`,
        });
      } else {
        const errText = await liveRes.text();
        setWorkerTestResult({
          success: false,
          message: `Worker 在線但 TDX 查詢失敗 (HTTP ${liveRes.status})：${errText.slice(0, 100)}`,
        });
      }
    } catch (e: any) {
      setWorkerTestResult({ success: false, message: `無法連線至 Worker: ${e.message}` });
    } finally {
      setTestingWorker(false);
    }
  };

  const handleClearFavorites = () => {
    if (window.confirm('確定要清除所有已收藏的最愛車站嗎？')) {
      localStorage.removeItem('metro_fav_stations');
      window.location.reload();
    }
  };

  const handleReloadCache = async () => {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      alert('已清除本機 PWA 快取，即將重新載入頁面！');
      window.location.reload();
    }
  };

  const presets = [
    { label: '首班發車 (06:05)', time: '06:05' },
    { label: '晨間尖峰 (08:30)', time: '08:30' },
    { label: '日間離峰 (14:00)', time: '14:00' },
    { label: '傍晚尖峰 (18:30)', time: '18:30' },
    { label: '深夜末班 (23:45)', time: '23:45' },
  ];

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <div className="modal-title-group">
            <Zap size={20} color="#10b981" />
            <h2>系統運作模式與進階設定</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Zero-Key Pure Static & PWA Offline Cache Status */}
          <div className="settings-card">
            <div className="settings-card-title">
              <ShieldCheck size={18} color="#10b981" />
              <h3>零金鑰純靜態離線運作 (PWA Cache)</h3>
            </div>
            <p className="settings-card-desc">
              系統架構為 100% 零金鑰純靜態。全路網 134 站時刻表與行車歷程拓撲已完全預編譯為靜態 JSON 並由 Service Worker 自動預載入本機快取，於地下捷運隧道完全無網路環境下仍可秒開秒查。
            </p>
            <div className="test-action-row" style={{ marginTop: '0.25rem', justifyContent: 'space-between' }}>
              <div className="test-result-badge badge-success">
                <ShieldCheck size={16} />
                <span>
                  {cacheCount > 0 ? `PWA 離線快取已就緒（已快取 ${cacheCount} 項資源）` : '純靜態離線模式就緒'}
                </span>
              </div>
              <button className="btn-secondary" onClick={handleReloadCache} style={{ fontSize: '0.78rem' }}>
                <RefreshCw size={14} />
                <span>重整快取</span>
              </button>
            </div>
          </div>

          {/* Cloudflare Worker Edge Proxy */}
          <div className="settings-card">
            <div className="settings-card-title">
              <Cloud size={18} color="#3b82f6" />
              <h3>TDX 即時到站雙軌引擎 (Cloudflare Worker / 訪客免密直連)</h3>
            </div>
            <p className="settings-card-desc">
              <strong>未填寫 Worker 網址時：</strong>系統預設自動啟用【TDX 官方訪客免金鑰直連模式】，直接由瀏覽器發起請求（受限於每日 20 次/IP，支援按需單次手動更新）。<br />
              <strong>配置 Worker 網址後：</strong>自動切換至【邊緣代理模式】，享有伺服器端全域快取、自動高頻輪詢與金鑰安全隔離。
            </p>

            <div className="form-group">
              <label>Worker 代理網址 (選填)</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="https://metro-tdx-proxy.<subdomain>.workers.dev"
                  value={workerUrl}
                  onChange={(e) => setWorkerUrl(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="btn-secondary" onClick={handleTestWorker} disabled={testingWorker}>
                  <RefreshCw size={14} className={testingWorker ? 'spin' : ''} />
                  <span>{testingWorker ? '連線中...' : '測試'}</span>
                </button>
                <button className="btn-primary" onClick={handleSaveWorkerUrl}>
                  <span>儲存</span>
                </button>
              </div>
            </div>

            {workerTestResult && (
              <div
                className={`test-result-badge ${workerTestResult.success ? 'badge-success' : 'badge-error'}`}
                style={{ marginTop: '0.25rem' }}
              >
                {workerTestResult.success ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                <span>{workerTestResult.message}</span>
              </div>
            )}
          </div>

          {/* Time Simulation */}
          <div className="settings-card">
            <div className="settings-card-title">
              <Clock size={18} color="#f59e0b" />
              <h3>時刻模擬與壓力測試</h3>
            </div>
            <p className="settings-card-desc">
              手動指定目前時間以驗證尖離峰班距、首末班車過濾與到站倒數演算法。
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
              {presets.map((p) => (
                <button
                  key={p.time}
                  className={`btn-secondary ${simulatedTime === p.time ? 'active' : ''}`}
                  style={{ fontSize: '0.78rem', padding: '0.35rem 0.6rem' }}
                  onClick={() => onSetSimulatedTime(p.time)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="form-row-inline">
              <input
                type="time"
                value={simulatedTime}
                onChange={(e) => onSetSimulatedTime(e.target.value)}
              />
              <button
                className="btn-secondary"
                onClick={() => onSetSimulatedTime('')}
                disabled={!simulatedTime}
              >
                <RotateCcw size={15} />
                <span>重設為真實時間</span>
              </button>
            </div>
          </div>

          {/* Local Cache & Favorites */}
          <div className="settings-card">
            <div className="settings-card-title">
              <HelpCircle size={18} color="#94a3b8" />
              <h3>本機資料管理</h3>
            </div>
            <p className="settings-card-desc">
              管理儲存於瀏覽器中的最愛車站快取資料。
            </p>
            <div className="test-action-row">
              <button className="btn-secondary" onClick={handleClearFavorites} style={{ color: '#ef4444' }}>
                <Trash2 size={15} />
                <span>清除所有最愛車站快取</span>
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>
            關閉
          </button>
        </div>
      </div>
    </div>
  );
};
