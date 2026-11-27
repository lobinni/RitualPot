import { NETWORK_ID, isAddress, resolveDeployment } from "@/lib/config";
import { hasDatabase } from "@/db";
import { readDeployment, writeDeployment } from "@/db/deployments";

export const dynamic = "force-dynamic";

/**
 * The single runtime source of the contract address.
 *
 * GET  - what the running instance is using, and which of the three sources supplied it.
 * POST - point the running instance at another contract without a rebuild.
 */

type PostBody = {
  network?: string;
  address?: string;
  codeSha256?: string;
  updatedBy?: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const network = url.searchParams.get("network") || NETWORK_ID;

  try {
    const row = await readDeployment(network);
    const resolved = resolveDeployment(row?.address ?? null);
    return Response.json({
      ...resolved,
      database: hasDatabase(),
      recordedAt: row?.updatedAt ?? null,
      recordedBy: row?.updatedBy ?? null,
    });
  } catch (error) {
    // The registry is still a valid answer when no database is configured or reachable.
    const resolved = resolveDeployment(null);
    return Response.json({
      ...resolved,
      database: hasDatabase(),
      recordedAt: null,
      recordedBy: null,
      ...(hasDatabase()
        ? { warning: error instanceof Error ? error.message : "deployment store unavailable" }
        : {}),
    });
  }
}

export async function POST(request: Request) {
  if (!hasDatabase()) {
    // A host without a database (a plain Vercel build) keeps the address in the repository.
    return Response.json(
      {
        error:
          "This instance has no database, so the address cannot be changed at runtime. Record it in deployments/registry.json and redeploy.",
        source: "registry",
      },
      { status: 503 },
    );
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return Response.json({ error: "A JSON body is required." }, { status: 400 });
  }

  const network = (body.network || NETWORK_ID).trim();
  const address = (body.address || "").trim();

  if (!isAddress(address)) {
    return Response.json(
      { error: "address must be 0x followed by 40 hexadecimal characters." },
      { status: 400 },
    );
  }
  if (!/^[a-z0-9-]{1,40}$/i.test(network)) {
    return Response.json({ error: "network id is not valid." }, { status: 400 });
  }
  if (body.codeSha256 && !/^[0-9a-f]{64}$/i.test(body.codeSha256)) {
    return Response.json({ error: "codeSha256 must be 64 hexadecimal characters." }, { status: 400 });
  }

  try {
    const row = await writeDeployment({
      network,
      address: address.toLowerCase(),
      codeSha256: body.codeSha256 ?? null,
      updatedBy: body.updatedBy ?? null,
    });
    const resolved = resolveDeployment(row.address);
    return Response.json({ ok: true, ...resolved, recordedAt: row.updatedAt });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "could not record the address" },
      { status: 500 },
    );
  }
}
