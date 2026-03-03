import {
  ASpaceWindow,
  AddressSpaceServerTabs,
  MessageLog,
} from '../../features/address-space/components';
import { JointAnglesPanel, Viewport } from '../../features/robot-control/components';
import { RobotsServersManager } from '../../features/server-management/components';
import Settings from './Settings';
import MobilePanelControls from './MobilePanelControls';
import type { MobileControlsProps, WorkspaceLayoutProps } from './types';

type MobileLayoutProps = WorkspaceLayoutProps & MobileControlsProps;

export function MobileLayout(props: MobileLayoutProps) {
  return (
    <div className="px-2 py-2">
      <div className="flex items-center justify-between mb-2 z-50">
        <img
          src={props.logoSrc}
          alt="PLCM logo"
          className="h-10 w-auto bg-gray-200 rounded-sm p-1"
        />
        <Settings settings={props.settings} toggleSettings={props.toggleSettings} />
        <MobilePanelControls
          className="flex items-center gap-2"
          mobilePanelState={props.mobilePanelState}
          setMobilePanelState={props.setMobilePanelState}
          showClose={true}
        />
      </div>

      <div>
        {props.mobilePanelState === 'main' && (
          <div className="h-full gap-2 flex flex-col">
            <div className="w-full h-[60vh]">
              <Viewport
                key={props.reloadKey}
                urdfPath={props.selectedRobot?.url ?? null}
                jointManager={props.jointManager}
                onJointLimitsLoaded={props.onJointLimitsLoaded}
                showCollisionMesh={props.showCollisionMesh}
                setHoveredJointMesh={props.setHoveredJointMesh}
                effectComposer={props.settings.effectComposer}
                environment={props.settings.environment}
                pendingJoints={props.pendingJoints}
                setPendingJoints={props.setPendingJoints}
              />
            </div>
            <div className="w-full z-50 max-h-[30vh] overflow-auto">
              <JointAnglesPanel
                jointManager={props.jointManager}
                jointProperties={props.jointProperties}
                showCollisionMesh={props.showCollisionMesh}
                setShowCollisionMesh={props.setShowCollisionMesh}
                reloadKey={props.reloadKey}
                hoveredJointMesh={props.hoveredJointMesh}
                setPendingJoints={props.setPendingJoints}
              />
            </div>
          </div>
        )}

        {props.mobilePanelState === 'side' && (
          <div className="flex flex-col gap-4">
            <RobotsServersManager
              servers={props.servers}
              robots={props.robots}
              jointManager={props.jointManager}
              addServer={props.addServer}
              removeServer={props.removeServer}
              addRobot={props.addRobot}
              removeRobot={props.removeRobot}
              connectRobotToServer={props.connectRobotToServer}
              disconnectRobot={props.disconnectRobot}
              onSelectURDF={props.onSelectURDF}
            />
          </div>
        )}

        {props.mobilePanelState === 'bot' && (
          <div>
            <header className="panel-header">
              <div className="flex items-center gap-4">
                <div className="panel-title">Servers:</div>
                <AddressSpaceServerTabs
                  servers={props.servers}
                  activeServerId={props.activeASpaceServerId}
                  onSelectServer={props.setActiveASpaceServerId}
                />
              </div>
            </header>
            <div className="flex flex-col gap-2 h-[80vh]">
              <div className="flex-1 min-h-0 ml-2">
                <ASpaceWindow key={props.activeASpaceServerId ?? 'none'} />
              </div>
              <div className="flex-1 min-h-0">
                <MessageLog />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
