import { PrismaClient } from "@prisma/client";

const FB_GRAPH_URL = "https://graph.facebook.com/v21.0";
const APP_ID = process.env.FACEBOOK_APP_ID || "";
const APP_SECRET = process.env.FACEBOOK_APP_SECRET || "";
const AD_ACCOUNT_ID = process.env.FACEBOOK_AD_ACCOUNT_ID || "";
const REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI || "http://localhost:3001/api/integrations/meta/callback";

// ─── OAuth2 ───

export function getAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: REDIRECT_URI,
    config_id: process.env.FACEBOOK_CONFIG_ID || "1250742467194906",
    response_type: "code",
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
}

export async function exchangeCodeForToken(code: string): Promise<{ access_token: string; expires_in: number }> {
  const params = new URLSearchParams({
    client_id: APP_ID,
    client_secret: APP_SECRET,
    redirect_uri: REDIRECT_URI,
    code,
  });

  const res = await fetch(`${FB_GRAPH_URL}/oauth/access_token?${params}`);
  if (!res.ok) throw new Error(`Meta token exchange failed: ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

// Exchange short-lived token for long-lived (60 days)
export async function getLongLivedToken(shortToken: string): Promise<{ access_token: string; expires_in: number }> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: APP_ID,
    client_secret: APP_SECRET,
    fb_exchange_token: shortToken,
  });

  const res = await fetch(`${FB_GRAPH_URL}/oauth/access_token?${params}`);
  if (!res.ok) throw new Error(`Meta long-lived token failed: ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

export function isConfigured(): boolean {
  return Boolean(APP_ID && APP_SECRET && AD_ACCOUNT_ID);
}

// ─── API helpers ───

async function fbFetch(token: string, endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${FB_GRAPH_URL}/${endpoint}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Meta API error (${endpoint}): ${res.status} ${err}`);
  }
  return res.json();
}

// ─── Import ad spend data ───

interface CampaignInsight {
  campaign_id: string;
  campaign_name: string;
  spend: string;
  impressions: string;
  clicks: string;
  actions?: { action_type: string; value: string }[];
  date_start: string;
  date_stop: string;
}

export async function importAdSpend(prisma: PrismaClient, dateFrom: string, dateTo: string) {
  const cred = await prisma.integrationCredential.findUnique({ where: { platform: "meta" } });
  if (!cred) throw new Error("Meta Ads not connected");

  const token = cred.accessToken;

  console.log(`[Meta Ads] Fetching campaign insights from ${dateFrom} to ${dateTo}...`);

  // Fetch campaign-level insights per day
  let allInsights: CampaignInsight[] = [];
  let url = `${AD_ACCOUNT_ID}/insights`;
  let hasMore = true;

  while (hasMore) {
    const data = await fbFetch(token, url, {
      level: "campaign",
      fields: "campaign_id,campaign_name,spend,impressions,clicks,actions",
      time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
      time_increment: "monthly",
      limit: "500",
    });

    allInsights.push(...(data.data || []));

    if (data.paging?.next) {
      // For pagination, use the full URL directly
      const nextRes = await fetch(data.paging.next);
      if (!nextRes.ok) break;
      const nextData = await nextRes.json() as any;
      allInsights.push(...(nextData.data || []));
      hasMore = Boolean(nextData.paging?.next);
    } else {
      hasMore = false;
    }
  }

  console.log(`[Meta Ads] Got ${allInsights.length} campaign insight rows`);

  let synced = 0;

  for (const insight of allInsights) {
    const spend = parseFloat(insight.spend || "0");
    if (spend <= 0) continue;

    const leads = insight.actions?.find((a) => a.action_type === "lead")?.value || "0";

    // Store in ad_platform_data
    const date = new Date(insight.date_start);

    await prisma.adPlatformData.upsert({
      where: {
        platform_campaignId_date: {
          platform: "META",
          campaignId: insight.campaign_id,
          date,
        },
      },
      create: {
        platform: "META",
        campaignId: insight.campaign_id,
        campaignName: insight.campaign_name,
        spend,
        impressions: parseInt(insight.impressions || "0"),
        clicks: parseInt(insight.clicks || "0"),
        leads: parseInt(leads),
        date,
      },
      update: {
        campaignName: insight.campaign_name,
        spend,
        impressions: parseInt(insight.impressions || "0"),
        clicks: parseInt(insight.clicks || "0"),
        leads: parseInt(leads),
      },
    });

    // Also create/update cost record for the dashboard metrics
    // Group by month for the costs table
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const costKey = `meta-${insight.campaign_id}-${monthStart.toISOString().slice(0, 7)}`;

    // We'll aggregate costs per month after all imports
    synced++;
  }

  // Now aggregate all Meta spend per month and upsert into costs table
  const monthlySpend: Record<string, number> = {};
  for (const insight of allInsights) {
    const spend = parseFloat(insight.spend || "0");
    if (spend <= 0) continue;
    const month = insight.date_start.slice(0, 7); // YYYY-MM
    monthlySpend[month] = (monthlySpend[month] || 0) + spend;
  }

  for (const [month, amount] of Object.entries(monthlySpend)) {
    const date = new Date(`${month}-01`);

    // Find existing Meta cost for this month
    const existing = await prisma.cost.findFirst({
      where: {
        channel: "META Leads",
        type: "AD_SPEND",
        date: {
          gte: new Date(date.getFullYear(), date.getMonth(), 1),
          lt: new Date(date.getFullYear(), date.getMonth() + 1, 1),
        },
      },
    });

    if (existing) {
      await prisma.cost.update({
        where: { id: existing.id },
        data: { amount, isEstimated: false, source: "meta_api" },
      });
    } else {
      await prisma.cost.create({
        data: {
          channel: "META Leads",
          amount,
          date,
          type: "AD_SPEND",
          description: `Meta Ads spend ${month}`,
          isEstimated: false,
          source: "meta_api",
        },
      });
    }
  }

  console.log(`[Meta Ads] Synced ${synced} campaign insights, ${Object.keys(monthlySpend).length} monthly cost records`);

  return { insights: synced, months: Object.keys(monthlySpend).length, monthlySpend };
}
