import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

// Giving the user a file or text the app made (CSV, PDF, QR image, a bill).
// On the phone the Android WebView has no downloads, no window.print and no
// navigator.share, so files are written with the Filesystem plugin and handed
// to the share sheet, or saved into Documents/BillerPe. In a browser they are
// normal downloads.

export const canShareFiles = () => Capacitor.isNativePlatform();

/** Text (CSV) or binary (PDF, PNG) file content. */
export type FileContent = string | Uint8Array | Blob;

function download(name: string, content: FileContent, mime: string) {
  const blob = content instanceof Blob ? content : new Blob([content as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function base64(content: Uint8Array | Blob): Promise<string> {
  const bytes = content instanceof Blob ? new Uint8Array(await content.arrayBuffer()) : content;
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function write(path: string, content: FileContent, directory: Directory) {
  // Text goes in as UTF-8; binary as base64 (no encoding = base64 for the plugin).
  const { uri } =
    typeof content === "string"
      ? await Filesystem.writeFile({
          path,
          data: content,
          directory,
          encoding: Encoding.UTF8,
          recursive: true,
        })
      : await Filesystem.writeFile({
          path,
          data: await base64(content),
          directory,
          recursive: true,
        });
  return uri;
}

/** Share sheet (WhatsApp, Drive, e-mail, Files...) on the phone; a download in a browser. */
export async function shareFile(name: string, content: FileContent, mime = "text/csv") {
  if (!Capacitor.isNativePlatform()) return download(name, content, mime);
  const uri = await write(name, content, Directory.Cache);
  await Share.share({ title: name, files: [uri], dialogTitle: `Share ${name}` });
}

/** Saved into the phone's Documents/BillerPe folder; returns where. A download in a browser. */
export async function saveFile(
  name: string,
  content: FileContent,
  mime = "text/csv",
): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    download(name, content, mime);
    return "Downloads";
  }
  // Android 9 and older need the storage permission for Documents.
  const perm = await Filesystem.checkPermissions().catch(() => null);
  if (perm && perm.publicStorage !== "granted") {
    const asked = await Filesystem.requestPermissions();
    if (asked.publicStorage !== "granted") throw new Error("Storage permission was not given");
  }
  await write(`BillerPe/${name}`, content, Directory.Documents);
  return `Documents/BillerPe/${name}`;
}

/**
 * Plain text to another app (WhatsApp, SMS...): the Android share sheet on the
 * phone, the browser's share sheet where there is one. Returns false when
 * nothing could share it (the caller then copies it).
 */
export async function shareTextOut(title: string, text: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    await Share.share({ title, text, dialogTitle: title });
    return true;
  }
  if (navigator.share) {
    await navigator.share({ title, text });
    return true;
  }
  return false;
}

/** True when the user closed the share sheet (not an error to show). */
export const isShareCancel = (e: unknown) =>
  /cancel|abort/i.test(e instanceof Error ? `${e.name} ${e.message}` : String(e));
