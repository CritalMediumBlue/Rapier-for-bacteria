import { CHAMBER, Point, RGB } from "./model.js";
import type { Simulation } from "./simulation.js";

export type RenderStyle = "simple" | "diagnostic";
export const RENDER_STYLES: RenderStyle[] = ["simple", "diagnostic"];

export const VIEW = { minX: -55, maxX: 55, minY: 133, maxY: 205 };
export interface ViewRect { minX: number; maxX: number; minY: number; maxY: number; }

const CHAMBER_BOX = { minX: -50, maxX: 50, minY: 140, maxY: 200 };

export interface RenderOptions {
  style: RenderStyle;
  radius: number;
  view?: ViewRect;
  overlaps?: { i: Int32Array, j: Int32Array, depth: Float64Array, count: number };
  targetDepth?: number;
}

export class ChamberRenderer {
  private n = 0;
  private x = new Float64Array(0); private y = new Float64Array(0);
  private ux = new Float64Array(0); private uy = new Float64Array(0);
  private region = new Uint8Array(0);
  private regionColors: RGB[] = [];
  private readonly collect = (x: number, y: number, angle: number, length: number, color: RGB): void => {
    const k = this.n++;
    const h = length / 2;
    this.x[k] = x; this.y[k] = y;
    this.ux[k] = -Math.sin(angle) * h; this.uy[k] = Math.cos(angle) * h;
    let r = this.regionColors.indexOf(color);
    if (r < 0) { r = this.regionColors.length; this.regionColors.push(color); }
    this.region[k] = r;
  };

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  public draw(sim: Simulation, options: RenderOptions): void {
    const ctx = this.ctx, canvas = ctx.canvas;
    this.gather(sim);

    const v = options.view ?? VIEW;
    const scale = Math.min(canvas.width / (v.maxX - v.minX), canvas.height / (v.maxY - v.minY));
    const cx = (v.minX + v.maxX) / 2, cy = (v.minY + v.maxY) / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.setTransform(scale, 0, 0, -scale, canvas.width / 2 - cx * scale, canvas.height / 2 + cy * scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (options.style) {
      case "simple": this.drawSimple(sim, scale, options.radius); break;
      case "diagnostic": this.drawDiagnostic(sim, scale, options); break;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawSimple(sim: Simulation, scale: number, radius: number): void {
    const ctx = this.ctx;
    this.clear("#ffffff");
    this.strokeWalls("#000000", 1.5 / scale, 0);
    this.strokeTriangles("#000000", 1 / scale);
    const line = 1 / scale;
    this.strokeCells(null, "#303030", 2 * radius);
    this.strokeCells(null, "#ffffff", Math.max(0, 2 * radius - 2 * line));
    const marker = 5 / scale;
    ctx.beginPath();
    sim.forEachAnchor((x, y, cell: Point | null) => {
      if (!cell) { return; }
      ctx.moveTo(x, y); ctx.lineTo(cell.x, cell.y);
      ctx.rect(x - marker / 2, y - marker / 2, marker, marker);
    });
    ctx.strokeStyle = ctx.fillStyle = "#d02020";
    ctx.lineWidth = line;
    ctx.stroke();
    ctx.fill();
  }

  private drawDiagnostic(sim: Simulation, scale: number, options: RenderOptions): void {
    const ctx = this.ctx;
    const radius = options.radius;
    this.clear("#ffffff");
    this.fillPdms("#dfe6df");
    this.strokeWalls("#333", 2 / scale, 0);
    for (let r = 0; r < this.regionColors.length; r++) {
      const c = this.regionColors[r];
      this.strokeCells((k) => this.region[k] === r, `rgb(${255 * c.r},${255 * c.g},${255 * c.b})`, 2 * radius);
    }
    this.outlineCells(radius, "rgba(0,0,0,0.75)", 1 / scale);

    const o = options.overlaps;
    if (o) {
      for (const red of [false, true]) {
        ctx.beginPath();
        for (let p = 0; p < o.count; p++) {
          if ((o.depth[p] > (options.targetDepth ?? Infinity)) !== red) { continue; }
          for (const k of [o.i[p], o.j[p]]) {
            ctx.moveTo(this.x[k] - this.ux[k], this.y[k] - this.uy[k]);
            ctx.lineTo(this.x[k] + this.ux[k], this.y[k] + this.uy[k]);
          }
        }
        ctx.strokeStyle = red ? "#e00000" : "#ff9900";
        ctx.lineWidth = red ? 0.45 : 0.2;
        ctx.stroke();
      }
    }

    ctx.beginPath();
    sim.forEachAnchor((x, y, cell: Point | null) => {
      if (cell) { ctx.moveTo(x, y); ctx.lineTo(cell.x, cell.y); }
    });
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 1 / scale;
    ctx.stroke();
    ctx.fillStyle = "#000";
    const marker = 5 / scale;
    sim.forEachAnchor((x, y) => { ctx.fillRect(x - marker / 2, y - marker / 2, marker, marker); });
  }

  private gather(sim: Simulation): void {
    const n = sim.cellCount;
    if (this.x.length < n) {
      const m = Math.max(n, 2 * this.x.length, 1024);
      this.x = new Float64Array(m); this.y = new Float64Array(m);
      this.ux = new Float64Array(m); this.uy = new Float64Array(m);
      this.region = new Uint8Array(m);
    }
    this.n = 0;
    sim.forEachCell(this.collect);
  }

  private strokeCells(select: ((k: number) => boolean) | null, style: string, width: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let k = 0; k < this.n; k++) {
      if (select && !select(k)) { continue; }
      const ux = this.ux[k], uy = this.uy[k];
      ctx.moveTo(this.x[k] - ux, this.y[k] - uy);
      ctx.lineTo(this.x[k] + ux, this.y[k] + uy);
    }
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  private outlineCells(radius: number, style: string, width: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let k = 0; k < this.n; k++) {
      const x = this.x[k], y = this.y[k], ux = this.ux[k], uy = this.uy[k];
      const theta = Math.atan2(uy, ux);
      ctx.moveTo(x + ux + radius * Math.cos(theta - Math.PI / 2), y + uy + radius * Math.sin(theta - Math.PI / 2));
      ctx.arc(x + ux, y + uy, radius, theta - Math.PI / 2, theta + Math.PI / 2);
      ctx.arc(x - ux, y - uy, radius, theta + Math.PI / 2, theta + 3 * Math.PI / 2);
      ctx.closePath();
    }
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  private clear(color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.fillRect(VIEW.minX - 10, VIEW.minY - 10, VIEW.maxX - VIEW.minX + 20, VIEW.maxY - VIEW.minY + 20);
  }

  private fillPdms(color: string): void {
    const ctx = this.ctx, B = CHAMBER_BOX, far = 20;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.rect(VIEW.minX - far, B.minY, B.minX - VIEW.minX + far, VIEW.maxY - B.minY + far);
    ctx.rect(B.maxX, B.minY, VIEW.maxX - B.maxX + far, VIEW.maxY - B.minY + far);
    ctx.rect(B.minX, B.maxY, B.maxX - B.minX, VIEW.maxY - B.maxY + far);
    for (const t of CHAMBER.triangles) {
      const [a, b, c] = t.vertices;
      ctx.moveTo(a.x + t.offset.x, a.y + t.offset.y);
      ctx.lineTo(b.x + t.offset.x, b.y + t.offset.y);
      ctx.lineTo(c.x + t.offset.x, c.y + t.offset.y);
      ctx.closePath();
    }
    ctx.fill();
  }

  private strokeWalls(style: string, width: number, inset: number): void {
    const ctx = this.ctx, B = CHAMBER_BOX;
    ctx.beginPath();
    ctx.moveTo(VIEW.minX - 20, B.minY - inset);
    ctx.lineTo(B.minX + inset, B.minY - inset);
    ctx.lineTo(B.minX + inset, B.maxY - inset);
    ctx.lineTo(B.maxX - inset, B.maxY - inset);
    ctx.lineTo(B.maxX - inset, B.minY - inset);
    ctx.lineTo(VIEW.maxX + 20, B.minY - inset);
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  private strokeTriangles(style: string, width: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    for (const t of CHAMBER.triangles) {
      const [a, b, c] = t.vertices;
      ctx.moveTo(a.x + t.offset.x, a.y + t.offset.y);
      ctx.lineTo(b.x + t.offset.x, b.y + t.offset.y);
      ctx.lineTo(c.x + t.offset.x, c.y + t.offset.y);
      ctx.closePath();
    }
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}
