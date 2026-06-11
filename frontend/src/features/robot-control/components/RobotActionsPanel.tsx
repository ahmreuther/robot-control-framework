import { useMemo, useState } from "react";

import { useAppFeedback } from "../../../app/context/AppFeedbackContext";
import { DisclosureSection } from "../../../shared/ui/DisclosureSection";
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

function getRawActionStateText(
  state:
    | {
        status?: string | null;
        currentState?: string | null;
      }
    | null
    | undefined,
): string {
  const raw = (state?.currentState ?? state?.status ?? "idle").trim();
  if (!raw) {
    return "idle";
  }

  const localizedTextMatch = raw.match(/Text='([^']+)'/i);
  return (localizedTextMatch?.[1] ?? raw).trim();
}

function formatActionStateLabel(
  state:
    | {
        status?: string | null;
        currentState?: string | null;
      }
    | null
    | undefined,
): string {
  const raw = getRawActionStateText(state);
  if (raw.toLowerCase() === "ready") {
    return "idle";
  }
  return raw;
}

function getActionStateColorClass(
  state:
    | {
        status?: string | null;
        currentState?: string | null;
      }
    | null
    | undefined,
): string {
  const label = getRawActionStateText(state).toLowerCase();

  if (
    label === "failed" ||
    label === "error" ||
    label === "aborted"
  ) {
    return "border-rose-400/35 bg-rose-500/10 text-rose-300";
  }
  if (label === "halted") {
    return "border-amber-400/35 bg-amber-500/10 text-amber-300";
  }
  if (label === "running" || label === "executing") {
    return "border-cyan-400/35 bg-cyan-500/10 text-cyan-300";
  }
  if (
    label === "idle" ||
    label === "ready" ||
    label === "succeeded"
  ) {
    return "border-emerald-400/35 bg-emerald-500/10 text-emerald-300";
  }
  if (label === "reset") {
    return "border-white/15 bg-white/5 text-white/80";
  }

  return "border-[rgb(var(--panel-border)/0.18)] bg-[rgb(var(--panel-bg)/0.45)] text-[rgb(var(--fg))]";
}

export default function RobotActionsPanel({
  robot,
  embedded = false,
}: RobotActionsPanelProps) {
  const feedback = useAppFeedback();
  const { executeRobotAction, haltRobotAction, resetRobotAction } =
    useRobotControl();
  const [inputsByAction, setInputsByAction] = useState<Record<string, string>>(
    {},
  );
  const [openActionName, setOpenActionName] = useState<string | null>(null);
  const [skillsOpen, setSkillsOpen] = useState(true);
  const [methodsOpen, setMethodsOpen] = useState(true);

  const actions = useMemo(
    () =>
      robot?.actions
        ? Object.entries(robot.actions).sort(([left], [right]) =>
            left.localeCompare(right),
          )
        : [],
    [robot?.actions],
  );
  const skillActions = useMemo(
    () => actions.filter(([, action]) => action.kind === "skill"),
    [actions],
  );
  const methodActions = useMemo(
    () => actions.filter(([, action]) => action.kind === "method"),
    [actions],
  );
  if (!robot) {
    return null;
  }
  const currentRobot = robot;

  const containerClass = embedded
    ? "flex flex-col text-xs"
    : "panel pointer-events-auto w-[320px] text-xs shadow-md";

  function renderActionList(entries: [string, RobotActionBinding][]) {
    if (entries.length === 0) {
      return (
        <div className="px-2 py-2 text-[rgb(var(--fg-muted))]">
          No actions in this section.
        </div>
      );
    }

    return (
      <div className="flex flex-col divide-y divide-[rgb(var(--panel-border)/0.1)]">
        {entries.map(([actionName, action]) => {
          const currentState = currentRobot.actionStates[actionName] ?? null;
          const stateLabel = formatActionStateLabel(currentState);
          const stateColorClass = getActionStateColorClass(currentState);
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
                    <div className="truncate text-[12px]">
                      {action.targetName}
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-2">
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
                          throw new Error(
                            "Action inputs must be a JSON object.",
                          );
                        }
                        executeRobotAction(
                          currentRobot.robotId,
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
                        onClick={() =>
                          haltRobotAction(currentRobot.robotId, actionName)
                        }
                      >
                        Halt
                      </button>
                      <button
                        className="button-ghost"
                        disabled={!action.resetNodeId}
                        onClick={() =>
                          resetRobotAction(currentRobot.robotId, actionName)
                        }
                      >
                        Reset
                      </button>
                    </>
                  ) : null}
                  <div className="ml-6 text-right">
                    <div
                      className={`inline-flex h-6 min-w-[72px] items-center justify-center border px-2 text-xs leading-none ${stateColorClass}`}
                    >
                      {stateLabel}
                    </div>
                  </div>
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
    );
  }

  return (
    <section className={containerClass}>
      {!embedded ? (
        <header className="panel-header">
          <div className="panel-title">Actions</div>
          <div className="text-[10px] text-[rgb(var(--fg-muted))]">
            {currentRobot.displayName}
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
          <div className="flex flex-col gap-2">
            <DisclosureSection
              title={`Skills`}
              open={skillsOpen}
              onToggle={() => setSkillsOpen((current) => !current)}
              contentClassName="p-0 gap-0"
            >
              {renderActionList(skillActions)}
            </DisclosureSection>
            <DisclosureSection
              title={`Methods`}
              open={methodsOpen}
              onToggle={() => setMethodsOpen((current) => !current)}
              contentClassName="p-0 gap-0"
            >
              {renderActionList(methodActions)}
            </DisclosureSection>
          </div>
        )}
      </div>
    </section>
  );
}
