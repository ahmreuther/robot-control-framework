import { Separator } from "react-resizable-panels";

export function ResizeHandle({
  direction = "vertical",
}: {
  direction?: "vertical" | "horizontal";
}) {
  const className =
    direction === "vertical"
      ? "w-2 shrink-0 bg-[rgb(var(--bg-gray-200))]"
      : "h-2 shrink-0 bg-[rgb(var(--bg-gray-200))]";

  return <Separator className={className} />;
}
