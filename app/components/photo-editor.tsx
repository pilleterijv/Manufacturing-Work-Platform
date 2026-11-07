"use client";
import { useEffect, useRef, useState } from "react";
export default function PhotoEditor({
  src,
  onSave,
  onCancel,
}: {
  src: string;
  onSave: (image: string) => Promise<void>;
  onCancel: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    drawing = useRef(false),
    last = useRef<{ x: number; y: number } | null>(null);
  const [tool, setTool] = useState("draw"),
    [color, setColor] = useState("#ff2020"),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const history = useRef<ImageData[]>([]);
  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      const c = canvas.current;
      if (!c) return;
      const ratio = Math.min(1, 1600 / image.width, 1600 / image.height);
      c.width = Math.round(image.width * ratio);
      c.height = Math.round(image.height * ratio);
      c.getContext("2d")!.drawImage(image, 0, 0, c.width, c.height);
      history.current = [];
    };
    image.onerror = () => setError("Unable to load this image");
    image.src = src;
  }, [src]);
  function remember() {
    const c = canvas.current!;
    history.current.push(
      c.getContext("2d")!.getImageData(0, 0, c.width, c.height),
    );
    if (history.current.length > 10) history.current.shift();
  }
  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvas.current!,
      r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * c.width) / r.width,
      y: ((e.clientY - r.top) * c.height) / r.height,
    };
  }
  function rotate() {
    remember();
    const c = canvas.current!,
      copy = document.createElement("canvas");
    copy.width = c.width;
    copy.height = c.height;
    copy.getContext("2d")!.drawImage(c, 0, 0);
    c.width = copy.height;
    c.height = copy.width;
    const ctx = c.getContext("2d")!;
    ctx.translate(c.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(copy, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  return (
    <section className="panel">
      <h3>Edit photo</h3>
      <p className="small muted">
        Draw to highlight an issue, add text, rotate, or drag a crop rectangle.
        Save creates a new image.
      </p>
      <div className="button-row">
        <select
          aria-label="Photo tool"
          value={tool}
          onChange={(e) => setTool(e.target.value)}
        >
          <option value="draw">Draw</option>
          <option value="text">Place text</option>
          <option value="crop">Drag to crop</option>
        </select>
        <input
          aria-label="Markup color"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
        {tool === "text" && (
          <input
            aria-label="Photo annotation"
            placeholder="Annotation"
            value={text}
            maxLength={120}
            onChange={(e) => setText(e.target.value)}
          />
        )}
        <button type="button" onClick={rotate}>
          Rotate
        </button>
        <button
          type="button"
          onClick={() => {
            const old = history.current.pop(),
              c = canvas.current!;
            if (old) {
              c.width = old.width;
              c.height = old.height;
              c.getContext("2d")!.putImageData(old, 0, 0);
            }
          }}
        >
          Undo
        </button>
      </div>
      <canvas
        ref={canvas}
        aria-label="Photo markup canvas"
        style={{
          maxWidth: "100%",
          maxHeight: "65vh",
          touchAction: "none",
          border: "1px solid #888",
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          remember();
          last.current = point(e);
          drawing.current = true;
          if (tool === "text") {
            const ctx = e.currentTarget.getContext("2d")!;
            ctx.fillStyle = color;
            ctx.font = "bold 32px sans-serif";
            ctx.fillText(text, last.current.x, last.current.y);
            drawing.current = false;
          }
        }}
        onPointerMove={(e) => {
          if (!drawing.current || tool !== "draw" || !last.current) return;
          const ctx = e.currentTarget.getContext("2d")!,
            p = point(e);
          ctx.strokeStyle = color;
          ctx.lineWidth = 6;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(last.current.x, last.current.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          last.current = p;
        }}
        onPointerUp={(e) => {
          if (drawing.current && tool === "crop" && last.current) {
            const c = e.currentTarget,
              p = point(e),
              x = Math.floor(Math.min(p.x, last.current.x)),
              y = Math.floor(Math.min(p.y, last.current.y)),
              w = Math.min(
                c.width - x,
                Math.floor(Math.abs(p.x - last.current.x)),
              ),
              h = Math.min(
                c.height - y,
                Math.floor(Math.abs(p.y - last.current.y)),
              );
            if (w > 10 && h > 10) {
              const image = c
                .getContext("2d")!
                .getImageData(Math.max(0, x), Math.max(0, y), w, h);
              c.width = w;
              c.height = h;
              c.getContext("2d")!.putImageData(image, 0, 0);
            }
          }
          drawing.current = false;
          last.current = null;
        }}
        onPointerCancel={() => {
          drawing.current = false;
          last.current = null;
        }}
      />
      {error && <p role="alert">{error}</p>}
      <div className="button-row">
        <button
          className="primary"
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onSave(canvas.current!.toDataURL("image/webp", 0.9));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Save edited photo"}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel editing
        </button>
      </div>
    </section>
  );
}
