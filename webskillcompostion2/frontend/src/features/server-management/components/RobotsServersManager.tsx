import type {
  ApplicationController,
  ApplicationSnapshot,
} from '../../../app/model/applicationController';
import RobotManager from './RobotManager';
import ServerManager from './ServerManager';

export interface RobotsServersManagerProps {
  controller: ApplicationController;
  snapshot: ApplicationSnapshot;
}

export default function RobotsServersManager({
  controller,
  snapshot,
}: RobotsServersManagerProps) {
  return (
    <div className="flex flex-col overflow-y-auto h-full w-full space-y-2">
      <ServerManager controller={controller} snapshot={snapshot} />
      <RobotManager controller={controller} snapshot={snapshot} />
    </div>
  );
}
