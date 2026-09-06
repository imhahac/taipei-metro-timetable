import React, { useState, useMemo, useEffect } from 'react';
import { Clock, Info, Star, Train, AlertCircle, Sparkles, ChevronRight, LayoutGrid, List, RefreshCw } from 'lucide-react';
import { DayType, StationDetail, StationSummary, TimetableDirection } from '../types/metro';
import {
  calculateNextTrains,
  formatTimeHM,
  getLineColor,
  getLineTextColor,
  getScheduleForDay,
  groupDeparturesByHour,
} from '../services/timetableEngine';
import {
  fetchLiveBoardWithEngine,
  TDXLiveItem,
  getLiveBoardMode,
  getGuestRemainingQuota,
  getEffectiveWorkerUrl,
} from '../services/tdxService';

interface StationBoardProps {
  station: StationSummary;
  stationDetail: StationDetail | null;
  dayType: DayType;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  currentTime: Date;
  onSelectTrain: (depTime: string, dst: string) => void;
}

export const StationBoard: React.FC<StationBoardProps> = ({
  station,
  stationDetail,
  dayType,
  isFavorite,
  onToggleFavorite,
  currentTime,
  onSelectTrain,
}) => {
  const [selectedDirectionIdx, setSelectedDirectionIdx] = useState<number>(0);
  const [filterMode, setFilterMode] = useState<'all' | 'shuttle' | 'terminal'>('all');
  const [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('grid');
  const [liveArrivals, setLiveArrivals] = useState<TDXLiveItem[] | null>(null);
  const [isLiveActive, setIsLiveActive] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [activeEngine, setActiveEngine] = useState<'guest' | 'worker'>(getLiveBoardMode());
  const [isFallback, setIsFallback] = useState<boolean>(false);
  const [guestQuota, setGuestQuota] = useState<number | null>(getGuestRemainingQuota());
  const [quotaToast, setQuotaToast] = useState<string | null>(null);

  const handleManualRefresh = async () => {
    // 若處於訪客模式且已知額度已為 0，且未配置 Worker
    if (activeEngine === 'guest' && guestQuota === 0 && !getEffectiveWorkerUrl()) {
      setQuotaToast('今日 TDX 來源端 IP 額度 (20次/日) 已全數用罄，目前維持離線班表推算。明日重置，或於設定中填入 Worker 網址！');
      setTimeout(() => setQuotaToast(null), 5000);
      return;
    }

    setIsRefreshing(true);
    setQuotaToast(null);
    try {
      const result = await fetchLiveBoardWithEngine(station.code, true);
      setActiveEngine(result.activeEngine);
      setIsFallback(result.isFallback);
      setGuestQuota(result.guestQuota);

      if (result.items !== null) {
        setLiveArrivals(result.items);
        setIsLiveActive(true);

        if (result.isFallback) {
          setQuotaToast('⚡ 來源端 IP 額度已達上限 (429)，已自動無縫切換至 Worker (OAuth2 模式)！');
        } else if (result.activeEngine === 'worker') {
          setQuotaToast(result.items.length > 0 ? '已同步 Worker 即時車況 (月台有車)' : 'Worker 連線正常：目前月台無停靠車');
        } else {
          setQuotaToast(
            `已同步 TDX 訪客即時動態 (今日來源端 IP 額度剩 ${result.guestQuota !== null ? result.guestQuota : '≤20'} 次)`
          );
        }
      } else {
        setLiveArrivals(null);
        setIsLiveActive(false);
        if (result.guestQuota === 0) {
          setQuotaToast('今日 TDX 來源端 IP 額度 (20次/日) 已達上限 (HTTP 429)，自動降級為離線時刻表推算。');
        } else {
          setQuotaToast('連線異常，目前維持離線時刻表推算');
        }
      }
      setTimeout(() => setQuotaToast(null), 5000);
    } catch (e) {
      setLiveArrivals(null);
      setIsLiveActive(false);
      setQuotaToast('連線異常，目前維持離線時刻表推算');
      setTimeout(() => setQuotaToast(null), 5000);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let currentDelay = 25000; // Worker 全路網快取週期 25 秒

    const scheduleNext = (delay: number) => {
      if (!isMounted) return;
      timerId = setTimeout(loadLive, delay);
    };

    const loadLive = async () => {
      // 若分頁處於背景或手機螢幕鎖定，立即停止發送請求，零 API 消耗
      if (document.visibilityState !== 'visible') {
        return;
      }

      try {
        const result = await fetchLiveBoardWithEngine(station.code);
        if (!isMounted) return;

        setActiveEngine(result.activeEngine);
        setIsFallback(result.isFallback);
        setGuestQuota(result.guestQuota);

        if (result.items !== null) {
          // 成功取得資料 (即便長度為 0 亦代表連線正常且確認月台目前無車)
          setLiveArrivals(result.items);
          setIsLiveActive(true);

          if (result.isFallback) {
            setQuotaToast('⚡ 來源端 IP 額度已達上限 (429)，已自動無縫切換至 Worker (OAuth2 模式)！');
            setTimeout(() => setQuotaToast(null), 5000);
          }

          // 核心策略：僅在 Worker 模式下啟用 25 秒自動平穩輪詢；訪客模式嚴格保護 20 次額度不自動輪詢
          if (result.activeEngine === 'worker') {
            currentDelay = 25000;
            scheduleNext(currentDelay);
          }
        } else {
          // 真正連線失敗 / 429 且無 Worker 可切換
          setLiveArrivals(null);
          setIsLiveActive(false);
          if (result.activeEngine === 'worker') {
            currentDelay = Math.min(currentDelay * 1.5, 60000);
            scheduleNext(currentDelay);
          }
        }
      } catch (e) {
        if (!isMounted) return;
        setGuestQuota(getGuestRemainingQuota());
        setLiveArrivals(null);
        setIsLiveActive(false);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadLive();
      } else {
        if (timerId) clearTimeout(timerId);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    loadLive();

    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [station.code]);

  const timetables = stationDetail?.Timetables || [];
  const currentDirection: TimetableDirection | undefined = timetables[selectedDirectionIdx] || timetables[0];

  const currentDepartures = useMemo(() => {
    if (!currentDirection) return [];
    return getScheduleForDay(currentDirection.Schedule, dayType);
  }, [currentDirection, dayType]);

  const nextTrains = useMemo(() => {
    return calculateNextTrains(currentDepartures, currentTime, 3);
  }, [currentDepartures, currentTime]);

  const groupedDepartures = useMemo(() => {
    return groupDeparturesByHour(currentDepartures);
  }, [currentDepartures]);

  const currentHourStr = String(currentTime.getHours()).padStart(2, '0');

  const shuttleNote = currentDirection?.DestinationNotice || (
    station.line === 'G' ? '加註底線為往台電大樓站區間車' :
    station.line === 'R' ? '加註底線為往大安、北投站區間車' :
    station.line === 'BL' ? '加註底線為往亞東醫院站區間車' :
    station.line === 'O' ? '加註底線為往蘆洲站列車' : ''
  );

  const matchedLiveItem = useMemo(() => {
    if (!liveArrivals || !currentDirection) return null;
    return liveArrivals.find((item) => {
      const head = item.TripHeadSign || item.DestinationStationName?.Zh_tw || '';
      return currentDirection.Direction.includes(head) || head.includes(currentDirection.Direction);
    });
  }, [liveArrivals, currentDirection]);

  return (
    <div className="station-board-container">
      {/* Station Hero Header */}
      <div className="station-hero">
        <div className="station-hero-left">
          <div className="code-and-fav">
            <span
              className="badge-line badge-large"
              style={{
                backgroundColor: getLineColor(station.line),
                color: getLineTextColor(station.line),
              }}
            >
              {station.code}
            </span>
            <button
              className={`fav-toggle-btn ${isFavorite ? 'active' : ''}`}
              onClick={onToggleFavorite}
              title={isFavorite ? '從最愛移除' : '加到最愛車站'}
            >
              <Star size={20} fill={isFavorite ? '#fbbf24' : 'none'} color={isFavorite ? '#fbbf24' : '#9ca3af'} />
            </button>
          </div>
          <div className="station-names">
            <h1 className="station-title">{station.name}</h1>
            <span className="station-subtitle">TRTC Station {station.code}</span>
          </div>
        </div>

        {/* Live Status Header Tag & Manual Refresh */}
        <div className="station-hero-right" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className="btn-secondary"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            title={activeEngine === 'worker' ? '手動強制更新到站 (Worker OAuth2 快取模式)' : '手動更新實體到站 (消耗 1 次 TDX 來源端 IP 額度)'}
            style={{
              padding: '0.28rem 0.65rem',
              fontSize: '0.78rem',
              borderRadius: '9999px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <RefreshCw size={13} className={isRefreshing ? 'spin' : ''} />
            <span>{isRefreshing ? '更新中' : '即時更新'}</span>
          </button>

          {isLiveActive ? (
            activeEngine === 'worker' ? (
              <div className="status-pill live-connected" style={{ borderColor: '#3b82f6', background: 'rgba(59, 130, 246, 0.12)' }}>
                <span className="status-indicator" style={{ backgroundColor: '#3b82f6' }}></span>
                <span className="status-pill-text" style={{ color: '#3b82f6', fontWeight: 700 }}>
                  {isFallback
                    ? '⚡ TDX 額度已滿 (429) · 已自動升級至 Worker (OAuth2 模式)'
                    : matchedLiveItem
                    ? '⚡ Cloudflare Worker 即時動態 (列車月台停靠中)'
                    : '⚡ Cloudflare Worker (OAuth2 快取連線中 · 表定推算倒數)'}
                </span>
              </div>
            ) : (
              <div className="status-pill live-connected" style={{ borderColor: '#ef4444', background: 'rgba(239, 68, 68, 0.12)' }}>
                <span className="status-indicator" style={{ backgroundColor: '#ef4444' }}></span>
                <span className="status-pill-text" style={{ color: '#ef4444', fontWeight: 700 }}>
                  🔴 TDX 訪客直連中 (今日來源端 IP 額度剩 {guestQuota !== null ? guestQuota : '≤20'} 次)
                </span>
              </div>
            )
          ) : station.line === 'BR' ? (
            <div className="status-pill" style={{ borderColor: '#c48c31', background: 'rgba(196, 140, 49, 0.12)' }}>
              <span className="status-indicator" style={{ backgroundColor: '#c48c31' }}></span>
              <span className="status-pill-text" style={{ color: '#c48c31', fontWeight: 700 }}>
                🟡 文湖線班距推估 (官方無固定分秒時刻表)
              </span>
            </div>
          ) : (
            <div
              className="status-pill"
              style={
                guestQuota === 0
                  ? { borderColor: '#f59e0b', background: 'rgba(245, 158, 11, 0.12)' }
                  : undefined
              }
            >
              <span
                className="status-indicator"
                style={guestQuota === 0 ? { backgroundColor: '#f59e0b' } : undefined}
              ></span>
              <span
                className="status-pill-text"
                style={guestQuota === 0 ? { color: '#f59e0b', fontWeight: 700 } : undefined}
              >
                {guestQuota === 0
                  ? `🟡 表定時刻表推算中 (${formatTimeHM(currentTime)}) · 來源端 IP 額度已用罄 (20次/日)`
                  : `🟢 表定時刻表推算中 (${formatTimeHM(currentTime)}) · 基準 115.8.30 版`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Quota Toast Alert */}
      {quotaToast && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0.85rem',
            marginTop: '0.65rem',
            borderRadius: '8px',
            fontSize: '0.82rem',
            background: guestQuota === 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
            border: `1px solid ${guestQuota === 0 ? '#f59e0b' : '#10b981'}`,
            color: guestQuota === 0 ? '#f59e0b' : '#10b981',
            fontWeight: 600,
          }}
        >
          <AlertCircle size={15} color={guestQuota === 0 ? '#f59e0b' : '#10b981'} style={{ flexShrink: 0 }} />
          <span>{quotaToast}</span>
        </div>
      )}

      {/* Direction Switch Tabs */}
      {timetables.length > 1 && (
        <div className="direction-tabs">
          {timetables.map((dir, idx) => (
            <button
              key={idx}
              className={`dir-tab-btn ${selectedDirectionIdx === idx ? 'active' : ''}`}
              onClick={() => setSelectedDirectionIdx(idx)}
            >
              <Train size={18} />
              <span>{dir.Direction}</span>
            </button>
          ))}
        </div>
      )}

      {/* 文湖線特性告示卡 (無固定分秒時刻，到站全權依賴實體車況) */}
      {station.line === 'BR' && (
        <div
          className="wenhu-notice-banner"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            padding: '0.65rem 1rem',
            marginTop: '0.75rem',
            background: 'rgba(196, 140, 49, 0.1)',
            border: '1px solid rgba(196, 140, 49, 0.3)',
            borderRadius: 'var(--radius-sharp)',
            fontSize: '0.84rem',
            lineHeight: 1.5,
          }}
        >
          <AlertCircle size={18} color="#c48c31" style={{ flexShrink: 0 }} />
          <div>
            <strong style={{ color: '#c48c31' }}>文湖線營運特性提醒：</strong>
            本線為全自動無人駕駛中運量系統，北捷官方未發布固定分秒時刻表。
            {isLiveActive ? (
              <span style={{ color: '#10b981', fontWeight: 700 }}>
                {' '}到站倒數已全權依賴 Cloudflare 代理之 TDX 實體即時車況。
              </span>
            ) : (
              <span>
                {' '}全日時刻為依官方公告班距（尖峰 2~4 分、離峰 4~7 分）推估之參考值，精準到站請以實體車況為準。
              </span>
            )}
          </div>
        </div>
      )}

      {/* Next Trains Arrival Live Cards */}
      <div className="live-arrivals-section">
        <div className="section-header">
          <div className="section-title-group">
            <Sparkles size={18} color="var(--live-color)" />
            <h2>即將到站列車</h2>
          </div>
          <span className="day-badge">
            {dayType === 'weekday' ? '平日時刻表' : dayType === 'saturday' ? '週六時刻表' : '週日/假日時刻表'}
          </span>
        </div>

        <div className="arrival-cards-grid">
          {nextTrains.length > 0 ? (
            nextTrains.map((train, idx) => (
              <div
                key={idx}
                className={`arrival-card ${idx === 0 ? 'card-first' : ''} ${train.isShuttle ? 'card-shuttle' : ''}`}
                onClick={() => onSelectTrain(train.time, train.dst)}
                style={{ cursor: 'pointer' }}
                title="點擊查看沿線各站到站時間"
              >
                <div className="card-top">
                  <span className="train-order">第 {idx + 1} 班車</span>
                  <div className="badge-dst-group">
                    <span className="train-dst">往 {train.dst}</span>
                    {train.isShuttle && <span className="shuttle-tag">區間車</span>}
                    {idx === 0 && matchedLiveItem ? (
                      activeEngine === 'worker' ? (
                        <span className="shuttle-tag" style={{ background: '#2563eb', color: '#fff', fontWeight: 700 }}>
                          ⚡ Worker 即時
                        </span>
                      ) : (
                        <span className="shuttle-tag" style={{ background: '#dc2626', color: '#fff', fontWeight: 700 }}>
                          🔴 訪客直連即時
                        </span>
                      )
                    ) : station.line === 'BR' ? (
                      <span className="shuttle-tag" style={{ background: '#c48c31', color: '#fff' }}>
                        班距推估
                      </span>
                    ) : (
                      <span className="shuttle-tag" style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)', border: '1px solid var(--border-main)' }}>
                        📅 時刻表排定
                      </span>
                    )}
                  </div>
                </div>

                {idx === 0 && matchedLiveItem ? (
                  <div className="card-countdown">
                    <span className="countdown-number" style={{ color: activeEngine === 'worker' ? '#3b82f6' : '#ef4444' }}>
                      {matchedLiveItem.EstimateTime <= 30 ? '進站中' : Math.ceil(matchedLiveItem.EstimateTime / 60)}
                    </span>
                    <span className="countdown-unit" style={{ color: activeEngine === 'worker' ? '#3b82f6' : '#ef4444' }}>
                      {matchedLiveItem.EstimateTime <= 30
                        ? '列車靠站'
                        : activeEngine === 'worker'
                        ? '分後抵達 (Worker 實測)'
                        : '分後抵達 (訪客直連實測)'}
                    </span>
                  </div>
                ) : (
                  <div className="card-countdown">
                    <span className="countdown-number">{train.minutesAway}</span>
                    <span className="countdown-unit">
                      {station.line === 'BR' ? '分後 (班距推估)' : '分後發車 (時刻表推算)'}
                    </span>
                  </div>
                )}

                <div className="card-footer">
                  <div className="dep-time-box">
                    <Clock size={14} color={idx === 0 && matchedLiveItem ? (activeEngine === 'worker' ? '#3b82f6' : '#ef4444') : undefined} />
                    {idx === 0 && matchedLiveItem ? (
                      <span>
                        即時到站預估：
                        <strong style={{ color: activeEngine === 'worker' ? '#3b82f6' : '#ef4444' }}>
                          {formatTimeHM(new Date(currentTime.getTime() + matchedLiveItem.EstimateTime * 1000))}
                        </strong>{' '}
                        ({activeEngine === 'worker' ? '⚡ Worker 連線' : '🔴 訪客直連'})
                      </span>
                    ) : (
                      <span>
                        表定出發時間：<strong>{train.time}</strong> (時刻表時間)
                      </span>
                    )}
                  </div>
                  <div className="card-click-hint">
                    <span>沿線站點</span>
                    <ChevronRight size={14} />
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="no-trains-card">
              <AlertCircle size={24} color="#f59e0b" />
              <span>今日目前方向已無後續班次 (已過末班車)</span>
            </div>
          )}
        </div>
      </div>

      {/* Underline Notice Banner */}
      {shuttleNote && (
        <div className="shuttle-banner">
          <Info size={18} color="var(--shuttle-color)" />
          <span>註：{shuttleNote}</span>
        </div>
      )}

      {/* Full Day 24H Timetable Section */}
      <div className="matrix-section">
        <div className="matrix-header">
          <div className="matrix-title-group">
            <Clock size={18} color="var(--text-main)" />
            <h2>全日出發時刻表</h2>
          </div>

          <div className="header-right-controls" style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
            {/* Filter Pills */}
            <div className="matrix-filters">
              <button
                className={`filter-pill ${filterMode === 'all' ? 'active' : ''}`}
                onClick={() => setFilterMode('all')}
              >
                全部班次
              </button>
              <button
                className={`filter-pill ${filterMode === 'shuttle' ? 'active' : ''}`}
                onClick={() => setFilterMode('shuttle')}
              >
                僅看區間車 (加底線)
              </button>
            </div>

            {/* Layout Toggle: Grid vs Tokyo Metro List */}
            <div className="view-toggle-group">
              <button
                className={`view-btn ${layoutMode === 'grid' ? 'active' : ''}`}
                onClick={() => setLayoutMode('grid')}
                title="方格檢視"
              >
                <LayoutGrid size={15} />
                <span className="hide-mobile">方格檢視</span>
              </button>
              <button
                className={`view-btn ${layoutMode === 'list' ? 'active' : ''}`}
                onClick={() => setLayoutMode('list')}
                title="車次清單 (仿東京地鐵)"
              >
                <List size={15} />
                <span className="hide-mobile">車次清單</span>
              </button>
            </div>
          </div>
        </div>

        {layoutMode === 'grid' ? (
          /* Grid View */
          <div className="matrix-grid">
            {groupedDepartures.map(({ hour, departures: deps }) => {
              const isCurrentHour = hour === currentHourStr;
              const filteredDeps = deps.filter((d) => {
                if (filterMode === 'shuttle') return d.IsShuttle;
                if (filterMode === 'terminal') return !d.IsShuttle;
                return true;
              });

              if (filteredDeps.length === 0 && filterMode !== 'all') {
                return null;
              }

              return (
                <div
                  key={hour}
                  className={`matrix-row ${isCurrentHour ? 'row-current-hour' : ''}`}
                >
                  <div className="hour-col">
                    <span className="hour-num">{hour}</span>
                    <span className="hour-unit">時</span>
                  </div>
                  <div className="minutes-col">
                    {filteredDeps.length > 0 ? (
                      filteredDeps.map((dep, dIdx) => {
                        const minuteStr = dep.Time.split(':')[1];
                        return (
                          <div
                            key={dIdx}
                            className={`minute-chip ${dep.IsShuttle ? 'chip-shuttle' : ''}`}
                            onClick={() => onSelectTrain(dep.Time, dep.Dst)}
                            style={{ cursor: 'pointer' }}
                            title={`點擊查看沿線到站時間：${dep.Time} 往 ${dep.Dst}${dep.IsShuttle ? ' (區間車)' : ''}`}
                          >
                            <span className={`minute-text ${dep.IsShuttle ? 'underlined' : ''}`}>
                              {minuteStr}
                            </span>
                            {dep.IsShuttle && (
                              <span className="chip-dst-dot" title={dep.Dst}></span>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <span className="empty-hour">無班次</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Tokyo Metro Style List View */
          <div className="departures-list-container">
            {currentDepartures
              .filter((d) => {
                if (filterMode === 'shuttle') return d.IsShuttle;
                if (filterMode === 'terminal') return !d.IsShuttle;
                return true;
              })
              .map((dep, idx) => (
                <div
                  key={idx}
                  className="departure-list-row"
                  onClick={() => onSelectTrain(dep.Time, dep.Dst)}
                >
                  <div className="list-row-left">
                    <span className="list-dep-time">{dep.Time}</span>
                    <div className="list-train-info">
                      <span className="list-type-text">
                        {dep.IsShuttle ? '區間車' : '普通列車'}
                      </span>
                      <span className="list-dst-text">
                        往 {dep.Dst} 方向
                        {dep.IsShuttle && <span className="shuttle-tag">區間車</span>}
                      </span>
                    </div>
                  </div>
                  <div className="list-row-right">
                    <span>沿線各站時刻</span>
                    <ChevronRight size={18} />
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};
