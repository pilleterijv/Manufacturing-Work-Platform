"use client";
import { equipmentLabel, type LabeledEquipment } from "@/lib/equipment-label";
export default function RecordingContext({
  equipment,
  shift,
}: {
  equipment?: LabeledEquipment;
  shift?: string;
}) {
  if (!equipment) return null;
  return (
    <aside className="recording-context" aria-label="Recording target">
      <strong>Recording against</strong>
      <p>{equipmentLabel(equipment)}</p>
      <p>
        {shift ? `Task shift: ${shift}` : "The task's saved timestamps determine its reporting period."} The
        reminder at the top does not change this task.
      </p>
    </aside>
  );
}
