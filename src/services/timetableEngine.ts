import { DayType, Departure, NextTrainInfo, ScheduleGroup, LINE_SHUTTLE_TERMINALS, isShuttleForLine } from '../types/metro';

export function getCurrentDayType(d: Date = new Date()): DayType {
  const day = d.getDay();
  if (day === 0) return 'sunday';
  if (day === 6) return 'saturday';
  return 'weekday';
}

export function formatTimeHM(d: Date = new Date()): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function convertTimeToMinutes(timeStr: string): number {
  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  // 跨夜 (00:xx, 01:xx 視為 24:xx, 25:xx)
  if (h < 4) {
    h += 24;
  }
  return h * 60 + m;
}

export function getScheduleForDay(schedules: ScheduleGroup[], dayType: DayType): Departure[] {
  if (!schedules || schedules.length === 0) return [];

  // 配對優先順序
  let targetPattern = '1,2,3,4,5';
  if (dayType === 'saturday') targetPattern = '6';
  else if (dayType === 'sunday') targetPattern = '7';

  // 1. 精準比對
  let match = schedules.find((s) => s.Days === targetPattern);
  if (match) return match.Departures;

  // 2. 假日合併比對 (如 "6,7")
  if (dayType === 'saturday' || dayType === 'sunday') {
    match = schedules.find((s) => s.Days.includes('6') || s.Days.includes('7'));
    if (match) return match.Departures;
  }

  // 3. Fallback 回第一組
  return schedules[0].Departures;
}

export function calculateNextTrains(
  departures: Departure[],
  currentDate: Date = new Date(),
  limit: number = 3
): NextTrainInfo[] {
  if (!departures || departures.length === 0) return [];

  const currentMinutes = convertTimeToMinutes(formatTimeHM(currentDate));
  const currentSecondsInDay = currentMinutes * 60 + currentDate.getSeconds();

  const results: NextTrainInfo[] = [];

  for (const dep of departures) {
    const depMinutes = convertTimeToMinutes(dep.Time);
    const depSeconds = depMinutes * 60;

    if (depSeconds >= currentSecondsInDay) {
      const diffSeconds = depSeconds - currentSecondsInDay;
      const minutesAway = Math.floor(diffSeconds / 60);

      let statusText = `${minutesAway} 分鐘`;
      if (minutesAway === 0) {
        statusText = '即將進站';
      } else if (minutesAway === 1) {
        statusText = '約 1 分鐘';
      }

      results.push({
        time: dep.Time,
        dst: dep.Dst,
        isShuttle: !!dep.IsShuttle || isShuttleDestination(dep.Dst),
        minutesAway,
        secondsAway: diffSeconds,
        statusText,
        isLive: false,
      });

      if (results.length >= limit) break;
    }
  }

  return results;
}

export function isShuttleDestination(dst: string, lineCode?: string): boolean {
  if (lineCode) {
    return isShuttleForLine(lineCode, dst);
  }
  return Object.values(LINE_SHUTTLE_TERMINALS).some((list) => list.includes(dst));
}

export interface HourGroup {
  hour: string;
  departures: Departure[];
}

export function groupDeparturesByHour(departures: Departure[]): HourGroup[] {
  if (!departures || departures.length === 0) return [];

  // 營運小時順序：從早晨 05/06 點到深夜 23 點、跨日 00/01 點
  const operationalHours = [
    '05', '06', '07', '08', '09', '10', '11', '12', '13', '14',
    '15', '16', '17', '18', '19', '20', '21', '22', '23', '00', '01'
  ];

  const bucketMap: Record<string, Departure[]> = {};
  for (const dep of departures) {
    const hour = dep.Time.split(':')[0];
    if (!bucketMap[hour]) bucketMap[hour] = [];
    bucketMap[hour].push({
      ...dep,
      IsShuttle: dep.IsShuttle || isShuttleDestination(dep.Dst),
    });
  }

  // 找出首班車與末班車的小時，直接從首班車所在時段開始顯示
  const activeHours = operationalHours.filter((h) => bucketMap[h] && bucketMap[h].length > 0);
  if (activeHours.length === 0) return [];

  const startIdx = operationalHours.indexOf(activeHours[0]);
  const endIdx = operationalHours.indexOf(activeHours[activeHours.length - 1]);

  const result: HourGroup[] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    const h = operationalHours[i];
    result.push({
      hour: h,
      departures: bucketMap[h] || [],
    });
  }

  return result;
}

export function getLineColor(lineCode: string): string {
  switch (lineCode?.toUpperCase()) {
    case 'BL': return '#0070BD';
    case 'G': return '#008659';
    case 'R': return '#E3002C';
    case 'O': return '#F5A81C';
    case 'BR': return '#C48C31';
    case 'Y': return '#E5C200';
    default: return '#6B7280';
  }
}

export function getLineTextColor(lineCode: string): string {
  switch (lineCode?.toUpperCase()) {
    case 'O':
    case 'Y': return '#000000';
    default: return '#FFFFFF';
  }
}
