import React, { useState, useMemo, useEffect } from 'react';
import { Clock, Info, Star, Train, AlertCircle, Sparkles, ChevronRight, LayoutGrid, List } from 'lucide-react';
import { DayType, StationDetail, StationSummary, TimetableDirection } from '../types/metro';
import {
  calculateNextTrains,
  formatTimeHM,
  getLineColor,
  getLineTextColor,
  getScheduleForDay,
  groupDeparturesByHour,
} from '../services/timetableEngine';
import { fetchLiveBoard, TDXLiveItem } from '../services/tdxService';

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

  useEffect(() => {
    let isMounted = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let currentDelay = 20000; // 基礎間隔 20 秒

    const scheduleNext = (delay: number) => {
      if (!isMounted) return;
      timerId = setTimeout(loadLive, delay);
    };

    const loadLive = async () => {
      try {
        const items = await fetchLiveBoard(station.code);
        if (!isMounted) return;
        if (items && items.length > 0) {
          setLiveArrivals(items);
          setIsLiveActive(true);
          currentDelay = 20000; // 成功時重設退避計時為 20 秒
          scheduleNext(currentDelay);
        } else {
          setLiveArrivals(null);
          setIsLiveActive(false);
          // 失敗或無資料時指數退避：20s -> 40s -> 80s -> 最大 300s (5分鐘)
          currentDelay = Math.min(currentDelay * 2, 300000);
          scheduleNext(currentDelay);
        }
      } catch (e) {
        if (!isMounted) return;
        setLiveArrivals(null);
        setIsLiveActive(false);
        currentDelay = Math.min(currentDelay * 2, 300000);
        scheduleNext(currentDelay);
      }
    };

    loadLive();

    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
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

        {/* Live Status Header Tag */}
        <div className="station-hero-right">
          {isLiveActive ? (
            <div className="status-pill live-connected" style={{ borderColor: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' }}>
              <span className="status-indicator" style={{ backgroundColor: '#ef4444' }}></span>
              <span className="status-pill-text" style={{ color: '#ef4444', fontWeight: 700 }}>
                🔴 TDX 實體即時動態
              </span>
            </div>
          ) : (
            <div className="status-pill">
              <span className="status-indicator"></span>
              <span className="status-pill-text">🟢 離線推算中 ({formatTimeHM(currentTime)}) · 基準 115.8.30 版</span>
            </div>
          )}
        </div>
      </div>

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
                    {idx === 0 && matchedLiveItem && (
                      <span className="shuttle-tag" style={{ background: '#ef4444', color: '#fff' }}>
                        即時動態
                      </span>
                    )}
                  </div>
                </div>

                {idx === 0 && matchedLiveItem ? (
                  <div className="card-countdown">
                    <span className="countdown-number" style={{ color: '#ef4444' }}>
                      {matchedLiveItem.EstimateTime <= 30 ? '進站中' : Math.ceil(matchedLiveItem.EstimateTime / 60)}
                    </span>
                    <span className="countdown-unit" style={{ color: '#ef4444' }}>
                      {matchedLiveItem.EstimateTime <= 30 ? '列車靠站' : '分後抵達 (實測)'}
                    </span>
                  </div>
                ) : (
                  <div className="card-countdown">
                    <span className="countdown-number">{train.minutesAway}</span>
                    <span className="countdown-unit">分後發車</span>
                  </div>
                )}

                <div className="card-footer">
                  <div className="dep-time-box">
                    <Clock size={14} />
                    <span>預計出發：<strong>{train.time}</strong></span>
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
