import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FfmpegCheckResult } from "../types";

export function useFfmpegCheck() {
  const [result, setResult] = useState<FfmpegCheckResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    invoke<FfmpegCheckResult>("check_ffmpeg")
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch(() => {
        if (!cancelled)
          setResult({ available: false, path: "", version: "" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { result, loading };
}
