import { useEffect, useMemo, useRef, useState } from "react";

import { useAppFeedback } from "../../../app/context/AppFeedbackContext";
import { DisclosureSection } from "../../../shared/ui/DisclosureSection";
import { Toggle } from "../../../shared/ui/Toggle";
import { useRobotControl } from "../context/RobotControlContext";
import RobotActionsPanel from "./RobotActionsPanel";
import RobotDetails from "./RobotDetails";

export interface RobotManagerProps {
  serverUrl?: string;
  embedded?: boolean;
}

export default function RobotManager({
  serverUrl,
  embedded = false,
}: RobotManagerProps) {
  const feedback = useAppFeedback();
  const {
    robots,
    activeRobotId,
    isSyncing,
    selectRobot,
    startRobotSync,
    stopRobotSync,
    setRobotTakeControl,
    motionDevices,
  } = useRobotControl();
  const [openSectionsByRobotId, setOpenSectionsByRobotId] = useState<
    Record<string, { details: boolean }>
  >({});
  const shownMissingUrdfErrorsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const robot of robots) {
      if (
        robot.visual.urdfUrl ||
        shownMissingUrdfErrorsRef.current.has(robot.robotId)
      ) {
        continue;
      }
      shownMissingUrdfErrorsRef.current.add(robot.robotId);
      feedback.showError(`No URDF mapping for ${robot.displayName}`, {
        description:
          "This motion device was discovered, but no supported URDF model mapping could be resolved.",
      });
    }
  }, [feedback, robots]);

  const robotsByDisplayName = useMemo(
    () =>
      [...robots]
        .filter((robot) => (serverUrl ? robot.serverUrl === serverUrl : true))
        .sort((left, right) =>
          left.displayName.localeCompare(right.displayName),
        ),
    [robots, serverUrl],
  );

  function toggleSection(robotId: string, section: "details") {
    setOpenSectionsByRobotId((current) => ({
      ...current,
      [robotId]: {
        details: !(current[robotId]?.[section] ?? false),
      },
    }));
  }

  function handleToggleSync(robotId: string) {
    if (isSyncing(robotId)) {
      stopRobotSync(robotId);
      return;
    }
    startRobotSync(robotId);
  }

  async function handleToggleTakeControl(robotId: string, enabled: boolean) {
    try {
      await setRobotTakeControl(robotId, enabled);
    } catch (error) {
      feedback.showError(
        enabled ? "Failed to take control" : "Failed to release control",
        {
          description:
            error instanceof Error
              ? error.message
              : "Robot control request failed.",
        },
      );
    }
  }

  return (
    <section className={embedded ? "" : "panel"}>
      {!embedded ? (
        <header className="panel-header">
          <div className="panel-title">Motion Devices</div>
        </header>
      ) : null}
      <div
        className={
          embedded
            ? "flex flex-col gap-2 px-2 py-2"
            : "panel-body flex flex-col gap-2"
        }
      >
        {robotsByDisplayName.length === 0 ? (
          <div className="text-xs text-[rgb(var(--fg-muted))]">
            No discovered motion devices.
          </div>
        ) : null}

        {robotsByDisplayName.map((robot) => {
          const isActive = activeRobotId === robot.robotId;
          const syncing = isSyncing(robot.robotId);
          const takeControlActive = robot.panel.takeControlActive;
          const detailsOpen =
            openSectionsByRobotId[robot.robotId]?.details ?? false;
          const motionDevice =
            motionDevices.find(
              (candidate) => candidate.robotId === robot.motionDeviceId,
            ) ?? null;

          return (
            <section key={robot.robotId} className="panel transition-colors">
              <div
                className={`panel-header cursor-pointer px-2 py-2 ${isActive ? "active" : ""}`}
                onClick={() => selectRobot(robot.robotId)}
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold tracking-wider">
                    {robot.displayName}
                  </div>
                </div>
              </div>
              <div className="panel-body flex flex-col gap-2">
                <div className="flex flex-col gap-2 text-xs">
                  <label className="flex items-center justify-between gap-3">
                    <span>Take Control</span>
                    <Toggle
                      checked={takeControlActive}
                      disabled={!isActive}
                      onChange={(checked) => {
                        void handleToggleTakeControl(robot.robotId, checked);
                      }}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3">
                    <span>Sync</span>
                    <Toggle
                      checked={syncing}
                      disabled={!isActive || !robot.visual.urdfUrl}
                      onChange={() => {
                        handleToggleSync(robot.robotId);
                      }}
                    />
                  </label>
                </div>

                {!robot.visual.urdfUrl ? (
                  <div className="px-1 py-1 text-[11px] text-[rgb(var(--warn))]">
                    No URDF mapping available for this motion device.
                  </div>
                ) : null}

                <DisclosureSection
                  title="Details"
                  open={detailsOpen}
                  onToggle={() => toggleSection(robot.robotId, "details")}
                  contentClassName="p-0 gap-0"
                >
                  <RobotDetails
                    robot={robot}
                    motionDevice={motionDevice}
                    syncing={syncing}
                  />
                </DisclosureSection>

                <RobotActionsPanel robot={robot} embedded />
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function shortServerName(serverUrl: string): string {
  return serverUrl.replace("opc.tcp://", "").replace("/freeopcua/server/", "");
}
