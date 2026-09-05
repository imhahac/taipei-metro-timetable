import React from 'react';
import { Star } from 'lucide-react';
import { NetworkMeta, StationSummary } from '../types/metro';
import { getLineColor, getLineTextColor } from '../services/timetableEngine';

interface QuickBarProps {
  networkMeta: NetworkMeta | null;
  selectedStation: StationSummary | null;
  onSelectStation: (st: StationSummary) => void;
  favorites: string[];
  activeLineFilter: string | null;
  onSelectLineFilter: (lineCode: string | null) => void;
}

export const QuickBar: React.FC<QuickBarProps> = ({
  networkMeta,
  selectedStation,
  onSelectStation,
  favorites,
  activeLineFilter,
  onSelectLineFilter,
}) => {
  if (!networkMeta) return null;

  const favoriteStations = favorites
    .map((code) => networkMeta.stations[code])
    .filter(Boolean);

  const activeLineStations = activeLineFilter
    ? networkMeta.lines.find((l) => l.code === activeLineFilter)?.stations || []
    : [];

  return (
    <div className="quickbar-container">
      {/* Pinned Favorites Bar */}
      {favoriteStations.length > 0 && (
        <div className="favorites-scroll-row">
          <div className="fav-label">
            <Star size={14} fill="#fbbf24" color="#fbbf24" />
            <span>常用車站</span>
          </div>
          <div className="fav-list">
            {favoriteStations.map((st) => (
              <button
                key={st.code}
                className={`fav-chip ${selectedStation?.code === st.code ? 'active' : ''}`}
                onClick={() => onSelectStation(st)}
              >
                <span
                  className="badge-line badge-mini"
                  style={{
                    backgroundColor: getLineColor(st.line),
                    color: getLineTextColor(st.line),
                  }}
                >
                  {st.code}
                </span>
                <span className="fav-name">{st.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Metro Lines Filter Pills */}
      <div className="lines-filter-row">
        {networkMeta.lines.map((line) => {
          const isActive = activeLineFilter === line.code;
          return (
            <button
              key={line.code}
              className={`line-pill ${isActive ? 'active' : ''}`}
              style={{
                borderColor: line.color,
                backgroundColor: isActive ? line.color : 'var(--bg-surface)',
                color: isActive ? line.textColor : 'var(--text-main)',
              }}
              onClick={() => onSelectLineFilter(isActive ? null : line.code)}
            >
              <span
                className="line-pill-code"
                style={{ color: isActive ? line.textColor : line.color }}
              >
                {line.code}
              </span>
              <span className="line-pill-name">{line.name}</span>
            </button>
          );
        })}
      </div>

      {/* Expanded Line Stations Carousel */}
      {activeLineFilter && activeLineStations.length > 0 && (
        <div className="line-stations-carousel">
          <div className="carousel-inner">
            {activeLineStations.map((item) => {
              const isSelected = selectedStation?.code === item.code;
              return (
                <button
                  key={item.code}
                  className={`station-carousel-btn ${isSelected ? 'active' : ''}`}
                  onClick={() => {
                    const st = networkMeta.stations[item.code];
                    if (st) onSelectStation(st);
                  }}
                >
                  <span
                    className="badge-line badge-mini"
                    style={{
                      backgroundColor: getLineColor(activeLineFilter),
                      color: getLineTextColor(activeLineFilter),
                    }}
                  >
                    {item.code}
                  </span>
                  <span className="st-name">{item.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
