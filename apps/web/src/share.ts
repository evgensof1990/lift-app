/**
 * «Опубликовать в Instagram в одно касание»: подпись — в буфер обмена, фото — в системное меню «Поделиться»,
 * откуда пилот выбирает Instagram (лента или истории). API Meta не используется.
 * В APK — через плагины Capacitor (Share + Filesystem), в браузере телефона — через Web Share API.
 */
import { Capacitor } from "@capacitor/core";
import type { FileInfo } from "./api";

export type ShareResult = "shared" | "copied-only";

async function copy(text: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* в старых WebView буфер недоступен — текст останется в карточке поста */
  }
}

function toBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function shareToInstagram(text: string, photos: FileInfo[]): Promise<ShareResult> {
  await copy(text);
  const blobs = await Promise.all(photos.map(async (f) => ({ f, blob: await (await fetch(f.url)).blob() })));

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const files: string[] = [];
    for (const [i, { f, blob }] of blobs.entries()) {
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const saved = await Filesystem.writeFile({ path: `lift-share-${Date.now()}-${i}.${ext}`, data: await toBase64(blob), directory: Directory.Cache });
      files.push(saved.uri);
    }
    await Share.share({ title: "Instagram", text, files: files.length ? files : undefined, dialogTitle: "Выберите Instagram" });
    return "shared";
  }

  const files = blobs.map(({ f, blob }) => new File([blob], f.name, { type: f.mime }));
  if (files.length && navigator.canShare?.({ files })) {
    await navigator.share({ files, text });
    return "shared";
  }
  return "copied-only";
}
