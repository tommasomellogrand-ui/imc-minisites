import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://italianmastersclub.it",
  "https://www.italianmastersclub.it",
]);

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://italianmastersclub.it",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin",
  };
}

function reply(req: Request, body: unknown, status = 200, cache = "no-store") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cache,
    },
  });
}

function normalizeGw(value: string | null) {
  const gw = String(value || "").trim().toUpperCase();
  if (!/^GW\d{3}$/.test(gw)) throw new Error("invalid_game_world");
  return gw;
}

function positiveInt(value: string | null, fallback: number, max: number) {
  const n = Number(value ?? fallback);
  if (!Number.isInteger(n) || n < 0) return fallback;
  return Math.min(n, max);
}

function playerId(value: string | null) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error("invalid_player_id");
  return n;
}

function sqlText(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function searchText(value: string | null) {
  const q = String(value || "").trim();
  if (!q) return "";
  if (q.length > 80 || !/^[\p{L}\p{N} .'-]+$/u.test(q)) throw new Error("invalid_search");
  return q;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSql(sql: string) {
  const request = await db.rpc("imc_minisite_aruba_request", {
    p_body: { action: "query", target: "core", sql },
  });
  if (request.error) throw request.error;

  const requestId = Number(request.data);
  if (!Number.isSafeInteger(requestId) || requestId <= 0) throw new Error("invalid_bridge_request_id");

  for (let attempt = 0; attempt < 120; attempt++) {
    if (attempt > 0) await sleep(125);
    const response = await db.rpc("imc_minisite_aruba_response", { p_request_id: requestId });
    if (response.error) throw response.error;
    if (!response.data) continue;

    const statusCode = Number(response.data.status_code || 0);
    let payload: any = response.data.content;
    if (typeof payload === "string") {
      try { payload = JSON.parse(payload); } catch { throw new Error("invalid_bridge_response"); }
    }

    if (statusCode < 200 || statusCode >= 300 || !payload?.ok) {
      throw new Error(`aruba_query_failed:${statusCode || "unknown"}`);
    }
    return payload?.result?.rows || [];
  }

  throw new Error("aruba_query_timeout");
}

function sqlFor(resource: string, params: URLSearchParams) {
  const limit = positiveInt(params.get("limit"), 50, 200);
  const offset = positiveInt(params.get("offset"), 0, 1000000);

  switch (resource) {
    case "game_world": {
      const gw = normalizeGw(params.get("gw"));
      return `SELECT \`IMC GW\` AS game_world_id, \`IMC GW Name\` AS game_world_name, \`SM Game World ID\` AS sm_game_world_id, \`Active Club\` AS active_club, \`Country\` AS country FROM \`IMC Game World Codex Global\` WHERE \`IMC GW\`=${sqlText(gw)} LIMIT 1`;
    }
    case "clubs": {
      const gw = normalizeGw(params.get("gw"));
      return `SELECT m.\`Game World\` AS game_world_id, m.\`Club ID\` AS club_id, m.\`Club Name\` AS club_name, m.\`SM Club ID\` AS sm_club_id, c.image_file, c.image_url FROM \`IMC Game World Club Mapping\` m LEFT JOIN \`IMC Club Codex Global\` c ON c.id=m.\`Club ID\` WHERE m.\`Game World\`=${sqlText(gw)} ORDER BY m.\`Club Name\``;
    }
    case "competitions": {
      const gw = normalizeGw(params.get("gw"));
      return `SELECT id, game_world_id, sm_action, custom_competition, sm_action_group, sm_country, sm_division, teams_count, expected_match, is_sm_action FROM \`IMC Competition Codex Global\` WHERE game_world_id=${sqlText(gw)} ORDER BY sm_action_group, sm_country, sm_division, sm_action, custom_competition`;
    }
    case "countries":
      return "SELECT id, name FROM `IMC Country Codex Global` ORDER BY name";
    case "national_teams":
      return "SELECT id, name, image_file, image_url FROM `IMC National Team Codex Global` ORDER BY name";
    case "managers":
      return "SELECT manager_id, full_name, imc_join_date, sm_manager_id FROM `IMC Manager Codex Global` ORDER BY full_name";
    case "manager_assignments": {
      const gw = normalizeGw(params.get("gw"));
      return `SELECT a.id, a.game_world_id, a.manager_id, a.full_name, a.club_id, a.assignment_type, a.start_date, a.end_date, a.national_team_id, c.name AS club_name, c.image_file AS club_image_file, c.image_url AS club_image_url, n.name AS national_team_name, n.image_file AS national_team_image_file, n.image_url AS national_team_image_url FROM \`IMC Manager Assignment Global\` a LEFT JOIN \`IMC Club Codex Global\` c ON c.id=a.club_id LEFT JOIN \`IMC National Team Codex Global\` n ON n.id=a.national_team_id WHERE a.game_world_id=${sqlText(gw)} AND a.end_date IS NULL ORDER BY a.assignment_type, a.full_name`;
    }
    case "players": {
      const q = searchText(params.get("q"));
      const where = q ? ` WHERE CONCAT_WS(' ', forename, surname) LIKE ${sqlText(`%${q}%`)}` : "";
      return `SELECT id, forename, surname, image_file, image_url FROM \`IMC Player Codex Global\`${where} ORDER BY surname, forename, id LIMIT ${limit} OFFSET ${offset}`;
    }
    case "player_data": {
      const rawId = params.get("player_id");
      if (rawId) {
        const id = playerId(rawId);
        return `SELECT p.id AS player_id, p.forename, p.surname, p.image_file, p.image_url, d.full_name, d.nationality, d.position, d.rating, d.market_value, d.age, d.date_of_birth, d.height_cm, d.weight_kg, d.foot, d.soccerwiki_club_name, d.soccerwiki_club_id, d.wage, d.updated_at FROM \`IMC Player Codex Global\` p LEFT JOIN \`IMC Player Codex Global Data\` d ON d.player_id=p.id WHERE p.id=${id} LIMIT 1`;
      }
      return `SELECT player_id, full_name, nationality, position, rating, market_value, age, date_of_birth, height_cm, weight_kg, foot, soccerwiki_club_name, soccerwiki_club_id, wage, updated_at FROM \`IMC Player Codex Global Data\` ORDER BY updated_at DESC, player_id LIMIT ${limit} OFFSET ${offset}`;
    }
    case "rating_history": {
      const id = playerId(params.get("player_id"));
      return `SELECT id, player_id, change_date, old_rating, new_rating, imported_at FROM \`IMC Player Codex Global Rating History\` WHERE player_id=${id} ORDER BY change_date DESC, id DESC LIMIT ${limit} OFFSET ${offset}`;
    }
    default:
      throw new Error("invalid_resource");
  }
}

function cacheFor(resource: string) {
  if (["manager_assignments", "player_data", "rating_history"].includes(resource)) {
    return "public, max-age=60, stale-while-revalidate=120";
  }
  return "public, max-age=300, stale-while-revalidate=1800";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "GET") return reply(req, { ok: false, error: "method_not_allowed" }, 405);

  const origin = req.headers.get("origin") || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return reply(req, { ok: false, error: "origin_not_allowed" }, 403);
  }

  try {
    const url = new URL(req.url);
    const resource = String(url.searchParams.get("resource") || "").trim().toLowerCase();

    if (resource === "bootstrap") {
      const gw = normalizeGw(url.searchParams.get("gw"));
      const params = new URLSearchParams({ gw });
      const [gameWorld, clubs, competitions, managerAssignments, countries, nationalTeams, managers] = await Promise.all([
        runSql(sqlFor("game_world", params)),
        runSql(sqlFor("clubs", params)),
        runSql(sqlFor("competitions", params)),
        runSql(sqlFor("manager_assignments", params)),
        runSql(sqlFor("countries", params)),
        runSql(sqlFor("national_teams", params)),
        runSql(sqlFor("managers", params)),
      ]);

      return reply(req, {
        ok: true,
        source: "MySQL Aruba CORE",
        database: "Sql1956795_1",
        game_world_id: gw,
        data: {
          game_world: gameWorld[0] || null,
          clubs,
          competitions,
          manager_assignments: managerAssignments,
          countries,
          national_teams: nationalTeams,
          managers,
        },
      }, 200, "public, max-age=60, stale-while-revalidate=180" );
    }

    const rows = await runSql(sqlFor(resource, url.searchParams));
    return reply(req, {
      ok: true,
      source: "MySQL Aruba CORE",
      database: "Sql1956795_1",
      resource,
      rows,
      count: rows.length,
    }, 200, cacheFor(resource));
  } catch (error) {
    const message = String((error as Error)?.message || error);
    const clientErrors = new Set([
      "invalid_game_world",
      "invalid_player_id",
      "invalid_search",
      "invalid_resource",
    ]);
    return reply(req, { ok: false, error: message }, clientErrors.has(message) ? 400 : 502);
  }
});
