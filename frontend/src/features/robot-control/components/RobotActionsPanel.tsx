import { useMemo, useState } from "react";

import { useAppFeedback } from "../../../app/context/AppFeedbackContext";
import type {
  Robot,
  RobotActionBinding,
} from "../../../entities/robot/model/types";
import { useRobotControl } from "../context/RobotControlContext";

interface RobotActionsPanelProps {
  robot: Robot | null;
  embedded?: boolean;
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

export default function RobotActionsPanel({
  robot,
  embedded = false,
}: RobotActionsPanelProps) {
  const feedback = useAppFeedback();
  const { executeRobotAction, haltRobotAction, resetRobotAction } = useRobotControl();
  const [inputsByAction, setInputsByAction] = useState<Record<string, string>>({});
  const [openActionName, setOpenActionName] = useState<string | null>(null);

  const actions = useMemo(
    () =>
      robot?.actions
        ? Object.entries(robot.actions).sort(([left], [right]) =>
            left.localeCompare(right),
          )
        : [],
    [robot?.actions],
  );
  if (!robot) {
    return null;
  }

  const currentActionStateEntries = Object.entries(robot.actionStates ?? {});
  const containerClass = embedded
    ? "flex flex-col text-xs"
    : "panel pointer-events-auto w-[320px] text-xs shadow-md";

  return (
    <section className={containerClass}>
      {!embedded ? (
        <header className="panel-header">
          <div className="panel-title">Actions</div>
          <div className="text-[10px] text-[rgb(var(--fg-muted))]">
            {robot.displayName}
          </div>
        </header>
      ) : null}
      <div
        className={
          embedded
            ? "flex flex-col"
            : "panel-body flex max-h-[60vh] flex-col gap-2 overflow-y-auto"
        }
      >
        {actions.length === 0 ? (
          <div className="px-2 py-2 text-[rgb(var(--fg-muted))]">
            No discovered actions for this robot.
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-[rgb(var(--panel-border)/0.1)]">
            {actions.map(([actionName, action]) => {
              const currentState = robot.actionStates[actionName] ?? null;
              const stateLabel =
                currentState?.currentState ?? currentState?.status ?? "idle";
              const isSkill = action.kind === "skill";
              const inputValue =
                inputsByAction[actionName] ?? buildDefaultInputValue(action);
              const isOpen = openActionName === actionName;

              return (
                <section key={actionName} className="py-2">
                  <div className="flex items-center justify-between gap-2 px-2">
                    <button
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      type="button"
                      onClick={() =>
                        setOpenActionName((current) =>
                          current === actionName ? null : actionName,
                        )
                      }
                    >
                      <span
                        className={`text-[10px] transition-transform ${
                          isOpen ? "rotate-90" : ""
                        }`}
                      >
                        ▶
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-[rgb(var(--fg))]">
                          {actionName}
                        </div>
                        <div className="truncate text-[10px] text-[rgb(var(--fg-muted))]">
                          {action.kind} · {action.targetName}
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-2">
                      <div className="text-right text-[10px]">
                        <div className="text-[rgb(var(--fg-muted))]">State</div>
                        <div className="text-[rgb(var(--fg))]">{stateLabel}</div>
                      </div>
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
                      {isSkill ? (
                        <>
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
                        </>
                      ) : null}
                    </div>
                  </div>

                  {isOpen ? (
                    <div className="mt-2 flex flex-col gap-2 border-t border-[rgb(var(--panel-border)/0.1)] bg-[rgb(var(--panel-border)/0.05)] px-2 py-2">
                      {action.parameterNames.length > 0 ? (
                        <>
                          <div className="text-[10px] text-[rgb(var(--fg-muted))]">
                            Params: {action.parameterNames.join(", ")}
                          </div>
                          <textarea
                            className="input-ghost min-h-24 w-full resize-y"
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
                      ) : (
                        <div className="text-[10px] text-[rgb(var(--fg-muted))]">
                          No input parameters.
                        </div>
                      )}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}

        {currentActionStateEntries.length > 0 ? (
          <div className="border-t border-[rgb(var(--panel-border)/0.1)] px-2 py-2">
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
