import type { Robot, RobotJointState } from '../../../entities/robot/model/types';

const DEGREE_UNITS = new Set(['deg', 'degree', 'degrees', '°']);

export interface AxisToJointMappingResult {
  axisToJointName: Record<string, string>;
  angles: number[];
}

export function mapVisualAnglesToAxisValues(
  angles: number[],
  orderedJointNames: string[],
  axisNames: string[],
  axisToJointName?: Record<string, string>,
): number[] {
  const mapping =
    axisToJointName && Object.keys(axisToJointName).length
      ? axisToJointName
      : buildAxisToJointMap(axisNames, orderedJointNames);
  const jointNameToIndex = Object.fromEntries(
    orderedJointNames.map((jointName, index) => [jointName, index]),
  );

  return sortAxisNames(axisNames).map((axisName) => {
    const jointName = mapping[axisName];
    if (!jointName) {
      return 0;
    }

    const jointIndex = jointNameToIndex[jointName];
    if (jointIndex === undefined) {
      return 0;
    }

    return angles[jointIndex] ?? 0;
  });
}

function trailingNumber(value: string): number {
  return Number.parseInt(value.match(/(\d+)$/)?.[1] ?? '0', 10);
}

export function sortAxisNames(axisNames: string[]): string[] {
  return [...axisNames].sort((left, right) => {
    const leftNumber = trailingNumber(left);
    const rightNumber = trailingNumber(right);
    if (leftNumber !== rightNumber) return leftNumber - rightNumber;
    return left.localeCompare(right);
  });
}

export function buildAxisToJointMap(
  axisNames: string[],
  orderedJointNames: string[],
): Record<string, string> {
  const sortedAxisNames = sortAxisNames(axisNames);
  const count = Math.min(sortedAxisNames.length, orderedJointNames.length);
  const mapping: Record<string, string> = {};

  for (let index = 0; index < count; index += 1) {
    const axisName = sortedAxisNames[index];
    const jointName = orderedJointNames[index];
    if (!axisName || !jointName) continue;
    mapping[axisName] = jointName;
  }

  return mapping;
}

export function unitNeedsDegreeToRadianConversion(unit: RobotJointState['unit']): boolean {
  if (!unit) return false;
  if (typeof unit === 'string') {
    return DEGREE_UNITS.has(unit.trim());
  }

  const displayName = unit.displayName;
  const description = unit.description;
  const unitId = unit.unitId;
  return [displayName, description, unitId].some(
    (value) => typeof value === 'string' && DEGREE_UNITS.has(value.trim()),
  );
}

export function normalizeJointValue(value: number, unit: RobotJointState['unit']): number {
  if (!Number.isFinite(value)) return 0;
  if (unitNeedsDegreeToRadianConversion(unit)) {
    return (value * Math.PI) / 180;
  }
  return value;
}

export function mapAxisValuesToJointAngles(
  jointState: RobotJointState,
  orderedJointNames: string[],
  axisToJointName?: Record<string, string>,
): AxisToJointMappingResult {
  const mapping =
    axisToJointName && Object.keys(axisToJointName).length
      ? axisToJointName
      : buildAxisToJointMap(Object.keys(jointState.axisValues), orderedJointNames);
  const jointNameToIndex = Object.fromEntries(
    orderedJointNames.map((jointName, index) => [jointName, index]),
  );
  const angles = orderedJointNames.map(() => 0);

  for (const [axisName, value] of Object.entries(jointState.axisValues)) {
    const jointName = mapping[axisName];
    if (!jointName) continue;

    const jointIndex = jointNameToIndex[jointName];
    if (jointIndex === undefined) continue;

    angles[jointIndex] = normalizeJointValue(value, jointState.unit);
  }

  return { axisToJointName: mapping, angles };
}

export function mapRobotJointStateToVisualAngles(robot: Robot): AxisToJointMappingResult {
  // Live axis mapping follows the articulated visual order, not the full manager/home joint list.
  return mapAxisValuesToJointAngles(
    robot.joints,
    robot.visual.orderedUrdfJointNames,
    robot.visual.axisToJointName,
  );
}
