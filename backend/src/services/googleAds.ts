import { PrismaClient } from "@prisma/client";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ADS_API = "https://googleads.googleapis.com/v23";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3001/api/integrations/google/callback";
const DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";
const MANAGER_ID = (process.env.GOOGLE_ADS_MANAGER_ID || "").replace(/-/g, "");
const CUSTOMER_ID = (process.env.GOOGLE_ADS_CUSTOMER_ID || "").replace(/-/g, "");

// ─── OAuth2 ───

export function getAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/adwords",
    access_type: "offline",
    prompt: "consent",
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

export async function exchangeCodeForTokens(code: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

export function isConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET && DEVELOPER_TOKEN && CUSTOMER_ID);
}

// ─── API client ───

async function getValidToken(prisma: PrismaClient): Promise<string> {
  const cred = await prisma.integrationCredential.findUnique({ where: { platform: "google" } });
  if (!cred) throw new Error("Google Ads not connected");

  const buffer = 5 * 60 * 1000;
  if (cred.expiresAt && cred.expiresAt.getTime() - buffer < Date.now()) {
    if (!cred.refreshToken) throw new Error("No refresh token");
    const tokens = await refreshAccessToken(cred.refreshToken);
    await prisma.integrationCredential.update({
      where: { platform: "google" },
      data: {
        accessToken: tokens.access_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });
    return tokens.access_token;
  }

  return cred.accessToken;
}

// ─── Helper: make Google Ads API call, auto-detect working auth combo ───

async function googleAdsQuery(token: string, query: string): Promise<any[]> {
  // Try different combinations of customer ID and login-customer-id
  const combos = [
    { customerId: CUSTOMER_ID, loginCustomerId: MANAGER_ID },
    { customerId: CUSTOMER_ID, loginCustomerId: "" },
    { customerId: MANAGER_ID, loginCustomerId: "" },
  ];

  for (const combo of combos) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "developer-token": DEVELOPER_TOKEN,
      "Content-Type": "application/json",
    };
    if (combo.loginCustomerId) {
      headers["login-customer-id"] = combo.loginCustomerId;
    }

    console.log(`[Google Ads] Trying customers/${combo.customerId}, login-customer-id=${combo.loginCustomerId || "none"}`);

    const res = await fetch(`${GOOGLE_ADS_API}/customers/${combo.customerId}/googleAds:searchStream`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
    });

    if (res.ok) {
      console.log(`[Google Ads] Success with customers/${combo.customerId}`);
      return await res.json() as any[];
    }

    const errText = await res.text();
    console.log(`[Google Ads] Failed (${res.status}): ${errText.slice(0, 200)}`);

    // If it's not a permission error, don't try other combos
    if (res.status !== 403) {
      throw new Error(`Google Ads API error: ${res.status} ${errText}`);
    }
  }

  throw new Error("Google Ads API: all auth combinations failed with permission denied. Check account access and developer token.");
}

// ─── Fetch campaign spend ───

export async function importAdSpend(prisma: PrismaClient, dateFrom: string, dateTo: string) {
  const token = await getValidToken(prisma);

  console.log(`[Google Ads] Fetching campaign data from ${dateFrom} to ${dateTo}`);
  console.log(`[Google Ads] CUSTOMER_ID=${CUSTOMER_ID}, MANAGER_ID=${MANAGER_ID}`);

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      segments.month
    FROM campaign
    WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
      AND campaign.status != 'REMOVED'
  `;

  const data = await googleAdsQuery(token, query);

  // Aggregate spend per month
  const monthlySpend: Record<string, { spend: number; impressions: number; clicks: number; conversions: number }> = {};
  let synced = 0;

  if (data[0]?.results?.[0]) {
    console.log("[Google Ads] Sample row:", JSON.stringify(data[0].results[0]));
  }

  for (const batch of data) {
    for (const row of batch.results || []) {
      const monthRaw = row.segments?.month; // "YYYY-MM-DD" format (first of month)
      const spendMicros = parseInt(row.metrics?.costMicros || "0");
      const spend = spendMicros / 1_000_000;
      const impressions = parseInt(row.metrics?.impressions || "0");
      const clicks = parseInt(row.metrics?.clicks || "0");
      const conversions = parseFloat(row.metrics?.conversions || "0");

      if (!monthRaw || spend <= 0) continue;

      // month key: "YYYY-MM"
      const month = monthRaw.slice(0, 7);

      if (!monthlySpend[month]) monthlySpend[month] = { spend: 0, impressions: 0, clicks: 0, conversions: 0 };
      monthlySpend[month].spend += spend;
      monthlySpend[month].impressions += impressions;
      monthlySpend[month].clicks += clicks;
      monthlySpend[month].conversions += conversions;

      const campaignId = row.campaign?.id || "unknown";
      const campaignName = row.campaign?.name || "Unknown";
      const date = new Date(`${monthRaw}T00:00:00Z`);

      await prisma.adPlatformData.upsert({
        where: { platform_campaignId_date: { platform: "GOOGLE", campaignId: String(campaignId), date } },
        create: {
          platform: "GOOGLE",
          campaignId: String(campaignId),
          campaignName,
          spend,
          impressions,
          clicks,
          leads: Math.round(conversions),
          date,
        },
        update: { campaignName, spend, impressions, clicks, leads: Math.round(conversions) },
      });
      synced++;
    }
  }

  // Save aggregated monthly costs
  for (const [month, mData] of Object.entries(monthlySpend)) {
    const date = new Date(`${month}-01T00:00:00Z`);

    const existing = await prisma.cost.findFirst({
      where: {
        channel: "Google Ads",
        type: "AD_SPEND",
        date: { gte: date, lt: new Date(new Date(date).setMonth(date.getMonth() + 1)) },
      },
    });

    if (existing) {
      await prisma.cost.update({
        where: { id: existing.id },
        data: { amount: mData.spend, isEstimated: false, source: "google_api" },
      });
    } else {
      await prisma.cost.create({
        data: {
          channel: "Google Ads",
          amount: mData.spend,
          date,
          type: "AD_SPEND",
          description: `Google Ads spend ${month}`,
          isEstimated: false,
          source: "google_api",
        },
      });
    }
  }

  console.log(`[Google Ads] Synced ${synced} campaign rows, ${Object.keys(monthlySpend).length} monthly costs`);
  return { insights: synced, months: Object.keys(monthlySpend).length, monthlySpend };
}
