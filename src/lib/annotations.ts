import type { Annotation } from "./model";

/** Creates a separate, local JPEG composite while leaving the source frame untouched. */
export async function renderAnnotatedFrame(
  screenshot: string,
  annotations: Annotation[],
) {
  const image = new Image();
  image.src = screenshot;
  if (!image.complete) {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("Captured frame could not be decoded."));
    });
  }
  if (!image.naturalWidth || !image.naturalHeight)
    throw new Error("Captured frame has no image dimensions.");

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("A canvas is unavailable for frame annotation export.");
  context.drawImage(image, 0, 0);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = Math.max(2, canvas.width * 0.006);

  for (const annotation of annotations) {
    const color = /^#[0-9a-fA-F]{6}$/.test(annotation.color)
      ? annotation.color
      : "#ff584f";
    const x = annotation.x * canvas.width;
    const y = annotation.y * canvas.height;
    const w = annotation.w * canvas.width;
    const h = annotation.h * canvas.height;
    context.strokeStyle = color;
    context.fillStyle = color;
    if (annotation.type === "rect") {
      context.strokeRect(x, y, w, h);
    } else if (annotation.type === "ellipse") {
      context.beginPath();
      context.ellipse(
        x + w / 2,
        y + h / 2,
        Math.abs(w / 2),
        Math.abs(h / 2),
        0,
        0,
        Math.PI * 2,
      );
      context.stroke();
    } else if (annotation.type === "arrow") {
      const endX = x + w;
      const endY = y + h;
      const angle = Math.atan2(h, w);
      const head = Math.max(8, canvas.width * 0.022);
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(endX, endY);
      context.moveTo(endX, endY);
      context.lineTo(
        endX - head * Math.cos(angle - Math.PI / 6),
        endY - head * Math.sin(angle - Math.PI / 6),
      );
      context.moveTo(endX, endY);
      context.lineTo(
        endX - head * Math.cos(angle + Math.PI / 6),
        endY - head * Math.sin(angle + Math.PI / 6),
      );
      context.stroke();
    } else {
      context.font = `700 ${Math.max(14, canvas.width * 0.035)}px system-ui, sans-serif`;
      context.textBaseline = "top";
      context.fillText(
        annotation.label || "Note",
        x,
        y,
        Math.max(1, w || canvas.width),
      );
    }
  }
  return canvas.toDataURL("image/jpeg", 0.88);
}
