export interface CellState {
  x: number;
  y: number;
  id: number;
  an: number;
  le: number;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export class StateRecorder {
  private readonly snapshotParts: string[] = [];
  private readonly lineage: number[] = [];
  private maxId: number = 0;

  public get snapshotCount(): number {
    return this.snapshotParts.length;
  }

  public get idCount(): number {
    return this.maxId;
  }

  public addLineage(childId: number, parentId: number): void {
    this.lineage[childId] = parentId;
    if (childId > this.maxId) { this.maxId = childId; }
  }

  public addSnapshot(cells: CellState[]): void {
    const sorted = cells.slice().sort((a, b) => a.id - b.id);
    const text = sorted.map((c) => JSON.stringify({
      x: round2(c.x),
      y: round2(c.y),
      id: c.id,
      an: round2(c.an),
      le: round2(c.le),
    })).join(",");
    this.snapshotParts.push(`"${this.snapshotParts.length + 1}":[${text}]`);
  }

  public toPieces(): string[] {
    const pieces: string[] = ["{"];
    this.snapshotParts.forEach((part, i) => {
      if (i > 0) { pieces.push(","); }
      pieces.push(part);
    });
    if (this.snapshotParts.length > 0) { pieces.push(","); }
    pieces.push(`"lineage":{`);
    const CHUNK = 10000;
    for (let start = 1; start <= this.maxId; start += CHUNK) {
      const entries: string[] = [];
      for (let id = start; id < start + CHUNK && id <= this.maxId; id++) {
        entries.push(`"${id}":${this.lineage[id]}`);
      }
      pieces.push((start > 1 ? "," : "") + entries.join(","));
    }
    pieces.push("}}");
    return pieces;
  }
}
