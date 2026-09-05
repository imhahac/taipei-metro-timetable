import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { QuickBar } from './components/QuickBar';
import { StationBoard } from './components/StationBoard';
import { MetroMap } from './components/MetroMap';
import { SettingsModal } from './components/SettingsModal';
import { TrainStopModal } from './components/TrainStopModal';
import { DayType, NetworkMeta, StationDetail, StationSummary } from './types/metro';
import { getCurrentDayType, formatTimeHM } from './services/timetableEngine';
import { getTrainRouteDetail, TrainRouteDetail } from './services/trainRouteService';

export const App: React.FC = () => {
  const [networkMeta, setNetworkMeta] = useState<NetworkMeta | null>(null);
  const [selectedStation, setSelectedStation] = useState<StationSummary | null>(null);
  const [stationDetail, setStationDetail] = useState<StationDetail | null>(null);
  const [selectedTrainDetail, setSelectedTrainDetail] = useState<TrainRouteDetail | null>(null);
  const [dayType, setDayType] = useState<DayType>(getCurrentDayType());
  const [viewMode, setViewMode] = useState<'board' | 'map'>('board');
  const [activeLineFilter, setActiveLineFilter] = useState<string | null>('G');
  const [isOpenSettings, setIsOpenSettings] = useState<boolean>(false);
  const [simulatedTime, setSimulatedTime] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('metro_theme') as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('metro_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Favorites
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('metro_fav_stations');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return ['G18', 'G19', 'G17', 'BL12', 'R10', 'BR09'];
  });

  // Ticking Clock
  useEffect(() => {
    const timer = setInterval(() => {
      if (simulatedTime) {
        const [h, m] = simulatedTime.split(':').map(Number);
        const simDate = new Date();
        simDate.setHours(h, m, 0, 0);
        setCurrentTime(simDate);
      } else {
        setCurrentTime(new Date());
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [simulatedTime]);

  // Load Network Metadata & Initialize Selected Station
  useEffect(() => {
    fetch('./data/network_meta.json')
      .then((res) => res.json())
      .then((meta: NetworkMeta) => {
        setNetworkMeta(meta);

        // 優先讀取 URL query param (如 ?st=G01) 或 localStorage 紀錄，避免重新整理跳回南京三民
        let targetCode = '';
        try {
          const urlParams = new URLSearchParams(window.location.search);
          const stParam = urlParams.get('st') || urlParams.get('station');
          if (stParam && meta.stations[stParam.toUpperCase()]) {
            targetCode = stParam.toUpperCase();
          } else {
            const saved = localStorage.getItem('metro_last_selected_station');
            if (saved && meta.stations[saved.toUpperCase()]) {
              targetCode = saved.toUpperCase();
            }
          }
        } catch (e) {
          // 靜默處理
        }

        const target = (targetCode && meta.stations[targetCode]) || meta.stations['G18'] || Object.values(meta.stations)[0];
        if (target) {
          setSelectedStation(target);
        }
      })
      .catch((err) => console.error('Failed to load network_meta.json', err));
  }, []);

  // 同步記住使用者最後瀏覽的車站 (localStorage + URL)，重新整理維持該站
  useEffect(() => {
    if (selectedStation) {
      try {
        localStorage.setItem('metro_last_selected_station', selectedStation.code);
        const url = new URL(window.location.href);
        if (url.searchParams.get('st') !== selectedStation.code) {
          url.searchParams.set('st', selectedStation.code);
          window.history.replaceState({}, '', url.toString());
        }
      } catch (e) {
        // 靜默處理
      }
    }
  }, [selectedStation]);

  // Load Station Timetable Detail
  useEffect(() => {
    if (!selectedStation) return;

    let ignore = false;
    setActiveLineFilter(selectedStation.line);

    fetch(`./data/stations/${selectedStation.code}.json`)
      .then((res) => res.json())
      .then((detail: StationDetail) => {
        if (!ignore) {
          setStationDetail(detail);
        }
      })
      .catch((err) => {
        if (!ignore) {
          console.error(`Failed to load ${selectedStation.code}.json`, err);
        }
      });

    return () => {
      ignore = true;
    };
  }, [selectedStation]);

  const toggleFavorite = (code: string) => {
    const updated = favorites.includes(code)
      ? favorites.filter((c) => c !== code)
      : [...favorites, code];
    setFavorites(updated);
    localStorage.setItem('metro_fav_stations', JSON.stringify(updated));
  };

  const handleSelectTrain = async (depTime: string, dst: string) => {
    if (!selectedStation) return;
    try {
      const detail = await getTrainRouteDetail(
        selectedStation.line,
        selectedStation.code,
        selectedStation.name,
        depTime,
        dst,
        dayType,
        networkMeta
      );
      setSelectedTrainDetail(detail);
    } catch (e) {
      console.error('Failed to get train route detail', e);
    }
  };

  const currentTimeStr = formatTimeHM(currentTime);

  return (
    <div className="app-container">
      <Navbar
        networkMeta={networkMeta}
        onSelectStation={(st) => {
          setSelectedStation(st);
          setViewMode('board');
        }}
        dayType={dayType}
        onChangeDayType={setDayType}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        onOpenSettings={() => setIsOpenSettings(true)}
        currentTimeStr={currentTimeStr}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main className="main-content">
        <QuickBar
          networkMeta={networkMeta}
          selectedStation={selectedStation}
          onSelectStation={(st) => {
            setSelectedStation(st);
            setViewMode('board');
          }}
          favorites={favorites}
          activeLineFilter={activeLineFilter}
          onSelectLineFilter={setActiveLineFilter}
        />

        {viewMode === 'board' ? (
          selectedStation && (
            <StationBoard
              station={selectedStation}
              stationDetail={stationDetail}
              dayType={dayType}
              isFavorite={favorites.includes(selectedStation.code)}
              onToggleFavorite={() => toggleFavorite(selectedStation.code)}
              currentTime={currentTime}
              onSelectTrain={handleSelectTrain}
            />
          )
        ) : (
          <MetroMap
            networkMeta={networkMeta}
            selectedStation={selectedStation}
            onSelectStation={(st) => {
              setSelectedStation(st);
              setViewMode('board');
            }}
          />
        )}
      </main>

      <SettingsModal
        isOpen={isOpenSettings}
        onClose={() => setIsOpenSettings(false)}
        simulatedTime={simulatedTime}
        onSetSimulatedTime={setSimulatedTime}
      />

      <TrainStopModal
        trainDetail={selectedTrainDetail}
        onClose={() => setSelectedTrainDetail(null)}
      />
    </div>
  );
};
export default App;
