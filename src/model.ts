export const DEFAULT_PARAMS = {
	hertz: 60,
	substeps: 1,
	solverIterations: 8,
	pgsIterations: 1,
	contactFrequency: 720,
	refreshContacts: 1,
	rebuildInterval: 10000,

	minX: -50, maxX: 50,
	minY: 140, maxY: 200,

	initialCells: 1000,
	minSize: 2.4, maxSize: 4.8,

	growthInterval: 25,
	growthGroups: 5,
	rate: 0.002 * 0.8,
	wallRate: 0.002 * 0.8,
	wallZone: 20,
	reproductionProportionMin: 0.3,
	reproductionProportionRange: 0.2,
	reproductiveLengthMean: 4.8,
	reproductiveLengthSpread: 2.0,
	centredDivision: 1,
	randomDeathProbability: 0.001 * 0.15,

	airResistance: 0.007 * 0.8 ** 2,
	angularAirResistance: 0.007 * 0.8 ** 4,
	continuousDrag: 1,
	dragClamp: 1,

	anchorProbability: 0.001,
	anchorFrequencyHz: 0.8,
	anchorDampingRatio: 0.3,
	anchorLifetimeSteps: 12000,
	anchorMaxStretch: 4,

	radius: 0.4,
	density: 0.0001,
	restitution: 0.0,

	snapshotInterval: 300,
};

export type SimulationParams = typeof DEFAULT_PARAMS & { seed: number };

export function checkParams(p: SimulationParams): void {
	if (!Number.isInteger(p.growthInterval) || p.growthInterval < 1) {
		throw new Error(`growthInterval must be a positive integer (got ${p.growthInterval})`);
	}
	if (!Number.isInteger(p.snapshotInterval) || p.snapshotInterval < 1 || p.snapshotInterval % p.growthInterval !== 0) {
		throw new Error(`snapshotInterval must be a positive multiple of growthInterval (${p.growthInterval}); got ${p.snapshotInterval}`);
	}
	if (!Number.isInteger(p.growthGroups) || p.growthGroups < 1 || p.growthInterval % p.growthGroups !== 0) {
		throw new Error(`growthGroups must be a positive integer that divides growthInterval (${p.growthInterval}); got ${p.growthGroups}`);
	}
	if (!Number.isInteger(p.substeps) || p.substeps < 1) {
		throw new Error(`substeps must be a positive integer (got ${p.substeps})`);
	}
}

export interface Point { x: number; y: number; }

export interface Triangle { offset: Point; vertices: [Point, Point, Point]; }

function triangleRows(count: number, step: Point, ...vertexSets: [Point, Point, Point][]): Triangle[] {
	const rows: Triangle[] = [];
	for (let i = 0; i < count; i++) {
		for (const vertices of vertexSets) { rows.push({ offset: { x: i * step.x, y: i * step.y }, vertices }); }
	}
	return rows;
}

const RIGHT_WALL_TRIANGLE: [Point, Point, Point] = [{ x: 50, y: 140 }, { x: 50, y: 142 }, { x: 49, y: 141 }];
const LEFT_WALL_TRIANGLE: [Point, Point, Point] = [{ x: -50, y: 140 }, { x: -50, y: 142 }, { x: -49, y: 141 }];
const TOP_WALL_TRIANGLE: [Point, Point, Point] = [{ x: -50, y: 200 }, { x: -48, y: 200 }, { x: -49, y: 199 }];

export const CHAMBER = {
	triangles: [
		...triangleRows(12, { x: 0, y: 5 }, RIGHT_WALL_TRIANGLE, LEFT_WALL_TRIANGLE),
		...triangleRows(20, { x: 5, y: 0 }, TOP_WALL_TRIANGLE),
	],
	edges: [
		[{ x: -50, y: 200 }, { x: 50, y: 200 }],
		[{ x: 50, y: 200 }, { x: 50, y: 140 }],
		[{ x: -50, y: 200 }, { x: -50, y: 140 }],
	] as [Point, Point][],
	friction: 0.2,
};

export interface RGB { r: number; g: number; b: number; }
export const COLOR_INITIAL: RGB = { r: 0.3, g: 0.35, b: 0.3 };
export const COLOR_WALL: RGB = { r: 0.1, g: 0.8, b: 0.18 };
export const COLOR_CENTRE: RGB = { r: 0.8, g: 0.1, b: 0.6 };

export const DRAG_APPLICATIONS_PER_CELL = 3;

export function dragFraction(coefficient: number, massOrInertia: number, dt: number, clamp: boolean): number {
	const fraction = DRAG_APPLICATIONS_PER_CELL * coefficient * dt / massOrInertia;
	return clamp && fraction > 1 ? 1 : fraction;
}

export function continuousDampingRate(coefficient: number, massOrInertia: number, growthInterval: number): number {
	return DRAG_APPLICATIONS_PER_CELL * coefficient / (growthInterval * massOrInertia);
}

export function cellMassProperties(length: number, radius: number, density: number): { mass: number, inertia: number } {
	const a = radius, b = length / 2;
	const boxMass = density * 4 * a * b;
	const capMass = density * Math.PI * a * a;
	const boxInertia = boxMass * ((2 * a) ** 2 + (2 * b) ** 2) / 12;
	const capInertia = capMass * (0.5 * a * a + b * b);
	return { mass: boxMass + 2 * capMass, inertia: boxInertia + 2 * capInertia };
}

export function orientationOf(angle: number): number {
	return angle > 0 ? (angle / Math.PI) % 1 : 1 + (angle / Math.PI) % 1;
}
