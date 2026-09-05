export interface Departure {
  Time: string;       // "06:03"
  Dst: string;        // "新店" or "台電大樓"
  IsShuttle?: boolean;
}

export interface ScheduleGroup {
  Days: string;       // "1,2,3,4,5" | "6" | "7"
  Departures: Departure[];
}

export interface TimetableDirection {
  Direction: string;       // "往G01新店站"
  DirectionCode?: number;  // 0 or 1
  DestinationNotice?: string;
  EffectiveFrom?: string;
  Schedule: ScheduleGroup[];
}

export interface StationDetail {
  StationCode: string;
  StationName: string;
  LineID?: string;
  Timetables: TimetableDirection[];
}

export interface StationSummary {
  code: string;
  name: string;
  line: string;
  directions?: { dirText: string; dirCode: number }[];
}

export interface LineMeta {
  code: string;
  name: string;
  nameEn: string;
  color: string;
  textColor: string;
  terminal0: string;
  terminal1: string;
  stations: { code: string; name: string }[];
}

export interface NetworkMeta {
  lines: LineMeta[];
  stations: Record<string, StationSummary>;
  totalStations: number;
  updatedAt: string;
}

export interface NextTrainInfo {
  time: string;
  dst: string;
  isShuttle: boolean;
  minutesAway: number;
  secondsAway: number;
  statusText: string;
  isLive: boolean;
}

export const LINE_SHUTTLE_TERMINALS: Record<string, string[]> = {
  G: ['台電大樓'],
  R: ['北投', '大安'],
  BL: ['亞東醫院', '昆陽'],
  O: ['蘆洲'],
  Y: [],
  BR: [],
};

export function isShuttleForLine(lineCode: string, dst: string): boolean {
  const list = LINE_SHUTTLE_TERMINALS[lineCode?.toUpperCase()] || [];
  return list.includes(dst);
}

export type DayType = 'weekday' | 'saturday' | 'sunday';
