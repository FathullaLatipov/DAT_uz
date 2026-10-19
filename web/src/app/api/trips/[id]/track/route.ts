import { api, HttpError } from "@/server/http";
import { loadTrack } from "@/server/services/tracking-data";

/** Where a trip is now. The carrier and the company that posted the load may ask; nobody else (404). */
export const GET = api<{ id: string }>(
  async ({ session, params }) => {
    const view = await loadTrack(params.id, session.orgId);
    if (!view) throw new HttpError(404, "Trip not found.");
    return view;
  },
  { limit: 240 },
);
