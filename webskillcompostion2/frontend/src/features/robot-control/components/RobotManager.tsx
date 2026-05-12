import { useState } from "react";

import CreateRobot from "./CreateRobot";
import RobotDetails from "./RobotDetails";
import { useRobotControl } from "../context/RobotControlContext";

export default function RobotManager() {
  const {
    robots,
    activeRobotId,
    motionDevices,
    isSyncing,
    removeRobot,
    selectRobot,
    bindRobotToMotionDevice,
    startRobotSync,
    stopRobotSync,
  } = useRobotControl();
  const [robotsOpen, setRobotsOpen] = useState(true);
  const [openRobotIds, setOpenRobotIds] = useState<Record<string, boolean>>({});

  function handleSelectRobot(robotId: string) {
    selectRobot(robotId);
  }

  function handleToggleSync(robotId: string) {
    if (isSyncing(robotId)) {
      stopRobotSync(robotId);
      return;
    }

    startRobotSync(robotId);
  }

  function toggleRobotOpen(robotId: string) {
    setOpenRobotIds((current) => ({
      ...current,
      [robotId]: !current[robotId],
    }));
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <div className="panel-title">Robots</div>
        <div className="flex items-center gap-2">
          <CreateRobot />
          <button
            className="button-ghost"
            onClick={() => setRobotsOpen(!robotsOpen)}
            aria-expanded={robotsOpen}
          >
            {robotsOpen ? "▼" : "▶"}
          </button>
        </div>
      </header>
      {robotsOpen && (
        <div className="panel-body flex flex-col gap-2">
          {robots.length === 0 && (
            <div className="text-xs text-[rgb(var(--fg-muted))]">
              No robot instances.
            </div>
          )}

          {robots.map((robot) => {
            const isActive = activeRobotId === robot.robotId;
            const syncing = isSyncing(robot.robotId);
            const isOpen = !!openRobotIds[robot.robotId];
            const boundMotionDevice = robot.motionDeviceId
              ? (motionDevices.find(
                  (motionDevice) =>
                    motionDevice.robotId === robot.motionDeviceId,
                ) ?? null)
              : null;
            const canSync = boundMotionDevice !== null;

            return (
              <section
                className={`panel ${isActive ? "active" : ""}`}
                key={robot.robotId}
                onClick={() => handleSelectRobot(robot.robotId)}
              >
                <header className="panel-header px-2 py-1">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold tracking-wider">
                      {robot.displayName}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className={`button-ghost ${syncing ? "active" : ""}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleToggleSync(robot.robotId);
                      }}
                      disabled={!canSync}
                    >
                      Sync
                    </button>
                    <button
                      className="button-ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeRobot(robot.robotId);
                      }}
                    >
                      Remove
                    </button>
                    <button
                      className={`button-ghost ${isOpen ? "active" : ""}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleRobotOpen(robot.robotId);
                      }}
                    >
                      Details
                    </button>
                  </div>
                </header>

                <div className="panel-body flex flex-col gap-2 text-xs">
                  <select
                    className="select w-full"
                    value={robot.motionDeviceId ?? ""}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) =>
                      bindRobotToMotionDevice(
                        robot.robotId,
                        event.target.value || null,
                      )
                    }
                  >
                    <option value="">Offline</option>
                    {motionDevices.map((motionDevice) => (
                      <option
                        key={motionDevice.robotId}
                        value={motionDevice.robotId}
                      >
                        {motionDevice.displayName} (
                        {shortServerName(motionDevice.serverUrl)})
                      </option>
                    ))}
                  </select>

                  {isOpen && (
                    <RobotDetails
                      robot={robot}
                      motionDevice={boundMotionDevice}
                      syncing={syncing}
                    />
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

function shortServerName(serverUrl: string): string {
  return serverUrl.replace("opc.tcp://", "").replace("/freeopcua/server/", "");
}
