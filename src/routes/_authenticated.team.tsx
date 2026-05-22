import { createFileRoute } from "@tanstack/react-router";
import { TeamManagement } from "@/components/team/TeamManagement";

export const Route = createFileRoute("/_authenticated/team")({
  component: TeamManagement,
});
