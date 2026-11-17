import RAPIER from "@dimforge/rapier2d-simd-compat";
import type { Collider, ColliderDesc, ImpulseJoint, RigidBody, World } from "@dimforge/rapier2d-simd-compat";
import {
  CHAMBER, COLOR_CENTRE, COLOR_INITIAL, COLOR_WALL, DEFAULT_PARAMS, Point, RGB,
  SimulationParams, cellMassProperties, checkParams, continuousDampingRate, dragFraction, orientationOf,
} from "./model.js";
import { Rng, mulberry32, randomSeed } from "./rng.js";
import { CellState, StateRecorder } from "./states.js";

let initialised: Promise<void> | null = null;

export function initRapier(): Promise<void> {
  if (!initialised) { initialised = RAPIER.init(); }
  return initialised;
}

export function rapierVersion(): string {
  return RAPIER.version();
}

interface Cell {
  id: number;
  body: RigidBody;
  collider: Collider;
  sqrtFriction: number;
  flipped: boolean;
  mass: number;
  inertia: number;
  length: number;
  growthRate: number;
  phase: number;
  reproductiveLength: number;
  color: RGB;
  anchors: Anchor[];
  removed: boolean;
}

interface Anchor {
  body: RigidBody;
  x: number;
  y: number;
  createdAtStep: number;
  cell: Cell | null;
  joint: ImpulseJoint | null;
  stiffness: number;
  damping: number;
}

const WALL_THICKNESS = 2;

export class Simulation {
  public readonly params: SimulationParams;
  public world: World;
  public readonly states: StateRecorder = new StateRecorder();
  public stepCount: number = 0;

  private readonly rng: Rng;
  private nextId: number = 1;
  private cells: Cell[] = [];
  private anchors: Anchor[] = [];
  private readonly zero = { x: 0, y: 0 };

  public static async create(overrides: Partial<SimulationParams> = {}): Promise<Simulation> {
    await initRapier();
    return new Simulation(overrides);
  }

  constructor(overrides: Partial<SimulationParams> = {}) {
    this.params = { ...DEFAULT_PARAMS, seed: randomSeed(), ...overrides };
    const p = this.params;
    checkParams(p);
    this.rng = mulberry32(p.seed);
    this.world = this.createWorld();

    for (let i = 0; i < p.initialCells; ++i) {
      const x = this.rng() * (p.maxX - p.minX) + p.minX;
      const y = this.rng() * (p.maxY - p.minY) + p.minY;
      const angle = this.rng() * 2 * Math.PI;
      const size = 0.2 * this.rng() * (p.maxSize - p.minSize) + p.minSize;
      this.cells.push(this.createCell(x, y, angle, size, COLOR_INITIAL, 0, i % p.growthGroups));
    }
    this.createWalls();
  }

  public get cellCount(): number {
    return this.cells.length;
  }

  public forEachCell(fn: (x: number, y: number, angle: number, length: number, color: RGB, id: number) => void): void {
    for (const cell of this.cells) {
      const t = cell.body.translation();
      fn(t.x, t.y, cell.body.rotation(), cell.length, cell.color, cell.id);
    }
  }

  public forEachAnchor(fn: (x: number, y: number, cell: Point | null) => void): void {
    for (const anchor of this.anchors) {
      fn(anchor.x, anchor.y, anchor.cell ? anchor.cell.body.translation() : null);
    }
  }

  public step(): boolean {
    const p = this.params;
    for (let i = 0; i < p.substeps; i++) { this.world.step(); }
    this.stepCount += 1;
    const offset = this.stepCount % p.growthInterval;
    const spacing = p.growthInterval / p.growthGroups;

    if (offset % spacing === 0 && this.growDivideAndMark(offset / spacing)) { this.removeMarkedCells(); }

    if (offset === 0) { this.removeAnchors(); }

    if (p.refreshContacts === 1 && p.rebuildInterval > 0 && this.stepCount % p.rebuildInterval === 0) {
      this.rebuildWorld();
    }

    if (this.stepCount % p.snapshotInterval === 0) {
      this.takeSnapshot();
      return true;
    }
    return false;
  }

  private createWorld(): World {
    const p = this.params;
    const world = new RAPIER.World({ x: 0, y: 0 });
    world.timestep = 1 / (p.hertz * p.substeps);
    world.numSolverIterations = p.solverIterations;
    world.numInternalPgsIterations = p.pgsIterations;
    if (p.contactFrequency > 0) {
      world.integrationParameters.contact_natural_frequency = p.contactFrequency;
    }
    return world;
  }

  private rebuildWorld(): void {
    const old = this.world;
    this.world = this.createWorld();
    for (const cell of this.cells) {
      const t = cell.body.translation(), v = cell.body.linvel();
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(t.x, t.y)
        .setRotation(cell.body.rotation())
        .setLinvel(v.x, v.y)
        .setAngvel(cell.body.angvel())
        .setCanSleep(false)
        .setLinearDamping(this.linearDamping(cell.mass))
        .setAngularDamping(this.angularDamping(cell.inertia))
        .setAdditionalMassProperties(cell.mass, this.zero, cell.inertia));
      cell.body = body;
      cell.collider = this.world.createCollider(this.cellColliderDesc(cell.length, cell.sqrtFriction)
        .setRotation(cell.flipped ? Math.PI : 0), body);
    }
    this.createWalls();
    for (const anchor of this.anchors) {
      anchor.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(anchor.x, anchor.y));
      if (anchor.cell) {
        const data = RAPIER.JointData.spring(0, anchor.stiffness, anchor.damping, this.zero, this.zero);
        anchor.joint = this.world.createImpulseJoint(data, anchor.cell.body, anchor.body, true);
      }
    }
    old.free();
  }

  private removeMarkedCells(): void {
    let kept = 0;
    for (const cell of this.cells) {
      if (cell.removed) {
        this.detachAnchors(cell, false);
        this.world.removeRigidBody(cell.body);
      } else {
        this.cells[kept++] = cell;
      }
    }
    this.cells.length = kept;
  }

  private removeAnchors(): void {
    const p = this.params;
    let kept = 0;
    for (const anchor of this.anchors) {
      if (this.stepCount - anchor.createdAtStep >= p.anchorLifetimeSteps || this.overStretched(anchor)) {
        if (anchor.cell) { anchor.cell.anchors.splice(anchor.cell.anchors.indexOf(anchor), 1); }
        this.world.removeRigidBody(anchor.body);
      } else {
        this.anchors[kept++] = anchor;
      }
    }
    this.anchors.length = kept;
  }

  private linearDamping(mass: number): number {
    const p = this.params;
    return p.continuousDrag !== 0 ? continuousDampingRate(p.airResistance, mass, p.growthInterval) : 0;
  }

  private angularDamping(inertia: number): number {
    const p = this.params;
    return p.continuousDrag !== 0 ? continuousDampingRate(p.angularAirResistance, inertia, p.growthInterval) : 0;
  }

  private overStretched(anchor: Anchor): boolean {
    const max = this.params.anchorMaxStretch;
    if (max <= 0 || !anchor.cell) { return false; }
    const t = anchor.cell.body.translation();
    return Math.hypot(t.x - anchor.x, t.y - anchor.y) > max;
  }

  private growDivideAndMark(phase: number): boolean {
    const p = this.params;
    const dt = 1 / p.hertz;
    const kick = p.continuousDrag === 0;
    let marked = false;
    const count = this.cells.length;
    for (let i = 0; i < count; i++) {
      const cell = this.cells[i];
      if (cell.phase !== phase) { continue; }
      const body = cell.body;

      cell.length *= cell.growthRate;
      this.resizeCollider(cell);

      if (kick) {
        const v = body.linvel();
        const linear = -dragFraction(p.airResistance, cell.mass, dt, p.dragClamp !== 0) * cell.mass;
        body.applyImpulse({ x: linear * v.x, y: linear * v.y }, true);
        body.applyTorqueImpulse(-dragFraction(p.angularAirResistance, cell.inertia, dt, p.dragClamp !== 0) * cell.inertia * body.angvel(), true);
      }

      const length = cell.length;
      const position = body.translation();
      const angle = body.rotation();
      let divided = false;

      if (length >= cell.reproductiveLength) {
        const a = p.radius;
        const proportion = p.reproductionProportionMin + this.rng() * p.reproductionProportionRange;
        const lengthA = (length - (2 * a)) * proportion;
        const lengthB = (length - (2 * a)) * (1 - proportion);
        const factorA = p.centredDivision ? length / 2 - lengthB / 2 : proportion * (1 / 2) * length + (a / 2);
        const factorB = p.centredDivision ? length / 2 - lengthA / 2 : (1 - proportion) * (1 / 2) * length + (a / 2);
        const sin = Math.sin(angle), cos = Math.cos(angle);
        const x1 = position.x + factorB * sin, y1 = position.y - factorB * cos;
        const x2 = position.x - factorA * sin, y2 = position.y + factorA * cos;

        const color = cell.color;
        const parentId = cell.id;
        this.detachAnchors(cell, true);
        this.resetCell(cell, x1, y1, angle, lengthA, color, parentId);
        this.cells.push(this.createCell(x2, y2, angle, lengthB, color, parentId, cell.phase));
        divided = true;
      }

      if (position.x < p.minX || position.x > p.maxX || position.y < p.minY || position.y > p.maxY || this.rng() < p.randomDeathProbability) {
        if (!divided) { cell.removed = true; marked = true; }
      }

      if (position.x < p.minX + p.wallZone || position.x > p.maxX - p.wallZone) {
        if (!divided) {
          cell.color = COLOR_WALL;
          cell.growthRate = 1 + p.wallRate;
        }
        if (this.rng() < p.anchorProbability) {
          this.createAnchor(position.x, position.y, divided || cell.removed ? null : cell);
        }
      } else if (!divided) {
        cell.color = COLOR_CENTRE;
        cell.growthRate = 1 + p.rate;
      }
    }
    return marked;
  }

  private takeSnapshot(): void {
    const cells: CellState[] = [];
    for (const cell of this.cells) {
      const t = cell.body.translation();
      cells.push({ x: t.x, y: t.y, id: cell.id, an: orientationOf(cell.body.rotation()), le: cell.length });
    }
    this.states.addSnapshot(cells);
  }

  private createCell(x: number, y: number, angle: number, length: number, color: RGB, parentId: number, phase: number): Cell {
    const p = this.params;
    const friction = this.rng();
    const reproductiveLength = p.reproductiveLengthMean + (this.rng() - 0.5) * p.reproductiveLengthSpread;
    const { mass, inertia } = cellMassProperties(length, p.radius, p.density);
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y)
      .setRotation(angle)
      .setCanSleep(false)
      .setLinearDamping(this.linearDamping(mass))
      .setAngularDamping(this.angularDamping(inertia))
      .setAdditionalMassProperties(mass, this.zero, inertia));
    const sqrtFriction = Math.sqrt(friction);
    const collider = this.world.createCollider(this.cellColliderDesc(length, sqrtFriction), body);
    const id = this.nextId++;
    this.states.addLineage(id, parentId);
    return {
      id, body, collider, sqrtFriction, flipped: false, mass, inertia, length, color, reproductiveLength,
      growthRate: 1 + p.rate, phase, anchors: [], removed: false,
    };
  }

  private cellColliderDesc(length: number, sqrtFriction: number): ColliderDesc {
    const p = this.params;
    return RAPIER.ColliderDesc.capsule(length / 2, p.radius)
      .setDensity(0)
      .setFriction(sqrtFriction)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
      .setRestitution(p.restitution)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max);
  }

  private resizeCollider(cell: Cell): void {
    switch (this.params.refreshContacts) {
      case 1:
        this.world.removeCollider(cell.collider, false);
        cell.collider = this.world.createCollider(this.cellColliderDesc(cell.length, cell.sqrtFriction), cell.body);
        break;
      case 2:
        cell.collider.setHalfHeight(cell.length / 2);
        cell.flipped = !cell.flipped;
        cell.collider.setRotationWrtParent(cell.flipped ? Math.PI : 0);
        break;
      default:
        cell.collider.setHalfHeight(cell.length / 2);
    }
  }

  private resetCell(cell: Cell, x: number, y: number, angle: number, length: number, color: RGB, parentId: number): void {
    const p = this.params;
    const friction = this.rng();
    cell.reproductiveLength = p.reproductiveLengthMean + (this.rng() - 0.5) * p.reproductiveLengthSpread;
    const { mass, inertia } = cellMassProperties(length, p.radius, p.density);
    const body = cell.body;
    body.setTranslation({ x, y }, true);
    body.setRotation(angle, true);
    body.setLinvel(this.zero, true);
    body.setAngvel(0, true);
    body.setAdditionalMassProperties(mass, this.zero, inertia, true);
    if (p.continuousDrag !== 0) {
      body.setLinearDamping(this.linearDamping(mass));
      body.setAngularDamping(this.angularDamping(inertia));
    }
    cell.mass = mass;
    cell.inertia = inertia;
    cell.length = length;
    cell.sqrtFriction = Math.sqrt(friction);
    cell.collider.setFriction(cell.sqrtFriction);
    this.resizeCollider(cell);
    cell.color = color;
    cell.growthRate = 1 + p.rate;
    cell.id = this.nextId++;
    this.states.addLineage(cell.id, parentId);
  }

  private createAnchor(x: number, y: number, cell: Cell | null): void {
    const p = this.params;
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y));
    const anchor: Anchor = { body, x, y, createdAtStep: this.stepCount, cell, joint: null, stiffness: 0, damping: 0 };
    if (cell) {
      const mass = cell.body.mass();
      const omega = 2 * Math.PI * p.anchorFrequencyHz;
      anchor.stiffness = mass * omega * omega;
      anchor.damping = 2 * mass * p.anchorDampingRatio * omega;
      const data = RAPIER.JointData.spring(0, anchor.stiffness, anchor.damping, this.zero, this.zero);
      anchor.joint = this.world.createImpulseJoint(data, cell.body, body, true);
      cell.anchors.push(anchor);
    }
    this.anchors.push(anchor);
  }

  private detachAnchors(cell: Cell, removeJoints: boolean): void {
    for (const anchor of cell.anchors) {
      if (removeJoints && anchor.joint) { this.world.removeImpulseJoint(anchor.joint, true); }
      anchor.joint = null;
      anchor.cell = null;
    }
    cell.anchors.length = 0;
  }

  private createWalls(): void {
    const walls = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const add = (desc: ColliderDesc) => this.world.createCollider(desc
      .setFriction(Math.sqrt(CHAMBER.friction))
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max), walls);
    for (const [v1, v2] of CHAMBER.edges) {
      const cx = (v1.x + v2.x) / 2, cy = (v1.y + v2.y) / 2;
      const hx = Math.abs(v1.x - v2.x) / 2, hy = Math.abs(v1.y - v2.y) / 2;
      const t = WALL_THICKNESS / 2;
      if (hx === 0) {
        add(RAPIER.ColliderDesc.cuboid(t, hy).setTranslation(cx + Math.sign(cx) * t, cy));
      } else {
        add(RAPIER.ColliderDesc.cuboid(hx + 2 * t, t).setTranslation(cx, cy + t));
      }
    }
    for (const tri of CHAMBER.triangles) {
      const [a, b, c] = tri.vertices.map((v) => ({ x: v.x + tri.offset.x, y: v.y + tri.offset.y }));
      const clockwise = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y) < 0;
      add(clockwise ? RAPIER.ColliderDesc.triangle(a, c, b) : RAPIER.ColliderDesc.triangle(a, b, c));
    }
  }
}
