import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

const LAST_BACKUP_KEY = "quran_school_last_backup_at";
const BACKUP_MIME = "application/json";

function backupFilename() {
  const stamp = new Date().toISOString().slice(0, 10);
  return `quran-school-backup-${stamp}.json`;
}

export async function getLastBackupAt() {
  return AsyncStorage.getItem(LAST_BACKUP_KEY);
}

export async function exportBackupFile(data: unknown) {
  const filename = backupFilename();
  const content = JSON.stringify(data, null, 2);
  if (Platform.OS === "web") {
    const blob = new Blob([content], { type: BACKUP_MIME });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  } else {
    const uri = `${FileSystem.documentDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
    if (!(await Sharing.isAvailableAsync())) throw new Error("لا تتوفر مشاركة الملفات على هذا الجهاز");
    await Sharing.shareAsync(uri, { dialogTitle: "احفظ نسخة المدرسة القرآنية", mimeType: BACKUP_MIME });
  }
  const exportedAt = new Date().toISOString();
  await AsyncStorage.setItem(LAST_BACKUP_KEY, exportedAt);
  return { filename, exportedAt };
}

export async function pickBackupFile() {
  const result = await DocumentPicker.getDocumentAsync({ type: BACKUP_MIME, copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const content = Platform.OS === "web" && asset.file ? await asset.file.text() : await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error("هذا الملف ليس نسخة احتياطية صالحة بصيغة JSON");
  }
}
