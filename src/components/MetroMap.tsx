import React, { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Crosshair } from 'lucide-react';
import { StationSummary, NetworkMeta } from '../types/metro';

interface MetroMapProps {
  networkMeta: NetworkMeta | null;
  selectedStation: StationSummary | null;
  onSelectStation: (st: StationSummary) => void;
}

export const MetroMap: React.FC<MetroMapProps> = ({
  networkMeta,
  selectedStation,
  onSelectStation,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number>(1);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [svgContent, setSvgContent] = useState<string>('');

  // 載入 SVG
  useEffect(() => {
    fetch('./metro.svg')
      .then((res) => res.text())
      .then((svg) => {
        setSvgContent(svg);
      })
      .catch((err) => console.error('Failed to load metro.svg', err));
  }, []);

  // 綁定 SVG 內部站名點擊事件
  useEffect(() => {
    if (!containerRef.current || !svgContent || !networkMeta) return;

    const svgElement = containerRef.current.querySelector('svg');
    if (!svgElement) return;

    svgElement.setAttribute('width', '100%');
    svgElement.setAttribute('height', '100%');
    svgElement.style.overflow = 'visible';

    // 尋找文字與站點元素
    const targetElements = svgElement.querySelectorAll('text, tspan, [data-station]');
    targetElements.forEach((el) => {
      const stationAttr = el.getAttribute('data-station');
      const rawText = stationAttr || el.textContent?.trim() || '';
      const cleanText = rawText.replace('站', '');

      // 比對 station
      const matched = Object.values(networkMeta.stations).find(
        (st) =>
          st.name === rawText ||
          st.name.replace('站', '') === cleanText ||
          st.name.replace('/', '') === cleanText.replace('/', '')
      );

      if (matched) {
        (el as HTMLElement).style.cursor = 'pointer';
        (el as HTMLElement).style.transition = 'all 0.2s';

        el.addEventListener('mouseenter', () => {
          if (el.tagName.toLowerCase() === 'circle') {
            (el as HTMLElement).style.filter = 'drop-shadow(0 0 6px #10b981)';
            (el as HTMLElement).style.stroke = '#10b981';
            (el as HTMLElement).style.strokeWidth = '3';
          } else {
            (el as HTMLElement).style.fill = '#10b981';
            (el as HTMLElement).style.fontWeight = '900';
          }
        });
        el.addEventListener('mouseleave', () => {
          if (el.tagName.toLowerCase() === 'circle') {
            (el as HTMLElement).style.filter = '';
            (el as HTMLElement).style.stroke = '#505050';
            (el as HTMLElement).style.strokeWidth = '2';
          } else {
            (el as HTMLElement).style.fill = '';
            (el as HTMLElement).style.fontWeight = '';
          }
        });
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectStation(matched);
        });
      }
    });
  }, [svgContent, networkMeta, onSelectStation]);

  // 滑鼠拖曳平移
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 滾輪縮放
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.15;
    if (e.deltaY < 0) {
      setScale((prev) => Math.min(prev * zoomFactor, 4.0));
    } else {
      setScale((prev) => Math.max(prev / zoomFactor, 0.4));
    }
  };

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  return (
    <div className="metro-map-wrapper">
      {/* Map Control Toolbar */}
      <div className="map-toolbar">
        <button className="map-tool-btn" onClick={() => setScale((s) => Math.min(s * 1.25, 4.0))} title="放大">
          <ZoomIn size={18} />
        </button>
        <button className="map-tool-btn" onClick={() => setScale((s) => Math.max(s / 1.25, 0.4))} title="縮小">
          <ZoomOut size={18} />
        </button>
        <button className="map-tool-btn" onClick={handleReset} title="重設視圖">
          <RotateCcw size={18} />
        </button>
      </div>

      {/* Floating Info Pill */}
      {selectedStation && (
        <div className="map-selected-pill">
          <Crosshair size={16} color="var(--live-color)" />
          <span>目前選中：<strong>{selectedStation.name}</strong> ({selectedStation.code})</span>
        </div>
      )}

      {/* Map Viewport */}
      <div
        className="metro-map-canvas"
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
      >
        <div
          className="map-transform-layer"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: '50% 50%',
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
          }}
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      </div>
    </div>
  );
};
