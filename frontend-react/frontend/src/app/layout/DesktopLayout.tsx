import { Group, Panel } from 'react-resizable-panels';

import {
  ASpaceWindow,
  AddressSpaceServerTabs,
  MessageLog,
} from '../../features/address-space/components';
import { JointAnglesPanel, Viewport } from '../../features/robot-control/components';
import { RobotsServersManager } from '../../features/server-management/components';
import Settings from './Settings';
import type { WorkspaceLayoutProps } from '../types';

export function DesktopLayout(props: WorkspaceLayoutProps) {
  return (
    <Group orientation="vertical">
      <header className="panel-header flex">
        <img
          src={props.logoSrc}
          alt="PLCM logo"
          className="h-10 w-auto bg-gray-200 rounded-sm p-1"
        />
        <div className="panel-title text-sm">Digital Twin Robots</div>
        <Settings settings={props.settings} toggleSettings={props.toggleSettings} />
      </header>

      <Group>
        <Panel defaultSize={'85%'}>
          <Group orientation="vertical">
            <Panel>
              <Group>
                <Panel>
                  <JointAnglesPanel
                    jointManager={props.jointManager}
                    jointProperties={props.jointProperties}
                    showCollisionMesh={props.showCollisionMesh}
                    setShowCollisionMesh={props.setShowCollisionMesh}
                    reloadKey={props.reloadKey}
                    hoveredJointMesh={props.hoveredJointMesh}
                    setPendingJoints={props.setPendingJoints}
                    workspaceResolution={props.workspaceResolution}
                    setWorkspaceResolution={props.setWorkspaceResolution}
                    showWorkspace={props.showWorkspace}
                    setShowWorkspace={props.setShowWorkspace}
                    hasWorkspace={props.workspacePoints.length > 0}
                    isGeneratingWorkspace={props.isGeneratingWorkspace}
                    workspaceProgress={props.workspaceProgress}
                    onGenerateWorkspace={props.onGenerateWorkspace}
                    onCancelWorkspace={props.onCancelWorkspace}
                  />
                </Panel>
                <Panel defaultSize={'85%'}>
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
                    workspacePoints={props.workspacePoints}
                    showWorkspace={props.showWorkspace}
                    onRobotReady={props.onRobotReady}
                  />
                </Panel>
              </Group>
            </Panel>

            <Panel defaultSize={'35%'}>
              <div className="panel flex flex-col h-full">
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
                <div className="panel-body flex-1 overflow-auto">
                  <Group>
                    <Panel defaultSize={'70%'}>
                      <ASpaceWindow key={props.activeASpaceServerId ?? 'none'} />
                    </Panel>
                    <Panel>
                      <MessageLog />
                    </Panel>
                  </Group>
                </div>
              </div>
            </Panel>
          </Group>
        </Panel>

        <Panel>
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
        </Panel>
      </Group>
    </Group>
  );
}
