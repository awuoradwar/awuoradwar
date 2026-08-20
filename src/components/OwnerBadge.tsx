import { ManagerColor } from "@/lib/managerColor";

/** A task's owner name, colored to match that manager's dot on Week page's
 * "Manager capacity" list and schedule grid -- so a manager's tasks are
 * recognizable at a glance the same way their shifts already are. Falls
 * back to plain muted text when no color map was passed (or the owner
 * isn't in it, e.g. a since-deactivated user). */
export default function OwnerBadge({ name, ownerId, managerColors }: { name: string; ownerId: string | null; managerColors?: Record<string, ManagerColor> }) {
  const color = ownerId ? managerColors?.[ownerId] : undefined;
  if (!color) return <span>{name}</span>;
  return (
    <span className="rounded px-1.5 py-0.5 font-medium" style={{ backgroundColor: color.bg, color: color.text }}>
      {name}
    </span>
  );
}
