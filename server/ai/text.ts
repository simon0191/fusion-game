import type { FuseRequest } from "../../shared/fusion/schema";
import { mockFusionText } from "../../shared/fusion/mockText";

/**
 * Name and flavor text for a fused monster. Mocked for now; the Claude call goes here.
 * Whatever this returns is validated against `FusionText` before it reaches the client.
 */
export async function generateFusionText(req: FuseRequest): Promise<{ name: string; flavor: string; source: string }> {
  return { ...mockFusionText(req.a, req.b, req.outcome), source: "server mock" };
}
