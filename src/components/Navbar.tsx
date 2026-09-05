import React, { useState, useRef, useEffect } from 'react';
import { Search, Map, Calendar, Settings, Train, Clock, Sun, Moon } from 'lucide-react';
import { DayType, StationSummary, NetworkMeta } from '../types/metro';
import { getLineColor, getLineTextColor } from '../services/timetableEngine';

interface NavbarProps {
  networkMeta: NetworkMeta | null;
  onSelectStation: (st: StationSummary) => void;
  dayType: DayType;
  onChangeDayType: (d: DayType) => void;
  viewMode: 'board' | 'map';
  onChangeViewMode: (m: 'board' | 'map') => void;
  onOpenSettings: () => void;
  currentTimeStr: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  networkMeta,
  onSelectStation,
  dayType,
  onChangeDayType,
  viewMode,
  onChangeViewMode,
  onOpenSettings,
  currentTimeStr,
  theme,
  onToggleTheme,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpenSearch, setIsOpenSearch] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // 關閉點擊外部
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsOpenSearch(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchResults = React.useMemo(() => {
    if (!networkMeta || !searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();
    return Object.values(networkMeta.stations)
      .filter((st) => st.name.toLowerCase().includes(q) || st.code.toLowerCase().includes(q))
      .slice(0, 8);
  }, [networkMeta, searchQuery]);

  return (
    <header className="navbar-container">
      <div className="navbar-inner">
        {/* Brand */}
        <div className="brand-group" onClick={() => onChangeViewMode('board')}>
          <div className="brand-logo">
            <Train size={22} color="#ffffff" />
          </div>
          <div className="brand-text">
            <span className="brand-title">台北捷運時刻表</span>
            <span className="brand-sub">TAIPEI METRO TIMETABLE</span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="search-wrapper" ref={searchRef}>
          <div className="search-input-box">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="搜尋站名或編號 (如 G18、南京三民)..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsOpenSearch(true);
              }}
              onFocus={() => setIsOpenSearch(true)}
            />
          </div>

          {isOpenSearch && searchResults.length > 0 && (
            <div className="search-dropdown">
              {searchResults.map((st) => (
                <div
                  key={st.code}
                  className="search-item"
                  onClick={() => {
                    onSelectStation(st);
                    setIsOpenSearch(false);
                    setSearchQuery('');
                  }}
                >
                  <span
                    className="badge-line"
                    style={{
                      backgroundColor: getLineColor(st.line),
                      color: getLineTextColor(st.line),
                    }}
                  >
                    {st.code}
                  </span>
                  <span className="search-item-name">{st.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Action Controls */}
        <div className="nav-actions">
          {/* Real-time Clock */}
          <div className="live-clock">
            <Clock size={15} color="var(--live-color)" />
            <span>{currentTimeStr}</span>
          </div>

          {/* Day Type Selector */}
          <div className="day-selector-group">
            <button
              className={`day-btn ${dayType === 'weekday' ? 'active' : ''}`}
              onClick={() => onChangeDayType('weekday')}
            >
              平日
            </button>
            <button
              className={`day-btn ${dayType === 'saturday' ? 'active' : ''}`}
              onClick={() => onChangeDayType('saturday')}
            >
              週六
            </button>
            <button
              className={`day-btn ${dayType === 'sunday' ? 'active' : ''}`}
              onClick={() => onChangeDayType('sunday')}
            >
              週日/假日
            </button>
          </div>

          {/* View Mode Toggle */}
          <div className="view-toggle-group">
            <button
              className={`view-btn ${viewMode === 'board' ? 'active' : ''}`}
              onClick={() => onChangeViewMode('board')}
              title="時刻看板"
            >
              <Calendar size={18} />
              <span className="hide-mobile">時刻看板</span>
            </button>
            <button
              className={`view-btn ${viewMode === 'map' ? 'active' : ''}`}
              onClick={() => onChangeViewMode('map')}
              title="互動路網圖"
            >
              <Map size={18} />
              <span className="hide-mobile">路網圖</span>
            </button>
          </div>

          {/* Theme Toggle Button */}
          <button
            className="theme-toggle-btn"
            onClick={onToggleTheme}
            title={theme === 'light' ? '切換為深色高對比中控台' : '切換為淺色鐵道印刷表格'}
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>

          {/* Settings Button */}
          <button className="settings-icon-btn" onClick={onOpenSettings} title="時間模擬與系統設定">
            <Settings size={18} />
          </button>
        </div>
      </div>
    </header>
  );
};
