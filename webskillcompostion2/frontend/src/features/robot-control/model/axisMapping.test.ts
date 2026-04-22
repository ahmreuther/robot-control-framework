import { describe, expect, it } from 'vitest';

import type { Robot } from '../../../entities/robot/model/types';
import {
  buildAxisToJointMap,
  mapAxisValuesToJointAngles,
  mapRobotJointStateToVisualAngles,
  normalizeJointValue,
  sortAxisNames,
  unitNeedsDegreeToRadianConversion,
} from './axisMapping';

describe('axis mapping', () => {
  it('sorts common OPC UA axis names numerically', () => {
    expect(sortAxisNames(['Axis_10', 'Axis_2', 'Axis_1'])).toEqual([
      'Axis_1',
      'Axis_2',
      'Axis_10',
    ]);
    expect(sortAxisNames(['Axis2', 'Axis1'])).toEqual(['Axis1', 'Axis2']);
  });

  it('builds a stable axis-to-joint mapping by sorted axis order', () => {
    expect(buildAxisToJointMap(['Axis_2', 'Axis_1'], ['joint_a', 'joint_b'])).toEqual({
      Axis_1: 'joint_a',
      Axis_2: 'joint_b',
    });
  });

  it('maps axis values into ordered joint angles and fills missing joints with zero', () => {
    const mapped = mapAxisValuesToJointAngles(
      {
        axisValues: {
          Axis_2: 0.2,
          Axis_1: 0.1,
        },
        unit: 'rad',
      },
      ['joint_1', 'joint_2', 'joint_3'],
    );

    expect(mapped.axisToJointName).toEqual({
      Axis_1: 'joint_1',
      Axis_2: 'joint_2',
    });
    expect(mapped.angles).toEqual([0.1, 0.2, 0]);
  });

  it('uses an explicit mapping when one already exists', () => {
    const mapped = mapAxisValuesToJointAngles(
      {
        axisValues: {
          Axis_1: 0.4,
          Axis_2: 0.8,
        },
      },
      ['elbow', 'shoulder'],
      {
        Axis_1: 'shoulder',
        Axis_2: 'elbow',
      },
    );

    expect(mapped.angles).toEqual([0.8, 0.4]);
  });

  it('keeps radians by default and converts explicit degree units', () => {
    expect(normalizeJointValue(Math.PI, null)).toBe(Math.PI);
    expect(normalizeJointValue(Math.PI, 'C81')).toBe(Math.PI);
    expect(normalizeJointValue(180, 'deg')).toBe(Math.PI);
    expect(unitNeedsDegreeToRadianConversion({ displayName: 'degree' })).toBe(true);
  });

  it('maps the live demo server EVA axis shape to the EVA URDF revolute joint order', () => {
    const mapped = mapAxisValuesToJointAngles(
      {
        axisValues: {
          Axis_1: 0.1,
          Axis_2: 0.2,
          Axis_3: 0.3,
          Axis_4: 0.4,
          Axis_5: 0.5,
          Axis_6: 0.6,
        },
        unit: 'C81',
      },
      ['joint_1', 'joint_2', 'joint_3', 'joint_4', 'joint_5', 'joint_6'],
    );

    expect(mapped.axisToJointName).toEqual({
      Axis_1: 'joint_1',
      Axis_2: 'joint_2',
      Axis_3: 'joint_3',
      Axis_4: 'joint_4',
      Axis_5: 'joint_5',
      Axis_6: 'joint_6',
    });
    expect(mapped.angles).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
  });

  it('maps a full robot visual binding', () => {
    const robot: Robot = {
      robotId: 'robot-a',
      serverUrl: 'opc.tcp://127.0.0.1:4840',
      displayName: 'Robot A',
      motionDevice: { nodeId: 'ns=4;s=robot-a' },
      info: {},
      opcua: { variables: {}, methods: {}, axes: {} },
      status: 'connected',
      joints: {
        axisValues: {
          Axis1: 0.5,
          Axis2: 1,
        },
        unit: 'rad',
      },
      mode: null,
      visual: {
        orderedUrdfJointNames: ['joint_1', 'joint_2'],
        axisToJointName: {},
      },
    };

    expect(mapRobotJointStateToVisualAngles(robot).angles).toEqual([0.5, 1]);
  });
});
