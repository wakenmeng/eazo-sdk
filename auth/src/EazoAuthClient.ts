import { AuthenticationClient, EmailScene } from "authing-js-sdk";
import { requestBridgeApi } from "./eazo-bridge";
import type { EazoAuthClientConfig, SocialConnection } from "./types";

const DEFAULT_AUTH_APP_ID     = "6972f32040acf5801552404b";
const DEFAULT_AUTH_APP_DOMAIN = "https://eazo.genauth.ai";
const DEFAULT_API_BASE        = "https://eazo.ai";

/** Encrypted session token returned by the server — same shape as Eazo Mobile session. */
export type SessionToken = {
  encryptedData: string;
  encryptedKey: string;
  iv: string;
  authTag: string;
  [key: string]: string;
};

/**
 * Browser-side auth client.
 * All three web login methods exchange the GenAuth JWT for an encrypted
 * session token (via /api/open/app-session-token), so both Mobile and Web
 * callers hold the same `SessionToken` shape and send it as `x-eazo-session`.
 */
export class EazoAuthClient {
  private readonly publicKey: string;
  private readonly authAppId: string;
  private readonly authAppDomain: string;
  private readonly apiBase: string;

  private _authingClient: AuthenticationClient | null = null;
  private _cachedSession: SessionToken | null = null;

  constructor(config: EazoAuthClientConfig) {
    if (!config.publicKey) throw new Error("@eazo/auth: publicKey is required");
    this.publicKey     = config.publicKey;
    this.authAppId     = config.authAppId     ?? DEFAULT_AUTH_APP_ID;
    this.authAppDomain = config.authAppDomain ?? DEFAULT_AUTH_APP_DOMAIN;
    this.apiBase       = config.apiBase       ?? DEFAULT_API_BASE;
  }

  // ---------------------------------------------------------------------------
  // Environment detection
  // ---------------------------------------------------------------------------

  isEazoMobile(): boolean {
    if (typeof navigator === "undefined") return false;
    return navigator.userAgent.includes("EAZO");
  }

  // ---------------------------------------------------------------------------
  // Session token exchange
  // ---------------------------------------------------------------------------

  /**
   * Exchanges a GenAuth JWT for an encrypted session token.
   * The resulting token is the same shape as Eazo Mobile's session,
   * so the server always decrypts it with EAZO_PRIVATE_KEY.
   */
  private async _getSessionToken(jwt: string): Promise<SessionToken> {
    const res = await fetch(`${this.apiBase}/api/open/app-session-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwt}`,
      },
      body: JSON.stringify({ publicKey: this.publicKey }),
    });

    if (!res.ok) {
      throw new Error(`Failed to get session token: ${res.status}`);
    }

    const json = await res.json() as { data: SessionToken };
    return json.data;
  }

  // ---------------------------------------------------------------------------
  // Web login — all methods return a SessionToken (same shape as Mobile)
  // ---------------------------------------------------------------------------

  /** Initiates a social login popup and returns an encrypted session token. */
  loginWithSocial(extIdpIdentifier: string): Promise<SessionToken> {
    return new Promise((resolve, reject) => {
      const client = this.getAuthingClient();
      client.social.authorize(extIdpIdentifier, {
        onSuccess: async (profile) => {
          try {
            const p = profile as unknown as Record<string, unknown>;
            const jwt = (p.token ?? p.id_token) as string | undefined;
            if (!jwt) throw new Error("Social login succeeded but no token received");
            resolve(await this._getSessionToken(jwt));
          } catch (err) {
            reject(err);
          }
        },
        onError: (code: number, message: string) => {
          reject(new Error(message || `Social login failed (${code})`));
        },
      });
    });
  }

  /** Logs in with email + password and returns an encrypted session token. */
  async loginWithEmailPassword(email: string, password: string): Promise<SessionToken> {
    const result = (await this.getAuthingClient().loginByEmail(
      email,
      password
    )) as unknown as Record<string, unknown>;
    const jwt = (result.token ?? result.id_token) as string | undefined;
    if (!jwt) throw new Error("Login succeeded but no token received");
    return this._getSessionToken(jwt);
  }

  /** Logs in with email + verification code and returns an encrypted session token. */
  async loginWithEmailCode(email: string, code: string): Promise<SessionToken> {
    const result = (await this.getAuthingClient().loginByEmailCode(
      email,
      code
    )) as unknown as Record<string, unknown>;
    const jwt = (result.token ?? result.id_token) as string | undefined;
    if (!jwt) throw new Error("Login succeeded but no token received");
    return this._getSessionToken(jwt);
  }

  /** Sends an email verification code for login. */
  async sendEmailCode(email: string): Promise<void> {
    await this.getAuthingClient().sendEmail(email, EmailScene.LOGIN_VERIFY_CODE);
  }

  // ---------------------------------------------------------------------------
  // Eazo Mobile login
  // ---------------------------------------------------------------------------

  /**
   * Fetches the Eazo Mobile session token from the host app via the bridge.
   * Cached for the lifetime of the page (one bridge call per load).
   */
  async loginByEazoMobile(): Promise<SessionToken> {
    if (this._cachedSession) return this._cachedSession;
    this._cachedSession = (await requestBridgeApi("session.getToken")) as SessionToken;
    return this._cachedSession;
  }

  // ---------------------------------------------------------------------------
  // GenAuth / Authing
  // ---------------------------------------------------------------------------

  getAuthingClient(): AuthenticationClient {
    if (this._authingClient) return this._authingClient;
    this._authingClient = new AuthenticationClient({
      appId:   this.authAppId,
      appHost: this.authAppDomain,
    });
    return this._authingClient;
  }

  async fetchSocialConnections(): Promise<SocialConnection[]> {
    const res = await fetch(
      `${this.authAppDomain}/api/v2/applications/${this.authAppId}/public-config`,
      { next: { revalidate: 3600 } } as RequestInit
    );
    if (!res.ok) throw new Error(`Failed to fetch GenAuth public config: ${res.status}`);
    const json = await res.json() as { data: { socialConnections: SocialConnection[] } };
    return json.data.socialConnections;
  }
}
