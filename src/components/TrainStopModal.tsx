import React, { useEffect } from 'react';
import { X, Clock, Train } from 'lucide-react';
import { TrainRouteDetail } from '../services/trainRouteService';
import { getLineColor, getLineTextColor } from '../services/timetableEngine';

interface TrainStopModalProps {
  trainDetail: TrainRouteDetail | null;
  onClose: () => void;
}

export const TrainStopModal: React.FC<TrainStopModalProps> = ({ trainDetail, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!trainDetail) return null;

  const lineColor = getLineColor(trainDetail.lineCode);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="train-stop-modal" onClick={(e) => e.stopPropagation()}>
        {/* Top Header */}
        <div className="train-stop-header">
          <div className="train-meta-group">
            <div className="train-type-badge">
              <Train size={16} />
              <span>{trainDetail.isShuttle ? '區間車' : '普通列車'}</span>
            </div>
            <h2 className="train-destination-title">
              往 {trainDetail.trainDst} 方向
            </h2>
            <span className="train-current-origin">
              （{trainDetail.currentStationName} {trainDetail.currentDepTime} 發車）
            </span>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="關閉視窗">
            <X size={20} />
          </button>
        </div>

        {/* Subheader Column Legend */}
        <div className="train-stop-legend">
          <span>停靠車站 (Station)</span>
          <span>到站時間 (Arrival Time)</span>
        </div>

        {/* Vertical Timeline List (Tokyo Metro Style) */}
        <div className="train-timeline-body">
          <div className="timeline-container">
            {/* Vertical Colored Track Bar */}
            <div
              className="timeline-track-bar"
              style={{ backgroundColor: lineColor }}
            />

            {trainDetail.stops.map((stop, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === trainDetail.stops.length - 1;

              return (
                <div
                  key={stop.stationCode}
                  className={`timeline-stop-row ${stop.isCurrent ? 'stop-current' : ''} ${
                    stop.isPassed ? 'stop-passed' : ''
                  }`}
                >
                  {/* Left Station Node & Badge */}
                  <div className="stop-node-cell">
                    <div
                      className="stop-circle"
                      style={{
                        borderColor: lineColor,
                        backgroundColor: stop.isCurrent ? lineColor : 'var(--bg-surface)',
                        color: stop.isCurrent ? getLineTextColor(trainDetail.lineCode) : lineColor,
                      }}
                    >
                      <span className="stop-circle-code">{stop.stationCode}</span>
                    </div>

                    <div className="stop-name-group">
                      <div className="stop-name-row">
                        <span className="stop-name">{stop.stationName}</span>
                        {stop.isCurrent && (
                          <span className="current-badge">目前車站</span>
                        )}
                        {isFirst && <span className="terminal-badge">始發站</span>}
                        {isLast && <span className="terminal-badge">終點站</span>}
                      </div>

                      {/* Transfer Badges */}
                      {stop.transfers.length > 0 && (
                        <div className="stop-transfers">
                          {stop.transfers.map((t) => (
                            <span
                              key={t}
                              className="badge-line badge-mini"
                              style={{
                                backgroundColor: getLineColor(t),
                                color: getLineTextColor(t),
                              }}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Scheduled Arrival Time */}
                  <div className="stop-time-cell">
                    <span className="stop-time">{stop.time}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer Note */}
        <div className="train-stop-footer">
          <div className="footer-notice">
            <Clock size={14} />
            <span>實際運行時間可能依現場營運調度稍有微調，請提前至月台候車。</span>
          </div>
        </div>
      </div>
    </div>
  );
};
