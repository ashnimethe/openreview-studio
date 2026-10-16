export class MediaSeekError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaSeekError";
  }
}

type SeekableMedia = Pick<
  HTMLMediaElement,
  | "currentTime"
  | "duration"
  | "readyState"
  | "seeking"
  | "addEventListener"
  | "removeEventListener"
>;

function waitForMetadata(
  media: SeekableMedia,
  timeoutMs: number,
  signal?: AbortSignal,
) {
  if (media.readyState >= 1) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(
      () =>
        finish(
          new MediaSeekError(
            "Video metadata did not become available in time.",
          ),
        ),
      timeoutMs,
    );
    function finish(error?: Error) {
      window.clearTimeout(timer);
      media.removeEventListener("loadedmetadata", onLoaded);
      media.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve();
    }
    const onLoaded = () => finish();
    const onError = () =>
      finish(new MediaSeekError("The selected video could not load metadata."));
    const onAbort = () =>
      finish(
        new MediaSeekError(
          "The seek was cancelled because the source changed.",
        ),
      );
    if (signal?.aborted) {
      onAbort();
      return;
    }
    media.addEventListener("loadedmetadata", onLoaded, { once: true });
    media.addEventListener("error", onError, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Seeks without clamping review data; resolves only when the browser reports seek completion. */
export async function seekMediaTime(
  media: SeekableMedia,
  target: number,
  timeoutMs = 8000,
  signal?: AbortSignal,
) {
  if (!Number.isFinite(target) || target < 0)
    throw new MediaSeekError(
      "The requested timestamp must be a finite, non-negative time.",
    );
  await waitForMetadata(media, timeoutMs, signal);
  if (signal?.aborted)
    throw new MediaSeekError(
      "The seek was cancelled because the source changed.",
    );
  if (!Number.isFinite(media.duration) || media.duration < 0)
    throw new MediaSeekError("The video duration is unavailable.");
  if (target > media.duration)
    throw new MediaSeekError(
      "This timestamp is beyond the video's duration. The issue time was left unchanged.",
    );
  if (!media.seeking && Math.abs(media.currentTime - target) < 0.001)
    return media.currentTime;

  return new Promise<number>((resolve, reject) => {
    const timer = window.setTimeout(
      () =>
        finish(
          new MediaSeekError(
            "The browser did not finish seeking to this timestamp.",
          ),
        ),
      timeoutMs,
    );
    function finish(error?: Error, value?: number) {
      window.clearTimeout(timer);
      media.removeEventListener("seeked", onSeeked);
      media.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(value ?? media.currentTime);
    }
    const onSeeked = () => {
      if (Math.abs(media.currentTime - target) <= 0.25)
        finish(undefined, media.currentTime);
      else
        finish(
          new MediaSeekError(
            "The browser stopped at a different media time than requested.",
          ),
        );
    };
    const onError = () =>
      finish(new MediaSeekError("The video reported an error while seeking."));
    const onAbort = () =>
      finish(
        new MediaSeekError(
          "The seek was cancelled because the source changed.",
        ),
      );
    if (signal?.aborted) {
      onAbort();
      return;
    }
    media.addEventListener("seeked", onSeeked, { once: true });
    media.addEventListener("error", onError, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      media.currentTime = target;
      if (!media.seeking && Math.abs(media.currentTime - target) < 0.001)
        finish(undefined, media.currentTime);
    } catch (error) {
      finish(
        new MediaSeekError(
          error instanceof Error
            ? error.message
            : "The browser rejected the seek.",
        ),
      );
    }
  });
}
