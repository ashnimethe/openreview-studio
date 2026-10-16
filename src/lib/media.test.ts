import { describe, expect, it } from "vitest";
import { MediaSeekError, seekMediaTime } from "./media";

class FakeMedia extends EventTarget {
  readyState = 1;
  duration = 30;
  seeking = false;
  private time = 0;
  get currentTime() {
    return this.time;
  }
  set currentTime(value: number) {
    this.seeking = true;
    queueMicrotask(() => {
      this.time = value;
      this.seeking = false;
      this.dispatchEvent(new Event("seeked"));
    });
  }
}

describe("media timestamp seeking", () => {
  it("waits until a seeked event and returns the browser media time", async () => {
    const media = new FakeMedia();
    await expect(seekMediaTime(media, 12.5)).resolves.toBe(12.5);
  });
  it("rejects invalid or out-of-duration timestamps without changing them", async () => {
    const media = new FakeMedia();
    await expect(seekMediaTime(media, -1)).rejects.toBeInstanceOf(
      MediaSeekError,
    );
    await expect(seekMediaTime(media, 31)).rejects.toThrow(
      "beyond the video's duration",
    );
    expect(media.currentTime).toBe(0);
  });
  it("waits for metadata before checking the duration", async () => {
    const media = new FakeMedia();
    media.readyState = 0;
    const seeking = seekMediaTime(media, 3, 1000);
    media.readyState = 1;
    queueMicrotask(() => media.dispatchEvent(new Event("loadedmetadata")));
    await expect(seeking).resolves.toBe(3);
  });
  it("cancels a pending seek when the source changes", async () => {
    const media = new FakeMedia();
    media.readyState = 0;
    const controller = new AbortController();
    const seeking = seekMediaTime(media, 3, 1000, controller.signal);
    controller.abort();
    await expect(seeking).rejects.toThrow(
      "cancelled because the source changed",
    );
  });
});
