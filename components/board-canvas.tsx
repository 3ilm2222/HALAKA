import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

import { type AttendanceRecord, type BoardElement, type BoardPoint } from "@/lib/app-types";
import { attendanceDateLabel, attendanceForMonth } from "@/lib/attendance";
import { BOARD_THEMES, getBoardTheme, normalizeCustomTheme, type BoardThemeKey, type CustomThemeColors } from "@/lib/board-themes";
import { QURAN_SURAHS } from "@/lib/quran-surahs";
import { AppIcon, colors } from "./app-ui";

const DEFAULT_COLOR = "#176B53";
const MIN_CANVAS_HEIGHT = 560;
const CANVAS_EXTENSION = 360;
const PALETTE = ["#176B53", "#0E7490", "#2563EB", "#7C3AED", "#BE185D", "#C2410C", "#C8902F", "#21332D"];
const CUSTOM_COLOR_PALETTE = ["#FFFFFF", "#FFFDF7", "#F5FAFF", "#FCF8FF", "#FFFCF4", "#176B53", "#1769AA", "#73429B", "#8A5A23", "#21332D", "#18354E", "#372348", "#4A341E", "#C8902F", "#D97706", "#BE185D"];
const STRUCTURED_ROW_TYPES = new Set<BoardElement["type"]>(["ayahRow", "surahTitle", "fullSurah", "reviewRow", "attendanceRow", "weekRow"]);

type ToolMode = "draw" | "hand" | "select";
type ElementBounds = { x: number; y: number; width: number; height: number };
type Interaction = { kind: "move" | "resize"; element: BoardElement; origin: BoardPoint; bounds: ElementBounds };
type InputField = "fromAyah" | "toAyah" | "reviewNote";
type InputTarget = { elementId: string; field: InputField };
type SurahTarget = { elementId: string; type: "surahTitle" | "reviewRow" | "ayahRow" };
type PendingTap = { kind: "complete" | "surah" | "input"; elementId: string; field?: InputField; type?: "surahTitle" | "reviewRow" | "ayahRow"; origin: BoardPoint; cancelled: boolean };

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayDateKey() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function completionDateLabel(dateKey: string) {
  return `يوم ${attendanceDateLabel(dateKey).replace(/[،,]/g, "")}`;
}

function makePath(points: BoardPoint[]) {
  if (points.length === 0) return "";
  return points.reduce((path, point, index) => `${path}${index === 0 ? "M" : " L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`, "");
}

function getBounds(element: BoardElement): ElementBounds {
  if (element.type === "path") {
    const points = element.points ?? [];
    if (!points.length) return { x: 0, y: 0, width: 1, height: 1 };
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: minX, y: minY, width: Math.max(1, Math.max(...xs) - minX), height: Math.max(1, Math.max(...ys) - minY) };
  }
  if (element.type === "text") {
    const fontSize = element.fontSize ?? 20;
    return { x: element.x ?? 30, y: element.y ?? 30, width: Math.max(65, (element.text?.length ?? 4) * fontSize * 0.62), height: fontSize * 1.5 };
  }
  if (element.type === "ayahRow") {
    return { x: element.x ?? 22, y: element.y ?? 62, width: element.width ?? 292, height: element.height ?? 70 };
  }
  if (element.type === "attendanceRow") {
    return { x: element.x ?? 12, y: element.y ?? 44, width: element.width ?? 312, height: element.height ?? 60 };
  }
  return { x: element.x ?? 0, y: element.y ?? 0, width: element.width ?? 100, height: element.height ?? 100 };
}

function getResponsiveReadOnlyBounds(element: BoardElement, canvasWidth: number): ElementBounds {
  const bounds = getBounds(element);
  if (!STRUCTURED_ROW_TYPES.has(element.type)) return bounds;
  const horizontalInset = element.type === "attendanceRow" ? 10 : 6;
  const width = Math.max(1, canvasWidth - horizontalInset * 2);
  return { ...bounds, x: Math.max(0, (canvasWidth - width) / 2), width };
}

function containsPoint(bounds: ElementBounds, point: BoardPoint) {
  const padding = 16;
  return point.x >= bounds.x - padding && point.x <= bounds.x + bounds.width + padding && point.y >= bounds.y - padding && point.y <= bounds.y + bounds.height + padding;
}

function translateElement(element: BoardElement, deltaX: number, deltaY: number): BoardElement {
  if (element.type === "path") return { ...element, points: (element.points ?? []).map((point) => ({ x: Math.max(0, point.x + deltaX), y: Math.max(0, point.y + deltaY) })) };
  return { ...element, x: Math.max(0, (element.x ?? 0) + deltaX), y: Math.max(0, (element.y ?? 0) + deltaY) };
}

function resizeElement(element: BoardElement, bounds: ElementBounds, deltaX: number, deltaY: number): BoardElement {
  if (element.type === "text") return { ...element, fontSize: Math.max(12, Math.min(56, (element.fontSize ?? 20) + deltaX * 0.16)) };
  const width = Math.max(42, bounds.width + deltaX);
  const height = Math.max(42, bounds.height + deltaY);
  if (element.type === "path") {
    const scaleX = width / Math.max(1, bounds.width);
    const scaleY = height / Math.max(1, bounds.height);
    return { ...element, points: (element.points ?? []).map((point) => ({ x: bounds.x + (point.x - bounds.x) * scaleX, y: bounds.y + (point.y - bounds.y) * scaleY })) };
  }
  return { ...element, width, height };
}

function maxElementBottom(elements: BoardElement[]) {
  return elements.reduce((bottom, element) => {
    const bounds = getBounds(element);
    return Math.max(bottom, bounds.y + bounds.height);
  }, 0);
}

function isAyahCheckboxTap(element: BoardElement, point: BoardPoint) {
  if (element.type !== "ayahRow" && element.type !== "reviewRow" && element.type !== "fullSurah") return false;
  const bounds = getBounds(element);
  return point.x >= bounds.x + 2 && point.x <= bounds.x + 48 && point.y >= bounds.y + 12 && point.y <= bounds.y + 58;
}

function getStructuredRowY(elements: BoardElement[]) {
  const bottom = elements.filter((element) => STRUCTURED_ROW_TYPES.has(element.type)).reduce((lastBottom, element) => {
    const bounds = getBounds(element);
    return Math.max(lastBottom, bounds.y + bounds.height);
  }, 44);
  return bottom + 18;
}

function getInteractiveField(element: BoardElement, point: BoardPoint): InputField | "surah" | null {
  const bounds = getBounds(element);
  if (point.y < bounds.y || point.y > bounds.y + bounds.height) return null;
  if (element.type === "ayahRow") {
    if (point.x >= bounds.x + bounds.width * 0.72) return "fromAyah";
    if (point.x >= bounds.x + bounds.width * 0.48 && point.x < bounds.x + bounds.width * 0.72) return "toAyah";
    if (point.x >= bounds.x + bounds.width * 0.12 && point.x < bounds.x + bounds.width * 0.48) return "surah";
  }
  if (element.type === "surahTitle") return "surah";
  if (element.type === "reviewRow") {
    if (point.x >= bounds.x + bounds.width * 0.48) return "reviewNote";
    if (point.x >= bounds.x + bounds.width * 0.15 && point.x < bounds.x + bounds.width * 0.48) return "surah";
  }
  return null;
}

export function BoardCanvas({
  boardKey,
  initialElements,
  initialCanvasHeight = MIN_CANVAS_HEIGHT,
  initialThemeKey = "classic",
  initialThemeColors = null,
  attendanceRecords = [],
  editable,
  onElementsChange,
  onCanvasHeightChange,
  onThemeChange,
  onThemeColorsChange,
  onUploadImage,
}: {
  boardKey: string;
  initialElements: BoardElement[];
  initialCanvasHeight?: number;
  initialThemeKey?: string;
  initialThemeColors?: CustomThemeColors | null;
  attendanceRecords?: AttendanceRecord[];
  editable: boolean;
  onElementsChange?: (elements: BoardElement[]) => void;
  onCanvasHeightChange?: (height: number) => void;
  onThemeChange?: (themeKey: string) => void;
  onThemeColorsChange?: (colors: CustomThemeColors | null) => void;
  onUploadImage?: (base64: string, mimeType: "image/jpeg" | "image/png" | "image/webp") => Promise<string | null>;
}) {
  const [elements, setElements] = useState<BoardElement[]>(initialElements);
  const [canvasHeight, setCanvasHeight] = useState(Math.max(MIN_CANVAS_HEIGHT, initialCanvasHeight));
  const [canvasWidth, setCanvasWidth] = useState(336);
  const [themeKey, setThemeKey] = useState<BoardThemeKey>((initialThemeKey in BOARD_THEMES ? initialThemeKey : "classic") as BoardThemeKey);
  const [customThemeColors, setCustomThemeColors] = useState<CustomThemeColors>(normalizeCustomTheme(initialThemeColors));
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [customThemeModalVisible, setCustomThemeModalVisible] = useState(false);
  const [draftPoints, setDraftPoints] = useState<BoardPoint[]>([]);
  const [toolMode, setToolMode] = useState<ToolMode>("hand");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeColor, setActiveColor] = useState(DEFAULT_COLOR);
  const [textModalVisible, setTextModalVisible] = useState(false);
  const [newText, setNewText] = useState("");
  const [newTextSize, setNewTextSize] = useState(22);
  const [newTextBold, setNewTextBold] = useState(true);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [inputTarget, setInputTarget] = useState<InputTarget | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [surahTarget, setSurahTarget] = useState<SurahTarget | null>(null);
  const [weekPickerVisible, setWeekPickerVisible] = useState(false);
  const latestElements = useRef(elements);
  const draftPointsRef = useRef<BoardPoint[]>([]);
  const previousBoardKey = useRef(boardKey);
  const interactionRef = useRef<Interaction | null>(null);
  const selectionCandidateRef = useRef<BoardElement | null>(null);
  const pendingTapRef = useRef<PendingTap | null>(null);

  useEffect(() => {
    if (previousBoardKey.current === boardKey) return;
    previousBoardKey.current = boardKey;
    setElements(initialElements);
    latestElements.current = initialElements;
    setCanvasHeight(Math.max(MIN_CANVAS_HEIGHT, initialCanvasHeight));
    setThemeKey((initialThemeKey in BOARD_THEMES ? initialThemeKey : "classic") as BoardThemeKey);
    setCustomThemeColors(normalizeCustomTheme(initialThemeColors));
    setToolMode("hand");
    setSelectedId(null);
  }, [boardKey, initialElements, initialCanvasHeight, initialThemeKey, initialThemeColors]);

  useEffect(() => {
    const normalizedHeight = Math.max(MIN_CANVAS_HEIGHT, initialCanvasHeight);
    setCanvasHeight((height) => height === normalizedHeight ? height : normalizedHeight);
  }, [boardKey, initialCanvasHeight]);

  const updateElements = useCallback((next: BoardElement[]) => {
    latestElements.current = next;
    setElements(next);
    onElementsChange?.(next);
  }, [onElementsChange]);

  const updateCanvasHeight = useCallback((next: number) => {
    const normalized = Math.max(MIN_CANVAS_HEIGHT, Math.min(5000, Math.ceil(next / 20) * 20));
    setCanvasHeight(normalized);
    onCanvasHeightChange?.(normalized);
  }, [onCanvasHeightChange]);

  const selectedElement = elements.find((element) => element.id === selectedId) ?? null;
  const selectedBounds = selectedElement ? getBounds(selectedElement) : null;
  const theme = getBoardTheme(themeKey, customThemeColors);
  const monthAttendance = useMemo(() => attendanceForMonth(attendanceRecords, boardKey), [attendanceRecords, boardKey]);
  const fallbackAttendanceTop = getStructuredRowY(elements);

  useEffect(() => {
    if (!editable) return;
    const current = latestElements.current;
    const attendanceByDate = new Map(monthAttendance.map((record) => [record.dateKey, record]));
    let changed = false;
    let next = current
      .filter((element) => {
        const keep = element.type !== "attendanceRow" || (element.dateKey ? attendanceByDate.has(element.dateKey) : false);
        if (!keep) changed = true;
        return keep;
      })
      .map((element) => {
        if (element.type !== "attendanceRow" || !element.dateKey) return element;
        const record = attendanceByDate.get(element.dateKey);
        if (!record || (element.morningAbsent === record.morningAbsent && element.eveningAbsent === record.eveningAbsent)) return element;
        changed = true;
        return { ...element, morningAbsent: record.morningAbsent, eveningAbsent: record.eveningAbsent };
      });
    for (const record of monthAttendance) {
      if (next.some((element) => element.type === "attendanceRow" && element.dateKey === record.dateKey)) continue;
      const width = Math.max(250, canvasWidth - 24);
      next = [...next, { id: createId(), type: "attendanceRow", dateKey: record.dateKey, morningAbsent: record.morningAbsent, eveningAbsent: record.eveningAbsent, x: 12, y: getStructuredRowY(next), width, height: 60 }];
      changed = true;
    }
    if (changed) updateElements(next);
  }, [canvasWidth, editable, monthAttendance, updateElements]);

  useEffect(() => {
    if (!editable) return;
    const neededHeight = Math.max(maxElementBottom(elements) + 110, 560);
    if (neededHeight > canvasHeight) updateCanvasHeight(Math.ceil(neededHeight / CANVAS_EXTENSION) * CANVAS_EXTENSION);
  }, [canvasHeight, editable, elements, updateCanvasHeight]);

  const panResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => editable && toolMode !== "hand",
      onMoveShouldSetPanResponder: () => editable && toolMode !== "hand",
      onPanResponderGrant: (event) => {
        const point = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
        pendingTapRef.current = null;
        if (toolMode === "draw") {
          if (event.nativeEvent.touches.length !== 1) return;
          setSelectedId(null);
          draftPointsRef.current = [point];
          setDraftPoints([point]);
          return;
        }
        const completionRow = [...latestElements.current].reverse().find((element) => isAyahCheckboxTap(element, point));
        if (completionRow) {
          pendingTapRef.current = { kind: "complete", elementId: completionRow.id, origin: point, cancelled: false };
          interactionRef.current = null;
          return;
        }
        const interactiveElement = [...latestElements.current].reverse().find((element) => getInteractiveField(element, point) !== null);
        if (interactiveElement) {
          const field = getInteractiveField(interactiveElement, point);
          if (field === "surah") {
            pendingTapRef.current = { kind: "surah", elementId: interactiveElement.id, type: interactiveElement.type === "reviewRow" ? "reviewRow" : interactiveElement.type === "ayahRow" ? "ayahRow" : "surahTitle", origin: point, cancelled: false };
          } else if (field) {
            pendingTapRef.current = { kind: "input", elementId: interactiveElement.id, field, origin: point, cancelled: false };
          }
          interactionRef.current = null;
          return;
        }
        const target = [...latestElements.current].reverse().find((element) => containsPoint(getBounds(element), point));
        if (!target) {
          setSelectedId(null);
          interactionRef.current = null;
          return;
        }
        setSelectedId(target.id);
        selectionCandidateRef.current = target;
        interactionRef.current = null;
      },
      onPanResponderMove: (event) => {
        const point = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
        const pendingTap = pendingTapRef.current;
        if (pendingTap) {
          const movedDistance = Math.hypot(point.x - pendingTap.origin.x, point.y - pendingTap.origin.y);
          if (movedDistance > 9 || event.nativeEvent.touches.length > 1) pendingTap.cancelled = true;
          return;
        }
        if (toolMode === "draw") {
          if (event.nativeEvent.touches.length !== 1) return;
          draftPointsRef.current = [...draftPointsRef.current, point];
          setDraftPoints(draftPointsRef.current);
          return;
        }
        if (!interactionRef.current && event.nativeEvent.touches.length >= 2 && selectionCandidateRef.current) {
          const target = selectionCandidateRef.current;
          const bounds = getBounds(target);
          const closeToResizeHandle = point.x >= bounds.x + bounds.width - 28 && point.y >= bounds.y + bounds.height - 28;
          interactionRef.current = { kind: closeToResizeHandle ? "resize" : "move", element: target, origin: point, bounds };
        }
        const interaction = interactionRef.current;
        if (!interaction) return;
        const deltaX = point.x - interaction.origin.x;
        const deltaY = point.y - interaction.origin.y;
        const changed = interaction.kind === "move" ? translateElement(interaction.element, deltaX, deltaY) : resizeElement(interaction.element, interaction.bounds, deltaX, deltaY);
        updateElements(latestElements.current.map((element) => element.id === interaction.element.id ? changed : element));
      },
      onPanResponderRelease: () => {
        const pendingTap = pendingTapRef.current;
        if (pendingTap) {
          pendingTapRef.current = null;
          if (!pendingTap.cancelled) {
            const tappedElement = latestElements.current.find((element) => element.id === pendingTap.elementId);
            if (tappedElement && pendingTap.kind === "complete") {
              const completed = !tappedElement.completed;
              updateElements(latestElements.current.map((element) => element.id === tappedElement.id ? { ...element, completed, completedDateKey: completed ? todayDateKey() : undefined } : element));
              setSelectedId(tappedElement.id);
              setToolMode("hand");
            }
            if (tappedElement && pendingTap.kind === "input" && pendingTap.field) {
              setInputTarget({ elementId: tappedElement.id, field: pendingTap.field });
              setInputValue(tappedElement[pendingTap.field] ?? "");
              setSelectedId(tappedElement.id);
            }
            if (tappedElement && pendingTap.kind === "surah" && pendingTap.type) {
              setSurahTarget({ elementId: tappedElement.id, type: pendingTap.type });
              setSelectedId(tappedElement.id);
            }
          }
          return;
        }
        if (toolMode === "draw") {
          const points = draftPointsRef.current;
          if (points.length > 1) updateElements([...latestElements.current, { id: createId(), type: "path", points, color: activeColor, strokeWidth: 3 }]);
          draftPointsRef.current = [];
          setDraftPoints([]);
        }
        interactionRef.current = null;
        selectionCandidateRef.current = null;
      },
      onPanResponderTerminate: () => { draftPointsRef.current = []; setDraftPoints([]); interactionRef.current = null; selectionCandidateRef.current = null; pendingTapRef.current = null; },
    }),
    [activeColor, editable, toolMode, updateElements],
  );

  const chooseColor = (color: string) => {
    setActiveColor(color);
    if (selectedId) updateElements(latestElements.current.map((element) => element.id === selectedId ? { ...element, color } : element));
  };

  const addShape = (type: "square" | "frame") => {
    const element: BoardElement = { id: createId(), type, x: 88, y: Math.min(132, canvasHeight - 160), width: type === "square" ? 120 : 190, height: type === "square" ? 120 : 104, color: activeColor, strokeWidth: 3 };
    updateElements([...latestElements.current, element]);
    setSelectedId(element.id);
    setToolMode("hand");
  };

  const addAyahRow = () => {
    const previousAyahRow = [...latestElements.current].reverse().find((element) => element.type === "ayahRow");
    const width = 326;
    const row: BoardElement = { id: createId(), type: "ayahRow", x: Math.max(4, (canvasWidth - width) / 2), y: getStructuredRowY(latestElements.current), width, height: 70, completed: false, fromAyah: previousAyahRow?.toAyah ?? "", surahName: previousAyahRow?.surahName ?? "" };
    updateElements([...latestElements.current, row]);
    setSelectedId(null);
    setToolMode("hand");
  };

  const addSurahTitle = () => {
    const width = 272;
    const row: BoardElement = { id: createId(), type: "surahTitle", x: Math.max(12, (canvasWidth - width) / 2), y: getStructuredRowY(latestElements.current), width, height: 66 };
    updateElements([...latestElements.current, row]);
    setSelectedId(null);
    setToolMode("hand");
    setSurahTarget({ elementId: row.id, type: "surahTitle" });
  };

  const addFullSurah = () => {
    const width = 272;
    const row: BoardElement = { id: createId(), type: "fullSurah", x: Math.max(12, (canvasWidth - width) / 2), y: getStructuredRowY(latestElements.current), width, height: 60 };
    updateElements([...latestElements.current, row]);
    setSelectedId(null);
    setToolMode("hand");
  };

  const addReviewRow = () => {
    const width = 300;
    const row: BoardElement = { id: createId(), type: "reviewRow", x: Math.max(10, (canvasWidth - width) / 2), y: getStructuredRowY(latestElements.current), width, height: 70, completed: false };
    updateElements([...latestElements.current, row]);
    setSelectedId(null);
    setToolMode("hand");
  };

  const addWeekRow = (weekNumber: 1 | 2 | 3 | 4) => {
    const width = 272;
    const row: BoardElement = { id: createId(), type: "weekRow", weekNumber, x: Math.max(12, (canvasWidth - width) / 2), y: getStructuredRowY(latestElements.current), width, height: 54 };
    updateElements([...latestElements.current, row]);
    setSelectedId(null);
    setToolMode("hand");
    setWeekPickerVisible(false);
  };

  const saveStructuredInput = () => {
    if (!inputTarget) return;
    updateElements(latestElements.current.map((element) => element.id === inputTarget.elementId ? { ...element, [inputTarget.field]: inputValue.trim() } : element));
    setInputTarget(null);
  };

  const selectSurah = (surahName: string) => {
    if (!surahTarget) return;
    updateElements(latestElements.current.map((element) => element.id === surahTarget.elementId ? { ...element, surahName } : element));
    setSurahTarget(null);
  };

  const applyTheme = (key: BoardThemeKey) => {
    const nextTheme = getBoardTheme(key, customThemeColors);
    setThemeKey(key);
    setActiveColor(nextTheme.accent);
    onThemeChange?.(key);
    onThemeColorsChange?.(key === "custom" ? customThemeColors : null);
    setThemeModalVisible(false);
    if (key === "custom") setCustomThemeModalVisible(true);
  };

  const updateCustomThemeColor = (field: keyof CustomThemeColors, color: string) => {
    const nextColors = { ...customThemeColors, [field]: color };
    setCustomThemeColors(nextColors);
    setThemeKey("custom");
    setActiveColor(nextColors.accent);
    onThemeChange?.("custom");
    onThemeColorsChange?.(nextColors);
  };

  const openTextEditor = () => {
    if (selectedElement?.type === "text") {
      setEditingTextId(selectedElement.id);
      setNewText(selectedElement.text ?? "");
      setNewTextSize(selectedElement.fontSize ?? 22);
      setNewTextBold(selectedElement.fontWeight !== "400");
      setActiveColor(selectedElement.color ?? DEFAULT_COLOR);
    } else {
      setEditingTextId(null);
      setNewText("");
      setNewTextSize(22);
      setNewTextBold(true);
    }
    setTextModalVisible(true);
  };

  const saveText = () => {
    const cleanText = newText.trim();
    if (!cleanText) return;
    if (editingTextId) {
      updateElements(latestElements.current.map((element) => element.id === editingTextId ? { ...element, text: cleanText, color: activeColor, fontSize: newTextSize, fontWeight: newTextBold ? "700" : "400" } : element));
      setSelectedId(editingTextId);
    } else {
      const element: BoardElement = { id: createId(), type: "text", text: cleanText, x: 52, y: 76, color: activeColor, fontSize: newTextSize, fontWeight: newTextBold ? "700" : "400" };
      updateElements([...latestElements.current, element]);
      setSelectedId(element.id);
      setToolMode("hand");
    }
    setTextModalVisible(false);
  };

  const adjustSelectedTextSize = (amount: number) => {
    if (selectedElement?.type !== "text") return;
    updateElements(latestElements.current.map((element) => element.id === selectedElement.id ? { ...element, fontSize: Math.max(12, Math.min(56, (element.fontSize ?? 22) + amount)) } : element));
  };

  const addImage = async () => {
    if (!onUploadImage || uploading) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, quality: 0.55, base64: true });
    if (result.canceled || !result.assets[0]?.base64) return;
    const asset = result.assets[0];
    const mimeType: "image/jpeg" | "image/png" | "image/webp" = asset.mimeType === "image/png" || asset.mimeType === "image/webp" ? asset.mimeType : "image/jpeg";
    setUploading(true);
    try {
      const url = await onUploadImage(asset.base64!, mimeType);
      if (url) {
        const element: BoardElement = { id: createId(), type: "image", uri: url, x: 52, y: 182, width: 170, height: 132 };
        updateElements([...latestElements.current, element]);
        setSelectedId(element.id);
        setToolMode("hand");
      }
    } catch {
      Alert.alert("تعذر رفع الصورة", "تأكد من اتصال الإنترنت ثم حاول مجدداً.");
    } finally { setUploading(false); }
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    updateElements(latestElements.current.filter((element) => element.id !== selectedId));
    setSelectedId(null);
  };

  const reorderStructuredRows = () => {
    let nextY = 44;
    const sorted = latestElements.current.filter((element) => STRUCTURED_ROW_TYPES.has(element.type)).sort((a, b) => getBounds(a).y - getBounds(b).y);
    const coordinates = new Map<string, number>();
    for (const element of sorted) {
      coordinates.set(element.id, nextY);
      nextY += getBounds(element).height + 18;
    }
    updateElements(latestElements.current.map((element) => coordinates.has(element.id) ? { ...element, y: coordinates.get(element.id) } : element));
    setSelectedId(null);
  };

  const toggleCompletion = (elementId: string) => {
    const tappedElement = latestElements.current.find((element) => element.id === elementId);
    if (!tappedElement) return;
    const completed = !tappedElement.completed;
    updateElements(latestElements.current.map((element) => element.id === elementId ? { ...element, completed, completedDateKey: completed ? todayDateKey() : undefined } : element));
  };

  return (
    <View>
      {editable ? <>
        <View style={[styles.structuredHeader, { backgroundColor: theme.titleSurface }]}><AppIcon name="auto-stories" color={theme.gold} size={19} /><Text style={[styles.structuredHeaderText, { color: theme.ink }]}>سطور المتابعة القرآنية</Text></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.structuredToolbar} style={styles.toolbarScroll}>
          <Tool label="سطر آيات" icon="format-list-numbered" onPress={addAyahRow} />
          <Tool label="عنوان سورة" icon="auto-stories" onPress={addSurahTitle} />
          <Tool label="السورة كاملة" icon="menu-book" onPress={addFullSurah} />
          <Tool label="مراجعة" icon="assignment-turned-in" onPress={addReviewRow} />
          <Tool label="سطر أسبوع" icon="date-range" onPress={() => setWeekPickerVisible(true)} />
          <Tool label="إعادة ترتيب" icon="format-list-numbered" onPress={reorderStructuredRows} />
        </ScrollView>
        <Text style={styles.drawingLabel}>أدوات الرسم والكتابة</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbar} style={styles.toolbarScroll}>
          <Tool label="قلم" icon="edit" onPress={() => setToolMode("draw")} selected={toolMode === "draw"} />
          <Tool label="يد" icon="near-me" onPress={() => setToolMode("hand")} selected={toolMode === "hand"} />
          <Tool label="تحديد" icon="touch-app" onPress={() => setToolMode("select")} selected={toolMode === "select"} />
          <Tool label={selectedElement?.type === "text" ? "تحرير النص" : "نص"} icon="title" onPress={openTextEditor} />
          <Tool label="مربع" icon="crop-square" onPress={() => addShape("square")} />
          <Tool label="إطار" icon="border-outer" onPress={() => addShape("frame")} />
          <Tool label={uploading ? "جارٍ الرفع" : "صورة"} icon="add-photo-alternate" onPress={addImage} disabled={uploading} />
          <Tool label="مدّ السبورة" icon="unfold-more" onPress={() => updateCanvasHeight(canvasHeight + CANVAS_EXTENSION)} />
          <Tool label="ثيمات" icon="palette" onPress={() => setThemeModalVisible(true)} />
          <Tool label="حذف المحدد" icon="delete-outline" onPress={deleteSelected} disabled={!selectedId} />
          <Tool label="تراجع" icon="undo" onPress={() => updateElements(latestElements.current.slice(0, -1))} disabled={elements.length === 0} />
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.palette} style={styles.paletteScroll}>
          <Text style={styles.paletteLabel}>{selectedId ? "لون العنصر المحدد" : "لون القلم والعناصر"}</Text>
          {PALETTE.map((color) => <Pressable key={color} onPress={() => chooseColor(color)} style={[styles.colorDot, { backgroundColor: color }, activeColor === color && styles.colorDotSelected]} />)}
          {selectedElement?.type === "text" ? <><Tool label="A−" icon="text-decrease" onPress={() => adjustSelectedTextSize(-2)} /><Tool label="A+" icon="text-increase" onPress={() => adjustSelectedTextSize(2)} /></> : null}
        </ScrollView>
        {toolMode === "select" && selectedElement && selectedBounds ? <View style={styles.selectionHelp}><AppIcon name="touch-app" color={colors.green} size={18} /><Text style={styles.selectionHelpText}>أداة التحديد للنقل والتكبير بإصبعين. اختر «يد» للتمرير من دون تحديد أي عنصر.</Text></View> : null}
      </> : null}
      <View onLayout={(event) => setCanvasWidth(event.nativeEvent.layout.width)} style={[styles.canvas, !editable && styles.readonlyCanvas, { height: canvasHeight, backgroundColor: theme.canvas, borderColor: theme.canvasBorder }]} {...(editable && toolMode !== "hand" ? panResponder.panHandlers : {})}>
        <View pointerEvents={editable && toolMode === "hand" ? "box-none" : "none"} style={StyleSheet.absoluteFill}>
          <Svg width="100%" height="100%">
            {elements.filter((element) => element.type === "path").map((element) => <Path key={element.id} d={makePath(element.points ?? [])} stroke={element.color ?? DEFAULT_COLOR} strokeWidth={element.strokeWidth ?? 3} strokeLinecap="round" strokeLinejoin="round" fill="none" />)}
            {draftPoints.length > 1 ? <Path d={makePath(draftPoints)} stroke={activeColor} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" /> : null}
            {elements.filter((element) => element.type === "square" || element.type === "frame").map((element) => <Rect key={element.id} x={element.x ?? 0} y={element.y ?? 0} width={element.width ?? 100} height={element.height ?? 100} fill={element.type === "square" ? `${element.color ?? colors.gold}30` : "transparent"} stroke={element.color ?? DEFAULT_COLOR} strokeWidth={element.strokeWidth ?? 3} rx={element.type === "square" ? 10 : 2} />)}
          </Svg>
          {elements.filter((element) => element.type === "text").map((element) => <Text key={element.id} style={[styles.boardText, { color: element.color ?? colors.ink, fontSize: element.fontSize ?? 20, fontWeight: element.fontWeight ?? "700", left: element.x ?? 30, top: element.y ?? 30 }]}>{element.text}</Text>)}
          {elements.filter((element) => element.type === "ayahRow").map((element) => {
            const bounds = editable ? getBounds(element) : getResponsiveReadOnlyBounds(element, canvasWidth);
            const handActive = editable && toolMode === "hand";
            return <View key={element.id} style={[styles.ayahRow, { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height, backgroundColor: theme.surface, borderColor: theme.rowBorder }]}>
              {element.completed && element.completedDateKey ? <Text style={[styles.completionDate, { backgroundColor: theme.canvas, color: theme.ink }]}>{completionDateLabel(element.completedDateKey)}</Text> : null}
              <Pressable disabled={!handActive} onPress={() => toggleCompletion(element.id)} style={[styles.ayahCheckbox, { borderColor: theme.accent }, element.completed && { backgroundColor: theme.accent, borderColor: theme.accent }]}>{element.completed ? <AppIcon name="check" color={colors.white} size={28} /> : null}</Pressable>
              <Pressable disabled={!handActive} onPress={() => setSurahTarget({ elementId: element.id, type: "ayahRow" })} style={[styles.ayahSurahBox, { backgroundColor: theme.canvas, borderColor: theme.rowBorder }]}><Text style={[styles.ayahSurahText, { color: theme.ink }, !element.surahName && styles.ayahPlaceholder]}>{element.surahName || "اختر السورة"}</Text></Pressable>
              <Pressable disabled={!handActive} onPress={() => { setInputTarget({ elementId: element.id, field: "toAyah" }); setInputValue(element.toAyah ?? ""); }} style={[styles.ayahNumberBox, styles.ayahNumberBoxCompact, { backgroundColor: theme.canvas, borderColor: theme.rowBorder }]}><Text style={[styles.ayahNumberText, { color: theme.ink }, !element.toAyah && styles.ayahPlaceholder]}>{element.toAyah || "رقم الآية"}</Text></Pressable>
              <Text style={[styles.ayahLabel, { color: theme.ink }]}>إلى</Text>
              <Pressable disabled={!handActive} onPress={() => { setInputTarget({ elementId: element.id, field: "fromAyah" }); setInputValue(element.fromAyah ?? ""); }} style={[styles.ayahNumberBox, styles.ayahNumberBoxCompact, { backgroundColor: theme.canvas, borderColor: theme.rowBorder }]}><Text style={[styles.ayahNumberText, { color: theme.ink }, !element.fromAyah && styles.ayahPlaceholder]}>{element.fromAyah || "رقم الآية"}</Text></Pressable>
              <Text style={[styles.ayahLabel, { color: theme.ink }]}>من</Text>
            </View>;
          })}
          {elements.filter((element) => element.type === "surahTitle").map((element) => {
            const bounds = editable ? getBounds(element) : getResponsiveReadOnlyBounds(element, canvasWidth);
            return <Pressable key={element.id} disabled={!editable || toolMode !== "hand"} onPress={() => setSurahTarget({ elementId: element.id, type: "surahTitle" })} style={[styles.surahTitleRow, { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height, backgroundColor: theme.titleSurface, borderColor: theme.gold }]}><Text style={[styles.ornament, { color: theme.gold }]}>۞</Text><Text style={[styles.surahTitleText, { color: theme.ink }, !element.surahName && styles.ayahPlaceholder]}>سورة {element.surahName ?? "اختر السورة"}</Text><Text style={[styles.ornament, { color: theme.gold }]}>۞</Text></Pressable>;
          })}
          {elements.filter((element) => element.type === "fullSurah").map((element) => {
            const bounds = editable ? getBounds(element) : getResponsiveReadOnlyBounds(element, canvasWidth);
            return <View key={element.id} style={[styles.fullSurahRow, { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height, backgroundColor: theme.fullSurface, borderColor: theme.gold }]}>{element.completed && element.completedDateKey ? <Text style={[styles.completionDate, { backgroundColor: theme.canvas, color: theme.ink }]}>{completionDateLabel(element.completedDateKey)}</Text> : null}<Text style={[styles.fullSurahText, { color: theme.fullInk }]}>السورة كاملة</Text><Pressable disabled={!editable || toolMode !== "hand"} onPress={() => toggleCompletion(element.id)} style={[styles.fullSurahCheckbox, element.completed && { backgroundColor: theme.gold, borderColor: theme.gold }]}>{element.completed ? <AppIcon name="check" color={theme.fullSurface} size={26} /> : null}</Pressable></View>;
          })}
          {elements.filter((element) => element.type === "reviewRow").map((element) => {
            const bounds = editable ? getBounds(element) : getResponsiveReadOnlyBounds(element, canvasWidth);
            const handActive = editable && toolMode === "hand";
            return <View key={element.id} style={[styles.reviewRow, { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height, backgroundColor: theme.surface, borderColor: theme.rowBorder }]}>{element.completed && element.completedDateKey ? <Text style={[styles.completionDate, { backgroundColor: theme.canvas, color: theme.ink }]}>{completionDateLabel(element.completedDateKey)}</Text> : null}<Text style={[styles.reviewLabel, { color: theme.ink }]}>مراجعة</Text><Pressable disabled={!handActive} onPress={() => { setInputTarget({ elementId: element.id, field: "reviewNote" }); setInputValue(element.reviewNote ?? ""); }} style={[styles.reviewNoteBox, { backgroundColor: theme.canvas, borderColor: theme.rowBorder }]}><Text style={[styles.reviewContent, { color: theme.ink }, !element.reviewNote && styles.ayahPlaceholder]}>{element.reviewNote || "اكتب ملاحظة"}</Text></Pressable><Text style={[styles.reviewLabel, { color: theme.ink }]}>سورة</Text><Pressable disabled={!handActive} onPress={() => setSurahTarget({ elementId: element.id, type: "reviewRow" })} style={[styles.reviewSurahBox, { backgroundColor: theme.canvas, borderColor: theme.rowBorder }]}><Text style={[styles.reviewContent, { color: theme.ink }, !element.surahName && styles.ayahPlaceholder]}>{element.surahName || "اختر"}</Text></Pressable><Pressable disabled={!handActive} onPress={() => toggleCompletion(element.id)} style={[styles.ayahCheckbox, { borderColor: theme.accent }, element.completed && { backgroundColor: theme.accent, borderColor: theme.accent }]}>{element.completed ? <AppIcon name="check" color={colors.white} size={28} /> : null}</Pressable></View>;
          })}
          {elements.filter((element) => element.type === "weekRow").map((element) => {
            const bounds = editable ? getBounds(element) : getResponsiveReadOnlyBounds(element, canvasWidth);
            return <View key={element.id} style={[styles.weekRow, { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }]}><View style={styles.weekMark}><Text style={styles.weekMarkText}>{element.weekNumber ?? 1}</Text></View><View style={styles.weekCopy}><Text style={styles.weekEyebrow}>خطة المتابعة</Text><Text style={styles.weekText}>الأسبوع {element.weekNumber ?? 1}</Text></View><AppIcon name="calendar-month" color="#536FA6" size={25} /></View>;
          })}
          {elements.filter((element) => element.type === "attendanceRow").map((element) => { const bounds = editable ? getBounds(element) : getResponsiveReadOnlyBounds(element, canvasWidth); return <View key={element.id} style={[styles.attendanceBoardRow, { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height, backgroundColor: element.morningAbsent && element.eveningAbsent ? theme.fullSurface : theme.surface, borderColor: element.morningAbsent && element.eveningAbsent ? theme.fullSurface : theme.rowBorder }]}><Text style={[styles.attendanceDate, { color: element.morningAbsent && element.eveningAbsent ? theme.fullInk : theme.ink }]}>يوم {attendanceDateLabel(element.dateKey ?? "")}</Text><View style={styles.attendanceDivider} />{element.morningAbsent ? <Text style={[styles.attendanceChip, { backgroundColor: "#B23A48" }]}>غياب صباحي</Text> : null}{element.eveningAbsent ? <Text style={[styles.attendanceChip, { backgroundColor: "#792934" }]}>غياب مسائي</Text> : null}</View>; })}
          {!editable ? monthAttendance.filter((record) => !elements.some((element) => element.type === "attendanceRow" && element.dateKey === record.dateKey)).map((record, index) => <View key={record.dateKey} style={[styles.attendanceBoardRow, { top: fallbackAttendanceTop + index * 70, backgroundColor: record.morningAbsent && record.eveningAbsent ? theme.fullSurface : theme.surface, borderColor: record.morningAbsent && record.eveningAbsent ? theme.fullSurface : theme.rowBorder }]}><Text style={[styles.attendanceDate, { color: record.morningAbsent && record.eveningAbsent ? theme.fullInk : theme.ink }]}>يوم {attendanceDateLabel(record.dateKey)}</Text><View style={styles.attendanceDivider} />{record.morningAbsent ? <Text style={[styles.attendanceChip, { backgroundColor: "#B23A48" }]}>غياب صباحي</Text> : null}{record.eveningAbsent ? <Text style={[styles.attendanceChip, { backgroundColor: "#792934" }]}>غياب مسائي</Text> : null}</View>) : null}
          {elements.filter((element) => element.type === "image" && element.uri).map((element) => <Image key={element.id} source={{ uri: element.uri }} resizeMode="cover" style={[styles.boardImage, { left: element.x ?? 30, top: element.y ?? 30, width: element.width ?? 150, height: element.height ?? 110 }]} />)}
          {selectedElement && selectedBounds ? <View style={[styles.selectionBox, { left: selectedBounds.x - 7, top: selectedBounds.y - 7, width: selectedBounds.width + 14, height: selectedBounds.height + 14 }]}><View style={styles.resizeHandle} /></View> : null}
        </View>
        {elements.length === 0 && monthAttendance.length === 0 && draftPoints.length === 0 ? <Text style={[styles.emptyBoardText, { marginTop: Math.max(160, canvasHeight * 0.37) }]}>{editable ? "وضع اليد هو الافتراضي للتمرير. اختر القلم للرسم أو التحديد لتحريك العناصر." : "لم يضف المعلم محتوى لهذا الشهر بعد"}</Text> : null}
        {editable ? <View pointerEvents="none" style={styles.bottomGuide}><Text style={styles.bottomGuideText}>يمكنك مدّ السبورة إلى الأسفل وإضافة محتوى جديد</Text></View> : null}
      </View>
      <Modal visible={textModalVisible} transparent animationType="fade" onRequestClose={() => setTextModalVisible(false)}>
        <View style={styles.modalBackdrop}><View style={styles.textModal}>
          <Text style={styles.modalTitle}>{editingTextId ? "تحرير النص" : "إضافة نص إلى السبورة"}</Text>
          <TextInput autoFocus multiline placeholder="اكتب النص هنا" placeholderTextColor="#93A19A" style={[styles.textInput, { color: activeColor, fontSize: newTextSize, fontWeight: newTextBold ? "700" : "400" }]} textAlign="right" value={newText} onChangeText={setNewText} />
          <View style={styles.formatRow}><Text style={styles.formatLabel}>حجم الخط</Text><Pressable onPress={() => setNewTextSize((size) => Math.max(12, size - 2))} style={styles.formatButton}><Text style={styles.formatButtonText}>A−</Text></Pressable><Text style={styles.sizeValue}>{newTextSize}</Text><Pressable onPress={() => setNewTextSize((size) => Math.min(56, size + 2))} style={styles.formatButton}><Text style={styles.formatButtonText}>A+</Text></Pressable><Pressable onPress={() => setNewTextBold((value) => !value)} style={[styles.boldButton, newTextBold && styles.boldButtonSelected]}><Text style={[styles.boldButtonText, newTextBold && styles.boldButtonTextSelected]}>عريض</Text></Pressable></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modalPalette}>{PALETTE.map((color) => <Pressable key={color} onPress={() => setActiveColor(color)} style={[styles.colorDot, { backgroundColor: color }, activeColor === color && styles.colorDotSelected]} />)}</ScrollView>
          <View style={styles.modalActions}><Pressable onPress={() => setTextModalVisible(false)} style={styles.cancelButton}><Text style={styles.cancelText}>إلغاء</Text></Pressable><Pressable onPress={saveText} style={styles.addTextButton}><Text style={styles.addTextButtonText}>{editingTextId ? "حفظ التعديل" : "إضافة النص"}</Text></Pressable></View>
        </View></View>
      </Modal>
      <Modal visible={Boolean(inputTarget)} transparent animationType="fade" onRequestClose={() => setInputTarget(null)}>
        <View style={styles.modalBackdrop}><View style={styles.shortModal}>
          <Text style={styles.modalTitle}>{inputTarget?.field === "reviewNote" ? "إضافة ملاحظة للمراجعة" : "إدخال رقم الآية"}</Text>
          <TextInput autoFocus value={inputValue} onChangeText={setInputValue} keyboardType={inputTarget?.field === "reviewNote" ? "default" : "number-pad"} multiline={inputTarget?.field === "reviewNote"} placeholder={inputTarget?.field === "reviewNote" ? "اكتب الملاحظة" : "اكتب رقم الآية"} placeholderTextColor="#93A19A" style={[styles.structuredInput, inputTarget?.field === "reviewNote" && styles.structuredNoteInput]} textAlign="right" />
          <View style={styles.modalActions}><Pressable onPress={() => setInputTarget(null)} style={styles.cancelButton}><Text style={styles.cancelText}>إلغاء</Text></Pressable><Pressable onPress={saveStructuredInput} style={styles.addTextButton}><Text style={styles.addTextButtonText}>حفظ</Text></Pressable></View>
        </View></View>
      </Modal>
      <Modal visible={Boolean(surahTarget)} transparent animationType="slide" onRequestClose={() => setSurahTarget(null)}>
        <View style={styles.modalBackdrop}><View style={styles.surahModal}>
          <View style={styles.surahModalHead}><Text style={styles.modalTitle}>اختر السورة</Text><Pressable onPress={() => setSurahTarget(null)} style={styles.closeButton}><AppIcon name="close" color={colors.muted} size={21} /></Pressable></View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.surahList}>{QURAN_SURAHS.map((surahName, index) => <Pressable key={surahName} onPress={() => selectSurah(surahName)} style={({ pressed }) => [styles.surahOption, pressed && styles.toolPressed]}><Text style={styles.surahNumber}>{index + 1}</Text><Text style={styles.surahOptionText}>سورة {surahName}</Text><AppIcon name="chevron-left" color={colors.gold} size={19} /></Pressable>)}</ScrollView>
        </View></View>
      </Modal>
      <Modal visible={weekPickerVisible} transparent animationType="fade" onRequestClose={() => setWeekPickerVisible(false)}>
        <View style={styles.modalBackdrop}><View style={styles.weekModal}><Text style={styles.modalTitle}>اختر أسبوع المتابعة</Text><Text style={styles.weekModalHint}>سيُضاف صف مميز إلى السبورة بهذا العنوان.</Text>{([1, 2, 3, 4] as const).map((weekNumber) => <Pressable key={weekNumber} onPress={() => addWeekRow(weekNumber)} style={({ pressed }) => [styles.weekOption, pressed && styles.toolPressed]}><Text style={styles.weekOptionText}>الأسبوع {weekNumber}</Text><AppIcon name="chevron-left" color={colors.gold} size={20} /></Pressable>)}<Pressable onPress={() => setWeekPickerVisible(false)} style={styles.cancelButton}><Text style={styles.cancelText}>إلغاء</Text></Pressable></View></View>
      </Modal>
      <Modal visible={themeModalVisible} transparent animationType="slide" onRequestClose={() => setThemeModalVisible(false)}>
        <View style={styles.modalBackdrop}><View style={styles.themeModal}>
          <View style={styles.surahModalHead}><Text style={styles.modalTitle}>ثيمات السبورة</Text><Pressable onPress={() => setThemeModalVisible(false)} style={styles.closeButton}><AppIcon name="close" color={colors.muted} size={21} /></Pressable></View>
          <Text style={styles.themeHint}>اختر نمطاً للورق والسطور والعناوين. الثيم الأصلي هو الإعداد الافتراضي.</Text>
          <View style={styles.themeList}>{(Object.keys(BOARD_THEMES) as BoardThemeKey[]).map((key) => {
            const option = BOARD_THEMES[key];
            const selected = key === themeKey;
            return <Pressable key={key} onPress={() => applyTheme(key)} style={({ pressed }) => [styles.themeOption, selected && { borderColor: option.accent, borderWidth: 2 }, pressed && styles.toolPressed]}>
              <View style={[styles.themePreview, { backgroundColor: option.canvas, borderColor: option.canvasBorder }]}><View style={[styles.themePreviewTitle, { backgroundColor: option.fullSurface }]} /><View style={[styles.themePreviewLine, { backgroundColor: option.surface, borderColor: option.rowBorder }]} /></View>
              <View style={styles.themeText}><Text style={styles.themeName}>{option.label}</Text><Text style={styles.themeDescription}>{option.description}</Text></View>
              {selected ? <AppIcon name="check-circle" color={option.accent} size={23} /> : <AppIcon name="chevron-left" color={colors.muted} size={20} />}
            </Pressable>;
          })}</View>
        </View></View>
      </Modal>
      <Modal visible={customThemeModalVisible} transparent animationType="slide" onRequestClose={() => setCustomThemeModalVisible(false)}>
        <View style={styles.modalBackdrop}><View style={styles.customThemeModal}>
          <View style={styles.surahModalHead}><Text style={styles.modalTitle}>ألواني الخاصة</Text><Pressable onPress={() => setCustomThemeModalVisible(false)} style={styles.closeButton}><AppIcon name="close" color={colors.muted} size={21} /></Pressable></View>
          <Text style={styles.themeHint}>اختر لون كل جزء، وتظهر المعاينة مباشرة على السبورة. اضغط «حفظ الثيم» في صفحة الطالب لحفظه للشهر.</Text>
          {([{ key: "canvas", label: "لون ورق السبورة" }, { key: "accent", label: "اللون الرئيسي والإطارات" }, { key: "ink", label: "لون النصوص" }, { key: "gold", label: "لون الزخرفة" }] as { key: keyof CustomThemeColors; label: string }[]).map((setting) => <View key={setting.key} style={styles.customColorSection}><View style={styles.customColorHead}><Text style={styles.customColorLabel}>{setting.label}</Text><View style={[styles.customColorSample, { backgroundColor: customThemeColors[setting.key] }]} /></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.customColorPalette}>{CUSTOM_COLOR_PALETTE.map((color) => <Pressable key={color} onPress={() => updateCustomThemeColor(setting.key, color)} style={[styles.colorDot, { backgroundColor: color }, customThemeColors[setting.key] === color && styles.colorDotSelected]} />)}</ScrollView></View>)}
          <Pressable onPress={() => setCustomThemeModalVisible(false)} style={styles.customDoneButton}><Text style={styles.addTextButtonText}>تم اختيار الألوان</Text></Pressable>
        </View></View>
      </Modal>
    </View>
  );
}

function Tool({ label, icon, onPress, selected, disabled }: { label: string; icon: React.ComponentProps<typeof AppIcon>["name"]; onPress: () => void; selected?: boolean; disabled?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.tool, selected && styles.toolSelected, (pressed || disabled) && styles.toolPressed]}><AppIcon name={icon} color={selected ? colors.white : colors.green} size={18} /><Text style={[styles.toolText, selected && styles.toolTextSelected]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  structuredHeader: { alignItems: "center", backgroundColor: "#FBF2DF", borderRadius: 12, flexDirection: "row-reverse", gap: 7, marginBottom: 8, paddingHorizontal: 11, paddingVertical: 9 }, structuredHeaderText: { color: colors.ink, fontSize: 14, fontWeight: "900", writingDirection: "rtl" }, structuredToolbar: { flexDirection: "row", gap: 8, paddingHorizontal: 1 }, drawingLabel: { color: colors.muted, fontSize: 12, fontWeight: "800", marginBottom: 6, textAlign: "right", writingDirection: "rtl" },
  toolbarScroll: { marginBottom: 9 }, toolbar: { flexDirection: "row", gap: 8, paddingHorizontal: 1 }, paletteScroll: { marginBottom: 9 }, palette: { alignItems: "center", flexDirection: "row", gap: 8, paddingHorizontal: 1 },
  tool: { alignItems: "center", backgroundColor: colors.white, borderColor: colors.line, borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 5, minHeight: 40, paddingHorizontal: 10 }, toolSelected: { backgroundColor: colors.green, borderColor: colors.green }, toolPressed: { opacity: 0.55 }, toolText: { color: colors.green, fontSize: 12, fontWeight: "800", writingDirection: "rtl" }, toolTextSelected: { color: colors.white },
  paletteLabel: { color: colors.muted, fontSize: 12, fontWeight: "800", writingDirection: "rtl" }, colorDot: { borderColor: colors.white, borderRadius: 15, borderWidth: 2, height: 28, width: 28 }, colorDotSelected: { borderColor: colors.ink, borderWidth: 3, transform: [{ scale: 1.12 }] },
  selectionHelp: { alignItems: "center", backgroundColor: colors.paleGreen, borderRadius: 12, flexDirection: "row-reverse", gap: 7, marginBottom: 9, padding: 10 }, selectionHelpText: { color: colors.green, flex: 1, fontSize: 12, fontWeight: "700", textAlign: "right", writingDirection: "rtl" },
  canvas: { backgroundColor: "#FFFDF7", borderColor: "#D9D1BA", borderRadius: 16, borderWidth: 1, direction: "ltr", overflow: "hidden" }, readonlyCanvas: { minHeight: MIN_CANVAS_HEIGHT }, emptyBoardText: { alignSelf: "center", color: "#98A79F", fontSize: 15, paddingHorizontal: 30, textAlign: "center", writingDirection: "rtl" }, boardText: { lineHeight: 30, position: "absolute", writingDirection: "rtl" }, boardImage: { borderRadius: 10, position: "absolute" }, selectionBox: { borderColor: colors.green, borderStyle: "dashed", borderWidth: 2, position: "absolute" }, resizeHandle: { backgroundColor: colors.green, borderColor: colors.white, borderRadius: 10, borderWidth: 2, bottom: -9, height: 18, position: "absolute", right: -9, width: 18 }, bottomGuide: { alignItems: "center", backgroundColor: "#FFF8E8", borderTopColor: "#EDDFBD", borderTopWidth: 1, bottom: 0, left: 0, paddingVertical: 6, position: "absolute", right: 0 }, bottomGuideText: { color: colors.gold, fontSize: 11, fontWeight: "800", writingDirection: "rtl" },
  ayahRow: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#BFD4C9", borderRadius: 14, borderWidth: 1.5, flexDirection: "row", gap: 6, paddingHorizontal: 8, position: "absolute" }, completionDate: { borderRadius: 6, fontSize: 8, fontWeight: "700", paddingHorizontal: 5, paddingVertical: 2, position: "absolute", right: 8, top: -16, writingDirection: "rtl" }, ayahLabel: { color: colors.ink, fontSize: 15, fontWeight: "900", writingDirection: "rtl" }, ayahNumberBox: { alignItems: "center", backgroundColor: "#FFFDF7", borderColor: "#98B9A9", borderRadius: 9, borderStyle: "dashed", borderWidth: 1.5, flex: 1, height: 46, justifyContent: "center" }, ayahNumberBoxCompact: { flex: 0.72 }, ayahNumberText: { color: colors.ink, fontSize: 15, fontWeight: "900", writingDirection: "rtl" }, ayahSurahBox: { alignItems: "center", borderRadius: 9, borderStyle: "dashed", borderWidth: 1.5, flex: 1.3, height: 46, justifyContent: "center" }, ayahSurahText: { fontSize: 12, fontWeight: "800", textAlign: "center", writingDirection: "rtl" }, ayahPlaceholder: { color: "#9AA8A0", fontSize: 12, fontWeight: "700" }, ayahCheckbox: { alignItems: "center", backgroundColor: colors.white, borderColor: colors.green, borderRadius: 9, borderWidth: 1.5, height: 40, justifyContent: "center", width: 34 }, ayahCheckboxCompleted: { backgroundColor: colors.green, borderColor: "#0F553F" },
  surahTitleRow: { alignItems: "center", backgroundColor: "#FFFDF7", borderColor: colors.gold, borderRadius: 18, borderWidth: 2, flexDirection: "row-reverse", justifyContent: "space-between", paddingHorizontal: 16, position: "absolute" }, ornament: { color: colors.gold, fontSize: 25, fontWeight: "900" }, surahTitleText: { color: colors.ink, fontSize: 21, fontWeight: "900", textAlign: "center", writingDirection: "rtl" }, fullSurahRow: { alignItems: "center", backgroundColor: "#176B53", borderColor: colors.gold, borderRadius: 14, borderWidth: 2, flexDirection: "row-reverse", gap: 12, justifyContent: "center", paddingHorizontal: 14, position: "absolute" }, fullSurahText: { color: "#FFF8E8", fontSize: 20, fontWeight: "900", writingDirection: "rtl" }, fullSurahCheckbox: { alignItems: "center", backgroundColor: "transparent", borderColor: "#FFF8E8", borderRadius: 8, borderWidth: 1.5, height: 32, justifyContent: "center", width: 32 },
  reviewRow: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#C9D7CE", borderRadius: 14, borderWidth: 1.5, flexDirection: "row-reverse", gap: 7, paddingHorizontal: 9, position: "absolute" }, reviewLabel: { color: colors.ink, fontSize: 14, fontWeight: "900", writingDirection: "rtl" }, reviewNoteBox: { alignItems: "center", backgroundColor: "#FFFDF7", borderColor: "#98B9A9", borderRadius: 8, borderStyle: "dashed", borderWidth: 1.25, flex: 1.25, height: 44, justifyContent: "center" }, reviewSurahBox: { alignItems: "center", backgroundColor: "#FFFDF7", borderColor: "#98B9A9", borderRadius: 8, borderStyle: "dashed", borderWidth: 1.25, flex: 0.95, height: 44, justifyContent: "center" }, reviewContent: { color: colors.ink, fontSize: 13, fontWeight: "800", textAlign: "center", writingDirection: "rtl" },
  weekRow: { alignItems: "center", backgroundColor: "#EEF3FF", borderColor: "#8FA7D3", borderLeftWidth: 6, borderRadius: 13, borderRightWidth: 1.5, borderTopWidth: 1.5, borderBottomWidth: 1.5, flexDirection: "row-reverse", gap: 10, paddingHorizontal: 12, position: "absolute" }, weekMark: { alignItems: "center", backgroundColor: "#536FA6", borderRadius: 17, height: 34, justifyContent: "center", width: 34 }, weekMarkText: { color: "#FFFFFF", fontSize: 17, fontWeight: "900" }, weekCopy: { flex: 1, gap: 1 }, weekEyebrow: { color: "#657EAF", fontSize: 9, fontWeight: "900", textAlign: "right", writingDirection: "rtl" }, weekText: { color: "#263B68", fontSize: 18, fontWeight: "900", textAlign: "right", writingDirection: "rtl" },
  attendanceBoardRow: { alignItems: "center", borderRadius: 14, borderWidth: 1.5, flexDirection: "row-reverse", gap: 8, left: 12, minHeight: 60, paddingHorizontal: 12, position: "absolute", right: 12 }, attendanceDate: { flex: 1, fontSize: 13, fontWeight: "900", textAlign: "right", writingDirection: "rtl" }, attendanceDivider: { backgroundColor: "#D9E2DC", height: 28, width: 1 }, attendanceChip: { borderRadius: 8, color: colors.white, fontSize: 11, fontWeight: "900", overflow: "hidden", paddingHorizontal: 8, paddingVertical: 7, writingDirection: "rtl" },
  modalBackdrop: { alignItems: "center", backgroundColor: "rgba(20, 40, 32, 0.42)", flex: 1, justifyContent: "center", padding: 24 }, textModal: { backgroundColor: colors.white, borderRadius: 22, gap: 14, padding: 20, width: "100%" }, shortModal: { backgroundColor: colors.white, borderRadius: 22, gap: 14, padding: 20, width: "100%" }, modalTitle: { color: colors.ink, fontSize: 18, fontWeight: "800", textAlign: "right", writingDirection: "rtl" }, textInput: { borderColor: colors.line, borderRadius: 12, borderWidth: 1, minHeight: 130, padding: 12, writingDirection: "rtl" }, structuredInput: { borderColor: colors.line, borderRadius: 12, borderWidth: 1, color: colors.ink, fontSize: 22, fontWeight: "800", minHeight: 58, padding: 12, writingDirection: "rtl" }, structuredNoteInput: { fontSize: 16, minHeight: 110 }, formatRow: { alignItems: "center", flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 }, formatLabel: { color: colors.ink, fontSize: 13, fontWeight: "800", writingDirection: "rtl" }, formatButton: { alignItems: "center", backgroundColor: colors.paleGreen, borderRadius: 9, justifyContent: "center", minHeight: 34, minWidth: 42 }, formatButtonText: { color: colors.green, fontWeight: "900" }, sizeValue: { color: colors.ink, fontSize: 14, fontWeight: "800", minWidth: 24, textAlign: "center" }, boldButton: { backgroundColor: colors.white, borderColor: colors.line, borderRadius: 9, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8 }, boldButtonSelected: { backgroundColor: colors.green, borderColor: colors.green }, boldButtonText: { color: colors.green, fontSize: 12, fontWeight: "800", writingDirection: "rtl" }, boldButtonTextSelected: { color: colors.white }, modalPalette: { flexDirection: "row", gap: 8 }, modalActions: { flexDirection: "row", gap: 10, justifyContent: "flex-start" }, cancelButton: { alignItems: "center", borderColor: colors.line, borderRadius: 12, borderWidth: 1, minWidth: 88, paddingVertical: 11 }, cancelText: { color: colors.muted, fontWeight: "800", writingDirection: "rtl" }, addTextButton: { alignItems: "center", backgroundColor: colors.green, borderRadius: 12, minWidth: 110, paddingVertical: 11 }, addTextButtonText: { color: colors.white, fontWeight: "800", writingDirection: "rtl" },
  surahModal: { backgroundColor: colors.paper, borderRadius: 25, maxHeight: "78%", padding: 18, width: "100%" }, surahModalHead: { alignItems: "center", flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 12 }, closeButton: { alignItems: "center", backgroundColor: colors.white, borderRadius: 12, height: 40, justifyContent: "center", width: 40 }, surahList: { gap: 7, paddingBottom: 4 }, surahOption: { alignItems: "center", backgroundColor: colors.white, borderColor: colors.line, borderRadius: 13, borderWidth: 1, flexDirection: "row-reverse", gap: 10, minHeight: 49, paddingHorizontal: 12 }, surahNumber: { alignItems: "center", backgroundColor: colors.paleGold, borderRadius: 12, color: colors.gold, fontSize: 12, fontWeight: "900", height: 25, lineHeight: 25, textAlign: "center", width: 25 }, surahOptionText: { color: colors.ink, flex: 1, fontSize: 15, fontWeight: "800", textAlign: "right", writingDirection: "rtl" }, weekModal: { backgroundColor: colors.paper, borderRadius: 22, gap: 10, padding: 20, width: "100%" }, weekModalHint: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: "right", writingDirection: "rtl" }, weekOption: { alignItems: "center", backgroundColor: colors.white, borderColor: "#E7D5A9", borderRadius: 13, borderWidth: 1, flexDirection: "row-reverse", justifyContent: "space-between", minHeight: 50, paddingHorizontal: 14 }, weekOptionText: { color: colors.ink, fontSize: 16, fontWeight: "900", writingDirection: "rtl" },
  themeModal: { backgroundColor: colors.paper, borderRadius: 25, gap: 10, maxHeight: "78%", padding: 18, width: "100%" }, customThemeModal: { backgroundColor: colors.paper, borderRadius: 25, gap: 13, maxHeight: "86%", padding: 18, width: "100%" }, themeHint: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: "right", writingDirection: "rtl" }, themeList: { gap: 9 }, themeOption: { alignItems: "center", backgroundColor: colors.white, borderColor: colors.line, borderRadius: 15, borderWidth: 1, flexDirection: "row-reverse", gap: 11, minHeight: 76, padding: 10 }, themePreview: { borderRadius: 12, borderWidth: 1, height: 54, justifyContent: "center", overflow: "hidden", padding: 8, width: 60 }, themePreviewTitle: { borderRadius: 5, height: 12, marginBottom: 6, width: "74%" }, themePreviewLine: { borderRadius: 5, borderWidth: 1, height: 17, width: "100%" }, themeText: { flex: 1, gap: 3 }, themeName: { color: colors.ink, fontSize: 15, fontWeight: "900", textAlign: "right", writingDirection: "rtl" }, themeDescription: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: "right", writingDirection: "rtl" }, customColorSection: { gap: 7 }, customColorHead: { alignItems: "center", flexDirection: "row-reverse", justifyContent: "space-between" }, customColorLabel: { color: colors.ink, fontSize: 14, fontWeight: "800", writingDirection: "rtl" }, customColorSample: { borderColor: colors.line, borderRadius: 10, borderWidth: 1, height: 28, width: 36 }, customColorPalette: { flexDirection: "row", gap: 8, paddingBottom: 2 }, customDoneButton: { alignItems: "center", backgroundColor: colors.green, borderRadius: 13, paddingVertical: 12 },
});
