import { NextRequest, NextResponse } from 'next/server';
import { resolveNestBackendUrl } from '@/lib/nest-backend-url';
import {
  finalizeOperationalInsights,
  parseInsightsFromModelContent,
  type OperationalInsightDelayTables,
  type OperationalInsightSummaryStats,
} from '@/lib/delayReportOperationalInsights';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INSIGHTS_RATE_WINDOW_MS = 60_000;
const INSIGHTS_RATE_LIMIT = 20;
const insightsRateByIp = new Map<string, { count: number; windowStart: number }>();

async function verifyFrisSession(request: NextRequest): Promise<boolean> {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader?.trim()) return false;
  try {
    const res = await fetch(`${resolveNestBackendUrl()}/auth/session`, {
      method: 'GET',
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

function checkInsightsRateLimit(request: NextRequest): boolean {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    'unknown';
  const now = Date.now();
  const entry = insightsRateByIp.get(ip);
  if (!entry || now - entry.windowStart >= INSIGHTS_RATE_WINDOW_MS) {
    insightsRateByIp.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= INSIGHTS_RATE_LIMIT) return false;
  entry.count += 1;
  return true;
}

type GenerateInsightsRequestBody = {
  summaryStats?: unknown;
  delayTableRows?: unknown;
  requestedInsightCount?: unknown;
};

function asSummaryStats(raw: unknown): OperationalInsightSummaryStats {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const top = o.topDelayCode as Record<string, unknown> | null | undefined;
  const worstStation = o.worstStation as Record<string, unknown> | null | undefined;
  const worstAirline = o.worstAirline as Record<string, unknown> | null | undefined;
  return {
    fromYmd: String(o.fromYmd ?? ''),
    toYmd: String(o.toYmd ?? ''),
    airline: String(o.airline ?? 'All airlines'),
    station: String(o.station ?? 'All stations'),
    delayedFlights: Number(o.delayedFlights ?? 0) || 0,
    totalDelayMinutes: Number(o.totalDelayMinutes ?? 0) || 0,
    avgDelayPerFlight: Number(o.avgDelayPerFlight ?? 0) || 0,
    topDelayCode: top?.code
      ? { code: String(top.code), flightCount: Number(top.flightCount ?? 0) || 0 }
      : null,
    worstStation: worstStation?.name
      ? { name: String(worstStation.name), flightCount: Number(worstStation.flightCount ?? 0) || 0 }
      : null,
    worstAirline: worstAirline?.name
      ? { name: String(worstAirline.name), flightCount: Number(worstAirline.flightCount ?? 0) || 0 }
      : null,
  };
}

function asDelayTables(raw: unknown): OperationalInsightDelayTables {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const mapRows = (rows: unknown): OperationalInsightDelayTables['gha'] => {
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => {
      const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
      return {
        code: String(r.code ?? ''),
        description: String(r.description ?? ''),
        flightCount: Number(r.flightCount ?? 0) || 0,
        totalMinutes: Number(r.totalMinutes ?? 0) || 0,
        avgMinutes: Number(r.avgMinutes ?? 0) || 0,
        pctOfDelay: Number(r.pctOfDelay ?? 0) || 0,
        severity: String(r.severity ?? ''),
      };
    });
  };
  return {
    gha: mapRows(o.gha),
    nonGha: mapRows(o.nonGha),
  };
}

async function tryGroqInsights(
  summary: OperationalInsightSummaryStats,
  tables: OperationalInsightDelayTables,
  requestedInsightCount: number,
): Promise<string[] | null> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return null;

  // Use fetch (not groq-sdk) so OpenNext does not ship the SDK into the Worker.
  const prompt =
    `You are an aviation operations analyst. Given the following flight delay data, generate exactly ${requestedInsightCount} concise operational insights for an airport operations team. Each insight must be 1-2 sentences, actionable, and reference specific codes, percentages, times, stations, or airlines from the data when relevant. Prioritize the most operationally important delay codes first. Return ONLY a JSON array of ${requestedInsightCount} strings with no markdown or extra text. Data: ` +
    JSON.stringify({
      summaryStats: summary,
      delayTableRows: tables,
      requestedInsightCount,
    });

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
  });
  if (!res.ok) return null;

  const completion = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = completion.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) return null;

  const parsed = parseInsightsFromModelContent(content);
  return parsed.length > 0 ? parsed : null;
}

export async function POST(request: NextRequest) {
  try {
    if (!checkInsightsRateLimit(request)) {
      return NextResponse.json(
        { error: 'Too many insight requests. Try again shortly.' },
        { status: 429 },
      );
    }

    const sessionOk = await verifyFrisSession(request);
    if (!sessionOk) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = (await request.json()) as GenerateInsightsRequestBody;
    if (body.summaryStats == null || body.delayTableRows == null || body.requestedInsightCount == null) {
      return NextResponse.json(
        { error: 'summaryStats, delayTableRows, and requestedInsightCount are required.' },
        { status: 400 },
      );
    }

    const requestedInsightCount = Math.min(
      10,
      Math.max(3, Number.parseInt(String(body.requestedInsightCount), 10) || 3),
    );

    const summary = asSummaryStats(body.summaryStats);
    const tables = asDelayTables(body.delayTableRows);

    let aiInsights: string[] | null = null;
    try {
      aiInsights = await tryGroqInsights(summary, tables, requestedInsightCount);
    } catch {
      aiInsights = null;
    }

    const { insights, source } = finalizeOperationalInsights(
      aiInsights,
      summary,
      tables,
      requestedInsightCount,
    );

    return NextResponse.json({
      insights,
      insightCount: insights.length,
      source,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not generate insights.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
