export type AuthEntitlements = {
  reservedHostnameLimit: number;
  ephemeralNamedLimit: number;
  customDomainEnabled: boolean;
  enterpriseEnabled: boolean;
};

export type AuthUsage = {
  claimedSessions: number;
  reservedHostnames: number;
  activeEphemeralNamedHostnames: number;
};

export type AuthBillingActions = {
  canStartCheckout: boolean;
  canManageBilling: boolean;
};

export type AuthUser = {
  id: string;
  createdAt: string;
  lastLoginAt?: string | null;
  claimedSessionCount: number;
  billingProvider: string;
  subscriptionId?: string | null;
  planCode: string;
  subscriptionStatus: string;
  reservedHostname?: string | null;
  entitlements: AuthEntitlements;
  usage: AuthUsage;
  billingActions: AuthBillingActions;
};

export type ClaimedRemoteSession = {
  slug: string;
  publicUrl: string;
  target?: string | null;
  provider?: string | null;
  label: string;
  claimedAt?: string | null;
  lastAvailableAt?: string | null;
  releasedAt?: string | null;
  sessionToken?: string | null;
  presence?: {
    state?: 'online' | 'degraded' | 'offline' | 'unknown';
    lastHeartbeatAt?: string | null;
    heartbeatTimeoutMs?: number;
    latestStatus?: {
      observedAt?: string;
      runtime?: {
        state?: string;
      };
      activity?: {
        state?: string;
        promptText?: string | null;
      };
    } | null;
  } | null;
};
