import { showHUD, showToast, Toast } from "@raycast/api";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const FINDER_RED_LABEL_INDEX = 2;

function toPercent(current: number, total: number) {
  if (total <= 0) {
    return 100;
  }

  return Math.round((current / total) * 100);
}

function escapeAppleScriptString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function setFinderRedTag(filePath: string) {
  const escapedPath = escapeAppleScriptString(filePath);
  const script = `tell application "Finder" to set label index of (POSIX file "${escapedPath}" as alias) to ${FINDER_RED_LABEL_INDEX}`;
  await execFileAsync("osascript", ["-e", script]);
}

export default async function main() {
  const progressToast = await showToast({
    style: Toast.Style.Animated,
    title: "Scanning Downloads",
    message: "0%",
  });

  const downloadsPath = join(homedir(), "Downloads");
  const now = Date.now();
  const threshold = now - TWO_DAYS_MS;

  const entries = await readdir(downloadsPath, { withFileTypes: true });
  const filesToTag: string[] = [];
  let scanned = 0;

  for (const entry of entries) {
    scanned += 1;
    progressToast.title = "Scanning Downloads";
    progressToast.message = `${toPercent(scanned, entries.length)}% (${scanned}/${entries.length})`;

    if (!entry.isFile()) {
      continue;
    }

    const fullPath = join(downloadsPath, entry.name);

    try {
      const fileStat = await stat(fullPath);
      if (fileStat.atimeMs < threshold) {
        filesToTag.push(fullPath);
      }
    } catch {
      // Ignore stat errors and continue with other files.
    }
  }

  if (filesToTag.length === 0) {
    progressToast.style = Toast.Style.Success;
    progressToast.title = "Scan complete";
    progressToast.message = "No files older than 2 days by atime";
    await showHUD("No files older than 2 days by atime");
    return;
  }

  const failedFiles: string[] = [];
  let tagged = 0;

  for (const filePath of filesToTag) {
    tagged += 1;
    progressToast.title = "Tagging outdated files";
    progressToast.message = `${toPercent(tagged, filesToTag.length)}% (${tagged}/${filesToTag.length})`;

    try {
      await setFinderRedTag(filePath);
    } catch {
      failedFiles.push(filePath);
    }
  }

  const succeeded = filesToTag.length - failedFiles.length;

  if (failedFiles.length > 0) {
    const sample = failedFiles
      .slice(0, 3)
      .map((path) => path.split("/").pop() ?? path)
      .join(", ");
    progressToast.style = Toast.Style.Failure;
    progressToast.title = `Tagged ${succeeded}/${filesToTag.length} files`;
    progressToast.message = sample ? `Failed: ${sample}${failedFiles.length > 3 ? ", ..." : ""}` : "Some files failed";
    await showToast({
      style: Toast.Style.Failure,
      title: `Tagged ${succeeded}/${filesToTag.length} files`,
      message: sample ? `Failed: ${sample}${failedFiles.length > 3 ? ", ..." : ""}` : "Some files failed",
    });
    return;
  }

  progressToast.style = Toast.Style.Success;
  progressToast.title = `Tagged ${succeeded} files with red label`;
  progressToast.message = "Completed";
  await showHUD(`Tagged ${succeeded} files with red label`);
}
