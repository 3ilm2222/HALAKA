export type BoardPoint = { x: number; y: number };

export type BoardElement = {
  id: string;
  type: "path" | "text" | "square" | "frame" | "image" | "ayahRow" | "surahTitle" | "fullSurah" | "reviewRow" | "attendanceRow" | "weekRow";
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  text?: string;
  fontSize?: number;
  fontWeight?: "400" | "700" | "900";
  completed?: boolean;
  fromAyah?: string;
  toAyah?: string;
  surahName?: string;
  reviewNote?: string;
  completedDateKey?: string;
  dateKey?: string;
  morningAbsent?: boolean;
  eveningAbsent?: boolean;
  weekNumber?: 1 | 2 | 3 | 4;
  uri?: string;
  points?: BoardPoint[];
};

export type AttendanceRecord = { dateKey: string; morningAbsent: boolean; eveningAbsent: boolean };

export type StudentSummary = {
  id: number;
  name: string;
  age: number;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  morningAbsent?: boolean;
  eveningAbsent?: boolean;
};

export type MonthlyBoard = {
  id: number;
  studentId: number;
  monthKey: string;
  label: string;
  canvasHeight: number;
  themeKey: string;
  themeColors: { canvas: string; accent: string; ink: string; gold: string } | null;
  elements: BoardElement[];
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export type StudentMessage = {
  id: number;
  studentId: number;
  senderRole: "teacher" | "parent";
  content: string;
  isNote: boolean;
  createdAt: Date | string;
};
