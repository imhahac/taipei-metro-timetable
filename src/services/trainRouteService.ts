import { DayType, NetworkMeta, isShuttleForLine } from '../types/metro';

export interface RouteStop {
  stationCode: string;
  stationName: string;
  time: string;
  isCurrent: boolean;
  isPassed: boolean;
  transfers: string[];
}

export interface TrainRouteDetail {
  lineCode: string;
  trainDst: string;
  isShuttle: boolean;
  currentStationCode: string;
  currentStationName: string;
  currentDepTime: string;
  stops: RouteStop[];
}

const linesCache: Record<string, any> = {};

export async function getTrainRouteDetail(
  lineCode: string,
  currentStationCode: string,
  currentStationName: string,
  depTime: string,
  dst: string,
  dayType: DayType,
  networkMeta: NetworkMeta | null
): Promise<TrainRouteDetail> {
  const isShuttle = isShuttleForLine(lineCode, dst);

  // 嘗試從 public/data/lines/{lineCode}.json 載入精確列車串接時刻表
  let lineData = linesCache[lineCode];
  if (!lineData) {
    try {
      const res = await fetch(`./data/lines/${lineCode}.json`);
      if (res.ok) {
        lineData = await res.json();
        linesCache[lineCode] = lineData;
      }
    } catch (e) {
      console.warn(`Could not load lines/${lineCode}.json`, e);
    }
  }

  // 1. 比對線路串接時刻表
  if (lineData && Array.isArray(lineData)) {
    const targetDay = dayType === 'weekday' ? '1,2,3,4,5' : dayType === 'saturday' ? '6' : '7';
    
    for (const dir of lineData) {
      for (const tt of dir.Timetables || []) {
        if (tt.Days === targetDay || (targetDay !== '1,2,3,4,5' && tt.Days.includes(targetDay))) {
          for (const train of tt.Trains || []) {
            if (train.Dst === dst) {
              const matchedStop = train.Schedule.find(
                (s: any) => s.StationCode === currentStationCode && s.DepTime === depTime
              );
              if (matchedStop) {
                // 找到了完全吻合的實體車次！
                return buildRouteDetailFromSchedule(
                  lineCode,
                  currentStationCode,
                  currentStationName,
                  depTime,
                  dst,
                  isShuttle,
                  train.Schedule,
                  networkMeta
                );
              }
            }
          }
        }
      }
    }
  }

  // 2. 若為其他線路或離線回退：依路線站點順序與平均站間時間動態推算整列車到站時刻
  return buildEstimatedRouteDetail(
    lineCode,
    currentStationCode,
    currentStationName,
    depTime,
    dst,
    isShuttle,
    networkMeta
  );
}

function buildRouteDetailFromSchedule(
  lineCode: string,
  currentStationCode: string,
  currentStationName: string,
  currentDepTime: string,
  dst: string,
  isShuttle: boolean,
  schedule: { StationCode: string; DepTime: string }[],
  networkMeta: NetworkMeta | null
): TrainRouteDetail {
  const stops: RouteStop[] = [];
  let foundCurrent = false;

  for (const item of schedule) {
    const isCurrent = item.StationCode === currentStationCode;
    if (isCurrent) foundCurrent = true;
    const isPassed = !foundCurrent;

    const stMeta = networkMeta?.stations[item.StationCode];
    const stationName = stMeta?.name || item.StationCode;

    // 尋找轉乘路線
    const transfers: string[] = [];
    if (networkMeta) {
      for (const line of networkMeta.lines) {
        if (line.code !== lineCode) {
          const hasSt = line.stations.some((s) => s.name === stationName);
          if (hasSt) transfers.push(line.code);
        }
      }
    }

    stops.push({
      stationCode: item.StationCode,
      stationName,
      time: item.DepTime,
      isCurrent,
      isPassed,
      transfers,
    });
  }

  return {
    lineCode,
    trainDst: dst,
    isShuttle,
    currentStationCode,
    currentStationName,
    currentDepTime,
    stops,
  };
}

function buildEstimatedRouteDetail(
  lineCode: string,
  currentStationCode: string,
  currentStationName: string,
  currentDepTime: string,
  dst: string,
  isShuttle: boolean,
  networkMeta: NetworkMeta | null
): TrainRouteDetail {
  const line = networkMeta?.lines.find((l) => l.code === lineCode);
  const allLineStations = line?.stations || [];
  
  // 判定行車方向
  const curIdx = allLineStations.findIndex((s) => s.code === currentStationCode);
  const dstIdx = allLineStations.findIndex((s) => s.name === dst || dst.includes(s.name));

  let orderedStations = [...allLineStations];
  if (dstIdx !== -1 && curIdx !== -1) {
    if (dstIdx < curIdx) {
      orderedStations.reverse();
    }
  }

  // 截斷至目的地
  const finalDstIdx = orderedStations.findIndex((s) => s.name === dst || dst.includes(s.name));
  if (finalDstIdx !== -1) {
    orderedStations = orderedStations.slice(0, finalDstIdx + 1);
  }

  const [hStr, mStr] = currentDepTime.split(':');
  let curMin = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
  const curOrderIdx = orderedStations.findIndex((s) => s.code === currentStationCode);

  const stops: RouteStop[] = [];
  for (let i = 0; i < orderedStations.length; i++) {
    const st = orderedStations[i];
    const isCurrent = st.code === currentStationCode;
    const isPassed = i < curOrderIdx;

    // 計算時間差 (每站約 2 分鐘)
    const diff = (i - curOrderIdx) * 2;
    const stopMin = (curMin + diff + 1440) % 1440;
    const sh = String(Math.floor(stopMin / 60)).padStart(2, '0');
    const sm = String(stopMin % 60).padStart(2, '0');

    const transfers: string[] = [];
    if (networkMeta) {
      for (const l of networkMeta.lines) {
        if (l.code !== lineCode && l.stations.some((s) => s.name === st.name)) {
          transfers.push(l.code);
        }
      }
    }

    stops.push({
      stationCode: st.code,
      stationName: st.name,
      time: `${sh}:${sm}`,
      isCurrent,
      isPassed,
      transfers,
    });
  }

  return {
    lineCode,
    trainDst: dst,
    isShuttle,
    currentStationCode,
    currentStationName,
    currentDepTime,
    stops,
  };
}
