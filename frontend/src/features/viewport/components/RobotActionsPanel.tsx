import { useMemo, useState } from "react";

import { useAppFeedback } from "../../../app/context/AppFeedbackContext";
import type {
  Robot,
  RobotActionBinding,
} from "../../../entities/robot/model/types";
import { useRobotControl } from "../../robot-control/context/RobotControlContext";

interface RobotActionsPanelProps {
  robot: Robot | null;
}

function buildDefaultInputValue(action: RobotActionBinding): string {
  if (action.parameterNames.length === 0) {
    return "{}";
  }

  const defaults = Object.fromEntries(
    action.parameterNames.map((name) => [name, null]),
  );
  return JSON.stringify(defaults, null, 2);
}

export default function RobotActionsPanel({ robot }: RobotActionsPanelProps) {
  const feedback = useAppFeedback();
  const {
    executeRobotAction,
    haltRobotAction,
    motionDevices,
    resetRobotAction,
  } =
    useRobotControl();
  const [inputsByAction, setInputsByAction] = useState<Record<string, string>>(
    {},
  );

  const actions = useMemo(
    () =>
      robot?.actions
        ? Object.entries(robot.actions).sort(([left], [right]) =>
            left.localeCompare(right),
          )
        : [],
    [robot?.actions],
  );
  const debugCounts = useMemo(
    () => ({
      actions: Object.keys(robot?.actions ?? {}).length,
      skills: Object.keys(robot?.opcua.skills ?? {}).length,
      methods: Object.keys(robot?.opcua.methods ?? {}).length,
    }),
    [robot?.actions, robot?.opcua.methods, robot?.opcua.skills],
  );
  const rawSkillNames = useMemo(
    () => Object.keys(robot?.opcua.skills ?? {}).sort(),
    [robot?.opcua.skills],
  );
  const rawMethodNames = useMemo(
    () => Object.keys(robot?.opcua.methods ?? {}).sort(),
    [robot?.opcua.methods],
  );
  const boundMotionDevice = useMemo(() => {
    if (!robot?.motionDeviceId) {
      return null;
    }
    return (
      motionDevices.find(
        (motionDevice) => motionDevice.robotId === robot.motionDeviceId,
      ) ?? null
    );
  }, [motionDevices, robot?.motionDeviceId]);
  const boundMotionDeviceCounts = useMemo(
    () => ({
      actions: Object.keys(boundMotionDevice?.actions ?? {}).length,
      skills: Object.keys(boundMotionDevice?.opcua.skills ?? {}).length,
      methods: Object.keys(boundMotionDevice?.opcua.methods ?? {}).length,
    }),
    [boundMotionDevice],
  );

  if (!robot) {
    return null;
  }

  const currentActionStateEntries = Object.entries(robot.actionStates ?? {});

  return (
    <section className="panel pointer-events-auto w-[320px] text-xs shadow-md">
      <header className="panel-header">
        <div className="panel-title">Actions</div>
        <div className="text-[10px] text-[rgb(var(--fg-muted))]">
          {robot.displayName}
        </div>
      </header>
      <div className="panel-body flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
        <div className="border border-[rgb(var(--panel-border)/0.1)] px-2 py-2 text-[10px] text-[rgb(var(--fg-muted))]">
          <div>motionDeviceId: {robot.motionDeviceId ?? "offline"}</div>
          <div>
            actions: {debugCounts.actions} · skills: {debugCounts.skills} ·
            methods: {debugCounts.methods}
          </div>
          {boundMotionDevice ? (
            <div className="mt-1">
              bound motion device {"->"} actions: {boundMotionDeviceCounts.actions} ·
              skills: {boundMotionDeviceCounts.skills} · methods:{" "}
              {boundMotionDeviceCounts.methods}
            </div>
          ) : null}
          {rawSkillNames.length > 0 ? (
            <div className="mt-1 break-words">
              skills: {rawSkillNames.join(", ")}
            </div>
          ) : null}
          {rawMethodNames.length > 0 ? (
            <div className="mt-1 break-words">
              methods: {rawMethodNames.join(", ")}
            </div>
          ) : null}
        </div>
        {actions.length === 0 ? (
          <div className="text-[rgb(var(--fg-muted))]">
            No discovered actions for this robot.
          </div>
        ) : (
          actions.map(([actionName, action]) => {
            const currentState =
              robot.actionStates[actionName] ?? null;
            const inputValue =
              inputsByAction[actionName] ?? buildDefaultInputValue(action);

            return (
              <section
                key={actionName}
                className="border border-[rgb(var(--panel-border)/0.1)] px-2 py-2"
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-[rgb(var(--fg))]">
                      {actionName}
                    </div>
                    <div className="text-[10px] text-[rgb(var(--fg-muted))]">
                      {action.kind} · {action.targetName}
                    </div>
                  </div>
                  <div className="text-right text-[10px]">
                    <div className="text-[rgb(var(--fg-muted))]">State</div>
                    <div className="text-[rgb(var(--fg))]">
                      {currentState?.currentState ??
                        currentState?.status ??
                        "idle"}
                    </div>
                  </div>
                </div>

                {action.parameterNames.length > 0 ? (
                  <>
                    <div className="mb-1 text-[10px] text-[rgb(var(--fg-muted))]">
                      Params: {action.parameterNames.join(", ")}
                    </div>
                    <textarea
                      className="input-ghost mb-2 min-h-24 w-full resize-y"
                      value={inputValue}
                      onChange={(event) =>
                        setInputsByAction((current) => ({
                          ...current,
                          [actionName]: event.target.value,
                        }))
                      }
                      spellCheck={false}
                    />
                  </>
                ) : null}

                <div className="grid grid-cols-3 gap-1">
                  <button
                    className="button-ghost"
                    onClick={() => {
                      try {
                        const parsed =
                          inputValue.trim() === ""
                            ? {}
                            : JSON.parse(inputValue);
                        if (
                          parsed === null ||
                          typeof parsed !== "object" ||
                          Array.isArray(parsed)
                        ) {
                          throw new Error("Action inputs must be a JSON object.");
                        }
                        executeRobotAction(
                          robot.robotId,
                          actionName,
                          parsed as Record<string, unknown>,
                        );
                      } catch (error) {
                        feedback.showError(`Failed to execute ${actionName}`, {
                          description:
                            error instanceof Error
                              ? error.message
                              : "Invalid action input payload.",
                        });
                      }
                    }}
                  >
                    Execute
                  </button>
                  <button
                    className="button-ghost"
                    disabled={!action.haltNodeId}
                    onClick={() => haltRobotAction(robot.robotId, actionName)}
                  >
                    Halt
                  </button>
                  <button
                    className="button-ghost"
                    disabled={!action.resetNodeId}
                    onClick={() => resetRobotAction(robot.robotId, actionName)}
                  >
                    Reset
                  </button>
                </div>
              </section>
            );
          })
        )}

        {currentActionStateEntries.length > 0 ? (
          <div className="border-t border-[rgb(var(--panel-border)/0.1)] pt-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--fg-muted))]">
              Runtime
            </div>
            <div className="flex flex-col gap-1">
              {currentActionStateEntries.map(([actionName, state]) => (
                <div
                  key={actionName}
                  className="flex items-center justify-between gap-2 text-[10px]"
                >
                  <span className="text-[rgb(var(--fg))]">{actionName}</span>
                  <span className="text-[rgb(var(--fg-muted))]">
                    {state.currentState ?? state.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
