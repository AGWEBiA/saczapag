import { createServerFn } from "@tanstack/react-start";
import { syncGroups as syncGroupsServer } from "./sync-groups.server";

export const syncGroups = createServerFn({ method: "POST" })
  .validator((instanceId: string) => instanceId)
  .handler(async ({ data }) => {
    return await syncGroupsServer({ data });
  });
