import type {
  RobotActionState,
  RobotJointState,
  RobotSessionInfo,
} from '../../entities/robot/model/types';
import type {
  AddressSpaceNode,
  AddressSpaceNodeDetails,
  AddressSpaceReference,
} from '../../entities/server/model/types';
import type { ServerSessionInfo } from '../../entities/server/model/types';

export type ClientMessage =
  | {
      type: 'connectServer';
      requestId: string;
      serverUrl: string;
    }
  | {
      type: 'disconnectServer';
      requestId: string;
      serverUrl: string;
    }
  | {
      type: 'discoverRobots';
      requestId: string;
      serverUrl: string;
    }
  | {
      type: 'subscribeRobotJoints' | 'unsubscribeRobotJoints';
      requestId: string;
      robotId: string;
    }
  | {
      type: 'subscribeRobotMode' | 'unsubscribeRobotMode';
      requestId: string;
      robotId: string;
    }
  | {
      type: 'callRobotMethod';
      requestId: string;
      robotId: string;
      method: string;
      inputs: Record<string, unknown>;
    }
  | {
      type: 'executeRobotAction';
      requestId: string;
      robotId: string;
      actionName: string;
      inputs: Record<string, unknown>;
    }
  | {
      type: 'haltRobotAction' | 'resetRobotAction';
      requestId: string;
      robotId: string;
      actionName: string;
    }
  | {
      type: 'subscribeNode' | 'unsubscribeNode' | 'subscribeEvent' | 'unsubscribeEvent';
      requestId: string;
      serverUrl: string;
      nodeId: string;
    }
  | {
      type: 'callRawMethod';
      requestId: string;
      serverUrl: string;
      nodeId: string;
      inputs: Record<string, unknown>;
    }
  | {
      type: 'browseAddressSpaceRoot';
      requestId: string;
      serverUrl: string;
    }
  | {
      type: 'browseAddressSpaceChildren';
      requestId: string;
      serverUrl: string;
      nodeId: string;
    }
  | {
      type: 'browseAddressSpaceReferences';
      requestId: string;
      serverUrl: string;
      nodeId: string;
    }
  | {
      type: 'browseAddressSpaceNodeDetails';
      requestId: string;
      serverUrl: string;
      nodeId: string;
    };

export type ServerMessage =
  | {
      type: 'serverConnected';
      requestId?: string | null;
      server: ServerSessionInfo;
    }
  | {
      type: 'serverDisconnected';
      requestId?: string | null;
      serverUrl: string;
    }
  | {
      type: 'robotsDiscovered';
      requestId?: string | null;
      serverUrl: string;
      robots: RobotSessionInfo[];
    }
  | {
      type: 'robotInfo';
      requestId?: string | null;
      serverUrl: string;
      robotId: string;
      robot: RobotSessionInfo;
    }
  | {
      type: 'robotJointState';
      serverUrl: string;
      robotId: string;
      data: RobotJointState;
    }
  | {
      type: 'robotModeChanged';
      serverUrl: string;
      robotId: string;
      mode: string;
    }
  | {
      type: 'robotActionState';
      requestId?: string | null;
      serverUrl: string;
      robotId: string;
      data: RobotActionState;
    }
  | {
      type: 'methodResult';
      requestId?: string | null;
      serverUrl: string;
      robotId?: string | null;
      nodeId?: string | null;
      result: unknown;
    }
  | {
      type: 'nodeValueChanged';
      serverUrl: string;
      nodeId: string;
      value: unknown;
      robotId?: string | null;
    }
  | {
      type: 'opcuaEvent';
      serverUrl: string;
      nodeId: string;
      event: unknown;
    }
  | {
      type: 'error';
      requestId?: string | null;
      serverUrl?: string | null;
      robotId?: string | null;
      message: string;
      code?: string | null;
    }
  | {
      type: 'addressSpaceRoot';
      requestId?: string | null;
      serverUrl: string;
      nodes: AddressSpaceNode[];
    }
  | {
      type: 'addressSpaceChildren';
      requestId?: string | null;
      serverUrl: string;
      nodeId: string;
      nodes: AddressSpaceNode[];
    }
  | {
      type: 'addressSpaceReferences';
      requestId?: string | null;
      serverUrl: string;
      nodeId: string;
      references: AddressSpaceReference[];
    }
  | {
      type: 'addressSpaceNodeDetails';
      requestId?: string | null;
      serverUrl: string;
      nodeId: string;
      details: AddressSpaceNodeDetails;
    };
